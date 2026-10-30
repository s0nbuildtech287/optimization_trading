from __future__ import annotations

import json
from pathlib import Path

from .config import AppConfig
from .models import JobRequest


def write_manifest(
    manifest_path: Path,
    job: JobRequest,
    config: AppConfig,
    ini_files: list[Path],
) -> None:
    payload = {
        "job": {
            "job_id": job.job_id,
            "bot_name": job.bot_name,
            "ini_folder": str(job.ini_folder),
            "max_ini": job.max_ini,
            "optimize_runs": job.optimize_runs,
        },
        "config": {
            "workspace_root": str(config.workspace_root),
            "mt5_path": str(config.mt5_path),
            "terminal_data_path": str(config.terminal_data_path),
            "poll_interval_seconds": config.poll_interval_seconds,
            "report_timeout_seconds": config.report_timeout_seconds,
            "report_stabilize_seconds": config.report_stabilize_seconds,
            "report_post_exit_grace_seconds": config.report_post_exit_grace_seconds,
            "max_attempts_per_ini": config.max_attempts_per_ini,
            "retry_delay_seconds": config.retry_delay_seconds,
            "shutdown_terminal": config.shutdown_terminal,
            "replace_report": config.replace_report,
        },
        "inputs": {
            "ini_files": [path.name for path in ini_files],
            "total_ini": len(ini_files),
        },
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
