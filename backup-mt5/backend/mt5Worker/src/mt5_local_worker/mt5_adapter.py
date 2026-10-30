from __future__ import annotations

import os
import json
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


def _to_short_path(path: Path) -> str:
    path_str = str(path.resolve())
    if os.name != "nt":
        return path_str
    try:
        import ctypes
        buf = ctypes.create_unicode_buffer(500)
        ret = ctypes.windll.kernel32.GetShortPathNameW(path_str, buf, 500)
        if ret > 0:
            short_p = Path(buf.value)
            if short_p.exists():
                return buf.value
    except Exception:
        pass
    return path_str


def derive_report_name_from_ini(ini_path: Path) -> str:
    for encoding in ("utf-16", "utf-8-sig", "utf-8", "latin-1"):
        try:
            text = ini_path.read_text(encoding=encoding)
            break
        except UnicodeError:
            continue
    else:
        raise RuntimeError(f"Cannot read ini file: {ini_path}")

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.lower().startswith("report="):
            value = line.split("=", 1)[1].strip()
            if value:
                return Path(value).stem
    return ini_path.stem


def _parse_ini_tester_section(ini_path: Path) -> dict:
    """Parse [Tester] section from an INI file and return key-value dict (lowercase keys)."""
    for encoding in ("utf-16", "utf-8-sig", "utf-8", "latin-1"):
        try:
            text = ini_path.read_text(encoding=encoding)
            break
        except UnicodeError:
            continue
    else:
        return {}
    result = {}
    in_tester = False
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.lower() == "[tester]":
            in_tester = True
            continue
        if in_tester:
            if line.startswith("[") and line.lower() != "[tester]":
                break
            if "=" in line:
                k, _, v = line.partition("=")
                result[k.strip().lower()] = v.strip()
    return result


# MT5 timeframe period string -> MT5 Python API TIMEFRAME constant (int)
_MT5_PERIOD_MAP: dict[str, int] = {
    "M1": 1, "M2": 2, "M3": 3, "M4": 4, "M5": 5, "M6": 6, "M10": 10,
    "M12": 12, "M15": 15, "M20": 20, "M30": 30,
    "H1": 16385, "H2": 16386, "H3": 16387, "H4": 16388, "H6": 16390,
    "H8": 16392, "H12": 16396,
    "D1": 16408, "W1": 32769, "MN1": 49153,
}

_PERIOD_MINUTES: dict[str, int] = {
    "M1": 1, "M2": 2, "M3": 3, "M4": 4, "M5": 5, "M6": 6,
    "M10": 10, "M12": 12, "M15": 15, "M20": 20, "M30": 30,
    "H1": 60, "H2": 120, "H3": 180, "H4": 240, "H6": 360,
    "H8": 480, "H12": 720, "D1": 1440, "W1": 10080, "MN1": 43200,
}


def _first_ini_value(value: str | None) -> str:
    return str(value or "").split("||", 1)[0].strip().upper()


def _period_minutes(value: str | None) -> int | None:
    normalized = _first_ini_value(value)
    if normalized in _PERIOD_MINUTES:
        return _PERIOD_MINUTES[normalized]
    try:
        numeric = int(normalized)
    except (TypeError, ValueError):
        return None
    for name, code in _MT5_PERIOD_MAP.items():
        if code == numeric:
            return _PERIOD_MINUTES.get(name)
    return None


def _warn_lower_timeframe_open_prices(ini_path: Path) -> None:
    params = _parse_ini_tester_section(ini_path)
    model = _first_ini_value(params.get("model"))
    # The pipeline deliberately writes Model=0 for Open Prices mode.
    if model not in {"0", "OPEN_PRICES", "OPEN PRICE", "OPEN PRICES"}:
        return

    chart_period = _first_ini_value(params.get("period"))
    ltf_period = _first_ini_value(params.get("selectedtimeframeltf"))
    chart_minutes = _period_minutes(chart_period)
    ltf_minutes = _period_minutes(ltf_period)
    if chart_minutes is None or ltf_minutes is None or ltf_minutes >= chart_minutes:
        return

    expert = params.get("expert", "unknown")
    symbol = params.get("symbol", "unknown")
    print(
        "⚠️ [MT5] Open Prices incompatible with lower timeframe request: "
        f"EA={expert} Symbol={symbol} ChartTF={chart_period} LTF={ltf_period}. "
        f"EA uses lower timeframe {ltf_period} and cannot run on {chart_period} "
        "in Open Prices mode.",
        flush=True,
    )


