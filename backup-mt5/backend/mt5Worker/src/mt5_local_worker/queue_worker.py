from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import shutil
import subprocess

from .config import build_config
from .models import JobRequest
from .pipeline import FilterConfig, parse_mt5_single_backtest_report
from .runner import LocalJobRunner
from .server_client import ServerApiClient, ServerApiError


OPTIMIZE_UPLOAD_CHUNK_SIZE = max(1, int(os.getenv("OPTIMIZE_UPLOAD_CHUNK_SIZE", "1000")))
OPTIMIZE_UPLOAD_CONCURRENCY = max(1, int(os.getenv("OPTIMIZE_UPLOAD_CONCURRENCY", "4")))
RESULT_UPLOAD_CHUNK_SIZE = 1024 * 1024
RUN_RETENTION_DAYS = max(1, int(os.getenv("MT5_RUN_RETENTION_DAYS", "7")))
WORKSPACE_ORPHAN_RETENTION_HOURS = max(24, int(os.getenv("MT5_WORKSPACE_ORPHAN_RETENTION_HOURS", "24")))
WORKSPACE_SWEEP_INTERVAL_SECONDS = max(300, int(os.getenv("MT5_WORKSPACE_SWEEP_INTERVAL_SECONDS", "1800")))
TERMINAL_CACHE_CLEANUP_ENABLED = os.getenv("MT5_TERMINAL_CACHE_CLEANUP_ENABLED", "true").strip().lower() not in {
    "0", "false", "no", "off"
}
MT5_AGENT_LOG_CLEANUP_ENABLED = os.getenv("MT5_AGENT_LOG_CLEANUP_ENABLED", "true").strip().lower() not in {
    "0", "false", "no", "off"
}
MT5_AGENT_LOG_SWEEP_INTERVAL_SECONDS = max(
    300, int(os.getenv("MT5_AGENT_LOG_SWEEP_INTERVAL_SECONDS", "1800"))
)
MT5_AGENT_LOG_FALLBACK_RETENTION_HOURS = max(
    1, int(os.getenv("MT5_AGENT_LOG_FALLBACK_RETENTION_HOURS", "24"))
)

# Chỉ chứa asset chuẩn; không hardcode prefix của broker hay tên bot.
KNOWN_ASSET_SYMBOLS = tuple(sorted({
    "BTCUSD", "ETHUSD", "XAUUSD", "XAGUSD", "US500", "US30", "USTECH",
    "NAS100", "USOIL", "UKOIL", "DE30", "DE40", "JP225", "HK50",
    "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY",
    "EURJPY", "GBPJPY",
}, key=len, reverse=True))


def _read_run_state(run_dir: Path) -> dict:
    try:
        with (run_dir / "run_state.json").open("r", encoding="utf-8") as handle:
            value = json.load(handle)
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def _is_safe_run_dir(run_dir: Path, runs_root: Path) -> bool:
    try:
        resolved_run = run_dir.resolve(strict=False)
        resolved_root = runs_root.resolve(strict=False)
        return resolved_run != resolved_root and resolved_root in resolved_run.parents
    except OSError:
        return False


def cleanup_completed_run(run_dir: Path, runs_root: Path) -> None:
    """Remove the completed run only after mark_done succeeds."""
    if not run_dir.exists() or not _is_safe_run_dir(run_dir, runs_root):
        return
    if str(_read_run_state(run_dir).get("status", "")).lower() != "done":
        return
    try:
        shutil.rmtree(run_dir)
        print(f"[cleanup] removed completed run={run_dir.name}", flush=True)
        _remove_empty_job_dir(run_dir.parent, runs_root)
    except OSError as error:
        print(f"[cleanup] unable to remove completed run={run_dir}: {error}", flush=True)


def _remove_empty_job_dir(job_dir: Path, runs_root: Path) -> None:
    """Remove an empty per-job directory without ever escaping runs_root."""
    if not job_dir.exists() or not job_dir.is_dir() or not _is_safe_run_dir(job_dir, runs_root):
        return
    try:
        if not any(job_dir.iterdir()):
            job_dir.rmdir()
            print(f"[cleanup] removed empty job directory={job_dir.name}", flush=True)
    except OSError as error:
        print(f"[cleanup] unable to remove empty job directory={job_dir}: {error}", flush=True)


def cleanup_terminal_run(run_dir: Path, runs_root: Path) -> None:
    """Remove a terminal run even when the server no longer accepts mark_done."""
    if not run_dir.exists() or not _is_safe_run_dir(run_dir, runs_root):
        return
    status = str(_read_run_state(run_dir).get("status", "")).lower()
    if status not in {"done", "failed", "cancelled", "canceled"}:
        return
    try:
        shutil.rmtree(run_dir)
        print(f"[cleanup] removed terminal run={run_dir.name} status={status}", flush=True)
        _remove_empty_job_dir(run_dir.parent, runs_root)
    except OSError as error:
        print(f"[cleanup] unable to remove terminal run={run_dir}: {error}", flush=True)


def _safe_child_dir(root: Path, name: str) -> Path | None:
    """Return a child directory only when it stays below root."""
    try:
        candidate = (root / str(name)).resolve(strict=False)
        resolved_root = root.resolve(strict=False)
        if candidate == resolved_root or resolved_root not in candidate.parents:
            return None
        return candidate
    except OSError:
        return None


def cleanup_completed_job_workspace(*, job: dict, config, state) -> None:
    """Remove per-job local inputs/temp after any terminal worker outcome."""
    workspace = config.workspace_root
    job_input = _safe_child_dir(workspace / "job_inputs", _folder_safe_job_name(job))
    job_id = job.get("external_job_id") or getattr(state, "job_id", None)
    temp_job = _safe_child_dir(workspace / "tmp", job_id)
    paths = (
        ("job_inputs", job_input),
        ("tmp", temp_job),
    )
    removed = []
    for label, path in paths:
        if path is None or not path.exists() or not path.is_dir():
            continue
        try:
            shutil.rmtree(path)
            removed.append(label)
        except OSError as error:
            print(f"[cleanup] unable to remove {label} job={job_id}: {error}", flush=True)
    if removed:
        print(f"[cleanup] job={job_id} removed={','.join(removed)}", flush=True)


def _cleanup_terminal_cache_and_logs(*, config, job_id: str, reason: str) -> None:
    """Clean this worker's private MT5 terminal cache/logs after a terminal job.

    Each worker owns one MT5 terminal data directory and the queue worker is
    single-flight, so this runs only after the MT5 process and result upload
    have finished. Every Tick can recreate Tester cache when it is needed.
    """
    if not TERMINAL_CACHE_CLEANUP_ENABLED:
        return

    raw_terminal_root = getattr(config, "terminal_data_path", "")
    if not raw_terminal_root:
        return
    terminal_root = Path(raw_terminal_root)

    tester_root = terminal_root / "Tester"
    candidates = (tester_root / "cache", tester_root / "logs", tester_root / "Logs")
    metadata_file = terminal_root / "mt5_worker_data_cache.json"
    seen = set()
    removed_files = 0
    removed_dirs = 0
    removed_bytes = 0

    for target in candidates:
        try:
            resolved = target.resolve(strict=False)
        except OSError:
            resolved = target
        if resolved in seen or not target.exists() or not target.is_dir():
            continue
        seen.add(resolved)

        try:
            entries = list(target.iterdir())
        except OSError as error:
            print(f"[cleanup] terminal directory scan skipped path={target}: {error}", flush=True)
            continue

        for entry in entries:
            try:
                if entry.is_dir():
                    shutil.rmtree(entry)
                    removed_dirs += 1
                else:
                    try:
                        removed_bytes += entry.stat().st_size
                    except OSError:
                        pass
                    entry.unlink()
                    removed_files += 1
            except OSError as error:
                # MT5 may recreate or briefly lock a current log. Do not make
                # a completed job fail just because one cleanup item was busy.
                print(f"[cleanup] terminal item skipped path={entry}: {error}", flush=True)

    # The preload metadata is useful only while the corresponding terminal
    # data is being retained. Since this worker cleans Tester cache after every
    # terminal job, remove the marker too so the next job verifies preload
    # again instead of reporting a misleading metadata hit.
    if metadata_file.exists() and metadata_file.is_file():
        try:
            try:
                removed_bytes += metadata_file.stat().st_size
            except OSError:
                pass
            metadata_file.unlink()
            removed_files += 1
        except OSError as error:
            print(f"[cleanup] terminal metadata skipped path={metadata_file}: {error}", flush=True)

    if removed_files or removed_dirs:
        print(
            f"[cleanup] terminal storage cleaned job={job_id} reason={reason} "
            f"files={removed_files} dirs={removed_dirs} bytes={removed_bytes}",
            flush=True,
        )


