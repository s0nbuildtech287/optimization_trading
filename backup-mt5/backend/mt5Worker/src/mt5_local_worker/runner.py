from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path
from typing import Callable

from .config import AppConfig, PathLayout
from .logging_utils import RunLogger
from .manifest import write_manifest
from .models import ItemAttemptState, JobRequest, RunState, WorkItemState, utc_now
from .mt5_adapter import MT5Adapter
from .pipeline import (
    FilterConfig,
    classify_rows,
    generate_backtest_ini_files,
    merge_result_rows,
    parse_mt5_xml_report,
    write_filtered_snapshot,
)
from .state_store import StateStore

ProgressCallback = Callable[[RunState], None]



class LocalJobRunner:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.layout = PathLayout.from_workspace(config.workspace_root)
        self.layout.ensure()
        self.adapter = MT5Adapter(
            mt5_path=config.mt5_path,
            terminal_data_path=config.terminal_data_path,
            portable_mode=config.portable_mode,
        )

    def run_job(self, job: JobRequest, progress_callback: ProgressCallback | None = None) -> RunState:
        return self.run_backtest_job(job, progress_callback=progress_callback)

    def run_backtest_job(self, job: JobRequest, progress_callback: ProgressCallback | None = None) -> RunState:
        self.adapter.reset_preload_session()
        ini_files = self._collect_ini_files(job.ini_folder, job.max_ini)
        if not ini_files:
            raise RuntimeError(f"No .ini files found in {job.ini_folder}")

        state, store, logger, _, raw_reports_dir, temp_dir = self._create_run_context(job, ini_files)
        self._emit_progress(state, progress_callback)
        self._set_stage(state, store, logger, "backtest", progress_callback)
        self._execute_backtests(job, state, store, logger, ini_files, raw_reports_dir, temp_dir, progress_callback)
        self._finalize_run(state, store, logger, progress_callback)
        return state

    def run_optimize_only(
        self,
        job: JobRequest,
        filters: FilterConfig,
        progress_callback: ProgressCallback | None = None,
        optimize_stage_callback: ProgressCallback | None = None,
    ) -> RunState:
        self.adapter.reset_preload_session()
        template_ini_files = self._collect_ini_files(job.ini_folder, job.max_ini)
        if not template_ini_files:
            raise RuntimeError(f"No .ini files found in {job.ini_folder}")

        state, store, logger, optimize_reports_dir, raw_reports_dir, temp_dir = self._create_run_context(job, template_ini_files)
        self._emit_progress(state, progress_callback)

        self._set_stage(state, store, logger, "optimize", progress_callback)
        self._run_optimize_stage(
            job=job,
            state=state,
            store=store,
            logger=logger,
            template_ini_files=template_ini_files,
            optimize_reports_dir=optimize_reports_dir,
            temp_dir=temp_dir,
            filters=filters,
            progress_callback=progress_callback,
        )

        for item in state.items:
            if item.status not in ("done", "failed"):
                item.status = "done"
                item.finished_at = item.finished_at or utc_now()
                state.done_ini += 1

        state.had_failures = False
        state.status = "done"
        state.finished_at = utc_now()
        store.save(state)
        self._emit_progress(state, progress_callback)
        self._safe_optimize_stage_callback(optimize_stage_callback, state, logger)
        self._finalize_run(state, store, logger, progress_callback)
        return state

    def run_full_pipeline(
        self,
        job: JobRequest,
        filters: FilterConfig,
        progress_callback: ProgressCallback | None = None,
        optimize_stage_callback: ProgressCallback | None = None,
    ) -> RunState:
        self.adapter.reset_preload_session()
        template_ini_files = self._collect_ini_files(job.ini_folder, job.max_ini)
        if not template_ini_files:
            raise RuntimeError(f"No .ini files found in {job.ini_folder}")

        state, store, logger, optimize_reports_dir, raw_reports_dir, temp_dir = self._create_run_context(job, template_ini_files)
        self._emit_progress(state, progress_callback)

        self._set_stage(state, store, logger, "optimize", progress_callback)
        generated_ini_files = self._run_optimize_stage(
            job=job,
            state=state,
            store=store,
            logger=logger,
            template_ini_files=template_ini_files,
            optimize_reports_dir=optimize_reports_dir,
            temp_dir=temp_dir,
            filters=filters,
            progress_callback=progress_callback,
        )

        if not generated_ini_files:
            self._safe_optimize_stage_callback(optimize_stage_callback, state, logger)
            state.last_error = "No backtest ini files were generated from optimize results"
            state.had_failures = True
            for item in state.items:
                if item.status not in ("done", "failed"):
                    item.status = "failed"
                    item.finished_at = item.finished_at or utc_now()
                    state.failed_ini += 1
            self._finalize_run(state, store, logger, progress_callback)
            return state

        state.generated_ini_count = len(generated_ini_files)
        store.save(state)
        self._emit_progress(state, progress_callback)
        self._safe_optimize_stage_callback(optimize_stage_callback, state, logger)

        self._set_stage(state, store, logger, "backtest", progress_callback)
        self._execute_backtests(job, state, store, logger, generated_ini_files, raw_reports_dir, temp_dir, progress_callback)
        self._finalize_run(state, store, logger, progress_callback)
        return state

    def _create_run_context(
        self,
        job: JobRequest,
        ini_files: list[Path],
    ) -> tuple[RunState, StateStore, RunLogger, Path, Path, Path]:
        run_id = job.execution_run_id or datetime.now().strftime("run_%Y%m%d_%H%M%S")
        run_dir = self.layout.runs_root / job.job_id / run_id
        optimize_reports_dir = run_dir / "optimize" / "raw_xml"
        optimize_results_path = run_dir / "optimize" / "results.json"
        raw_reports_dir = run_dir / "reports" / "raw"
        backtest_ini_dir = run_dir / "backtest_ini"
        logs_dir = run_dir / "logs"
        temp_dir = self.layout.temp_root / job.job_id / run_id
        manifest_path = run_dir / "manifest.json"
        log_path = logs_dir / "runner.log"
        events_path = logs_dir / "events.jsonl"

        optimize_reports_dir.mkdir(parents=True, exist_ok=True)
        raw_reports_dir.mkdir(parents=True, exist_ok=True)
        backtest_ini_dir.mkdir(parents=True, exist_ok=True)
        logs_dir.mkdir(parents=True, exist_ok=True)
        temp_dir.mkdir(parents=True, exist_ok=True)

        logger = RunLogger(log_path=log_path, events_path=events_path)
        write_manifest(
            manifest_path=manifest_path,
            job=job,
            config=self.config,
            ini_files=ini_files,
        )

        state = RunState.create(
            job=job,
            run_id=run_id,
            run_dir=run_dir,
            reports_dir=raw_reports_dir,
            optimize_reports_dir=optimize_reports_dir,
            optimize_results_path=optimize_results_path,
            backtest_ini_dir=backtest_ini_dir,
            manifest_path=manifest_path,
            log_path=log_path,
            events_path=events_path,
            ini_files=ini_files,
        )
        state.status = "running"
        store = StateStore(run_dir / "run_state.json")
        store.save(state)
        logger.info(
            "job_started",
            job_id=job.job_id,
            run_id=run_id,
            bot_name=job.bot_name,
            total_ini=len(ini_files),
        )
        return state, store, logger, optimize_reports_dir, raw_reports_dir, temp_dir

    def _run_optimize_stage(
        self,
        job: JobRequest,
        state: RunState,
        store: StateStore,
        logger: RunLogger,
        template_ini_files: list[Path],
        optimize_reports_dir: Path,
        temp_dir: Path,
        filters: FilterConfig,
        progress_callback: ProgressCallback | None,
    ) -> list[Path]:
        generated_ini_files: list[Path] = []
        optimize_root = Path(state.run_dir) / "optimize"
        filtered_dir = optimize_root / "filtered"
        filtered_dir.mkdir(parents=True, exist_ok=True)
        optimize_results_path = Path(state.optimize_results_path) if state.optimize_results_path else optimize_root / "results.json"
        (optimize_root / "filters.json").write_text(
            json.dumps(filters.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        generated_root = Path(state.backtest_ini_dir)

        for item, ini_path in zip(state.items, template_ini_files):
            item.status = "running"
            item.started_at = utc_now()
            item.error = None
            store.save(state)
            logger.info("optimize_item_started", ini_name=item.ini_name, optimize_runs=job.optimize_runs)
            self._emit_progress(state, progress_callback)

            # Keep successful run results across retries. If run 3/5 fails,
            # the next attempt resumes at run 3 instead of repeating runs 1-2.
            run_rows: list[list[dict[str, object]]] = []
            succeeded = False
            for attempt_number in range(1, self.config.max_attempts_per_ini + 1):
                item.attempt_count = attempt_number
                attempt = ItemAttemptState(attempt_number=attempt_number)
                item.attempts.append(attempt)
                store.save(state)
                self._emit_progress(state, progress_callback)
                logger.info(
                    "optimize_attempt_started",
                    ini_name=item.ini_name,
                    attempt_number=attempt_number,
                )

                try:
                    next_run = len(run_rows) + 1
                    for optimize_run in range(next_run, job.optimize_runs + 1):
                        run_started_at = time.monotonic()
                        report_name = self._build_report_name(
                            job=job,
                            ini_stem=ini_path.stem,
                            suffix=f"opt_{optimize_run}",
                        )
                        print(
                            f"[OPTIMIZE] {item.ini_name} | Bat dau lan chay "
                            f"{optimize_run}/{job.optimize_runs} | attempt={attempt_number}",
                            flush=True,
                        )
                        logger.info(
                            "optimize_run_started",
                            ini_name=item.ini_name,
                            run_index=optimize_run,
                            run_total=job.optimize_runs,
                            attempt=attempt_number,
                        )
                        result = self.adapter.run_ini_and_collect_report(
                            ini_path=ini_path,
                            temp_dir=temp_dir,
                            raw_reports_dir=optimize_reports_dir / ini_path.stem,
                            poll_interval_seconds=self.config.poll_interval_seconds,
                            timeout_seconds=self.config.report_timeout_seconds,
                            stabilize_seconds=self.config.report_stabilize_seconds,
                            post_exit_grace_seconds=self.config.report_post_exit_grace_seconds,
                            inactivity_timeout_seconds=self.config.inactivity_timeout_seconds,
                            shutdown_terminal=self.config.shutdown_terminal,
                            replace_report=self.config.replace_report,
                            report_name_override=report_name,
                            delete_source_report=True,
                            on_poll=(lambda state=state: self._emit_progress(state, progress_callback)),
                        )
                        parsed_rows = parse_mt5_xml_report(result.report_path)
                        if not parsed_rows:
                            report_size = result.report_path.stat().st_size if result.report_path.exists() else 0
                            raise RuntimeError(
                                f"Optimization report contains no result rows: "
                                f"{result.report_path} (size={report_size} bytes)"
                            )
                        for parsed_row in parsed_rows:
                            parsed_row["optimize_run_no"] = optimize_run
                        run_rows.append(parsed_rows)
                        logger.info(
                            "optimize_run_done",
                            ini_name=item.ini_name,
                            optimize_run=optimize_run,
                            run_index=optimize_run,
                            run_total=job.optimize_runs,
                            attempt=attempt_number,
                            row_count=len(parsed_rows),
                            duration_ms=round((time.monotonic() - run_started_at) * 1000),
                            report_path=str(result.report_path),
                        )
                        print(
                            f"[OPTIMIZE] {item.ini_name} | Hoan tat lan chay "
                            f"{optimize_run}/{job.optimize_runs} | rows={len(parsed_rows)} | "
                            f"duration={time.monotonic() - run_started_at:.1f}s",
                            flush=True,
                        )

                    merged_rows = merge_result_rows(run_rows)

                    # Persist every MT5 pass. The server is the single place that
                    # rejects rows whose complete output metric set is zero.
                    # User filters remain relevant only to optional generated INIs.
                    active_rows = merged_rows
                    storage_mode = "all_mt5_results"
                    classified_rows = classify_rows(active_rows, filters)
                    selected_all_rows = [row for row in classified_rows if row.get("selected")]
                    selected_rows = selected_all_rows[: filters.top_n] if selected_all_rows else classified_rows[: filters.top_n]

                    raw_rows = []
                    for row in active_rows:
                        enriched_row = dict(row)
                        enriched_row.pop("selected", None)
                        enriched_row.pop("filter_reason", None)
                        enriched_row.pop("rank_no", None)
                        enriched_row["template_ini_name"] = ini_path.name
                        enriched_row["template_ini_relpath"] = str(ini_path)
                        raw_rows.append(enriched_row)

                    upload_rows = raw_rows
                    exported_rows = upload_rows

                    optimize_summary = {
                        "optimize_started_at": item.started_at,
                        "optimize_finished_at": utc_now(),
                        "raw_row_count": len(merged_rows),
                        "merged_row_count": len(merged_rows),
                        "selected_row_count": len(selected_all_rows),
                        "filtered_row_count": len(selected_all_rows),
                        "uploaded_row_count": len(upload_rows),
                        "storage_mode": storage_mode,
                        "best_result": upload_rows[0].get("Result") if upload_rows else None,
                        "best_profit": upload_rows[0].get("Profit") if upload_rows else None,
                        "best_trades": upload_rows[0].get("Trades") if upload_rows else None,
                        "best_expected_payoff": upload_rows[0].get("Expected Payoff") if upload_rows else None,
                        "best_drawdown_pct": (
                            upload_rows[0].get("Drawdown %")
                            if upload_rows and "Drawdown %" in upload_rows[0]
                            else upload_rows[0].get("Equity DD %") if upload_rows else None
                        ),
                        "best_profit_factor": upload_rows[0].get("Profit Factor") if upload_rows else None,
                        "best_recovery_factor": upload_rows[0].get("Recovery Factor") if upload_rows else None,
                    }
                    optimize_results_path.parent.mkdir(parents=True, exist_ok=True)
                    optimize_results_path.write_text(
                        json.dumps(
                            {
                                "job_id": job.job_id,
                                "run_id": state.run_id,
                                "template_ini_name": ini_path.name,
                                "template_ini_relpath": str(ini_path),
                                "optimize_runs": job.optimize_runs,
                                "filters": filters.to_dict(),
                                "summary": optimize_summary,
                                "rows": exported_rows,
                            },
                            ensure_ascii=False,
                            indent=2,
                        ),
                        encoding="utf-8",
                    )
                    snapshot_path = filtered_dir / f"{ini_path.stem}.json"
                    write_filtered_snapshot(exported_rows, snapshot_path)
                    generated = generate_backtest_ini_files(
                        template_ini_path=ini_path,
                        selected_rows=selected_rows,
                        output_dir=generated_root / ini_path.stem,
                    )

                    attempt.status = "done"
                    attempt.report_name = ini_path.stem
                    attempt.report_path = str(snapshot_path)
                    attempt.finished_at = utc_now()

                    item.status = "done"
                    item.report_name = ini_path.stem
                    item.report_path = str(snapshot_path)
                    item.finished_at = utc_now()
                    item.error = None
                    state.done_ini += 1
                    state.optimize_results_path = str(optimize_results_path)
                    generated_ini_files.extend(generated)
                    store.save(state)
                    self._emit_progress(state, progress_callback)
                    logger.info(
                        "optimize_item_done",
                        ini_name=item.ini_name,
                        merged_rows=len(merged_rows),
                        selected_rows=len(upload_rows),
                        generated_ini=len(generated),
                    )
                    print(
                        f"[OPTIMIZE] {item.ini_name} | Tong ket: yeu cau="
                        f"{job.optimize_runs}, thanh cong={len(run_rows)}, that bai=0, "
                        f"merged_rows={len(merged_rows)}",
                        flush=True,
                    )
                    succeeded = True
                    break
                except Exception as exc:
                    attempt.status = "failed"
                    attempt.error = str(exc)
                    attempt.finished_at = utc_now()
                    item.error = str(exc)
                    state.last_error = str(exc)
                    store.save(state)
                    self._emit_progress(state, progress_callback)
                    logger.error(
                        "optimize_attempt_failed",
                        ini_name=item.ini_name,
                        attempt_number=attempt_number,
                        error=str(exc),
                    )
                    failed_run = max(1, min(len(run_rows) + 1, max(1, job.optimize_runs)))
                    print(
                        f"[OPTIMIZE] {item.ini_name} | Lan chay {failed_run}/"
                        f"{job.optimize_runs} that bai | reason=RUN_FAILED | "
                        f"attempt={attempt_number} | error={exc}",
                        flush=True,
                    )
                    # Chỉ skip retry đối với các lỗi code EA chắc chắn chết (timeframe, load indicator). Còn lỗi đơ stagnant (do mạng/agent lag tạm thời) vẫn cho phép chạy lại lần 2 thưa đại ca Xuân Sơn
                    is_fatal_code_error = any(kw in str(exc).lower() for kw in ["wrong timeframe", "cannot load"])
                    if attempt_number < self.config.max_attempts_per_ini and not is_fatal_code_error:
                        print(
                            f"[OPTIMIZE] {item.ini_name} | Dang thu lai lan chay "
                            f"{failed_run}/{job.optimize_runs} | retry="
                            f"{attempt_number}/{self.config.max_attempts_per_ini}",
                            flush=True,
                        )
                        time.sleep(self.config.retry_delay_seconds)
                    else:
                        break
            if not succeeded:
                item.status = "failed"
                item.finished_at = utc_now()
                state.failed_ini += 1
                state.had_failures = True
                store.save(state)
                self._emit_progress(state, progress_callback)
                logger.error("optimize_item_failed", ini_name=item.ini_name, error=item.error)
                print(
                    f"[OPTIMIZE] {item.ini_name} | Tong ket: yeu cau={job.optimize_runs}, "
                    f"thanh cong={len(run_rows)}, that bai={max(0, job.optimize_runs - len(run_rows))} | "
                    f"status=FAILED",
                    flush=True,
                )

        logger.info("optimize_stage_finished", generated_ini=len(generated_ini_files))
        return generated_ini_files

    def _execute_backtests(
        self,
        job: JobRequest,
        state: RunState,
        store: StateStore,
        logger: RunLogger,
        ini_files: list[Path],
        raw_reports_dir: Path,
        temp_dir: Path,
        progress_callback: ProgressCallback | None,
    ) -> None:
        state.done_ini = 0
        state.failed_ini = 0
        state.total_ini = len(ini_files)
        state.items = [WorkItemState(ini_name=ini_path.name) for ini_path in ini_files]
        store.save(state)
        self._emit_progress(state, progress_callback)

        for item, ini_path in zip(state.items, ini_files):
            item.status = "running"
            item.started_at = utc_now()
            item.error = None
            store.save(state)
            self._emit_progress(state, progress_callback)
            logger.info("backtest_item_started", ini_name=item.ini_name)

            succeeded = False
            for attempt_number in range(1, self.config.max_attempts_per_ini + 1):
                item.attempt_count = attempt_number
                attempt = ItemAttemptState(attempt_number=attempt_number)
                item.attempts.append(attempt)
                store.save(state)
                self._emit_progress(state, progress_callback)
                logger.info("backtest_attempt_started", ini_name=item.ini_name, attempt_number=attempt_number)

                try:
                    report_name = self._build_report_name(
                        job=job,
                        ini_stem=ini_path.stem,
                    )
                    result = self.adapter.run_ini_and_collect_report(
                        ini_path=ini_path,
                        temp_dir=temp_dir,
                        raw_reports_dir=raw_reports_dir,
                        poll_interval_seconds=self.config.poll_interval_seconds,
                        timeout_seconds=self.config.report_timeout_seconds,
                        stabilize_seconds=self.config.report_stabilize_seconds,
                        post_exit_grace_seconds=self.config.report_post_exit_grace_seconds,
                        inactivity_timeout_seconds=self.config.inactivity_timeout_seconds,
                        shutdown_terminal=self.config.shutdown_terminal,
                        replace_report=self.config.replace_report,
                        report_name_override=report_name,
                        delete_source_report=True,
                        on_poll=(lambda state=state: self._emit_progress(state, progress_callback)),
                    )
                    attempt.status = "done"
                    attempt.report_name = result.report_name
                    attempt.report_path = str(result.report_path)
                    attempt.finished_at = utc_now()

                    item.status = "done"
                    item.report_name = result.report_name
                    item.report_path = str(result.report_path)
                    item.finished_at = utc_now()
                    item.error = None
                    state.done_ini += 1
                    store.save(state)
                    self._emit_progress(state, progress_callback)
                    logger.info(
                        "backtest_item_done",
                        ini_name=item.ini_name,
                        attempt_number=attempt_number,
                        report_path=str(result.report_path),
                    )
                    succeeded = True
                    break
                except Exception as exc:
                    attempt.status = "failed"
                    attempt.error = str(exc)
                    attempt.finished_at = utc_now()
                    item.error = str(exc)
                    state.last_error = str(exc)
                    store.save(state)
                    self._emit_progress(state, progress_callback)
                    logger.error(
                        "backtest_attempt_failed",
                        ini_name=item.ini_name,
                        attempt_number=attempt_number,
                        error=str(exc),
                    )
                    if attempt_number < self.config.max_attempts_per_ini:
                        time.sleep(self.config.retry_delay_seconds)

            if not succeeded:
                item.status = "failed"
                item.finished_at = utc_now()
                state.failed_ini += 1
                state.had_failures = True
                store.save(state)
                self._emit_progress(state, progress_callback)
                logger.error("backtest_item_failed", ini_name=item.ini_name, error=item.error)

    def _set_stage(
        self,
        state: RunState,
        store: StateStore,
        logger: RunLogger,
        stage: str,
        progress_callback: ProgressCallback | None,
    ) -> None:
        state.current_stage = stage  # type: ignore[assignment]
        store.save(state)
        self._emit_progress(state, progress_callback)
        logger.info("stage_changed", stage=stage)

    def _safe_optimize_stage_callback(
        self,
        optimize_stage_callback: ProgressCallback | None,
        state: RunState,
        logger: RunLogger,
    ) -> None:
        if optimize_stage_callback is None:
            return
        try:
            optimize_stage_callback(state)
        except Exception as exc:
            logger.error(
                "optimize_results_upload_failed",
                run_id=state.run_id,
                job_id=state.job_id,
                error=str(exc),
            )
            raise RuntimeError(f"Optimize results upload failed: {exc}") from exc

    def _finalize_run(
        self,
        state: RunState,
        store: StateStore,
        logger: RunLogger,
        progress_callback: ProgressCallback | None,
    ) -> None:
        state.status = "done" if (state.failed_ini == 0 and not state.had_failures) else "failed"
        state.current_stage = "done" if state.status == "done" else "failed"
        state.finished_at = utc_now()
        store.save(state)
        self._emit_progress(state, progress_callback)
        logger.info(
            "job_finished",
            status=state.status,
            done_ini=state.done_ini,
            failed_ini=state.failed_ini,
            total_ini=state.total_ini,
            generated_ini_count=state.generated_ini_count,
        )

    def _collect_ini_files(self, ini_folder: Path, max_ini: int | None) -> list[Path]:
        ini_files = sorted(path for path in ini_folder.glob("*.ini") if path.is_file())
        if max_ini is not None:
            return ini_files[:max_ini]
        return ini_files

    def _emit_progress(self, state: RunState, progress_callback: ProgressCallback | None) -> None:
        if progress_callback is not None:
            progress_callback(state)

    def _build_report_name(self, *, job: JobRequest, ini_stem: str, suffix: str | None = None) -> str:
        tokens: list[str] = []
        is_rerun_job = "__rerun__" in str(job.job_id)
        job_label = self._sanitize_report_token(
            job.job_id if is_rerun_job else (job.job_name or job.bot_name or job.job_id)
        )
        if job_label:
            tokens.append(job_label)
        if ini_stem and not is_rerun_job:
            tokens.append(self._sanitize_report_token(ini_stem))
        if suffix:
            tokens.append(self._sanitize_report_token(suffix))
        if not tokens:
            return self._sanitize_report_token(job.job_id)
        return "__".join(tokens)

    @staticmethod
    def _sanitize_report_token(value: str) -> str:
        cleaned = "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in value.strip())
        return cleaned.strip("._-") or "report"
