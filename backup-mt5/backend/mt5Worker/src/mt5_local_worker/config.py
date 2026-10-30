from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


def detect_default_mt5_path() -> Path:
    common_paths = [
        Path(r"C:\Program Files\MetaTrader 5\terminal64.exe"),
        Path(r"C:\Program Files (x86)\MetaTrader 5\terminal64.exe"),
        Path(r"C:\Program Files\MetaTrader 5 EXNESS\terminal64.exe"),
        Path(r"C:\Program Files (x86)\MetaTrader 5 EXNESS\terminal64.exe"),
    ]
    for candidate in common_paths:
        if candidate.is_file():
            return candidate
    return common_paths[0]


def detect_default_terminal_data_path() -> Path:
    root = Path.home() / "AppData" / "Roaming" / "MetaQuotes" / "Terminal"
    if root.is_dir():
        candidates = sorted(d for d in root.iterdir() if d.is_dir() and d.name.lower() != "common")
        # Prefer directories that actually have MQL5/Experts (real terminal data paths)
        for child in candidates:
            if (child / "MQL5" / "Experts").is_dir():
                return child
        # Fall back to first non-Common directory
        for child in candidates:
            return child
    return root / "T1"


def _normalize_mt5_path(mt5_path: str | Path | None) -> tuple[Path, bool]:
    if mt5_path is None:
        return detect_default_mt5_path(), False

    raw = str(mt5_path).strip()
    portable_mode = False

    if " /portable" in raw.lower():
        parts = raw.split()
        kept_parts: list[str] = []
        for part in parts:
            if part.lower() == "/portable":
                portable_mode = True
                continue
            kept_parts.append(part)
        raw = " ".join(kept_parts).strip()
    elif raw.lower().endswith("/portable"):
        portable_mode = True
        raw = raw[: -len("/portable")].rstrip()

    if not raw:
        return detect_default_mt5_path(), portable_mode

    return Path(raw).resolve(), portable_mode


@dataclass(slots=True)
class AppConfig:
    workspace_root: Path
    mt5_path: Path
    terminal_data_path: Path
    portable_mode: bool = False
    poll_interval_seconds: int = 5
    # 0 disables a wall-clock limit. Long MT5 optimizations are governed by
    # inactivity_timeout_seconds instead of an arbitrary total runtime.
    report_timeout_seconds: int = 0
    inactivity_timeout_seconds: int = 3600
    report_stabilize_seconds: int = 2
    report_post_exit_grace_seconds: int = 30
    max_attempts_per_ini: int = 2
    retry_delay_seconds: int = 3
    shutdown_terminal: bool = True
    replace_report: bool = True


@dataclass(slots=True)
class PathLayout:
    workspace_root: Path
    runs_root: Path
    logs_root: Path
    temp_root: Path

    @classmethod
    def from_workspace(cls, workspace_root: Path) -> "PathLayout":
        return cls(
            workspace_root=workspace_root,
            runs_root=workspace_root / "runs",
            logs_root=workspace_root / "logs",
            temp_root=workspace_root / "tmp",
        )

    def ensure(self) -> None:
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        self.runs_root.mkdir(parents=True, exist_ok=True)
        self.logs_root.mkdir(parents=True, exist_ok=True)
        self.temp_root.mkdir(parents=True, exist_ok=True)


def build_config(
    workspace_root: str | Path,
    mt5_path: str | Path | None = None,
    terminal_data_path: str | Path | None = None,
    portable_mode: bool = False,
    max_attempts_per_ini: int = 2,
    retry_delay_seconds: int = 3,
    report_post_exit_grace_seconds: int = 30,
    inactivity_timeout_seconds: int = 3600,
) -> AppConfig:
    resolved_mt5_path, inferred_portable = _normalize_mt5_path(mt5_path)
    return AppConfig(
        workspace_root=Path(workspace_root).resolve(),
        mt5_path=resolved_mt5_path,
        terminal_data_path=(
            Path(terminal_data_path).resolve()
            if terminal_data_path
            else detect_default_terminal_data_path()
        ),
        portable_mode=portable_mode or inferred_portable,
        report_post_exit_grace_seconds=report_post_exit_grace_seconds,
        inactivity_timeout_seconds=max(60, inactivity_timeout_seconds),
        max_attempts_per_ini=max_attempts_per_ini,
        retry_delay_seconds=retry_delay_seconds,
    )
