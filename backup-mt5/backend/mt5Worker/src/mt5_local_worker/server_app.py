from __future__ import annotations

import asyncio
import csv
import io
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, Response
from starlette.responses import StreamingResponse

from .artifact_store import ArtifactStore
from .job_store import SQLiteJobStore
from .server_models import ClaimJobRequest, CloneJobRequest, DoneJobRequest, EnqueueJobRequest, FailJobRequest, HeartbeatRequest, WorkerHeartbeatRequest, WorkerStatusRequest


def create_app(
    db_path: str | Path = "server/mt5_queue.db",
    artifacts_root: str | Path = "server/artifacts",
    stale_after_seconds: int = 120,
    sweep_interval_seconds: int = 30,
) -> FastAPI:
    app = FastAPI(title="MT5 Local Worker Server", version="0.1.0")
    store = SQLiteJobStore(Path(db_path))
    artifacts = ArtifactStore(Path(artifacts_root))
    app.state.store = store
    app.state.artifacts = artifacts
    app.state.stale_after_seconds = stale_after_seconds
    app.state.sweep_interval_seconds = sweep_interval_seconds
    app.state.sweeper_task = None

    @app.on_event("startup")
    async def startup() -> None:
        async def sweeper_loop() -> None:
            while True:
                store.recover_stale_jobs(stale_after_seconds=stale_after_seconds)
                await asyncio.sleep(sweep_interval_seconds)
        app.state.sweeper_task = asyncio.create_task(sweeper_loop())

    @app.on_event("shutdown")
    async def shutdown() -> None:
        task = app.state.sweeper_task
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    @app.get("/health")
    def health() -> dict:
        return {"ok": True}

    @app.get("/", response_class=HTMLResponse)
    @app.get("/dashboard", response_class=HTMLResponse)
    def dashboard() -> str:
        jobs = store.list_jobs(limit=100)
        workers = store.list_workers()
        return _render_dashboard(jobs, workers, stale_after_seconds, sweep_interval_seconds)

    @app.get("/events")
    async def events() -> StreamingResponse:
        async def generator():
            while True:
                payload = store.snapshot(limit=100)
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                await asyncio.sleep(1)
        return StreamingResponse(generator(), media_type="text/event-stream")

    @app.post("/jobs/enqueue")
    def enqueue_job(payload: EnqueueJobRequest) -> dict:
        try:
            return store.enqueue_job(
                external_job_id=payload.external_job_id,
                job_name=payload.job_name,
                mode=payload.mode,
                ini_folder=payload.ini_folder,
                bot_name=payload.bot_name,
                priority=payload.priority,
                max_ini=payload.max_ini,
                optimize_runs=payload.optimize_runs,
                filters=payload.filters.model_dump() if payload.filters else None,
                max_retry=payload.max_retry,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/jobs/upload-bundle")
    async def upload_bundle(
        request: Request,
        external_job_id: str = Query(...),
        job_name: str = Query(...),
        bot_name: str = Query(...),
        filename: str = Query(...),
        mode: str = Query("full_pipeline"),
        priority: int = Query(0),
        optimize_runs: int = Query(3),
        max_retry: int = Query(1),
        filters_json: str | None = Query(default=None),
    ) -> dict:
        try:
            content = await request.body()
            filters = json.loads(filters_json) if filters_json else None
            bundle_relpath = artifacts.save_bundle(
                external_job_id=external_job_id,
                filename=filename,
                content=content,
            )
            return store.enqueue_job(
                external_job_id=external_job_id,
                job_name=job_name,
                mode=mode,
                ini_folder=f"@artifact_bundle:{bundle_relpath}",
                bot_name=bot_name,
                priority=priority,
                max_ini=None,
                optimize_runs=optimize_runs,
                filters=filters,
                max_retry=max_retry,
                claimable=False,
                artifact_relpath=bundle_relpath,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/jobs/{external_job_id}/split")
    def split_job(external_job_id: str) -> dict:
        job = store.get_job(external_job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        bundle_relpath = job.get("artifact_relpath")
        if not bundle_relpath:
            raise HTTPException(status_code=400, detail="Job has no bundle artifact")
        try:
            ini_relpaths = artifacts.list_ini_files(bundle_relpath)
            jobs = store.split_bundle_job(external_job_id, ini_relpaths)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"jobs": jobs, "count": len(jobs)}

    @app.post("/jobs/claim")
    def claim_job(payload: ClaimJobRequest, request: Request) -> dict:
        job = store.claim_next_job(payload.worker_name)
        if job is not None and job.get("artifact_relpath"):
            artifact_path = artifacts.resolve_relpath(job["artifact_relpath"])
            if artifact_path.is_file():
                job["artifact_download_url"] = str(request.base_url).rstrip("/") + f"/artifacts/jobs/{job['external_job_id']}/download"
        return {"job": job}

    @app.post("/jobs/heartbeat")
    def heartbeat(payload: HeartbeatRequest) -> dict:
        job = store.heartbeat_with_progress(
            external_job_id=payload.external_job_id,
            worker_name=payload.worker_name,
            done_ini=payload.done_ini,
            total_ini=payload.total_ini,
            current_stage=payload.current_stage,
            current_item=payload.current_item,
            run_id=payload.run_id,
            generated_ini_count=payload.generated_ini_count,
        )
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @app.post("/jobs/done")
    def mark_done(payload: DoneJobRequest) -> dict:
        job = store.mark_done(
            external_job_id=payload.external_job_id,
            worker_name=payload.worker_name,
            run_id=payload.run_id,
            run_dir=payload.run_dir,
            done_ini=payload.done_ini,
            failed_ini=payload.failed_ini,
            total_ini=payload.total_ini,
            generated_ini_count=payload.generated_ini_count,
            result_artifact_relpath=payload.result_artifact_relpath,
        )
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @app.post("/jobs/fail")
    def mark_fail(payload: FailJobRequest) -> dict:
        job = store.mark_failed(
            external_job_id=payload.external_job_id,
            worker_name=payload.worker_name,
            error=payload.error,
        )
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @app.get("/jobs")
    def list_jobs(limit: int = Query(default=100, ge=1, le=500)) -> dict:
        return {"jobs": store.list_jobs(limit=limit)}

    @app.get("/jobs/export")
    def export_jobs(
        format: str = Query(default="json", pattern="^(json|csv)$"),
        limit: int = Query(default=500, ge=1, le=500),
    ) -> Response | dict:
        jobs = store.list_jobs(limit=limit)
        if format == "json":
            return {"jobs": jobs}

        buffer = io.StringIO()
        writer = csv.DictWriter(
            buffer,
            fieldnames=[
                "external_job_id",
                "status",
                "retry_left",
                "retry_count",
                "max_retry",
                "claimable",
                "source_job_id",
                "mode",
                "worker_name",
                "current_stage",
                "current_item",
                "done_ini",
                "total_ini",
                "generated_ini_count",
                "last_heartbeat",
                "last_error",
            ],
        )
        writer.writeheader()
        for job in jobs:
            writer.writerow(
                {
                    "external_job_id": job.get("external_job_id"),
                    "status": job.get("status"),
                    "retry_left": job.get("retry_left"),
                    "retry_count": job.get("retry_count"),
                    "max_retry": job.get("max_retry"),
                    "claimable": job.get("claimable"),
                    "source_job_id": job.get("source_job_id"),
                    "mode": job.get("mode"),
                    "worker_name": job.get("worker_name"),
                    "current_stage": job.get("current_stage"),
                    "current_item": job.get("current_item"),
                    "done_ini": job.get("done_ini"),
                    "total_ini": job.get("total_ini"),
                    "generated_ini_count": job.get("generated_ini_count"),
                    "last_heartbeat": job.get("last_heartbeat"),
                    "last_error": job.get("last_error"),
                }
            )
        return Response(
            content=buffer.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": "attachment; filename=jobs.csv"},
        )

    @app.get("/artifacts/jobs/{external_job_id}/download")
    def download_job_artifact(external_job_id: str) -> FileResponse:
        job = store.get_job(external_job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        relpath = job.get("artifact_relpath")
        if not relpath:
            raise HTTPException(status_code=404, detail="Job has no artifact")
        artifact_path = artifacts.resolve_relpath(relpath)
        if not artifact_path.exists() or not artifact_path.is_file():
            raise HTTPException(status_code=404, detail="Artifact file not found")
        return FileResponse(artifact_path, filename=artifact_path.name)

    @app.post("/jobs/{external_job_id}/artifacts/upload")
    async def upload_job_result_artifact(
        external_job_id: str,
        request: Request,
        filename: str = Query(...),
    ) -> dict:
        job = store.get_job(external_job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        try:
            content = await request.body()
            relpath = artifacts.save_job_result(
                external_job_id=external_job_id,
                filename=filename,
                content=content,
            )
            return {
                "external_job_id": external_job_id,
                "artifact_relpath": relpath,
                "download_url": str(request.base_url).rstrip("/") + f"/jobs/{external_job_id}/artifacts/result",
            }
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/jobs/{external_job_id}/artifacts/result")
    def download_job_result_artifact(external_job_id: str) -> FileResponse:
        job = store.get_job(external_job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        relpath = job.get("result_artifact_relpath")
        if not relpath:
            raise HTTPException(status_code=404, detail="Job has no result artifact")
        artifact_path = artifacts.resolve_relpath(relpath)
        if not artifact_path.exists() or not artifact_path.is_file():
            raise HTTPException(status_code=404, detail="Result artifact file not found")
        return FileResponse(artifact_path, filename=artifact_path.name)

    @app.post("/jobs/{external_job_id}/requeue")
    def requeue_job(external_job_id: str) -> dict:
        try:
            job = store.requeue_job(external_job_id)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @app.post("/jobs/{external_job_id}/clone")
    def clone_job(external_job_id: str, payload: CloneJobRequest) -> dict:
        try:
            job = store.clone_job(
                external_job_id=external_job_id,
                new_external_job_id=payload.new_external_job_id,
                job_name=payload.job_name,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @app.get("/workers")
    def list_workers() -> dict:
        return {"workers": store.list_workers()}

    @app.get("/workers/{worker_name}")
    def get_worker(worker_name: str) -> dict:
        worker = store.get_worker(worker_name)
        if worker is None:
            raise HTTPException(status_code=404, detail="Worker not found")
        return worker

    @app.post("/workers/heartbeat")
    def worker_heartbeat(payload: WorkerHeartbeatRequest) -> dict:
        existing = store.get_worker(payload.worker_name)
        status = payload.status or (existing["status"] if existing is not None else "active")
        return store.upsert_worker(
            worker_name=payload.worker_name,
            status=status,
            current_job_id=payload.current_job_id,
        )

    @app.post("/workers/drain")
    def drain_worker(payload: WorkerStatusRequest) -> dict:
        return store.set_worker_status(worker_name=payload.worker_name, status="draining")

    @app.post("/workers/resume")
    def resume_worker(payload: WorkerStatusRequest) -> dict:
        return store.set_worker_status(worker_name=payload.worker_name, status="active")

    @app.get("/jobs/{external_job_id}")
    def get_job(external_job_id: str) -> dict:
        job = store.get_job(external_job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return {
            "job": job,
            "events": store.list_job_events(external_job_id),
        }

    return app


def _render_dashboard(jobs: list[dict], workers: list[dict], stale_after_seconds: int, sweep_interval_seconds: int) -> str:
    def td(value: object) -> str:
        return "" if value is None else str(value)
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>MT5 Queue Dashboard</title>
  <style>
    body {{ font-family: Segoe UI, sans-serif; margin: 24px; background: #f4f1ea; color: #1f2a2e; }}
    .meta {{ display: flex; gap: 16px; margin-bottom: 16px; }}
    .card {{ background: white; border: 1px solid #d8d0c4; border-radius: 10px; padding: 12px 16px; }}
    table {{ width: 100%; border-collapse: collapse; background: white; margin-top: 12px; }}
    th, td {{ border: 1px solid #ddd5ca; padding: 8px; text-align: left; font-size: 13px; vertical-align: top; }}
    th {{ background: #204b57; color: white; }}
    h1, h2 {{ margin-bottom: 8px; }}
    .muted {{ color: #6c757d; }}
    .row {{ display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }}
    button {{ background: #204b57; color: white; border: 0; border-radius: 8px; padding: 8px 12px; cursor: pointer; }}
    button.secondary {{ background: #7a5c3e; }}
    input {{ padding: 8px 10px; border: 1px solid #d8d0c4; border-radius: 8px; }}
  </style>
</head>
<body>
  <h1>MT5 Queue Dashboard</h1>
  <div class="meta">
    <div class="card"><strong>Jobs</strong><div id="jobs-count">{len(jobs)}</div></div>
    <div class="card"><strong>Workers</strong><div id="workers-count">{len(workers)}</div></div>
    <div class="card"><strong>Stale Timeout</strong><div>{stale_after_seconds}s</div></div>
    <div class="card"><strong>Sweep Interval</strong><div>{sweep_interval_seconds}s</div></div>
  </div>
  <div class="row">
    <input id="worker-name" placeholder="Worker name" value="PC1" />
    <button onclick="changeWorkerStatus('drain')">Drain Worker</button>
    <button class="secondary" onclick="changeWorkerStatus('resume')">Resume Worker</button>
    <span id="status-msg" class="muted"></span>
  </div>
  <h2>Workers</h2>
  <table>
    <thead><tr><th>Name</th><th>Status</th><th>Activity</th><th>Current Job</th><th>Jobs Claimed</th><th>Last Claimed</th><th>Last Seen</th></tr></thead>
    <tbody id="workers-body"></tbody>
  </table>
  <h2>Jobs</h2>
  <table>
    <thead><tr><th>Job</th><th>Status</th><th>Claimable</th><th>Source</th><th>Mode</th><th>Worker</th><th>Stage</th><th>Current Item</th><th>Progress</th><th>Generated</th><th>Retry Left</th><th>Last Heartbeat</th><th>Last Error</th></tr></thead>
    <tbody id="jobs-body"></tbody>
  </table>
  <script>
    const initialJobs = {json.dumps(jobs, ensure_ascii=False)};
    const initialWorkers = {json.dumps(workers, ensure_ascii=False)};

    function escapeHtml(value) {{
      if (value === null || value === undefined) return '';
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }}

    function render(data) {{
      document.getElementById('jobs-count').textContent = data.jobs.length;
      document.getElementById('workers-count').textContent = data.workers.length;

      const jobsBody = document.getElementById('jobs-body');
      const workersBody = document.getElementById('workers-body');

      if (data.jobs.length === 0) {{
        jobsBody.innerHTML = '<tr><td colspan="13" class="muted">No jobs</td></tr>';
      }} else {{
        jobsBody.innerHTML = data.jobs.map(job => `
          <tr>
            <td>${{escapeHtml(job.external_job_id)}}</td>
            <td>${{escapeHtml(job.status)}}</td>
            <td>${{escapeHtml(job.claimable)}}</td>
            <td>${{escapeHtml(job.source_job_id)}}</td>
            <td>${{escapeHtml(job.mode)}}</td>
            <td>${{escapeHtml(job.worker_name)}}</td>
            <td>${{escapeHtml(job.current_stage)}}</td>
            <td>${{escapeHtml(job.current_item)}}</td>
            <td>${{escapeHtml(job.done_ini)}}/${{escapeHtml(job.total_ini)}}</td>
            <td>${{escapeHtml(job.generated_ini_count)}}</td>
            <td>${{escapeHtml(job.retry_left)}}</td>
            <td>${{escapeHtml(job.last_heartbeat)}}</td>
            <td>${{escapeHtml(job.last_error)}}</td>
          </tr>
        `).join('');
      }}

      if (data.workers.length === 0) {{
        workersBody.innerHTML = '<tr><td colspan="7" class="muted">No workers</td></tr>';
      }} else {{
        workersBody.innerHTML = data.workers.map(worker => `
          <tr>
            <td>${{escapeHtml(worker.name)}}</td>
            <td>${{escapeHtml(worker.status)}}</td>
            <td>${{escapeHtml(worker.activity_state)}}</td>
            <td>${{escapeHtml(worker.current_job_id)}}</td>
            <td>${{escapeHtml(worker.jobs_claimed)}}</td>
            <td>${{escapeHtml(worker.last_claimed_at)}}</td>
            <td>${{escapeHtml(worker.last_seen)}}</td>
          </tr>
        `).join('');
      }}
    }}

    async function changeWorkerStatus(action) {{
      const workerName = document.getElementById('worker-name').value.trim();
      const statusMsg = document.getElementById('status-msg');
      if (!workerName) {{
        statusMsg.textContent = 'Worker name is required';
        return;
      }}
      const response = await fetch(`/workers/${{action}}`, {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify({{ worker_name: workerName }})
      }});
      statusMsg.textContent = response.ok ? `Worker ${{action}} request sent` : `Worker ${{action}} failed`;
    }}

    render({{ jobs: initialJobs, workers: initialWorkers }});
    const eventSource = new EventSource('/events');
    eventSource.onmessage = (event) => {{
      render(JSON.parse(event.data));
    }};
  </script>
</body>
</html>"""