def _resolve_mt5_agent_root(config) -> tuple[Path, Path] | None:
    """Resolve the shared Tester root only for MetaQuotes/Terminal/<id>."""
    raw_terminal_root = getattr(config, "terminal_data_path", "")
    if not raw_terminal_root:
        return None
    try:
        terminal_root = Path(raw_terminal_root).resolve(strict=False)
        terminal_parent = terminal_root.parent
        metaquotes_root = terminal_parent.parent
        if terminal_parent.name.lower() != "terminal" or metaquotes_root.name.lower() != "metaquotes":
            return None
        tester_root = (metaquotes_root / "Tester").resolve(strict=False)
        agent_root = (tester_root / terminal_root.name).resolve(strict=False)
        if agent_root.parent != tester_root or agent_root.name != terminal_root.name:
            return None
        return tester_root, agent_root
    except OSError:
        return None


def _mt5_process_state(config, agent_root: Path) -> bool | None:
    """Return True when this terminal/tester is active, False when idle, None when unknown."""
    if os.name != "nt":
        return None
    command = (
        "$items = Get-CimInstance Win32_Process | "
        "Where-Object { $_.Name -in @('terminal64.exe','metatester64.exe') } | "
        "Select-Object Name,ExecutablePath,CommandLine; "
        "@($items) | ConvertTo-Json -Compress"
    )
    try:
        completed = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                command,
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if completed.returncode != 0:
            return None
        raw = completed.stdout.strip()
        processes = json.loads(raw) if raw else []
        if isinstance(processes, dict):
            processes = [processes]
        if not isinstance(processes, list):
            return None

        mt5_path = str(Path(getattr(config, "mt5_path", "")).resolve(strict=False)).lower()
        scoped_agent_root = str(agent_root).lower()
        for process in processes:
            if not isinstance(process, dict):
                continue
            name = str(process.get("Name") or "").lower()
            executable = str(process.get("ExecutablePath") or "").lower()
            command_line = str(process.get("CommandLine") or "").lower()
            process_text = f"{executable} {command_line}"
            if name == "terminal64.exe" and mt5_path and mt5_path in process_text:
                return True
            if name == "metatester64.exe":
                if scoped_agent_root in process_text:
                    return True
                # Access to process paths can be denied. In that case, fail safe
                # instead of deleting a log which may still be in use.
                if not executable and not command_line:
                    return None
        return False
    except (OSError, subprocess.SubprocessError, ValueError, TypeError):
        return None


def _tree_size(path: Path) -> int:
    if path.is_file():
        try:
            return path.stat().st_size
        except OSError:
            return 0
    total = 0
    try:
        for child in path.rglob("*"):
            if child.is_file():
                try:
                    total += child.stat().st_size
                except OSError:
                    pass
    except OSError:
        pass
    return total


def _latest_tree_mtime(path: Path) -> float:
    """Return the newest mtime in a log entry without reading file contents."""
    try:
        latest = path.stat().st_mtime
    except OSError:
        return float("inf")
    if not path.is_dir():
        return latest
    try:
        for child in path.rglob("*"):
            try:
                latest = max(latest, child.stat().st_mtime)
            except OSError:
                return float("inf")
    except OSError:
        return float("inf")
    return latest


def cleanup_mt5_local_agent_logs(*, config, job_id: str, reason: str) -> None:
    """Remove log contents for this terminal's local agents, never bases/history."""
    if not MT5_AGENT_LOG_CLEANUP_ENABLED:
        return
    resolved = _resolve_mt5_agent_root(config)
    if resolved is None:
        print(
            f"[cleanup] MT5 agent log cleanup skipped reason=unsafe_agent_root "
            f"path={getattr(config, 'terminal_data_path', '')}",
            flush=True,
        )
        return
    tester_root, agent_root = resolved
    if not agent_root.exists() or not agent_root.is_dir():
        return

    process_state = _mt5_process_state(config, agent_root)
    if process_state is True:
        print("[cleanup] MT5 agent log cleanup skipped reason=terminal_active", flush=True)
        return
    fallback_cutoff = time.time() - MT5_AGENT_LOG_FALLBACK_RETENTION_HOURS * 60 * 60
    fallback_only = process_state is None
    if fallback_only:
        print(
            "[cleanup] MT5 agent process state unknown; "
            f"removing only logs older than {MT5_AGENT_LOG_FALLBACK_RETENTION_HOURS}h",
            flush=True,
        )

    agents = 0
    removed_files = 0
    removed_dirs = 0
    removed_bytes = 0
    try:
        candidates = list(agent_root.iterdir())
    except OSError as error:
        print(f"[cleanup] MT5 agent root scan skipped path={agent_root} error={error}", flush=True)
        return

    for agent_dir in candidates:
        if (
            not agent_dir.is_dir()
            or not agent_dir.name.startswith("Agent-127.0.0.1-")
            or not agent_dir.name.removeprefix("Agent-127.0.0.1-").isdigit()
        ):
            continue
        try:
            resolved_agent = agent_dir.resolve(strict=False)
            if resolved_agent.parent != agent_root:
                continue
            logs_dir = (resolved_agent / "logs").resolve(strict=False)
            if logs_dir.parent != resolved_agent or not logs_dir.exists() or not logs_dir.is_dir():
                continue
            if tester_root not in logs_dir.parents or agent_root not in logs_dir.parents:
                continue
            entries = list(logs_dir.iterdir())
        except OSError as error:
            print(f"[cleanup] MT5 agent log scan skipped path={agent_dir} error={error}", flush=True)
            continue
        agents += 1

        for entry in entries:
            try:
                resolved_entry = entry.resolve(strict=False)
                if logs_dir not in resolved_entry.parents:
                    print(f"[cleanup] MT5 agent log item skipped path={entry} error=unsafe_path", flush=True)
                    continue
                if fallback_only:
                    if _latest_tree_mtime(entry) >= fallback_cutoff:
                        continue
                size = _tree_size(entry)
                if entry.is_dir():
                    shutil.rmtree(entry)
                    removed_dirs += 1
                else:
                    entry.unlink()
                    removed_files += 1
                removed_bytes += size
            except OSError as error:
                print(f"[cleanup] MT5 agent log item skipped path={entry} error={error}", flush=True)

    if removed_files or removed_dirs:
        print(
            f"[cleanup] MT5 agent logs cleaned job={job_id} reason={reason} "
            f"agents={agents} files={removed_files} dirs={removed_dirs} bytes={removed_bytes}",
            flush=True,
        )
    elif agents:
        print(f"[cleanup] MT5 agent logs already clean job={job_id} agents={agents}", flush=True)


def cleanup_terminal_cache_and_logs(*, config, job_id: str, reason: str) -> None:
    """Clean terminal-private storage and the matching shared local-agent logs."""
    _cleanup_terminal_cache_and_logs(config=config, job_id=job_id, reason=reason)
    cleanup_mt5_local_agent_logs(config=config, job_id=job_id, reason=reason)


