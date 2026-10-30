from __future__ import annotations

import argparse

import uvicorn

from .server_app import create_app


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="MT5 Local Worker Server CLI")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--db-path", default="server/mt5_queue.db")
    parser.add_argument("--artifacts-root", default="server/artifacts")
    parser.add_argument("--stale-after", type=int, default=120)
    parser.add_argument("--sweep-interval", type=int, default=30)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    app = create_app(
        db_path=args.db_path,
        artifacts_root=args.artifacts_root,
        stale_after_seconds=args.stale_after,
        sweep_interval_seconds=args.sweep_interval,
    )
    uvicorn.run(app, host=args.host, port=args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