def patch_ini_for_report(
    ini_path: Path,
    temp_dir: Path,
    report_name: str,
    shutdown_terminal: bool,
    replace_report: bool,
) -> Path:
    for encoding in ("utf-16", "utf-8-sig", "utf-8", "latin-1"):
        try:
            lines = ini_path.read_text(encoding=encoding).splitlines(keepends=True)
            break
        except UnicodeError:
            continue
    else:
        raise RuntimeError(f"Cannot read ini file: {ini_path}")

    if lines and lines[0].startswith("\ufeff"):
        lines[0] = lines[0].lstrip("\ufeff")

    effective_shutdown = shutdown_terminal

    has_report = False
    has_replace = False
    has_shutdown = False
    has_allow_dll = False
    has_use_local = False
    has_use_remote = False
    has_use_cloud = False
    new_lines: list[str] = []
    report_file = f"{report_name}.xml"

    for line in lines:
        stripped = line.strip().lower()
        if stripped.startswith("report="):
            new_lines.append(f"Report={report_file}\n")
            has_report = True
        elif stripped.startswith("replacereport="):
            new_lines.append(f"ReplaceReport={1 if replace_report else 0}\n")
            has_replace = True
        elif stripped.startswith("shutdownterminal="):
            new_lines.append(f"ShutdownTerminal={1 if effective_shutdown else 0}\n")
            has_shutdown = True
        elif stripped.startswith("allowdll="):
            new_lines.append("AllowDLL=1\n")
            has_allow_dll = True
        elif stripped.startswith("uselocal="):
            new_lines.append("UseLocal=1\n")
            has_use_local = True
        elif stripped.startswith("useremote="):
            new_lines.append("UseRemote=0\n")
            has_use_remote = True
        elif stripped.startswith("usecloud="):
            new_lines.append("UseCloud=0\n")
            has_use_cloud = True
        else:
            new_lines.append(line)

    insert_lines: list[str] = []
    if not has_report:
        insert_lines.append(f"Report={report_file}\n")
    if not has_replace:
        insert_lines.append(f"ReplaceReport={1 if replace_report else 0}\n")
    if not has_shutdown:
        insert_lines.append(f"ShutdownTerminal={1 if effective_shutdown else 0}\n")
    if not has_allow_dll:
        insert_lines.append("AllowDLL=1\n")
    if not has_use_local:
        insert_lines.append("UseLocal=1\n")
    if not has_use_remote:
        insert_lines.append("UseRemote=0\n")
    if not has_use_cloud:
        insert_lines.append("UseCloud=0\n")

    if insert_lines:
        insert_at = len(new_lines)
        in_tester = False
        for idx, line in enumerate(new_lines):
            stripped = line.strip().lower()
            if stripped == "[tester]":
                in_tester = True
            elif in_tester and stripped.startswith("[") and stripped != "[tester]":
                insert_at = idx
                break
        for offset, new_line in enumerate(insert_lines):
            new_lines.insert(insert_at + offset, new_line)

    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / "run_patched.ini"
    content_str = "".join(new_lines).lstrip("\ufeff")
    temp_path.write_bytes(b"\xff\xfe" + content_str.encode("utf-16le"))

    # Log key tester fields to help debug mode/shutdown issues
    tester_params = _parse_ini_tester_section(temp_path)
    model_val = tester_params.get("model", "<not set>")
    opt_val = tester_params.get("optimization", "<not set>")
    shutdown_val = tester_params.get("shutdownterminal", "<not set>")
    print(
        "[MT5] patched ini prepared "
        f"source={ini_path} patched={temp_path} report_name={report_name} "
        f"encoding=utf-16 | Model={model_val} Optimization={opt_val} ShutdownTerminal={shutdown_val}",
        flush=True,
    )
    return temp_path


@dataclass(slots=True)
class MT5RunResult:
    report_name: str
    report_path: Path