def cleanup_stale_temp_uploads(workspace_root: Path, retention_hours: int = 24) -> None:
    """Clean only old temporary upload/download directories at startup."""
    cutoff = time.time() - max(1, retention_hours) * 60 * 60
    roots = (workspace_root / "artifact_uploads", workspace_root / "temp_downloads")
    removed = 0
    for root in roots:
        if not root.exists() or not root.is_dir():
            continue
        for entry in root.iterdir():
            if not entry.is_dir():
                continue
            try:
                if entry.stat().st_mtime < cutoff:
                    shutil.rmtree(entry)
                    removed += 1
            except OSError as error:
                print(f"[cleanup] unable to remove stale temp={entry}: {error}", flush=True)
    if removed:
        print(f"[cleanup] removed stale temp directories count={removed}", flush=True)


def cleanup_orphan_workspace(*, workspace_root: Path, runs_root: Path, client) -> None:
    """Remove old local workspaces only after a successful DB status lookup."""
    cutoff = time.time() - WORKSPACE_ORPHAN_RETENTION_HOURS * 60 * 60
    stale_run_dirs = []
    stale_tmp_dirs = []
    stale_input_dirs = []

    if runs_root.exists() and runs_root.is_dir():
        for job_dir in runs_root.iterdir():
            if not job_dir.is_dir():
                continue
            for run_dir in job_dir.iterdir():
                if run_dir.is_dir() and run_dir.stat().st_mtime < cutoff:
                    stale_run_dirs.append((job_dir.name, run_dir))

    for root, target in (
        (workspace_root / "tmp", stale_tmp_dirs),
        (workspace_root / "job_inputs", stale_input_dirs),
    ):
        if not root.exists() or not root.is_dir():
            continue
        for entry in root.iterdir():
            if entry.is_dir() and entry.stat().st_mtime < cutoff:
                target.append(entry)

    if not stale_run_dirs and not stale_tmp_dirs and not stale_input_dirs:
        return

    job_ids = {job_id for job_id, _ in stale_run_dirs}
    job_ids.update(entry.name for entry in stale_tmp_dirs)
    job_names = [entry.name for entry in stale_input_dirs]
    try:
        rows = client.get_job_statuses(
            external_job_ids=sorted(job_ids),
            job_names=job_names,
        )
    except Exception as error:
        print(f"[cleanup] orphan sweep skipped; DB status lookup failed: {error}", flush=True)
        return

    status_by_id = {str(row.get("external_job_id")): str(row.get("status", "")).lower() for row in rows}
    status_by_name = {str(row.get("job_name")): str(row.get("status", "")).lower() for row in rows}
    status_by_input_name = {
        _folder_safe_job_name(row): str(row.get("status", "")).lower()
        for row in rows
    }
    removed = 0

    for job_id, run_dir in stale_run_dirs:
        if status_by_id.get(str(job_id)) == "running":
            continue
        if not _is_safe_run_dir(run_dir, runs_root):
            continue
        try:
            shutil.rmtree(run_dir)
            removed += 1
            _remove_empty_job_dir(run_dir.parent, runs_root)
        except OSError as error:
            print(f"[cleanup] unable to remove orphan run={run_dir}: {error}", flush=True)

    for entry in stale_tmp_dirs:
        if status_by_id.get(entry.name) == "running":
            continue
        safe_path = _safe_child_dir(workspace_root / "tmp", entry.name)
        if safe_path is None or not safe_path.exists():
            continue
        try:
            shutil.rmtree(safe_path)
            removed += 1
        except OSError as error:
            print(f"[cleanup] unable to remove orphan tmp={safe_path}: {error}", flush=True)

    for entry in stale_input_dirs:
        if (status_by_name.get(entry.name) or status_by_input_name.get(entry.name)) == "running":
            continue
        safe_path = _safe_child_dir(workspace_root / "job_inputs", entry.name)
        if safe_path is None or not safe_path.exists():
            continue
        try:
            shutil.rmtree(safe_path)
            removed += 1
        except OSError as error:
            print(f"[cleanup] unable to remove orphan job input={safe_path}: {error}", flush=True)

    if removed:
        print(f"[cleanup] removed orphan workspace entries count={removed}", flush=True)


def cleanup_expired_runs(runs_root: Path) -> None:
    """Remove only completed run directories older than the retention period."""
    if not runs_root.exists() or not runs_root.is_dir():
        return
    cutoff = time.time() - RUN_RETENTION_DAYS * 24 * 60 * 60
    removed = 0
    for job_dir in runs_root.iterdir():
        if not job_dir.is_dir():
            continue
        for run_dir in job_dir.iterdir():
            if not run_dir.is_dir() or not _is_safe_run_dir(run_dir, runs_root):
                continue
            if str(_read_run_state(run_dir).get("status", "")).lower() != "done":
                continue
            try:
                if run_dir.stat().st_mtime < cutoff:
                    shutil.rmtree(run_dir)
                    removed += 1
                    _remove_empty_job_dir(job_dir, runs_root)
            except OSError as error:
                print(f"[cleanup] unable to remove {run_dir}: {error}", flush=True)
        _remove_empty_job_dir(job_dir, runs_root)
    if removed:
        print(f"[cleanup] removed expired completed runs count={removed}", flush=True)


def _extract_asset_symbol(filename: str) -> str:
    """Lấy asset chuẩn từ tên file, bỏ mã bot và prefix broker."""
    import re
    stem = Path(str(filename)).stem.upper()
    timeframes = r"H1|H4|M15|M30|D1|M1|H12|W1|MN"
    for asset in KNOWN_ASSET_SYMBOLS:
        if re.search(rf"{re.escape(asset)}(?={timeframes})(?:_|$|[A-Z])", stem):
            return asset
    return ""


def _format_strategy_name(job: dict) -> str:
    """Format ten strategy ngan gon tu job_name, vi du: 001BTCUSDH1OB.
    Dung cung pattern voi getShortJobName o backend JS:
    ([A-Z0-9]+)(H1|H4|...) - khong hardcode danh sach symbol.
    Thua dai ca Xuan Son!"""
    import re
    raw = str(
        job.get("strategy_id")
        or job.get("strategy_code")
        or job.get("job_name")
        or job.get("bot_name")
        or job.get("external_job_id")
        or ""
    ).strip()
    if not raw:
        return "unknown"

    clean = re.sub(r'\.ini$', '', raw, flags=re.IGNORECASE).strip()

    # Prefer an existing canonical strategy code. This is important for
    # rerun jobs whose job_name contains suffixes such as
    # "rerun pass ... rank ...".
    canonical_pattern = r'(\d{3}[A-Z0-9]+(?:H12|M15|M30|H1|H4|D1|M1|W1|MN)(?:OB|OS))'
    canonical_match = re.search(canonical_pattern, clean, re.IGNORECASE)
    if canonical_match:
        return canonical_match.group(1).upper()

    # Lay ma bot 3 so dau
    num_match = re.match(r'^(\d{3})', clean)
    bot_id = num_match.group(1) if num_match else ""

    # Bỏ mã bot 3 chữ số trước khi tách SYMBOL + TIMEFRAME.
    # Ví dụ 080BBXAGUSDH1OB -> BBXAGUSD + H1.
    # Nếu không bỏ prefix này, symbol sẽ bị nhận thành 080BBXAGUSD.
    symbol_source = re.sub(r'^\d{3}', '', clean)

    # Tim tat ca cap (SYMBOL)(TIMEFRAME), lay cap CUOI cung - khong hardcode symbol
    tf_pattern = r'([A-Z0-9]+)(H1|H4|M15|M30|D1|M1|H12|W1|MN)(?=_|$|\s|\.)'
    all_matches = list(re.finditer(tf_pattern, symbol_source))
    best = all_matches[-1] if all_matches else None
    symbol = _extract_asset_symbol(clean) or (best.group(1).upper() if best else "")
    timeframe = best.group(2).upper() if best else ""

    # Phan loai Buy/Sell
    if re.search(r'_Buy', clean, re.IGNORECASE):
        direction = 'OB'
    elif re.search(r'_Sell', clean, re.IGNORECASE):
        direction = 'OS'
    else:
        direction = ''

    if bot_id and symbol and timeframe:
        return f"{bot_id}{symbol}{timeframe}{direction}"

    # Fallback: clean ten job
    safe = re.sub(r'[^a-zA-Z0-9_]', '', clean.replace('-', '_'))[:30]
    return safe or "unknown"


