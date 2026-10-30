from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal


RunStatus = Literal["pending", "running", "done", "failed"]
ItemStatus = Literal["pending", "running", "done", "failed"]
AttemptStatus = Literal["running", "done", "failed"]
StageName = Literal["prepare", "optimize", "generate_backtest_ini", "backtest", "done", "failed"]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(slots=True)
class JobRequest:
    job_id: str
    job_name: str | None
    bot_name: str
    ini_folder: Path
    max_ini: int | None = None
    optimize_runs: int = 3
    execution_run_id: str | None = None


@dataclass(slots=True)
class ItemAttemptState:
    attempt_number: int
    status: AttemptStatus = "running"
    started_at: str = field(default_factory=utc_now)
    finished_at: str | None = None
    error: str | None = None
    report_name: str | None = None
    report_path: str | None = None


@dataclass(slots=True)
class WorkItemState:
    ini_name: str
    status: ItemStatus = "pending"
    attempt_count: int = 0
    report_name: str | None = None
    report_path: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    attempts: list[ItemAttemptState] = field(default_factory=list)


@dataclass(slots=True)
class RunState:
    job_id: str
    run_id: str
    bot_name: str
    ini_folder: str
    status: RunStatus = "pending"
    current_stage: StageName = "prepare"
    total_ini: int = 0
    done_ini: int = 0
    failed_ini: int = 0
    generated_ini_count: int = 0
    had_failures: bool = False
    started_at: str = field(default_factory=utc_now)
    finished_at: str | None = None
    last_error: str | None = None
    run_dir: str | None = None
    reports_dir: str | None = None
    optimize_reports_dir: str | None = None
    optimize_results_path: str | None = None
    backtest_ini_dir: str | None = None
    manifest_path: str | None = None
    log_path: str | None = None
    events_path: str | None = None
    items: list[WorkItemState] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def create(
        cls,
        job: JobRequest,
        run_id: str,
        run_dir: Path,
        reports_dir: Path,
        optimize_reports_dir: Path,
        optimize_results_path: Path,
        backtest_ini_dir: Path,
        manifest_path: Path,
        log_path: Path,
        events_path: Path,
        ini_files: list[Path],
    ) -> "RunState":
        return cls(
            job_id=job.job_id,
            run_id=run_id,
            bot_name=job.bot_name,
            ini_folder=str(job.ini_folder),
            total_ini=len(ini_files),
            run_dir=str(run_dir),
            reports_dir=str(reports_dir),
            optimize_reports_dir=str(optimize_reports_dir),
            optimize_results_path=str(optimize_results_path),
            backtest_ini_dir=str(backtest_ini_dir),
            manifest_path=str(manifest_path),
            log_path=str(log_path),
            events_path=str(events_path),
            items=[WorkItemState(ini_name=path.name) for path in ini_files],
        )
