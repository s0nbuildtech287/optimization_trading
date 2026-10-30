from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


JobMode = Literal["backtest_only", "full_pipeline"]


class FilterPayload(BaseModel):
    min_profit: float = 10000
    min_trades: float = 100
    max_trades: float = 1200
    min_recovery_factor: float = 2
    min_profit_factor: float = 1
    max_profit_factor: float = 4
    min_equity_dd: float = 8
    max_equity_dd: float = 13
    top_n: int = 10


class EnqueueJobRequest(BaseModel):
    external_job_id: str = Field(..., description="Stable external job id")
    job_name: str
    bot_name: str
    ini_folder: str
    mode: JobMode = "full_pipeline"
    priority: int = 0
    max_ini: int | None = None
    optimize_runs: int = 3
    max_retry: int = 1
    filters: FilterPayload | None = None


class ClaimJobRequest(BaseModel):
    worker_name: str


class WorkerStatusRequest(BaseModel):
    worker_name: str


class WorkerHeartbeatRequest(BaseModel):
    worker_name: str
    status: str | None = None
    current_job_id: str | None = None


class CloneJobRequest(BaseModel):
    new_external_job_id: str
    job_name: str | None = None


class HeartbeatRequest(BaseModel):
    worker_name: str
    external_job_id: str
    done_ini: int
    total_ini: int
    current_stage: str | None = None
    current_item: str | None = None
    run_id: str | None = None
    generated_ini_count: int | None = None


class DoneJobRequest(BaseModel):
    worker_name: str
    external_job_id: str
    run_id: str
    run_dir: str
    done_ini: int
    failed_ini: int
    total_ini: int
    generated_ini_count: int = 0
    result_artifact_relpath: str | None = None


class FailJobRequest(BaseModel):
    worker_name: str | None = None
    external_job_id: str
    error: str