def _next_available_strategy_path(directory: Path, strategy_name: str) -> Path:
    """Keep every report while retaining the canonical base filename."""
    base = directory / f"{strategy_name}.xlsx"
    if not base.exists():
        return base

    index = 1
    while True:
        candidate = directory / f"{strategy_name} ({index}).xlsx"
        if not candidate.exists():
            return candidate
        index += 1


def _configure_utf8_output() -> None:
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class QueueHeartbeatReporter:
    def __init__(
        self,
        client: ServerApiClient,
        worker_name: str,
        worker_instance_id: str | None,
        interval_seconds: int,
    ) -> None:
        self.client = client
        self.worker_name = worker_name
        self.worker_instance_id = worker_instance_id
        self.interval_seconds = interval_seconds
        self._lock = threading.Lock()
        self._in_flight = False
        self._active_job_id: str | None = None
        self._snapshot: dict[str, object] = {}
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start_job(self, job_id: str, run_id: str | None = None) -> None:
        """Start a heartbeat loop that is independent from MT5 progress callbacks."""
        self.stop_job()
        with self._lock:
            self._active_job_id = job_id
            self._snapshot = {
                "job_id": job_id,
                "current_stage": "starting",
                "done_ini": 0,
                "total_ini": 0,
                "run_id": run_id,
                "generated_ini_count": 0,
                "current_item": None,
            }
        self._stop_event = threading.Event()
        self._thread = threading.Thread(
            target=self._heartbeat_loop,
            name=f"mt5-heartbeat-{job_id}",
            daemon=True,
        )
        self._thread.start()
        print(f"[heartbeat] started job={job_id} interval={self.interval_seconds}s", flush=True)

    def stop_job(self) -> None:
        thread = self._thread
        if thread is None:
            return
        self._stop_event.set()
        if thread is not threading.current_thread():
            thread.join(timeout=max(2, self.interval_seconds + 1))
        with self._lock:
            job_id = self._active_job_id
            self._active_job_id = None
            self._snapshot = {}
        self._thread = None
        if job_id:
            print(f"[heartbeat] stopped job={job_id}", flush=True)

    def _heartbeat_loop(self) -> None:
        # Send immediately, then continue while the runner is inside any blocking
        # MT5/preload operation. Progress callbacks only enrich the snapshot.
        while not self._stop_event.is_set():
            self._send_snapshot()
            self._stop_event.wait(max(1, self.interval_seconds))

    def _send_snapshot(self) -> None:
        with self._lock:
            if not self._active_job_id:
                return
            snapshot = dict(self._snapshot)
            if self._in_flight:
                return
            self._in_flight = True
        print(
            f"[heartbeat] job={snapshot['job_id']} stage={snapshot['current_stage']} "
            f"done={snapshot['done_ini']}/{snapshot['total_ini']}",
            flush=True,
        )

        def _send() -> None:
            try:
                self.client.job_heartbeat(
                    external_job_id=snapshot["job_id"],
                    worker_name=self.worker_name,
                    done_ini=snapshot["done_ini"],
                    total_ini=snapshot["total_ini"],
                    current_stage=snapshot["current_stage"],
                    current_item=snapshot["current_item"],
                    run_id=snapshot["run_id"],
                    generated_ini_count=snapshot["generated_ini_count"],
                )
            except Exception as exc:
                print(f"[heartbeat] send failed job={snapshot['job_id']}: {exc}", flush=True)
            finally:
                with self._lock:
                    self._in_flight = False

        threading.Thread(target=_send, name="mt5-heartbeat-request", daemon=True).start()

    def send_idle(self) -> None:
        try:
            worker = self.client.get_worker(self.worker_name)
            if worker is None:
                status = "active"
            elif worker.get("status") == "draining":
                status = "draining"
            else:
                status = "active"
            print(f"[worker] idle heartbeat -> status={status}", flush=True)
            self.client.worker_heartbeat(
                worker_name=self.worker_name,
                worker_instance_id=self.worker_instance_id,
                status=status,
                current_job_id=None,
            )
        except Exception as exc:
            print(f"Idle heartbeat skipped: {exc}", flush=True)

    def send_offline(self) -> None:
        try:
            print("[worker] sending offline heartbeat", flush=True)
            self.client.worker_heartbeat(
                worker_name=self.worker_name,
                worker_instance_id=self.worker_instance_id,
                status="offline",
                current_job_id=None,
            )
        except Exception as exc:
            print(f"Offline heartbeat skipped: {exc}", flush=True)

    def maybe_send(self, state) -> None:
        with self._lock:
            if not self._active_job_id:
                return
            current_item = next((item.ini_name for item in state.items if item.status == "running"), None)
            self._snapshot = {
                "job_id": state.job_id,
                "current_stage": state.current_stage,
                "done_ini": state.done_ini,
                "total_ini": state.total_ini,
                "run_id": state.run_id,
                "generated_ini_count": state.generated_ini_count,
                "current_item": current_item,
            }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="MT5 Queue Worker CLI")
    parser.add_argument("--worker-instance-id", default=os.getenv("MT5_WORKER_INSTANCE_ID", ""))
    parser.add_argument("--worker-name", required=True)
    parser.add_argument("--server-url", default=os.getenv("MT5_QUEUE_SERVER_URL", "http://127.0.0.1:5000"))
    parser.add_argument("--api-key", default=os.getenv("MT5_QUEUE_API_KEY", ""))
    parser.add_argument("--workspace-root", default=".")
    parser.add_argument("--mt5-path", default=None)
    parser.add_argument("--terminal-data-path", default=None)
    parser.add_argument("--strategies-dir", default=None, help="Folder to save strategy excel reports")
    parser.add_argument("--max-attempts", type=int, default=2)
    parser.add_argument("--retry-delay", type=int, default=3)
    parser.add_argument("--post-exit-grace", type=int, default=30)
    parser.add_argument("--inactivity-timeout", type=int, default=3600)
    parser.add_argument("--heartbeat-seconds", type=int, default=15)
    parser.add_argument("--poll-seconds", type=int, default=10)
    parser.add_argument("--server-health-timeout", type=int, default=60)
    parser.add_argument("--server-health-interval", type=int, default=3)
    parser.add_argument("--portable", action="store_true", help="Launch MT5 in portable mode")
    parser.add_argument("--once", action="store_true", help="Claim and execute at most one job")
    return parser


