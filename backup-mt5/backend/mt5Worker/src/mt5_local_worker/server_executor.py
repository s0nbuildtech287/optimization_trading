from __future__ import annotations

from pathlib import Path

from .job_store import SQLiteJobStore
from .models import JobRequest
from .pipeline import FilterConfig
from .runner import LocalJobRunner


class ServerJobExecutor:
    def __init__(self, store: SQLiteJobStore, runner: LocalJobRunner) -> None:
        self.store = store
        self.runner = runner

    def execute_claimed_job(self, job_record: dict, worker_name: str, progress_callback=None) -> dict:
        request = JobRequest(
            job_id=job_record["external_job_id"],
            job_name=job_record.get("job_name"),
            bot_name=job_record["bot_name"],
            ini_folder=Path(job_record["ini_folder"]),
            max_ini=job_record["max_ini"],
            optimize_runs=job_record["optimize_runs"],
        )
        try:
            if job_record["mode"] == "full_pipeline":
                filters = FilterConfig(**(job_record["filters"] or {}))
                state = self.runner.run_full_pipeline(request, filters, progress_callback=progress_callback)
            else:
                state = self.runner.run_backtest_job(request, progress_callback=progress_callback)

            if state.status != "done":
                self.store.mark_failed(
                    external_job_id=job_record["external_job_id"],
                    worker_name=worker_name,
                    error=state.last_error or f"Runner finished with status={state.status}",
                )
                return state.to_dict()

            self.store.mark_done(
                external_job_id=job_record["external_job_id"],
                worker_name=worker_name,
                run_id=state.run_id,
                run_dir=state.run_dir or "",
                done_ini=state.done_ini,
                failed_ini=state.failed_ini,
                total_ini=state.total_ini,
                generated_ini_count=state.generated_ini_count,
            )
            return state.to_dict()
        except Exception as exc:
            self.store.mark_failed(
                external_job_id=job_record["external_job_id"],
                worker_name=worker_name,
                error=str(exc),
            )
            raise