class MT5Adapter:
    def __init__(self, mt5_path: Path, terminal_data_path: Path, portable_mode: bool = False) -> None:
        self.mt5_path = mt5_path
        self.terminal_data_path = terminal_data_path
        self.portable_mode = portable_mode
        self._metaeditor_path: Path | None = None
        # Stores only tiny data-range keys for the current queue job.
        # Bars/ticks remain owned by MT5 and are never kept in worker RAM.
        self._preloaded_data_keys: set[str] = set()

    def reset_preload_session(self) -> None:
        """Forget preload keys before a new queue job starts."""
        self._preloaded_data_keys.clear()

    def run_ini_and_collect_report(
        self,
        ini_path: Path,
        temp_dir: Path,
        raw_reports_dir: Path,
        poll_interval_seconds: int,
        timeout_seconds: int,
        stabilize_seconds: int,
        post_exit_grace_seconds: int,
        shutdown_terminal: bool,
        replace_report: bool,
        inactivity_timeout_seconds: int = 3600,
        report_name_override: str | None = None,
        delete_source_report: bool = False,
        on_poll: Callable[[], None] | None = None,
    ) -> MT5RunResult:
        report_name = report_name_override or derive_report_name_from_ini(ini_path)
        print(
            "[MT5] launching tester "
            f"ini={ini_path} report_name={report_name} "
            f"shutdown_terminal={shutdown_terminal} replace_report={replace_report}",
            flush=True,
        )
        patched_ini = patch_ini_for_report(
            ini_path=ini_path,
            temp_dir=temp_dir,
            report_name=report_name,
            shutdown_terminal=shutdown_terminal,
            replace_report=replace_report,
        )

        _warn_lower_timeframe_open_prices(patched_ini)

        self._ensure_indicators_ready()
        self._ensure_symbol_data(ini_path)
        # Kill any leftover terminal from preload/previous run, but keep metatester alive
        self._kill_all_mt5_terminals()
        time.sleep(3)
        # Clean up any leftover report files from previous runs to avoid false positives
        self._cleanup_source_report_bundle(report_name=report_name)
        # Only start metatester if it's not already running — a running metatester
        # with an active broker session should be preserved, not restarted.
        # The terminal launched below with the backtest INI will authenticate the
        # metatester agent when it connects to the broker.
        self._ensure_metatester_warm()
        raw_reports_dir.mkdir(parents=True, exist_ok=True)
        short_ini = _to_short_path(patched_ini)
        launch_args = [str(self.mt5_path)]
        if self.portable_mode:
            launch_args.append("/portable")
        launch_args.append(f"/config:{short_ini}")
        proc = subprocess.Popen(launch_args, shell=False)
        print(
            "[MT5] terminal process started "
            f"mt5_path={self.mt5_path} portable={self.portable_mode} config={patched_ini}",
            flush=True,
        )
        try:
            report_path = self._wait_for_report(
                report_name=report_name,
                timeout_seconds=timeout_seconds,
                poll_interval_seconds=poll_interval_seconds,
                stabilize_seconds=stabilize_seconds,
                post_exit_grace_seconds=post_exit_grace_seconds,
                inactivity_timeout_seconds=inactivity_timeout_seconds,
                proc=proc,
                on_poll=on_poll,
            )
            destination = self._copy_report(report_path, raw_reports_dir)
            print(
                "[MT5] report collected "
                f"source={report_path} destination={destination}",
                flush=True,
            )
            if delete_source_report:
                self._kill_process_tree(proc.pid)
                time.sleep(2)
                # The report has already been copied to the job workspace and
                # parsed from that copy, so remove the source report bundle
                # from the terminal data directory as well.
                self._cleanup_source_report_bundle(report_name=report_name)
            return MT5RunResult(report_name=report_name, report_path=destination)
        finally:
            self._kill_process_tree(proc.pid)
            if patched_ini.exists():
                patched_ini.unlink(missing_ok=True)

    def ensure_compiled_expert(self, *, expert_path: str, source_bundle_root: Path | None = None) -> Path:
        expert_relpath = self._normalize_expert_relpath(expert_path)
        target_source = self.terminal_data_path / "MQL5" / "Experts" / expert_relpath.with_suffix(".mq5")
        target_ex5 = target_source.with_suffix(".ex5")

        if target_ex5.exists():
            print(
                "[MT5] expert executable already present "
                f"expert_path={expert_path} target_ex5={target_ex5}",
                flush=True,
            )
            return target_ex5

        source_file = None
        if target_source.exists():
            source_file = target_source
        else:
            source_file = self._find_source_file(source_bundle_root, expert_relpath)
        if source_file is None:
            raise RuntimeError(
                f"Missing expert source for '{expert_path}'. "
                "Expected a matching .mq5 file in the downloaded bundle."
            )

        metaeditor_path = self._detect_metaeditor_path()
        print(
            "[MT5] refreshing expert source "
            f"expert_path={expert_path} source_file={source_file} "
            f"target_source={target_source}",
            flush=True,
        )
        target_source.parent.mkdir(parents=True, exist_ok=True)
        target_ex5.parent.mkdir(parents=True, exist_ok=True)
        compile_source = target_source
        if source_file.resolve() != target_source.resolve():
            shutil.copy2(source_file, target_source)
            compile_source = target_source
        time.sleep(0.25)

        proc = subprocess.run(
            [str(metaeditor_path), f"/compile:{compile_source}", "/log"],
            shell=False,
            capture_output=True,
            text=True,
        )

        compiled_ex5 = compile_source.with_suffix(".ex5")
        if not compiled_ex5.exists():
            details = "\n".join(
                part.strip()
                for part in [proc.stdout or "", proc.stderr or ""]
                if part and part.strip()
            ).strip()
            raise RuntimeError(
                f"MetaEditor failed to compile '{source_file}'. "
                f"Return code={proc.returncode}" + (f"\n{details}" if details else "")
            )

        if compiled_ex5.resolve() == target_ex5.resolve():
            return target_ex5
        shutil.copy2(compiled_ex5, target_ex5)
        return target_ex5

    def _normalize_expert_relpath(self, expert_path: str) -> Path:
        normalized = expert_path.strip().replace("/", "\\")
        while normalized.startswith("\\"):
            normalized = normalized[1:]
        return Path(normalized)

    def _find_source_file(self, source_bundle_root: Path | None, expert_relpath: Path) -> Path | None:
        if source_bundle_root is None:
            return None
        if not source_bundle_root.exists():
            return None

        expected_name = expert_relpath.with_suffix(".mq5").name
        expected_exact = source_bundle_root / expert_relpath.with_suffix(".mq5")
        if expected_exact.is_file():
            return expected_exact

        matches = [path for path in source_bundle_root.rglob("*.mq5") if path.is_file() and path.name.lower() == expected_name.lower()]
        if matches:
            matches.sort(key=lambda path: (len(path.parts), str(path).lower()))
            return matches[0]

        stem = expert_relpath.stem.lower()
        stem_matches = [path for path in source_bundle_root.rglob("*.mq5") if path.is_file() and path.stem.lower() == stem]
        if stem_matches:
            stem_matches.sort(key=lambda path: (len(path.parts), str(path).lower()))
            return stem_matches[0]

        return None

    def _detect_metaeditor_path(self) -> Path:
        if self._metaeditor_path is not None:
            return self._metaeditor_path

        candidates = [
            self.mt5_path.with_name("MetaEditor64.exe"),
            self.mt5_path.with_name("metaeditor64.exe"),
            self.mt5_path.with_name("MetaEditor.exe"),
            self.mt5_path.with_name("metaeditor.exe"),
            Path(r"C:\Program Files\MetaTrader 5\MetaEditor64.exe"),
            Path(r"C:\Program Files (x86)\MetaTrader 5\MetaEditor64.exe"),
            Path(r"C:\Program Files\MetaTrader 5\MetaEditor.exe"),
            Path(r"C:\Program Files (x86)\MetaTrader 5\MetaEditor.exe"),
        ]
        for candidate in candidates:
            if candidate.is_file():
                self._metaeditor_path = candidate
                return candidate

        raise FileNotFoundError(
            f"Could not find MetaEditor executable next to {self.mt5_path} or in the default MT5 install locations"
        )


    def _check_for_mt5_errors(self) -> str | None:
        """Đọc và quét các file log mới nhất của MT5 Terminal/Tester/Agents để phát hiện lỗi khởi tạo thưa đại ca Xuân Sơn."""
        try:
            today_str = time.strftime("%Y%m%d")
            log_dirs = [
                self.terminal_data_path / "Tester" / "Logs",
                self.terminal_data_path / "MQL5" / "Logs",
                self.terminal_data_path / "logs"
            ]
            
            # Quét các thư mục logs của Agents
            tester_path = self.terminal_data_path / "Tester"
            if tester_path.exists():
                for p in tester_path.iterdir():
                    if p.is_dir() and p.name.startswith("Agent-"):
                        log_dirs.append(p / "logs")

            real_errors = [
                "cannot load indicator",
                "wrong timeframe request",
                "critical error",
                "division by zero",
                "failed to load",
                "cannot load expert",
                "expert initialization failed",
                "failed to initialize"
            ]

            for log_dir in log_dirs:
                if not log_dir.exists():
                    continue
                log_file = log_dir / f"{today_str}.log"
                if not log_file.exists():
                    continue
                
                # Sao chép file tạm để tránh lỗi file bị khóa độc quyền bởi MT5 trên Windows thưa đại ca Xuân Sơn
                import tempfile
                temp_dir_path = Path(tempfile.gettempdir())
                temp_log_file = temp_dir_path / f"mt5_worker_temp_log_{log_dir.parent.name}_{log_file.name}"
                
                try:
                    shutil.copy2(str(log_file), str(temp_log_file))
                except Exception:
                    pass
                
                content = ""
                file_to_read = temp_log_file if temp_log_file.exists() else log_file
                for enc in ("utf-16", "utf-8-sig", "utf-8", "latin-1"):
                    try:
                        with open(file_to_read, "r", encoding=enc, errors="replace") as f:
                            content = f.read()
                        break
                    except Exception:
                        continue
                
                # Dọn dẹp file tạm sau khi đọc thưa đại ca Xuân Sơn
                try:
                    if temp_log_file.exists():
                        temp_log_file.unlink()
                except Exception:
                    pass
                
                if not content:
                    continue
                
                lines = content.splitlines()
                for line in lines[-50:]:
                    line_lower = line.lower()
                    for err in real_errors:
                        if err in line_lower:
                            return f"Log: {log_file.name} | Error: {line.strip()}"
        except Exception:
            pass
        return None

    def _wait_for_report(
        self,
        report_name: str,
        timeout_seconds: int,
        poll_interval_seconds: int,
        stabilize_seconds: int,
        post_exit_grace_seconds: int,
        inactivity_timeout_seconds: int,
        proc: subprocess.Popen,
        on_poll: Callable[[], None] | None,
    ) -> Path:
        started = time.time()
        exit_seen_at: float | None = None
        # A wall-clock timeout would incorrectly kill legitimate long MT5
        # optimizations. A non-positive value means unlimited runtime.
        effective_timeout = timeout_seconds if timeout_seconds and timeout_seconds > 0 else None
        effective_grace = max(post_exit_grace_seconds, 120)
        effective_inactivity_timeout = max(inactivity_timeout_seconds, 60)

        # Logic giám sát hoạt động log chống đơ treo thưa đại ca Xuân Sơn
        last_activity_time = time.time()
        last_total_log_size = 0
        last_report_activity_marker = None

        def get_total_log_size() -> int:
            try:
                today_str = time.strftime("%Y%m%d")
                log_dirs = [
                    self.terminal_data_path / "Tester" / "Logs",
                    self.terminal_data_path / "MQL5" / "Logs",
                    self.terminal_data_path / "logs"
                ]
                tester_path = self.terminal_data_path / "Tester"
                if tester_path.exists():
                    for p in tester_path.iterdir():
                        if p.is_dir() and p.name.startswith("Agent-"):
                            log_dirs.append(p / "logs")
                
                total_size = 0
                for log_dir in log_dirs:
                    if log_dir.exists():
                        log_file = log_dir / f"{today_str}.log"
                        if log_file.exists():
                            total_size += log_file.stat().st_size
                return total_size
            except Exception:
                return last_total_log_size

        last_total_log_size = get_total_log_size()

        while effective_timeout is None or (time.time() - started) < effective_timeout:
            if on_poll is not None:
                on_poll()

            # 1. Kiểm tra lỗi cụ thể trong log thưa đại ca Xuân Sơn
            err_msg = self._check_for_mt5_errors()
            if err_msg:
                print(f"[MT5] Critical error detected in logs: {err_msg}", flush=True)
                raise RuntimeError(f"MT5 Optimization aborted due to: {err_msg}")

            # 2. Kiểm tra xem log có hoạt động ghi nhận tiến độ hay không thưa đại ca Xuân Sơn
            current_log_size = get_total_log_size()
            candidate_for_activity = self._find_report_file(report_name)
            report_activity_marker = None
            if candidate_for_activity and candidate_for_activity.exists():
                try:
                    report_stat = candidate_for_activity.stat()
                    report_activity_marker = (report_stat.st_size, report_stat.st_mtime_ns)
                except OSError:
                    report_activity_marker = None
            current_activity_marker = (current_log_size, report_activity_marker)
            previous_activity_marker = (last_total_log_size, last_report_activity_marker)
            if current_activity_marker != previous_activity_marker:
                last_total_log_size = current_log_size
                last_report_activity_marker = report_activity_marker
                last_activity_time = time.time()  # Reset bộ đếm thời gian hoạt động gần nhất
            else:
                if (time.time() - last_activity_time) >= effective_inactivity_timeout:
                    print(
                        f"[MT5] Inactivity timeout: no log/report activity for "
                        f"{effective_inactivity_timeout}s. Aborting stuck process.",
                        flush=True,
                    )
                    raise TimeoutError(
                        "MT5 process made no log/report progress within the configured "
                        f"inactivity timeout ({effective_inactivity_timeout}s)."
                    )

            candidate = self._find_report_file(report_name)
            if candidate and candidate.stat().st_size > 0 and self._is_report_valid(candidate):
                time.sleep(stabilize_seconds)
                return candidate

            if proc.poll() is not None:
                if exit_seen_at is None:
                    exit_seen_at = time.time()
                elif (time.time() - exit_seen_at) >= effective_grace:
                    candidate = self._find_report_file(report_name)
                    if candidate and candidate.stat().st_size > 0 and self._is_report_valid(candidate):
                        time.sleep(stabilize_seconds)
                        return candidate
                    raise RuntimeError(
                        f"MT5 exited before valid report was found for '{report_name}' "
                        f"(exit code {proc.returncode}, waited {post_exit_grace_seconds}s after exit)"
                    )

            time.sleep(poll_interval_seconds)

        raise TimeoutError(f"Timed out waiting for report '{report_name}'")

    def _is_report_valid(self, report_path: Path) -> bool:
        if not report_path or not report_path.exists():
            return False
        if report_path.stat().st_size < 100:
            return False
        try:
            content = ""
            for enc in ("utf-16", "utf-8-sig", "utf-8", "latin-1"):
                try:
                    content = report_path.read_text(encoding=enc, errors="replace")
                    break
                except UnicodeError:
                    continue
            if not content:
                return False
            content_lower = content.lower()
            if not any(marker in content_lower for marker in ("<html", "<table", "metatrader", "tester", "xml", "spreadsheet")):
                return False
            # Check for dummy empty report (when MT5 tester agent authorization fails)
            # An empty report has Bars: 0 and Total Trades: 0
            if "total trades:</td>" in content_lower or "total trades:" in content_lower:
                import re
                bars_m = re.search(r'bars:.*?<b>(\d+)</b>', content_lower, re.DOTALL)
                trades_m = re.search(r'total trades:.*?<b>(\d+)</b>', content_lower, re.DOTALL)
                if bars_m and trades_m:
                    bars_val = int(bars_m.group(1))
                    trades_val = int(trades_m.group(1))
                    if bars_val == 0 and trades_val == 0:
                        print(f"[MT5] Report {report_path.name} has 0 Bars and 0 Trades (agent auth error) — waiting for valid run...", flush=True)
                        return False
            return True
        except Exception:
            return True

    def _find_report_file(self, report_name: str) -> Path | None:
        candidate_names = [
            f"{report_name}.xml",
            f"{report_name}.xml.htm",
            f"{report_name}.htm",
            report_name,
        ]
        candidate_lookup = {name.lower() for name in candidate_names}

        search_dirs = [
            self.terminal_data_path,
            self.terminal_data_path / "MQL5" / "Files",
            self.terminal_data_path / "Tester",
            self.terminal_data_path / "Reports",
        ]
        for search_dir in search_dirs:
            if not search_dir.exists():
                continue
            for name in candidate_names:
                candidate = search_dir / name
                try:
                    if candidate.is_file():
                        return candidate
                except Exception:
                    continue

        try:
            for root, _, files in os.walk(self.terminal_data_path):
                for f in files:
                    if f.lower() in candidate_lookup:
                        return Path(root) / f
        except Exception:
            pass
        return None

    def _copy_report(self, source: Path, raw_reports_dir: Path) -> Path:
        raw_reports_dir.mkdir(parents=True, exist_ok=True)
        destination = raw_reports_dir / source.name
        shutil.copy2(source, destination)
        
        # Copy associated report chart images (.png) if they exist
        source_dir = source.parent
        source_stem = source.stem
        try:
            for f in os.listdir(source_dir):
                if f.startswith(source_stem) and f.lower().endswith('.png'):
                    shutil.copy2(source_dir / f, raw_reports_dir / f)
                    print(f"[MT5] copied associated report chart image: {f}", flush=True)
        except Exception as e:
            print(f"[MT5] error copying associated report chart images: {e}", flush=True)
            
        return destination

    def _cleanup_source_report_bundle(self, report_name: str, keep_path: Path | None = None) -> None:
        keep_path_resolved = keep_path.resolve(strict=False) if keep_path else None
        report_suffixes = {".htm", ".html", ".png", ".xml"}
        base_prefix = report_name.split("__")[0]
        deleted = 0

        try:
            for root, _, files in os.walk(self.terminal_data_path):
                for f in files:
                    if not (f.startswith(report_name) or f.startswith(base_prefix)):
                        continue
                    candidate = Path(root) / f
                    if candidate.suffix.lower() not in report_suffixes:
                        continue
                    try:
                        resolved = candidate.resolve(strict=False)
                        if keep_path_resolved is not None and resolved == keep_path_resolved:
                            continue
                        if candidate.exists():
                            candidate.unlink(missing_ok=True)
                            deleted += 1
                    except Exception:
                        continue
        except Exception:
            pass

        if deleted > 0:
            print(f"[MT5] Cleaned up {deleted} source report files for {report_name}", flush=True)

    def _ensure_symbol_data(self, ini_path: Path) -> None:
        """Force-download bar/tick history from broker using MT5 Python API before running tester."""
        import importlib.util
        if importlib.util.find_spec("MetaTrader5") is None:
            print("[MT5] MetaTrader5 Python package not installed — skipping data pre-download", flush=True)
            return

        params = _parse_ini_tester_section(ini_path)
        symbol = params.get("symbol", "").strip()
        period_str = params.get("period", "").strip().upper()
        from_date_str = params.get("fromdate", "").strip()
        to_date_str = params.get("todate", "").strip()

        if not symbol or not period_str:
            print("[MT5] Cannot pre-download data: no symbol/period in INI", flush=True)
            return

        timeframe = _MT5_PERIOD_MAP.get(period_str)
        if timeframe is None:
            # Try as raw int (MT5 stores some periods as numeric strings like 16385 for H1)
            try:
                timeframe = int(period_str)
            except ValueError:
                print(f"[MT5] Unknown period '{period_str}' — skipping data pre-download", flush=True)
                return

        import datetime
        def _parse_date(s: str) -> datetime.datetime:
            for fmt in ("%Y.%m.%d", "%Y-%m-%d", "%Y/%m/%d"):
                try:
                    return datetime.datetime.strptime(s, fmt)
                except ValueError:
                    continue
            raise ValueError(f"Cannot parse date: {s}")

        try:
            from_dt = _parse_date(from_date_str) if from_date_str else datetime.datetime(2020, 1, 1)
            to_dt = _parse_date(to_date_str) if to_date_str else datetime.datetime.now()
        except ValueError as e:
            print(f"[MT5] Date parse error: {e} — skipping data pre-download", flush=True)
            return

        # Pad date range slightly so MT5 downloads more than requested
        from_dt = from_dt - datetime.timedelta(days=7)
        to_dt = min(to_dt + datetime.timedelta(days=7), datetime.datetime.now())

        data_key = f"{symbol}|{period_str}|{from_dt.isoformat()}|{to_dt.isoformat()}"
        if data_key in self._preloaded_data_keys:
            print(
                f"[preload] DATA REUSE {symbol} {period_str} "
                f"range={from_dt.date()}->{to_dt.date()} "
                "| already preloaded in current job",
                flush=True,
            )
            return

        print(f"[MT5] Pre-downloading {symbol} {period_str} from {from_dt.date()} to {to_dt.date()} ...", flush=True)

        # Build inline Python script that runs in a child process with a hard timeout.
        # If mt5.initialize() hangs, the subprocess timeout kills everything cleanly.
        download_script = f"""
import sys, time, subprocess, datetime

MT5_PATH = {repr(str(self.mt5_path))}
SYMBOL    = {repr(symbol)}
TIMEFRAME = {timeframe}
FROM_TS   = {int(from_dt.timestamp())}
TO_TS     = {int(to_dt.timestamp())}

try:
    import MetaTrader5 as mt5
except ImportError:
    print("[preload] MetaTrader5 package not found", flush=True)
    sys.exit(3)

# Initialize MT5 Python API directly
ok = False
for attempt in range(1, 4):
    ok = mt5.initialize(MT5_PATH)
    if ok:
        break
    err = mt5.last_error()
    print(f"[preload] initialize() attempt {{attempt}}/3 failed: {{err}}, retrying in 5s...", flush=True)
    time.sleep(5)

if not ok:
    print(f"[preload] initialize() failed after 3 attempts: {{mt5.last_error()}}", flush=True)
    sys.exit(1)

try:
    info = mt5.terminal_info()
    print(f"[preload] Connected to MT5: build={{info.build if info else '?'}} connected={{info.connected if info else '?'}}", flush=True)

    mt5.symbol_select(SYMBOL, True)
    time.sleep(5)

    from_dt = datetime.datetime.fromtimestamp(FROM_TS)
    to_dt   = datetime.datetime.fromtimestamp(TO_TS)

    # 1. Download OHLC bars (fast, needed for Open Price + rate calculations)
    rates = mt5.copy_rates_range(SYMBOL, TIMEFRAME, from_dt, to_dt)
    bar_count = len(rates) if rates is not None else 0
    print(f"[preload] Bars cached: {{bar_count}} for {{SYMBOL}} tf={{TIMEFRAME}}", flush=True)

    # 2. Download ticks (large, but needed for Every Tick backtests to not need internet later)
    print(f"[preload] Downloading ticks {{SYMBOL}} {{from_dt.date()}} -> {{to_dt.date()}} (this may take several minutes)...", flush=True)
    ticks = mt5.copy_ticks_range(SYMBOL, from_dt, to_dt, mt5.COPY_TICKS_ALL)
    tick_count = len(ticks) if ticks is not None else 0
    print(f"[preload] Ticks cached: {{tick_count}} for {{SYMBOL}}", flush=True)

    if bar_count > 0 and tick_count > 0:
        print(
            f"[preload] PRELOAD SUCCESS {{SYMBOL}} {{from_dt.date()}}->{{to_dt.date()}} "
            f"bars={{bar_count}} ticks={{tick_count}}",
            flush=True,
        )
    else:
        print(
            f"[preload] PRELOAD PARTIAL {{SYMBOL}} {{from_dt.date()}}->{{to_dt.date()}} "
            f"bars={{bar_count}} ticks={{tick_count}}",
            flush=True,
        )
        sys.exit(2)

    if bar_count == 0 and tick_count == 0:
        print("[preload] WARNING: No data downloaded — broker may be offline", flush=True)

finally:
    mt5.shutdown()
    # Do NOT kill terminal here — the caller (run_ini_and_collect_report) will
    # kill it cleanly before launching the backtest run, ensuring metatester64.exe
    # has a live broker-authenticated terminal to connect to.

print("[preload] Done", flush=True)
"""
        python_exe = sys.executable
        if getattr(sys, "frozen", False):
            import shutil
            python_exe = shutil.which("python") or shutil.which("python3") or "python"

        try:
            result = subprocess.run(
                [python_exe, "-c", download_script],
                timeout=600,  # Allow up to 10 min for tick download
                capture_output=False,  # Let output flow to worker console
                text=True,
            )
            if result.returncode != 0:
                print(f"[MT5] Pre-download subprocess exited with code {result.returncode}", flush=True)
            else:
                self._preloaded_data_keys.add(data_key)
                print(
                    f"[preload] DATA READY FOR CURRENT JOB {symbol} {period_str} "
                    f"range={from_dt.date()}->{to_dt.date()}",
                    flush=True,
                )
        except subprocess.TimeoutExpired:
            print("[MT5] Pre-download timed out after 600s — proceeding to tester anyway", flush=True)
        except Exception as e:
            print(f"[MT5] Pre-download subprocess error: {e}", flush=True)
        finally:
            pass



    def _ensure_indicators_ready(self) -> None:
        ind_dir = self.terminal_data_path / "MQL5" / "Indicators"
        if not ind_dir.exists():
            return
        examples_dir = ind_dir / "Examples"
        if examples_dir.exists():
            for ex5 in examples_dir.glob("*.ex5"):
                target = ind_dir / ex5.name
                if not target.exists():
                    try:
                        shutil.copy2(ex5, target)
                        print(f"[MT5] Copied missing indicator {ex5.name} to Indicators root", flush=True)
                    except Exception:
                        pass
            for mq5 in examples_dir.glob("*.mq5"):
                target = ind_dir / mq5.name
                if not target.exists():
                    try:
                        shutil.copy2(mq5, target)
                    except Exception:
                        pass

    def _processes_for_executable(self, executable: Path) -> list[tuple[int, str]]:
        """Return (pid, executable_path) for same-named processes for exact-path filtering."""
        if os.name != "nt":
            return []

        target = str(executable.resolve())
        # Use CIM instead of taskkill /IM: process names are not unique when
        # several MT5 installations are present on one machine.
        escaped_target = target.replace("'", "''")
        target_name = executable.name.replace("'", "''")
        script = (
            "$target = '" + escaped_target + "'; "
            "$targetName = '" + target_name + "'; "
            "Get-CimInstance Win32_Process | "
            "Where-Object { $_.ExecutablePath -and "
            "([IO.Path]::GetFileName($_.ExecutablePath)).Equals($targetName, "
            "[StringComparison]::OrdinalIgnoreCase) } | "
            "ForEach-Object { Write-Output ($_.ProcessId.ToString() + \"`t\" + $_.ExecutablePath) }"
        )
        try:
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
                capture_output=True,
                text=True,
                check=False,
            )
        except OSError as exc:
            print(f"[MT5] Process scan unavailable for {target}: {exc}", flush=True)
            return []

        matches: list[tuple[int, str]] = []
        for line in result.stdout.splitlines():
            raw_pid, separator, raw_path = line.partition("\t")
            if not separator:
                continue
            try:
                matches.append((int(raw_pid.strip()), raw_path.strip()))
            except ValueError:
                continue
        return matches

    def _kill_processes_for_executable(self, executable: Path, label: str, reason: str) -> int:
        """Kill only processes whose full executable path matches the configured MT5 binary."""
        target = str(executable.resolve())
        candidates = self._processes_for_executable(executable)
        matches: list[tuple[int, str]] = []
        for pid, process_path in candidates:
            if Path(process_path).resolve() == Path(target).resolve():
                matches.append((pid, process_path))
            else:
                print(
                    f"[MT5] Skipped unrelated {label} pid={pid} path={process_path}; "
                    f"configured_path={target}",
                    flush=True,
                )
        if not matches:
            print(f"[MT5] No matching configured {label} process found; skipped kill path={target} reason={reason}", flush=True)
            return 0

        killed = 0
        for pid, process_path in matches:
            print(
                f"[MT5] Matched {label} pid={pid} path={process_path}; "
                f"killing only this PID reason={reason}",
                flush=True,
            )
            result = subprocess.run(
                ["taskkill", "/F", "/PID", str(pid)],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode == 0:
                killed += 1
            else:
                detail = (result.stderr or result.stdout or "").strip()
                print(f"[MT5] Failed to kill {label} pid={pid}: {detail}", flush=True)
        return killed

    def _ensure_metatester_warm(self) -> None:
        """Kill any stale metatester64.exe and start a fresh authorized one.

        Root cause (confirmed from MT5 Agent logs):
        - After each backtest, metatester server stops internally ("MetaTester 5 stopped")
          but the metatester64.exe PROCESS stays alive as a zombie.
        - Checking only whether the process exists is unreliable -- must always restart.
        - A fresh metatester needs terminal64.exe to login broker and authorize it
          before it can accept backtest jobs (otherwise "tester forced to close" immediately).

        Correct sequence every time:
        1. Kill any existing metatester64.exe process
        2. Start fresh metatester64.exe (wait 5s for port 3000)
        3. Launch terminal64.exe normally (no /config) -> logs into broker -> authorizes agent
        4. Wait for broker connection confirmed (up to 60s)
        5. Kill terminal64.exe
        6. metatester now has valid broker session -> ready for backtest
        """
        metatester_exe = self.mt5_path.parent / "metatester64.exe"
        if not metatester_exe.exists():
            return

        # Step 1: Kill only a stale agent belonging to this MT5 installation.
        self._kill_processes_for_executable(
            metatester_exe,
            "metatester64.exe",
            "refresh configured MT5 agent",
        )
        time.sleep(3)

        # Step 2: Start fresh metatester64.exe
        print("[MT5] Starting fresh metatester64.exe agent...", flush=True)
        metatester_proc = subprocess.Popen([str(metatester_exe)], shell=False)
        print(f"[MT5] Started configured metatester64.exe pid={metatester_proc.pid} path={metatester_exe}", flush=True)
        time.sleep(5)

        # Step 3: Launch terminal64.exe normally (no /config) to authorize the agent via broker
        print("[MT5] Launching terminal64.exe to authorize metatester via broker...", flush=True)
        terminal_proc = subprocess.Popen([str(self.mt5_path)], shell=False)

        # Step 4: Wait until terminal is connected to broker (up to 60s)
        try:
            import importlib.util
            if importlib.util.find_spec("MetaTrader5") is not None:
                import MetaTrader5 as mt5
                authorized = False
                for _attempt in range(12):
                    time.sleep(5)
                    if mt5.initialize(str(self.mt5_path)):
                        info = mt5.terminal_info()
                        if info and info.connected:
                            print("[MT5] Broker authorization confirmed via MT5 API.", flush=True)
                            authorized = True
                            mt5.shutdown()
                            break
                        mt5.shutdown()
                if not authorized:
                    print("[MT5] Broker auth not confirmed after 60s -- waiting 10s more.", flush=True)
                    time.sleep(10)
            else:
                print("[MT5] MT5 Python package not available -- waiting 40s for terminal login.", flush=True)
                time.sleep(40)
        except Exception as exc:
            print(f"[MT5] Auth check error: {exc} -- waiting 40s.", flush=True)
            time.sleep(40)

        # Step 5: Kill terminal -- metatester now holds the broker-authorized session
        print("[MT5] Killing terminal64.exe -- metatester session is now authorized.", flush=True)
        terminal_proc.terminate()
        try:
            terminal_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            print(f"[MT5] Configured authorization terminal pid={terminal_proc.pid} did not exit; force-killing PID only", flush=True)
            subprocess.run(["taskkill", "/F", "/PID", str(terminal_proc.pid)], capture_output=True, check=False)
        time.sleep(1)
        self._kill_processes_for_executable(
            self.mt5_path,
            "terminal64.exe",
            "close authorization terminal",
        )
        time.sleep(3)
        print("[MT5] metatester64.exe is ready for backtests.", flush=True)
    def _kill_all_mt5_terminals(self) -> None:
        """Close only terminal64.exe belonging to the configured MT5 installation."""
        killed = self._kill_processes_for_executable(
            self.mt5_path,
            "terminal64.exe",
            "cleanup before tester",
        )
        if killed:
            time.sleep(2)

    def _kill_process_tree(self, pid: int) -> None:
        subprocess.run(
            ["taskkill", "/f", "/t", "/pid", str(pid)],
            check=False,
            capture_output=True,
            text=True,
        )