def main() -> int:
    _configure_utf8_output()
    args = build_parser().parse_args()
    if args.strategies_dir and args.strategies_dir.strip():
        os.environ["MQL5_STRATEGIES_DIR"] = args.strategies_dir.strip()
        print(f"[worker] Set MQL5_STRATEGIES_DIR to: {args.strategies_dir.strip()}", flush=True)

    print(f"[worker] starting worker_name={args.worker_name} server_url={args.server_url}", flush=True)
    if not args.api_key.strip():
        print("[worker] warning: API key is empty; job claim will be rejected by server", flush=True)
    client = ServerApiClient(
        args.server_url,
        api_key=args.api_key or None,
        timeout_seconds=max(args.poll_seconds, args.heartbeat_seconds, 30),
        max_retries=3,
        retry_delay_seconds=2.0,
    )
    print("[worker] waiting for server health", flush=True)
    while True:
        try:
            client.wait_until_healthy(
                timeout_seconds=args.server_health_timeout,
                interval_seconds=args.server_health_interval,
            )
            print("[worker] server healthy", flush=True)
            break
        except ServerApiError as exc:
            print(f"Server not ready yet: {exc}", flush=True)
            time.sleep(args.server_health_interval)
    config = build_config(
        workspace_root=args.workspace_root,
        mt5_path=args.mt5_path,
        terminal_data_path=args.terminal_data_path,
        portable_mode=args.portable,
        max_attempts_per_ini=args.max_attempts,
        retry_delay_seconds=args.retry_delay,
        report_post_exit_grace_seconds=args.post_exit_grace,
        inactivity_timeout_seconds=args.inactivity_timeout,
    )
    runs_root = config.workspace_root / "runs"
    cleanup_expired_runs(runs_root)
    cleanup_stale_temp_uploads(config.workspace_root)
    cleanup_orphan_workspace(workspace_root=config.workspace_root, runs_root=runs_root, client=client)
    cleanup_mt5_local_agent_logs(config=config, job_id="startup", reason="startup_sweep")
    next_workspace_sweep_at = time.monotonic() + WORKSPACE_SWEEP_INTERVAL_SECONDS
    next_agent_log_sweep_at = time.monotonic() + MT5_AGENT_LOG_SWEEP_INTERVAL_SECONDS
    runner = LocalJobRunner(config)
    worker_instance_id = args.worker_instance_id.strip() or None
    reporter = QueueHeartbeatReporter(client, args.worker_name, worker_instance_id, args.heartbeat_seconds)
    print(
        "[worker] launch config "
        f"mt5_path={config.mt5_path} portable={args.portable} terminal_data_path={config.terminal_data_path}",
        flush=True,
    )

    try:
        while True:
            try:
                if time.monotonic() >= next_workspace_sweep_at:
                    cleanup_orphan_workspace(
                        workspace_root=config.workspace_root,
                        runs_root=runs_root,
                        client=client,
                    )
                    next_workspace_sweep_at = time.monotonic() + WORKSPACE_SWEEP_INTERVAL_SECONDS
                if time.monotonic() >= next_agent_log_sweep_at:
                    cleanup_mt5_local_agent_logs(
                        config=config,
                        job_id="idle",
                        reason="periodic_idle_sweep",
                    )
                    next_agent_log_sweep_at = time.monotonic() + MT5_AGENT_LOG_SWEEP_INTERVAL_SECONDS
                print("[worker] polling server for job", flush=True)
                reporter.send_idle()
                job = client.claim_job(args.worker_name, worker_instance_id)
            except ServerApiError as exc:
                print(f"Server request failed: {exc}", flush=True)
                time.sleep(args.poll_seconds)
                continue
            if job is None:
                print(f"[worker] no job available, sleeping {args.poll_seconds}s", flush=True)
                if args.once:
                    print("No pending job")
                    return 0
                time.sleep(args.poll_seconds)
                continue

            print(f"Claimed job: {job['external_job_id']}", flush=True)
            reporter.start_job(job["external_job_id"], job.get("run_id"))
            print(f"[worker] preparing input for {job['external_job_id']}", flush=True)
            try:
                local_ini_folder = _prepare_job_input(client=client, config=config, job=job)
            except Exception as exc:
                print(f"[worker] input preparation failed: {exc}", flush=True)
                try:
                    _retry_server_call(
                        lambda: client.mark_failed(
                            worker_name=args.worker_name,
                            external_job_id=job["external_job_id"],
                            run_id=job.get("run_id"),
                            error_message=f"Input preparation failed: {exc}",
                        ),
                        label=f"mark_failed:input:{job['external_job_id']}",
                        retry_delay=args.poll_seconds,
                    )
                except Exception as mark_failed_exc:
                    print(f"[worker] could not mark input failure: {mark_failed_exc}", flush=True)
                cleanup_completed_job_workspace(job=job, config=config, state=None)
                cleanup_terminal_cache_and_logs(
                    config=config,
                    job_id=job["external_job_id"],
                    reason="input_preparation_failed",
                )
                reporter.stop_job()
                if args.once:
                    return 1
                continue
            print(f"[worker] input ready at {local_ini_folder}", flush=True)
            try:
                _ensure_experts_ready(
                    client=client,
                    runner=runner,
                    ini_folder=local_ini_folder,
                )
            except Exception as exc:
                print(f"[worker] expert preparation failed: {exc}", flush=True)
                try:
                    _retry_server_call(
                        lambda: client.mark_failed(
                            worker_name=args.worker_name,
                            external_job_id=job["external_job_id"],
                            run_id=job.get("run_id"),
                            error_message=str(exc),
                        ),
                        label=f"mark_failed:{job['external_job_id']}",
                        retry_delay=args.poll_seconds,
                    )
                finally:
                    cleanup_completed_job_workspace(job=job, config=config, state=None)
                    cleanup_terminal_cache_and_logs(
                        config=config,
                        job_id=job["external_job_id"],
                        reason="expert_preparation_failed",
                    )
                print(f"Failed job: {job['external_job_id']}", flush=True)
                reporter.stop_job()
                if args.once:
                    return 1
                continue
            request = JobRequest(
                job_id=job["external_job_id"],
                execution_run_id=job.get("run_id"),
                job_name=job.get("job_name"),
                bot_name=job["bot_name"],
                ini_folder=local_ini_folder,
                max_ini=job["max_ini"],
                optimize_runs=job["optimize_runs"],
            )
            state = None
            try:
                raw_mode = str(job.get("mode", "")).strip().lower()
                if raw_mode in {"0", "optimize_only", "open_price"}:
                    print(f"[worker] running optimize_only (mode=0/open_price) job={job['external_job_id']}", flush=True)
                    filters = FilterConfig(**(job["filters"] or {}))
                    state = runner.run_optimize_only(
                        request,
                        filters,
                        progress_callback=reporter.maybe_send,
                        optimize_stage_callback=lambda current_state: _upload_optimize_results_impl(
                            client=client,
                            job=job,
                            state=current_state,
                            retry_delay=args.poll_seconds,
                            heartbeat_callback=reporter.maybe_send,
                        ),
                    )
                elif raw_mode in {"2", "full_pipeline"}:
                    print(f"[worker] running full_pipeline (mode=2) job={job['external_job_id']}", flush=True)
                    filters = FilterConfig(**(job["filters"] or {}))
                    state = runner.run_full_pipeline(
                        request,
                        filters,
                        progress_callback=reporter.maybe_send,
                        optimize_stage_callback=lambda current_state: _upload_optimize_results_impl(
                            client=client,
                            job=job,
                            state=current_state,
                            retry_delay=args.poll_seconds,
                            heartbeat_callback=reporter.maybe_send,
                        ),
                    )
                else:
                    print(f"[worker] running backtest_only (mode=1/every_tick) job={job['external_job_id']}", flush=True)
                    state = runner.run_backtest_job(request, progress_callback=reporter.maybe_send)

                if state.status == "done":
                    if raw_mode in {"1", "backtest_only", "single_backtest", "every_tick"}:
                        try:
                            if state.run_dir:
                                reports_raw = Path(state.run_dir) / "reports" / "raw"
                                if reports_raw.exists():
                                    report_files = sorted([p for p in reports_raw.glob("*") if p.is_file() and p.suffix.lower() in {".htm", ".html", ".xml"}])
                                    xlsx_files = sorted([p for p in reports_raw.glob("*.xlsx") if p.is_file()])
                                    
                                    if report_files:
                                        report_path = report_files[0]
                                        print(f"[worker] parsing single backtest report: {report_path.name}", flush=True)
                                        payload = parse_mt5_single_backtest_report(report_path)
                                        payload["strategy_id"] = _format_strategy_name(job)
                                        payload["run_id"] = state.run_id
                                        
                                        _retry_server_call(
                                            lambda: client.upload_job_backtest_results(job["external_job_id"], payload),
                                            label=f"upload_job_backtest_results:{job['external_job_id']}",
                                            retry_delay=args.poll_seconds,
                                        )
                                        print(f"[worker] successfully uploaded backtest results for job {job['external_job_id']}", flush=True)
                                    else:
                                        raise RuntimeError("Every Tick report was not produced")
                        except Exception as parse_err:
                            print(f"[worker] failed to parse and upload backtest results: {parse_err}", flush=True)
                            raise RuntimeError(f"Every Tick result upload failed: {parse_err}") from parse_err

                    print(f"[worker] uploading result artifact job={job['external_job_id']}", flush=True)
                    result_artifact_relpath = _upload_run_artifact(
                        client=client,
                        config=config,
                        state=state,
                        heartbeat_callback=reporter.maybe_send,
                    )
                    
                    if result_artifact_relpath and args.strategies_dir:
                        # Localhost workers must also save the converted XLSX
                        # into the configured Strategies directory. The server
                        # URL does not determine whether a local copy is needed.
                        is_localhost = False
                        if is_localhost:
                            print("[worker] server is running on localhost, skip downloading Excel copy to avoid duplication", flush=True)
                        else:
                            strategies_path = Path(args.strategies_dir.strip())
                            if strategies_path.exists():
                                try:
                                    print(f"[worker] downloading converted Excel report from server for local saving", flush=True)
                                    temp_dl_dir = config.workspace_root / "temp_downloads"
                                    temp_dl_dir.mkdir(parents=True, exist_ok=True)
                                    
                                    downloaded_file = _retry_server_call(
                                        lambda: client.download_job_result_file(
                                            external_job_id=job["external_job_id"],
                                            destination_dir=temp_dl_dir
                                        ),
                                        label=f"download_job_result_file:{job['external_job_id']}",
                                        retry_delay=args.poll_seconds,
                                    )
                                    
                                    if downloaded_file and downloaded_file.exists():
                                        # The result endpoint may still return the raw MT5 ZIP when
                                        # server-side conversion fails. Never copy that artifact into
                                        # MQL5\Files\Strategies as an Excel result.
                                        if downloaded_file.suffix.lower() != ".xlsx":
                                            print(
                                                f"[worker] refusing to save non-XLSX result artifact "
                                                f"to Strategies: {downloaded_file.name}",
                                                flush=True,
                                            )
                                            shutil.rmtree(temp_dl_dir, ignore_errors=True)
                                            downloaded_file = None

                                    if downloaded_file and downloaded_file.exists():
                                        # Trich xuat Symbol tu ten file tai ve
                                        import re
                                        # Tên file có dạng 080BBXAGUSDH1OB.xlsx:
                                        # 3 chữ số đầu là bot id, không phải một phần của symbol.
                                        tf_pattern = r'^\d{3}([A-Z0-9]+)(H1|H4|M15|M30|D1|M1|H12|W1|MN)'
                                        match_tf = re.search(tf_pattern, downloaded_file.name, re.IGNORECASE)
                                        symbol = match_tf.group(1).upper() if match_tf else ""
                                        # Nhận diện asset chuẩn thay vì hardcode prefix broker.
                                        symbol = _extract_asset_symbol(downloaded_file.name) or symbol
                                        
                                        # Xac dinh thu muc dich (tao thu muc con symbol neu co)
                                        if symbol:
                                            dest_dir = strategies_path / symbol
                                        else:
                                            dest_dir = strategies_path
                                        dest_dir.mkdir(parents=True, exist_ok=True)
                                        
                                        # The Strategies folder keeps the canonical strategy name.
                                        # If the name already exists, preserve the previous file by
                                        # using the Windows-style (1), (2), ... suffix.
                                        canonical_name = _format_strategy_name(job)
                                        if not canonical_name or canonical_name == "unknown":
                                            canonical_name = re.sub(
                                                r"_R\d+$", "", downloaded_file.stem, flags=re.IGNORECASE
                                            )
                                        dest_file = _next_available_strategy_path(dest_dir, canonical_name)
                                        shutil.copy2(downloaded_file, dest_file)
                                        print(
                                            f"[worker] saved canonical Excel report copy to: {dest_file}",
                                            flush=True,
                                        )
                                        shutil.rmtree(temp_dl_dir, ignore_errors=True)
                                except Exception as dl_err:
                                    print(f"[worker] warning: failed to download result report copy: {dl_err}", flush=True)

                    try:
                        _retry_server_call(
                            lambda: client.mark_done(
                                worker_name=args.worker_name,
                                external_job_id=job["external_job_id"],
                                run_id=state.run_id,
                                run_dir=state.run_dir or "",
                                done_ini=state.done_ini,
                                failed_ini=state.failed_ini,
                                total_ini=state.total_ini,
                                generated_ini_count=state.generated_ini_count,
                                result_artifact_relpath=result_artifact_relpath,
                            ),
                            label=f"mark_done:{job['external_job_id']}",
                            retry_delay=args.poll_seconds,
                        )
                    except Exception:
                        # A batch may be deleted while MT5 is still running.
                        # The server can then reject mark_done, but the local
                        # run is already terminal and must not remain on disk.
                        cleanup_terminal_run(Path(state.run_dir), runs_root)
                        cleanup_completed_job_workspace(job=job, config=config, state=state)
                        cleanup_terminal_cache_and_logs(
                            config=config,
                            job_id=job["external_job_id"],
                            reason="mark_done_report_failed",
                        )
                        raise
                    cleanup_completed_run(Path(state.run_dir), runs_root)
                    cleanup_completed_job_workspace(job=job, config=config, state=state)
                    cleanup_terminal_cache_and_logs(
                        config=config,
                        job_id=job["external_job_id"],
                        reason="job_completed",
                    )
                    print(f"Finished job: {job['external_job_id']}", flush=True)
                else:
                    print(f"[worker] job finished with status={state.status}", flush=True)
                    _retry_server_call(
                        lambda: client.mark_failed(
                            worker_name=args.worker_name,
                            external_job_id=job["external_job_id"],
                            run_id=state.run_id,
                            error_message=state.last_error or f"Runner finished with status={state.status}",
                        ),
                        label=f"mark_failed:{job['external_job_id']}",
                        retry_delay=args.poll_seconds,
                    )
                    cleanup_terminal_run(Path(state.run_dir), runs_root)
                    cleanup_completed_job_workspace(job=job, config=config, state=state)
                    cleanup_terminal_cache_and_logs(
                        config=config,
                        job_id=job["external_job_id"],
                        reason="job_failed",
                    )
                    print(f"Failed job: {job['external_job_id']}", flush=True)
            except Exception as exc:
                print(f"[worker] job failed with exception: {exc}", flush=True)
                try:
                    _retry_server_call(
                        lambda: client.mark_failed(
                        worker_name=args.worker_name,
                        external_job_id=job["external_job_id"],
                        run_id=state.run_id if state is not None else job.get("run_id"),
                        error_message=str(exc),
                        ),
                        label=f"mark_failed:{job['external_job_id']}",
                        retry_delay=args.poll_seconds,
                    )
                except Exception as mark_failed_exc:
                    # A transient outage while reporting the failed job must
                    # not terminate the worker process. The server-side stale
                    # job recovery can handle the job on the next heartbeat.
                    print(
                        f"[worker] could not mark failed job={job['external_job_id']}: "
                        f"{mark_failed_exc}",
                        flush=True,
                    )
                if state is not None and state.run_dir:
                    cleanup_terminal_run(Path(state.run_dir), runs_root)
                    cleanup_completed_job_workspace(job=job, config=config, state=state)
                    cleanup_terminal_cache_and_logs(
                        config=config,
                        job_id=job["external_job_id"],
                        reason="job_exception",
                    )
                else:
                    # The runner may fail before returning a state object. The
                    # process guard prevents deletion if MT5/MetaTester is
                    # still active; otherwise clean logs left by that attempt.
                    cleanup_mt5_local_agent_logs(
                        config=config,
                        job_id=job["external_job_id"],
                        reason="job_exception_without_state",
                    )
                reporter.stop_job()
                if args.once:
                    return 1
                continue
            reporter.stop_job()
            if args.once:
                return 0
    except KeyboardInterrupt:
        print("Stopping worker...", flush=True)
        return 0
    finally:
        reporter.stop_job()
        try:
            reporter.send_offline()
        except Exception:
            pass


