from __future__ import annotations

import argparse
import json
from pathlib import Path

from .config import build_config
from .models import JobRequest
from .pipeline import FilterConfig
from .runner import LocalJobRunner


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="MT5 Local Worker CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_job = subparsers.add_parser("run-job", help="Run one local MT5 job")
    run_job.add_argument("--job-id", required=True, help="External job id")
    run_job.add_argument("--bot-name", required=True, help="Bot name")
    run_job.add_argument("--ini-folder", required=True, help="Folder containing .ini files")
    run_job.add_argument("--workspace-root", default=".", help="Project workspace root")
    run_job.add_argument("--mt5-path", default=None, help="Path to terminal64.exe")
    run_job.add_argument(
        "--terminal-data-path",
        default=None,
        help="Path to the MT5 terminal data folder",
    )
    run_job.add_argument("--max-attempts", type=int, default=2, help="Retry count per ini")
    run_job.add_argument("--retry-delay", type=int, default=3, help="Seconds between retries")
    run_job.add_argument("--post-exit-grace", type=int, default=30, help="Extra seconds to keep waiting after MT5 exits")
    run_job.add_argument("--max-ini", type=int, default=None, help="Optional limit for test runs")
    run_job.add_argument("--json", action="store_true", help="Print final run state as JSON")

    full_pipeline = subparsers.add_parser("run-full-pipeline", help="Optimize, filter, generate backtest ini, then backtest")
    full_pipeline.add_argument("--job-id", required=True, help="External job id")
    full_pipeline.add_argument("--bot-name", required=True, help="Bot name")
    full_pipeline.add_argument("--ini-folder", required=True, help="Folder containing optimize .ini files")
    full_pipeline.add_argument("--workspace-root", default=".", help="Project workspace root")
    full_pipeline.add_argument("--mt5-path", default=None, help="Path to terminal64.exe")
    full_pipeline.add_argument(
        "--terminal-data-path",
        default=None,
        help="Path to the MT5 terminal data folder",
    )
    full_pipeline.add_argument("--max-attempts", type=int, default=2, help="Retry count per ini")
    full_pipeline.add_argument("--retry-delay", type=int, default=3, help="Seconds between retries")
    full_pipeline.add_argument("--post-exit-grace", type=int, default=30, help="Extra seconds to keep waiting after MT5 exits")
    full_pipeline.add_argument("--max-ini", type=int, default=None, help="Optional limit for test runs")
    full_pipeline.add_argument("--optimize-runs", type=int, default=3, help="Number of optimize runs per template ini")
    full_pipeline.add_argument("--min-profit", type=float, default=10000, help="Min Profit")
    full_pipeline.add_argument("--min-trades", type=float, default=100, help="Min Trades")
    full_pipeline.add_argument("--max-trades", type=float, default=1200, help="Max Trades")
    full_pipeline.add_argument("--min-recovery-factor", type=float, default=2, help="Min Recovery Factor")
    full_pipeline.add_argument("--min-profit-factor", type=float, default=1, help="Min Profit Factor")
    full_pipeline.add_argument("--max-profit-factor", type=float, default=4, help="Max Profit Factor")
    full_pipeline.add_argument("--min-equity-dd", type=float, default=8, help="Min Equity DD")
    full_pipeline.add_argument("--max-equity-dd", type=float, default=13, help="Max Equity DD")
    full_pipeline.add_argument("--top-n", type=int, default=10, help="Top parameter sets to keep per bot")
    full_pipeline.add_argument("--json", action="store_true", help="Print final run state as JSON")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "run-job":
        config = build_config(
            workspace_root=args.workspace_root,
            mt5_path=args.mt5_path,
            terminal_data_path=args.terminal_data_path,
            max_attempts_per_ini=args.max_attempts,
            retry_delay_seconds=args.retry_delay,
            report_post_exit_grace_seconds=args.post_exit_grace,
        )
        job = JobRequest(
            job_id=args.job_id,
            job_name=None,
            bot_name=args.bot_name,
            ini_folder=Path(args.ini_folder).resolve(),
            max_ini=args.max_ini,
        )
        runner = LocalJobRunner(config)
        state = runner.run_job(job)
        _print_state(state, as_json=args.json)
        return 0

    if args.command == "run-full-pipeline":
        config = build_config(
            workspace_root=args.workspace_root,
            mt5_path=args.mt5_path,
            terminal_data_path=args.terminal_data_path,
            max_attempts_per_ini=args.max_attempts,
            retry_delay_seconds=args.retry_delay,
            report_post_exit_grace_seconds=args.post_exit_grace,
        )
        job = JobRequest(
            job_id=args.job_id,
            job_name=None,
            bot_name=args.bot_name,
            ini_folder=Path(args.ini_folder).resolve(),
            max_ini=args.max_ini,
            optimize_runs=args.optimize_runs,
        )
        filters = FilterConfig(
            min_profit=args.min_profit,
            min_trades=args.min_trades,
            max_trades=args.max_trades,
            min_recovery_factor=args.min_recovery_factor,
            min_profit_factor=args.min_profit_factor,
            max_profit_factor=args.max_profit_factor,
            min_equity_dd=args.min_equity_dd,
            max_equity_dd=args.max_equity_dd,
            top_n=args.top_n,
        )
        runner = LocalJobRunner(config)
        state = runner.run_full_pipeline(job, filters)
        _print_state(state, as_json=args.json)
        return 0

    parser.error(f"Unknown command: {args.command}")
    return 2


def _print_state(state, as_json: bool) -> None:
    if as_json:
        print(json.dumps(state.to_dict(), ensure_ascii=False, indent=2))
    else:
        print(f"Run completed: {state.run_id}")
        print(f"Status: {state.status}")
        print(f"Stage: {state.current_stage}")
        print(f"Done: {state.done_ini}/{state.total_ini}")
        print(f"Failed: {state.failed_ini}/{state.total_ini}")
        print(f"Generated backtest ini: {state.generated_ini_count}")
        print(f"Run dir: {state.run_dir}")


if __name__ == "__main__":
    raise SystemExit(main())
