from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


JOB_STATUS_PENDING = "pending"
JOB_STATUS_RUNNING = "running"
JOB_STATUS_DONE = "done"
JOB_STATUS_FAILED = "failed"
ACTIVE_IDLE_WINDOW_SECONDS = 45


def utc_now_sql() -> str:
    return "strftime('%Y-%m-%dT%H:%M:%fZ','now')"


class SQLiteJobStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _initialize(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  external_job_id TEXT NOT NULL UNIQUE,
                  job_name TEXT NOT NULL,
                  mode TEXT NOT NULL CHECK (mode IN ('backtest_only', 'full_pipeline')),
                  ini_folder TEXT NOT NULL,
                  bot_name TEXT NOT NULL,
                  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'done', 'failed')),
                  claimable INTEGER NOT NULL DEFAULT 1,
                  priority INTEGER NOT NULL DEFAULT 0,
                  max_ini INTEGER,
                  optimize_runs INTEGER NOT NULL DEFAULT 3,
                  filters_json TEXT,
                  artifact_relpath TEXT,
                  result_artifact_relpath TEXT,
                  source_job_id TEXT,
                  worker_name TEXT,
                  run_id TEXT,
                  run_dir TEXT,
                  current_stage TEXT,
                  current_item TEXT,
                  total_ini INTEGER NOT NULL DEFAULT 0,
                  done_ini INTEGER NOT NULL DEFAULT 0,
                  failed_ini INTEGER NOT NULL DEFAULT 0,
                  generated_ini_count INTEGER NOT NULL DEFAULT 0,
                  retry_count INTEGER NOT NULL DEFAULT 0,
                  max_retry INTEGER NOT NULL DEFAULT 1,
                  last_heartbeat TEXT,
                  last_error TEXT,
                  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                  started_at TEXT,
                  finished_at TEXT,
                  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                );

                CREATE TABLE IF NOT EXISTS job_events (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  external_job_id TEXT NOT NULL,
                  event_type TEXT NOT NULL,
                  payload_json TEXT,
                  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                );

                CREATE TABLE IF NOT EXISTS workers (
                  name TEXT PRIMARY KEY,
                  status TEXT NOT NULL CHECK (status IN ('active', 'draining', 'offline')),
                  current_job_id TEXT,
                  jobs_claimed INTEGER NOT NULL DEFAULT 0,
                  last_claimed_at TEXT,
                  last_seen TEXT,
                  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                );

                CREATE INDEX IF NOT EXISTS idx_jobs_status_priority_id
                  ON jobs(status, priority DESC, id ASC);
                CREATE INDEX IF NOT EXISTS idx_jobs_heartbeat
                  ON jobs(status, last_heartbeat);
                CREATE INDEX IF NOT EXISTS idx_job_events_job
                  ON job_events(external_job_id, id ASC);
                """
            )
            self._migrate_jobs_table(conn)
            self._migrate_workers_table(conn)

    def _migrate_jobs_table(self, conn: sqlite3.Connection) -> None:
        columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(jobs)").fetchall()
        }
        if "current_stage" not in columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN current_stage TEXT")
        if "current_item" not in columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN current_item TEXT")
        if "claimable" not in columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN claimable INTEGER NOT NULL DEFAULT 1")
        if "artifact_relpath" not in columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN artifact_relpath TEXT")
        if "result_artifact_relpath" not in columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN result_artifact_relpath TEXT")
        if "source_job_id" not in columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN source_job_id TEXT")

    def _migrate_workers_table(self, conn: sqlite3.Connection) -> None:
        columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(workers)").fetchall()
        }
        if "status" not in columns:
            conn.execute("ALTER TABLE workers ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
        if "jobs_claimed" not in columns:
            conn.execute("ALTER TABLE workers ADD COLUMN jobs_claimed INTEGER NOT NULL DEFAULT 0")
        if "last_claimed_at" not in columns:
            conn.execute("ALTER TABLE workers ADD COLUMN last_claimed_at TEXT")

    def enqueue_job(
        self,
        *,
        external_job_id: str,
        job_name: str,
        mode: str,
        ini_folder: str,
        bot_name: str,
        priority: int = 0,
        max_ini: int | None = None,
        optimize_runs: int = 3,
        filters: dict | None = None,
        max_retry: int = 1,
        claimable: bool = True,
        artifact_relpath: str | None = None,
        source_job_id: str | None = None,
    ) -> dict:
        filters_json = json.dumps(filters, ensure_ascii=False) if filters is not None else None
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO jobs (
                  external_job_id, job_name, mode, ini_folder, bot_name, status, claimable, priority,
                  max_ini, optimize_runs, filters_json, max_retry, artifact_relpath, source_job_id, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                """,
                (
                    external_job_id,
                    job_name,
                    mode,
                    ini_folder,
                    bot_name,
                    1 if claimable else 0,
                    priority,
                    max_ini,
                    optimize_runs,
                    filters_json,
                    max_retry,
                    artifact_relpath,
                    source_job_id,
                ),
            )
            self._insert_event(
                conn,
                external_job_id,
                "job_enqueued",
                {"mode": mode, "priority": priority, "claimable": claimable, "source_job_id": source_job_id},
            )
            row = conn.execute("SELECT * FROM jobs WHERE external_job_id = ?", (external_job_id,)).fetchone()
        return self._row_to_job(row)

    def claim_next_job(self, worker_name: str) -> dict | None:
        with self.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            worker = conn.execute(
                "SELECT status, current_job_id, jobs_claimed, last_claimed_at, last_seen FROM workers WHERE name = ?",
                (worker_name,),
            ).fetchone()
            if worker is not None and worker["status"] != "active":
                return None
            if worker is not None and worker["current_job_id"]:
                return None
            if not self._is_worker_turn(conn, worker_name):
                return None
            row = conn.execute(
                """
                SELECT * FROM jobs
                WHERE status = 'pending' AND claimable = 1
                ORDER BY priority DESC, id ASC
                LIMIT 1
                """
            ).fetchone()
            if row is None:
                row = conn.execute(
                    """
                    SELECT * FROM jobs
                    WHERE status = 'failed'
                      AND claimable = 1
                      AND retry_count <= max_retry
                    ORDER BY priority DESC, retry_count ASC, id ASC
                    LIMIT 1
                    """
                ).fetchone()
            if row is None:
                return None

            conn.execute(
                """
                UPDATE jobs
                SET status = 'running',
                    worker_name = ?,
                    started_at = COALESCE(started_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                    last_heartbeat = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE external_job_id = ?
                """,
                (worker_name, row["external_job_id"]),
            )
            conn.execute(
                """
                INSERT INTO workers(name, status, current_job_id, jobs_claimed, last_claimed_at, last_seen, updated_at)
                VALUES (?, 'active', ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                ON CONFLICT(name) DO UPDATE SET
                  status='active',
                  current_job_id=excluded.current_job_id,
                  jobs_claimed=workers.jobs_claimed + 1,
                  last_claimed_at=excluded.last_claimed_at,
                  last_seen=excluded.last_seen,
                  updated_at=excluded.updated_at
                """,
                (worker_name, row["external_job_id"]),
            )
            self._insert_event(conn, row["external_job_id"], "job_claimed", {"worker_name": worker_name})
            row = conn.execute("SELECT * FROM jobs WHERE external_job_id = ?", (row["external_job_id"],)).fetchone()
        return self._row_to_job(row)

    def heartbeat(self, *, external_job_id: str, worker_name: str, done_ini: int, total_ini: int) -> dict | None:
        return self.heartbeat_with_progress(
            external_job_id=external_job_id,
            worker_name=worker_name,
            done_ini=done_ini,
            total_ini=total_ini,
            current_stage=None,
            current_item=None,
            run_id=None,
            generated_ini_count=None,
        )

    def heartbeat_with_progress(
        self,
        *,
        external_job_id: str,
        worker_name: str,
        done_ini: int,
        total_ini: int,
        current_stage: str | None,
        current_item: str | None,
        run_id: str | None,
        generated_ini_count: int | None,
    ) -> dict | None:
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE jobs
                SET done_ini = ?,
                    total_ini = ?,
                    current_stage = COALESCE(?, current_stage),
                    current_item = ?,
                    run_id = COALESCE(?, run_id),
                    generated_ini_count = COALESCE(?, generated_ini_count),
                    last_heartbeat = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE external_job_id = ? AND worker_name = ? AND status = 'running'
                """,
                (
                    done_ini,
                    total_ini,
                    current_stage,
                    current_item,
                    run_id,
                    generated_ini_count,
                    external_job_id,
                    worker_name,
                ),
            )
            conn.execute(
                """
                UPDATE workers
                SET last_seen = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE name = ?
                """,
                (worker_name,),
            )
            row = conn.execute("SELECT * FROM jobs WHERE external_job_id = ?", (external_job_id,)).fetchone()
            if row is None:
                return None
            self._insert_event(
                conn,
                external_job_id,
                "heartbeat",
                {
                    "worker_name": worker_name,
                    "done_ini": done_ini,
                    "total_ini": total_ini,
                    "current_stage": current_stage,
                    "current_item": current_item,
                    "run_id": run_id,
                    "generated_ini_count": generated_ini_count,
                },
            )
        return self._row_to_job(row)

    def mark_done(
        self,
        *,
        external_job_id: str,
        worker_name: str,
        run_id: str,
        run_dir: str,
        done_ini: int,
        failed_ini: int,
        total_ini: int,
        generated_ini_count: int,
        result_artifact_relpath: str | None = None,
    ) -> dict | None:
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE jobs
                SET status = 'done',
                    run_id = ?,
                    run_dir = ?,
                    current_stage = 'done',
                    current_item = NULL,
                    done_ini = ?,
                    failed_ini = ?,
                    total_ini = ?,
                    generated_ini_count = ?,
                    result_artifact_relpath = COALESCE(?, result_artifact_relpath),
                    finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE external_job_id = ? AND worker_name = ?
                """,
                (
                    run_id,
                    run_dir,
                    done_ini,
                    failed_ini,
                    total_ini,
                    generated_ini_count,
                    result_artifact_relpath,
                    external_job_id,
                    worker_name,
                ),
            )
            conn.execute(
                """
                UPDATE workers
                SET current_job_id = NULL,
                    last_seen = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE name = ?
                """,
                (worker_name,),
            )
            row = conn.execute("SELECT * FROM jobs WHERE external_job_id = ?", (external_job_id,)).fetchone()
            if row is None:
                return None
            self._insert_event(
                conn,
                external_job_id,
                "job_done",
                {
                    "worker_name": worker_name,
                    "run_id": run_id,
                    "run_dir": run_dir,
                    "result_artifact_relpath": result_artifact_relpath,
                },
            )
        return self._row_to_job(row)

    def mark_failed(
        self,
        *,
        external_job_id: str,
        worker_name: str | None,
        error: str,
    ) -> dict | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE external_job_id = ?", (external_job_id,)).fetchone()
            if row is None:
                return None

            retry_count = int(row["retry_count"]) + 1
            should_retry = retry_count <= int(row["max_retry"])
            next_status = JOB_STATUS_FAILED
            next_worker = worker_name

            conn.execute(
                """
                UPDATE jobs
                SET status = ?,
                    worker_name = ?,
                    current_item = NULL,
                    retry_count = ?,
                    last_error = ?,
                    finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE external_job_id = ?
                """,
                (next_status, next_worker, retry_count, error, external_job_id),
            )
            if worker_name:
                conn.execute(
                    """
                    UPDATE workers
                    SET current_job_id = NULL,
                        last_seen = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                    WHERE name = ?
                    """,
                    (worker_name,),
                )
            self._insert_event(
                conn,
                external_job_id,
                "job_failed",
                {"worker_name": worker_name, "error": error, "retry_count": retry_count, "will_retry": should_retry},
            )
            row = conn.execute("SELECT * FROM jobs WHERE external_job_id = ?", (external_job_id,)).fetchone()
        return self._row_to_job(row)

    def list_jobs(self, limit: int = 100) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM jobs
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [self._row_to_job(row) for row in rows]

    def split_bundle_job(self, external_job_id: str, ini_relpaths: list[str]) -> list[dict]:
        with self.connect() as conn:
            parent = conn.execute("SELECT * FROM jobs WHERE external_job_id = ?", (external_job_id,)).fetchone()
            if parent is None:
                return []

            existing = conn.execute(
                "SELECT COUNT(*) AS count FROM jobs WHERE source_job_id = ?",
                (external_job_id,),
            ).fetchone()
            if existing is not None and int(existing["count"]) > 0:
                raise ValueError("Bundle job has already been split")

            created_ids: list[str] = []
            for index, ini_relpath in enumerate(ini_relpaths, start=1):
                child_external_job_id = f"{external_job_id}__{index:04d}"
                ini_name = Path(ini_relpath).name
                conn.execute(
                    """
                    INSERT INTO jobs (
                      external_job_id, job_name, mode, ini_folder, bot_name, status, claimable, priority,
                      max_ini, optimize_runs, filters_json, max_retry, artifact_relpath, source_job_id, updated_at
                    ) VALUES (?, ?, ?, ?, ?, 'pending', 1, ?, 1, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                    """,
                    (
                        child_external_job_id,
                        f"{parent['job_name']} :: {ini_name}",
                        parent["mode"],
                        f"@artifact:{ini_relpath}",
                        parent["bot_name"],
                        parent["priority"],
                        parent["optimize_runs"],
                        parent["filters_json"],
                        parent["max_retry"],
                        ini_relpath,
                        external_job_id,
                    ),
                )
                self._insert_event(
                    conn,
                    child_external_job_id,
                    "job_split_created",
                    {"source_job_id": external_job_id, "artifact_relpath": ini_relpath},
                )
                created_ids.append(child_external_job_id)

            self._insert_event(conn, external_job_id, "job_split_complete", {"child_count": len(created_ids)})

            if not created_ids:
                return []
            placeholders = ",".join("?" for _ in created_ids)
            rows = conn.execute(
                f"SELECT * FROM jobs WHERE external_job_id IN ({placeholders}) ORDER BY id ASC",
                created_ids,
            ).fetchall()
        return [self._row_to_job(row) for row in rows]

    def requeue_job(self, external_job_id: str) -> dict | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE external_job_id = ?", (external_job_id,)).fetchone()
            if row is None:
                return None
            if row["status"] == JOB_STATUS_RUNNING:
                raise ValueError("Cannot requeue a running job")
            conn.execute(
                """
                UPDATE jobs
                SET status = 'pending',
                    worker_name = NULL,
                    run_id = NULL,
                    run_dir = NULL,
                    current_stage = NULL,
                    current_item = NULL,
                    total_ini = 0,
                    done_ini = 0,
                    failed_ini = 0,
                    generated_ini_count = 0,
                    retry_count = 0,
                    last_heartbeat = NULL,
                    last_error = NULL,
                    started_at = NULL,
                    finished_at = NULL,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE external_job_id = ?
                """,
                (external_job_id,),
            )
            self._insert_event(conn, external_job_id, "job_requeued_manual", None)
            row = conn.execute("SELECT * FROM jobs WHERE external_job_id = ?", (external_job_id,)).fetchone()
        return self._row_to_job(row)

    def clone_job(
        self,
        *,
        external_job_id: str,
        new_external_job_id: str,
        job_name: str | None = None,
    ) -> dict | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE external_job_id = ?", (external_job_id,)).fetchone()
            if row is None:
                return None
        source = self._row_to_job(row)
        assert source is not None
        cloned = self.enqueue_job(
            external_job_id=new_external_job_id,
            job_name=job_name or source["job_name"],
            mode=source["mode"],
            ini_folder=source["ini_folder"],
            bot_name=source["bot_name"],
            priority=source["priority"],
            max_ini=source["max_ini"],
            optimize_runs=source["optimize_runs"],
            filters=source["filters"],
            max_retry=source["max_retry"],
            claimable=bool(source.get("claimable", True)),
            artifact_relpath=source.get("artifact_relpath"),
            source_job_id=source.get("source_job_id"),
        )
        with self.connect() as conn:
            self._insert_event(
                conn,
                new_external_job_id,
                "job_cloned",
                {"source_external_job_id": external_job_id},
            )
        return cloned

    def list_workers(self) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT name, status, current_job_id, jobs_claimed, last_claimed_at, last_seen, updated_at
                FROM workers
                ORDER BY name ASC
                """
            ).fetchall()
        return [self._row_to_worker(row) for row in rows]

    def upsert_worker(self, *, worker_name: str, status: str = "active", current_job_id: str | None = None) -> dict:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO workers(name, status, current_job_id, jobs_claimed, last_claimed_at, last_seen, updated_at)
                VALUES (?, ?, ?, 0, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                ON CONFLICT(name) DO UPDATE SET
                  status=excluded.status,
                  current_job_id=excluded.current_job_id,
                  last_seen=excluded.last_seen,
                  updated_at=excluded.updated_at
                """,
                (worker_name, status, current_job_id),
            )
            row = conn.execute("SELECT * FROM workers WHERE name = ?", (worker_name,)).fetchone()
        return self._row_to_worker(row)

    def get_worker(self, worker_name: str) -> dict | None:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT name, status, current_job_id, jobs_claimed, last_claimed_at, last_seen, updated_at
                FROM workers
                WHERE name = ?
                """,
                (worker_name,),
            ).fetchone()
        return self._row_to_worker(row) if row is not None else None

    def set_worker_status(self, *, worker_name: str, status: str) -> dict:
        with self.connect() as conn:
            existing = conn.execute(
                "SELECT current_job_id FROM workers WHERE name = ?",
                (worker_name,),
            ).fetchone()
            current_job_id = existing["current_job_id"] if existing is not None else None
            conn.execute(
                """
                INSERT INTO workers(name, status, current_job_id, jobs_claimed, last_claimed_at, last_seen, updated_at)
                VALUES (?, ?, ?, 0, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                ON CONFLICT(name) DO UPDATE SET
                  status=excluded.status,
                  current_job_id=COALESCE(workers.current_job_id, excluded.current_job_id),
                  last_seen=excluded.last_seen,
                  updated_at=excluded.updated_at
                """,
                (worker_name, status, current_job_id),
            )
            row = conn.execute(
                """
                SELECT name, status, current_job_id, jobs_claimed, last_claimed_at, last_seen, updated_at
                FROM workers
                WHERE name = ?
                """,
                (worker_name,),
            ).fetchone()
        return self._row_to_worker(row)

    def _is_worker_turn(self, conn: sqlite3.Connection, worker_name: str) -> bool:
        rows = conn.execute(
            """
            SELECT name, jobs_claimed, last_claimed_at
            FROM workers
            WHERE status = 'active'
              AND current_job_id IS NULL
              AND last_seen IS NOT NULL
              AND datetime(last_seen) >= datetime('now', '-' || ? || ' seconds')
            ORDER BY jobs_claimed ASC,
                     CASE WHEN last_claimed_at IS NULL THEN 0 ELSE 1 END ASC,
                     last_claimed_at ASC,
                     name ASC
            """,
            (ACTIVE_IDLE_WINDOW_SECONDS,),
        ).fetchall()
        if not rows:
            return True
        return rows[0]["name"] == worker_name

    def snapshot(self, limit: int = 100) -> dict:
        return {
            "jobs": self.list_jobs(limit=limit),
            "workers": self.list_workers(),
        }

    def recover_stale_jobs(self, stale_after_seconds: int) -> list[dict]:
        recovered: list[dict] = []
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT external_job_id, worker_name
                FROM jobs
                WHERE status = 'running'
                  AND last_heartbeat IS NOT NULL
                  AND datetime(last_heartbeat) < datetime('now', '-' || ? || ' seconds')
                """,
                (stale_after_seconds,),
            ).fetchall()
            for row in rows:
                current = conn.execute(
                    "SELECT * FROM jobs WHERE external_job_id = ?",
                    (row["external_job_id"],),
                ).fetchone()
                if current is None:
                    continue
                retry_count = int(current["retry_count"]) + 1
                should_retry = retry_count <= int(current["max_retry"])
                next_status = JOB_STATUS_FAILED
                next_worker = row["worker_name"]
                conn.execute(
                    """
                    UPDATE jobs
                    SET status = ?,
                        worker_name = ?,
                        current_stage = NULL,
                        current_item = NULL,
                        retry_count = ?,
                        last_error = ?,
                        finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                    WHERE external_job_id = ?
                    """,
                    (
                        next_status,
                        next_worker,
                        retry_count,
                        f"stale heartbeat timeout after {stale_after_seconds}s",
                        row["external_job_id"],
                    ),
                )
                if row["worker_name"]:
                    conn.execute(
                        """
                        UPDATE workers
                        SET current_job_id = NULL,
                            status = 'offline',
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                        WHERE name = ?
                        """,
                        (row["worker_name"],),
                    )
                self._insert_event(
                    conn,
                    row["external_job_id"],
                    "job_failed",
                    {
                        "worker_name": row["worker_name"],
                        "error": f"stale heartbeat timeout after {stale_after_seconds}s",
                        "retry_count": retry_count,
                        "will_retry": should_retry,
                    },
                )
                updated = conn.execute(
                    "SELECT * FROM jobs WHERE external_job_id = ?",
                    (row["external_job_id"],),
                ).fetchone()
                if updated is not None:
                    recovered.append(self._row_to_job(updated))
        return recovered

    def get_job(self, external_job_id: str) -> dict | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE external_job_id = ?", (external_job_id,)).fetchone()
        return self._row_to_job(row) if row else None

    def list_job_events(self, external_job_id: str) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT external_job_id, event_type, payload_json, created_at
                FROM job_events
                WHERE external_job_id = ?
                ORDER BY id ASC
                """,
                (external_job_id,),
            ).fetchall()
        return [
            {
                "external_job_id": row["external_job_id"],
                "event_type": row["event_type"],
                "payload": json.loads(row["payload_json"]) if row["payload_json"] else None,
                "created_at": row["created_at"],
            }
            for row in rows
        ]

    def _insert_event(self, conn: sqlite3.Connection, external_job_id: str, event_type: str, payload: dict | None) -> None:
        conn.execute(
            """
            INSERT INTO job_events(external_job_id, event_type, payload_json)
            VALUES (?, ?, ?)
            """,
            (
                external_job_id,
                event_type,
                json.dumps(payload, ensure_ascii=False) if payload is not None else None,
            ),
        )

    def _row_to_job(self, row: sqlite3.Row | None) -> dict | None:
        if row is None:
            return None
        data = dict(row)
        if data.get("filters_json"):
            data["filters"] = json.loads(data["filters_json"])
        else:
            data["filters"] = None
        del data["filters_json"]
        data["claimable"] = bool(data.get("claimable", 1))
        retry_count = int(data.get("retry_count") or 0)
        max_retry = int(data.get("max_retry") or 0)
        status = data.get("status")
        retry_left = max_retry - retry_count
        if status == JOB_STATUS_FAILED:
            retry_left += 1
        data["retry_left"] = max(retry_left, 0)
        return data

    def _row_to_worker(self, row: sqlite3.Row | None) -> dict:
        data = dict(row)
        data["activity_state"] = "busy" if data.get("current_job_id") else "idle"
        return data