def _retry_server_call(fn, *, label: str, retry_delay: int, max_attempts: int = 3):
    last_exc = None
    for attempt in range(1, max_attempts + 1):
        try:
            print(f"[worker] {label} attempt {attempt}/{max_attempts}", flush=True)
            return fn()
        except ServerApiError as exc:
            last_exc = exc
            print(f"{label} failed (attempt {attempt}/{max_attempts}): {exc}", flush=True)
            if attempt < max_attempts:
                time.sleep(retry_delay)
    if last_exc:
        raise last_exc


def _prepare_job_input(*, client: ServerApiClient, config, job: dict) -> Path:
    download_url = job.get("artifact_download_url")
    if not download_url:
        print("[worker] no artifact download url, using local ini folder", flush=True)
        return Path(job["ini_folder"])

    target_dir = config.workspace_root / "job_inputs" / _folder_safe_job_name(job)
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    if str(download_url).startswith("/"):
        download_url = f"{client.base_url}{download_url}"
    print(f"[worker] downloading artifact from {download_url}", flush=True)
    client.download_file(url=download_url, destination_dir=target_dir)
    return target_dir


def _upload_optimize_results(*, client: ServerApiClient, job: dict, state, retry_delay: int) -> None:
    _upload_optimize_results_impl(client=client, job=job, state=state, retry_delay=retry_delay, heartbeat_callback=None)


def _upload_optimize_results_impl(
    *,
    client: ServerApiClient,
    job: dict,
    state,
    retry_delay: int,
    heartbeat_callback=None,
) -> None:
    optimize_results_path = Path(state.optimize_results_path or Path(state.run_dir or "") / "optimize" / "results.json")
    if not optimize_results_path.exists():
        raise RuntimeError(f"Optimize results file not found: {optimize_results_path}")

    try:
        payload = json.loads(optimize_results_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[worker] failed to read optimize results snapshot: {exc}", flush=True)
        return

    if isinstance(payload, dict):
        payload["source_job_id"] = job.get("source_job_id") or payload.get("source_job_id")
        payload["template_ini_relpath"] = job.get("artifact_relpath") or payload.get("template_ini_relpath")
        payload["run_id"] = state.run_id

    rows = list(payload.get("rows") or []) if isinstance(payload, dict) else []
    if not rows:
        raise RuntimeError(f"Optimize results payload has no rows for job={state.job_id}")

    total_chunks = max(1, (len(rows) + OPTIMIZE_UPLOAD_CHUNK_SIZE - 1) // OPTIMIZE_UPLOAD_CHUNK_SIZE)
    upload_id = f"{state.run_id or state.job_id}__opt__{int(time.time() * 1000)}"
    base_summary = dict(payload.get("summary") or {}) if isinstance(payload, dict) else {}

    try:
        if heartbeat_callback is not None:
            heartbeat_callback(state)
        start_payload = {
            "upload_id": upload_id,
            "total_chunks": total_chunks,
            "template_ini_name": payload.get("template_ini_name"),
            "template_ini_relpath": payload.get("template_ini_relpath"),
            "source_job_id": payload.get("source_job_id"),
            "run_id": payload.get("run_id"),
            "summary": base_summary,
        }

        try:
            _retry_server_call(
                lambda: client.start_optimize_results_session(
                    external_job_id=state.job_id,
                    payload=start_payload,
                ),
                label=f"start_optimize_results_session:{state.job_id}",
                retry_delay=retry_delay,
            )
        except ServerApiError as exc:
            message = str(exc)
            if "Cannot POST /jobs/" in message or "404" in message:
                print("[worker] optimize session endpoint unavailable, falling back to legacy sequential upload", flush=True)
                return _upload_optimize_results_legacy(
                    client=client,
                    job=job,
                    state=state,
                    retry_delay=retry_delay,
                    heartbeat_callback=heartbeat_callback,
                    payload=payload,
                    rows=rows,
                    total_chunks=total_chunks,
                )
            raise

        chunk_payloads = []
        for chunk_index in range(total_chunks):
            start = chunk_index * OPTIMIZE_UPLOAD_CHUNK_SIZE
            end = start + OPTIMIZE_UPLOAD_CHUNK_SIZE
            chunk_rows = rows[start:end]
            chunk_payloads.append(
                {
                    "upload_id": upload_id,
                    "chunk_index": chunk_index + 1,
                    "total_chunks": total_chunks,
                    "replace_existing": chunk_index == 0,
                    "rows": chunk_rows,
                    "summary": base_summary,
                    "source_job_id": payload.get("source_job_id"),
                    "template_ini_name": payload.get("template_ini_name"),
                    "template_ini_relpath": payload.get("template_ini_relpath"),
                    "run_id": payload.get("run_id"),
                }
            )

        max_workers = min(OPTIMIZE_UPLOAD_CONCURRENCY, total_chunks)
        print(
            f"[worker] uploading optimize results job={state.job_id} chunks={total_chunks} "
            f"concurrency={max_workers} chunk_size={OPTIMIZE_UPLOAD_CHUNK_SIZE}",
            flush=True,
        )
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = []
            for chunk_payload in chunk_payloads:
                chunk_index = chunk_payload["chunk_index"]
                thread_client = ServerApiClient(
                    client.base_url,
                    api_key=client.api_key,
                    timeout_seconds=client.timeout_seconds,
                    max_retries=client.max_retries,
                    retry_delay_seconds=client.retry_delay_seconds,
                )
                futures.append(
                    executor.submit(
                        _retry_server_call,
                        lambda chunk_payload=chunk_payload, thread_client=thread_client: thread_client.upload_optimize_results_session_chunk(
                            external_job_id=state.job_id,
                            payload=chunk_payload,
                        ),
                        label=f"upload_optimize_results:{state.job_id}:chunk_{chunk_index}/{total_chunks}",
                        retry_delay=retry_delay,
                    )
                )

            for future in as_completed(futures):
                future.result()
                if heartbeat_callback is not None:
                    heartbeat_callback(state)

        finalize_payload = {
            "upload_id": upload_id,
            "total_chunks": total_chunks,
            "summary": base_summary,
            "source_job_id": payload.get("source_job_id"),
            "template_ini_name": payload.get("template_ini_name"),
            "template_ini_relpath": payload.get("template_ini_relpath"),
            "run_id": payload.get("run_id"),
        }
        response = _retry_server_call(
            lambda: client.finalize_optimize_results_session(
                external_job_id=state.job_id,
                payload=finalize_payload,
            ),
            label=f"finalize_optimize_results_session:{state.job_id}",
            retry_delay=retry_delay,
        )
        print(
            f"[worker] optimize results uploaded job={state.job_id} rows={len(rows)} "
            f"artifact={response.get('job', {}).get('optimize_snapshot_relpath') or 'stored'}",
            flush=True,
        )
    except ServerApiError as exc:
        print(f"[worker] optimize results upload failed: {exc}", flush=True)
        raise


def _upload_optimize_results_legacy(
    *,
    client: ServerApiClient,
    job: dict,
    state,
    retry_delay: int,
    heartbeat_callback=None,
    payload: dict,
    rows: list,
    total_chunks: int,
) -> None:
    try:
        for chunk_index in range(total_chunks):
            start = chunk_index * OPTIMIZE_UPLOAD_CHUNK_SIZE
            end = start + OPTIMIZE_UPLOAD_CHUNK_SIZE
            chunk_rows = rows[start:end]
            chunk_payload = dict(payload)
            chunk_payload["rows"] = chunk_rows
            chunk_payload["chunk_index"] = chunk_index + 1
            chunk_payload["total_chunks"] = total_chunks
            chunk_payload["replace_existing"] = chunk_index == 0
            _retry_server_call(
                lambda chunk_payload=chunk_payload: client.upload_optimize_results(
                    external_job_id=state.job_id,
                    payload=chunk_payload,
                ),
                label=f"upload_optimize_results:{state.job_id}:chunk_{chunk_index + 1}/{total_chunks}",
                retry_delay=retry_delay,
            )
            if heartbeat_callback is not None:
                heartbeat_callback(state)
        print(f"[worker] optimize results uploaded job={state.job_id}", flush=True)
    except ServerApiError as exc:
        print(f"[worker] optimize results upload skipped: {exc}", flush=True)


def _folder_safe_job_name(job: dict) -> str:
    raw_name = str(job.get("job_name") or job.get("bot_name") or job.get("external_job_id") or "").strip()
    cleaned = "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in raw_name)
    cleaned = cleaned.strip("._-")
    return cleaned or str(job.get("external_job_id") or "job")


def _ensure_experts_ready(*, client: ServerApiClient, runner: LocalJobRunner, ini_folder: Path) -> None:
    ini_files = sorted(path for path in ini_folder.glob("*.ini") if path.is_file())
    if not ini_files:
        return

    compiled: set[str] = set()
    for ini_path in ini_files:
        expert_path = _read_expert_path_from_ini(ini_path)
        if not expert_path:
            continue
        normalized_expert = expert_path.strip().replace("/", "\\").lower()
        if normalized_expert in compiled:
            continue
        compiled.add(normalized_expert)
        expert_relpath = Path(expert_path.replace("/", "\\"))
        target_source = (
            runner.adapter.terminal_data_path
            / "MQL5"
            / "Experts"
            / expert_relpath.with_suffix(".mq5")
        )
        target_ex5 = target_source.with_suffix(".ex5")
        if target_ex5.exists():
            continue
        if not target_source.exists():
            try:
                print(f"[worker] downloading Lotus MQ5 source for: {expert_path}", flush=True)
                client.download_lotus_artifact_source(
                    expert_path=expert_path,
                    destination_dir=target_source.parent,
                )
            except ServerApiError as exc:
                print(f"[worker] Lotus MQ5 download skipped: {exc}", flush=True)
        print(f"[worker] ensuring expert is compiled: {expert_path}", flush=True)
        runner.adapter.ensure_compiled_expert(
            expert_path=expert_path,
        )


def _read_expert_path_from_ini(ini_path: Path) -> str | None:
    for encoding in ("utf-16", "utf-8-sig", "utf-8", "latin-1"):
        try:
            text = ini_path.read_text(encoding=encoding)
            break
        except UnicodeError:
            continue
    else:
        return None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.lower().startswith("expert="):
            value = line.split("=", 1)[1].strip()
            return value or None
    return None


def _upload_run_artifact(*, client: ServerApiClient, config, state, heartbeat_callback=None) -> str | None:
    if not state.run_dir:
        return None
    run_dir = Path(state.run_dir)
    if not run_dir.exists():
        return None

    upload_dir = config.workspace_root / "artifact_uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(dir=upload_dir) as temp_dir:
        # Check if there is a direct report file (.xml/.xlsx/.htm) in reports/raw
        reports_raw = run_dir / "reports" / "raw"
        single_report = None
        if reports_raw.exists():
            report_files = sorted(
                [p for p in reports_raw.glob("*") if p.is_file() and p.suffix.lower() in {".xml", ".xlsx", ".htm", ".html"}],
                key=lambda item: (0 if item.suffix.lower() == ".xlsx" else 1, item.name.lower()),
            )
            png_files = [p for p in reports_raw.glob("*.png") if p.is_file()]
            # If png files exist alongside the report, we want to upload them too, so we zip the whole folder instead of single report upload
            if report_files and not png_files:
                single_report = report_files[0]

        if single_report and single_report.exists():
            print(f"[worker] found single report file {single_report.name}, uploading directly", flush=True)
            archive_path = single_report
        else:
            archive_base = Path(temp_dir) / state.run_id
            print(f"[worker] creating archive from {run_dir}", flush=True)
            archive_path = Path(shutil.make_archive(str(archive_base), "zip", root_dir=run_dir.parent, base_dir=run_dir.name))
        archive_size = archive_path.stat().st_size
        total_chunks = max(1, (archive_size + RESULT_UPLOAD_CHUNK_SIZE - 1) // RESULT_UPLOAD_CHUNK_SIZE)
        upload_id = state.run_id or f"{state.job_id}_{int(time.time())}"
        print(
            f"[worker] uploading archive {archive_path.name} size={archive_size} "
            f"chunks={total_chunks} chunk_size={RESULT_UPLOAD_CHUNK_SIZE}",
            flush=True,
        )
        chunk_upload_supported = True
        with archive_path.open("rb") as handle:
            for chunk_index in range(1, total_chunks + 1):
                chunk = handle.read(RESULT_UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                if heartbeat_callback is not None:
                    heartbeat_callback(state)
                print(
                    f"[worker] upload_result_artifact:{state.job_id}:chunk_{chunk_index}/{total_chunks}",
                    flush=True,
                )
                try:
                    response = _retry_server_call(
                        lambda chunk=chunk, chunk_index=chunk_index: client.upload_job_result_artifact_chunk(
                            external_job_id=state.job_id,
                            filename=archive_path.name,
                            upload_id=upload_id,
                            chunk_index=chunk_index,
                            total_chunks=total_chunks,
                            content=chunk,
                            replace_existing=chunk_index == 1,
                            run_id=state.run_id,
                        ),
                        label=f"upload_result_artifact:{state.job_id}:chunk_{chunk_index}/{total_chunks}",
                        retry_delay=3,
                    )
                except ServerApiError as exc:
                    message = str(exc)
                    if "Cannot POST /jobs/" in message or "404" in message:
                        chunk_upload_supported = False
                        print(
                            "[worker] chunk upload endpoint unavailable, falling back to single upload",
                            flush=True,
                        )
                        break
                    raise
                if response.get("complete"):
                    if response.get("processing") or response.get("status") == "PROCESSING":
                        deadline = time.time() + 15 * 60
                        print(
                            f"[worker] waiting for converted artifact job={state.job_id}",
                            flush=True,
                        )
                        while time.time() < deadline:
                            if heartbeat_callback is not None:
                                heartbeat_callback(state)
                            status = _retry_server_call(
                                lambda: client.get_result_artifact_status(
                                    external_job_id=state.job_id,
                                ),
                                label=f"result_artifact_status:{state.job_id}",
                                retry_delay=3,
                            )
                            if status.get("ready") and status.get("result_artifact_relpath"):
                                response = status
                                break
                            if status.get("status") == "FAILED":
                                raise ServerApiError(
                                    f"Result artifact conversion failed for {state.job_id}: "
                                    f"{status.get('error', 'unknown error')}"
                                )
                            time.sleep(3)
                        else:
                            raise ServerApiError(
                                f"Timed out waiting for result artifact conversion: {state.job_id}"
                            )
                    print(
                        f"[worker] result artifact upload complete job={state.job_id} "
                        f"artifact={response.get('result_artifact_relpath')}",
                        flush=True,
                    )
                    return response.get("result_artifact_relpath")
                if heartbeat_callback is not None:
                    heartbeat_callback(state)
        if not chunk_upload_supported:
            print(f"[worker] uploading archive {archive_path.name} using legacy single request", flush=True)
            response = client.upload_job_result_artifact(
                external_job_id=state.job_id,
                file_path=archive_path,
                run_id=state.run_id,
            )
            return response.get("artifact_relpath")
        return None


if __name__ == "__main__":
    raise SystemExit(main())
