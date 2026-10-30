from __future__ import annotations

import json
import re
import time
import os
from pathlib import Path
from urllib import error, parse, request


class ServerApiError(RuntimeError):
    pass


class ServerApiClient:
    def __init__(
        self,
        base_url: str,
        *,
        api_key: str | None = None,
        timeout_seconds: int = 30,
        max_retries: int = 3,
        retry_delay_seconds: float = 1.5,
    ) -> None:
        self.base_url = self._normalize_base_url(base_url)
        self.api_key = api_key.strip() if api_key else None
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.retry_delay_seconds = retry_delay_seconds

    def _normalize_base_url(self, base_url: str) -> str:
        normalized = base_url.strip().rstrip("/")
        if normalized.endswith("/api/v1"):
            normalized = normalized[: -len("/api/v1")]
        return normalized.rstrip("/")

    def health(self) -> dict:
        return self._get("/api/mt5-queue/health")

    def claim_job(self, worker_name: str, worker_instance_id: str | None = None) -> dict | None:
        body = {"worker_name": worker_name}
        if worker_instance_id:
            body["worker_instance_id"] = worker_instance_id
        payload = self._post("/jobs/claim", body)
        return payload.get("job")

    def get_job_statuses(self, *, external_job_ids: list[str] | None = None, job_names: list[str] | None = None) -> list[dict]:
        payload = self._post(
            "/jobs/statuses",
            {
                "external_job_ids": external_job_ids or [],
                "job_names": job_names or [],
            },
        )
        return payload.get("jobs", [])

    def job_heartbeat(
        self,
        *,
        worker_name: str,
        external_job_id: str,
        done_ini: int,
        total_ini: int,
        current_stage: str | None,
        current_item: str | None,
        run_id: str | None,
        generated_ini_count: int | None,
    ) -> dict:
        return self._post(
            "/jobs/heartbeat",
            {
                "worker_name": worker_name,
                "external_job_id": external_job_id,
                "done_ini": done_ini,
                "total_ini": total_ini,
                "current_stage": current_stage,
                "current_item": current_item,
                "run_id": run_id,
                "generated_ini_count": generated_ini_count,
            },
        )

    def mark_done(
        self,
        *,
        worker_name: str,
        external_job_id: str,
        run_id: str,
        run_dir: str,
        done_ini: int,
        failed_ini: int,
        total_ini: int,
        generated_ini_count: int,
        result_artifact_relpath: str | None = None,
    ) -> dict:
        return self._post(
            "/jobs/done",
            {
                "worker_name": worker_name,
                "external_job_id": external_job_id,
                "run_id": run_id,
                "run_dir": run_dir,
                "done_ini": done_ini,
                "failed_ini": failed_ini,
                "total_ini": total_ini,
                "generated_ini_count": generated_ini_count,
                "result_artifact_relpath": result_artifact_relpath,
            },
        )

    def mark_failed(self, *, worker_name: str | None, external_job_id: str, run_id: str | None, error_message: str) -> dict:
        return self._post(
            "/jobs/fail",
            {
                "worker_name": worker_name,
                "external_job_id": external_job_id,
                "run_id": run_id,
                "error": error_message,
            },
        )

    def upload_job_backtest_results(self, external_job_id: str, payload: dict) -> dict:
        return self._post(f"/jobs/{parse.quote(external_job_id)}/backtest-results", payload)

    def get_worker(self, worker_name: str) -> dict | None:
        try:
            return self._get(f"/workers/{parse.quote(worker_name)}")
        except ServerApiError as exc:
            if "404" in str(exc):
                return None
            raise

    def worker_heartbeat(
        self,
        *,
        worker_name: str,
        worker_instance_id: str | None = None,
        status: str | None = None,
        current_job_id: str | None = None,
    ) -> dict:
        payload: dict[str, object] = {
            "worker_name": worker_name,
            "current_job_id": current_job_id,
        }
        if worker_instance_id:
            payload["worker_instance_id"] = worker_instance_id
        if status is not None:
            payload["status"] = status
        return self._post("/workers/heartbeat", payload)

    def download_file(self, *, url: str, destination_dir: Path) -> Path:
        destination_dir.mkdir(parents=True, exist_ok=True)
        last_error: Exception | None = None
        request_url = self._normalize_request_url(url)
        for attempt in range(1, self.max_retries + 1):
            req = request.Request(request_url, method="GET", headers=self._headers(include_json=False))
            try:
                with request.urlopen(req, timeout=self.timeout_seconds) as response:
                    filename = self._filename_from_response(response) or Path(parse.urlparse(request_url).path).name or "artifact.bin"
                    target = destination_dir / filename
                    target.write_bytes(response.read())
                    return target
            except error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                last_error = ServerApiError(f"GET file failed: {exc.code} {detail}")
            except error.URLError as exc:
                last_error = ServerApiError(f"GET file failed: {exc.reason}")
            if attempt < self.max_retries:
                time.sleep(self.retry_delay_seconds * attempt)
        assert last_error is not None
        raise last_error

    def download_lotus_artifact_source(self, *, expert_path: str, destination_dir: Path) -> Path:
        query = parse.urlencode({"expert_path": expert_path})
        url = f"{self.base_url}/artifacts/source?{query}"
        return self.download_file(url=url, destination_dir=destination_dir)

    def _normalize_request_url(self, url: str) -> str:
        parsed = parse.urlsplit(url.strip())
        path = parse.quote(parsed.path, safe="/%")
        return parse.urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, parsed.fragment))

    def upload_job_result_artifact(self, *, external_job_id: str, file_path: Path, run_id: str | None = None) -> dict:
        strategies_dir = os.getenv("MQL5_STRATEGIES_DIR", "")
        query = parse.urlencode({
            "filename": file_path.name,
            "strategies_dir": strategies_dir,
            "run_id": run_id or "",
        })
        path = f"/jobs/{parse.quote(external_job_id)}/artifacts/upload?{query}"
        content = file_path.read_bytes()
        upload_timeout = max(self.timeout_seconds, 300)
        return self._post_bytes(
            path=path,
            content=content,
            content_type="application/octet-stream",
            timeout_seconds=upload_timeout,
        )

    def upload_job_result_artifact_chunk(
        self,
        *,
        external_job_id: str,
        filename: str,
        upload_id: str,
        chunk_index: int,
        total_chunks: int,
        content: bytes,
        replace_existing: bool = False,
        run_id: str | None = None,
    ) -> dict:
        strategies_dir = os.getenv("MQL5_STRATEGIES_DIR", "")
        query = parse.urlencode(
            {
                "filename": filename,
                "upload_id": upload_id,
                "chunk_index": chunk_index,
                "total_chunks": total_chunks,
                "replace_existing": 1 if replace_existing else 0,
                "strategies_dir": strategies_dir,
                "run_id": run_id or "",
            }
        )
        path = f"/jobs/{parse.quote(external_job_id)}/artifacts/upload-chunk?{query}"
        upload_timeout = max(self.timeout_seconds, 120)
        return self._post_bytes(
            path=path,
            content=content,
            content_type="application/octet-stream",
            timeout_seconds=upload_timeout,
        )

    def get_result_artifact_status(self, *, external_job_id: str) -> dict:
        return self._get(
            f"/jobs/{parse.quote(external_job_id)}/artifacts/result/status"
        )

    def upload_optimize_results(self, *, external_job_id: str, payload: dict) -> dict:
        path = f"/jobs/{parse.quote(external_job_id)}/optimize-results"
        return self._post(path=path, payload=payload)

    def start_optimize_results_session(self, *, external_job_id: str, payload: dict) -> dict:
        path = f"/jobs/{parse.quote(external_job_id)}/optimize-results/session/start"
        return self._post(path=path, payload=payload)

    def upload_optimize_results_session_chunk(self, *, external_job_id: str, payload: dict) -> dict:
        path = f"/jobs/{parse.quote(external_job_id)}/optimize-results/session/chunk"
        return self._post(path=path, payload=payload)

    def finalize_optimize_results_session(self, *, external_job_id: str, payload: dict) -> dict:
        path = f"/jobs/{parse.quote(external_job_id)}/optimize-results/session/finalize"
        return self._post(path=path, payload=payload)

    def _get(self, path: str) -> dict:
        url = f"{self.base_url}{path}"
        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            req = request.Request(url, method="GET", headers=self._headers(include_json=False))
            try:
                with request.urlopen(req, timeout=self.timeout_seconds) as response:
                    return json.loads(response.read().decode("utf-8"))
            except error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                status = exc.code
                last_error = ServerApiError(f"GET {path} failed: {status} {detail}")
                if 400 <= status < 500:
                    break
            except (error.URLError, TimeoutError, ConnectionResetError, OSError) as exc:
                reason = getattr(exc, "reason", exc)
                last_error = ServerApiError(f"GET {path} failed: {reason}")
            if attempt < self.max_retries:
                time.sleep(self.retry_delay_seconds * attempt)
        assert last_error is not None
        raise last_error

    def _post(self, path: str, payload: dict) -> dict:
        body = json.dumps(payload).encode("utf-8")
        return self._post_bytes(path=path, content=body, content_type="application/json")

    def _post_bytes(self, path: str, content: bytes, content_type: str, timeout_seconds: int | None = None) -> dict:
        url = f"{self.base_url}{path}"
        last_error: Exception | None = None
        request_timeout = timeout_seconds if timeout_seconds is not None else self.timeout_seconds
        for attempt in range(1, self.max_retries + 1):
            req = request.Request(
                url,
                data=content,
                headers=self._headers(content_type=content_type),
                method="POST",
            )
            try:
                with request.urlopen(req, timeout=request_timeout) as response:
                    return json.loads(response.read().decode("utf-8"))
            except error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                status = exc.code
                last_error = ServerApiError(f"POST {path} failed: {status} {detail}")
                if 400 <= status < 500:
                    break
            except (error.URLError, TimeoutError, ConnectionResetError, OSError) as exc:
                reason = getattr(exc, "reason", exc)
                last_error = ServerApiError(f"POST {path} failed: {reason}")
            if attempt < self.max_retries:
                time.sleep(self.retry_delay_seconds * attempt)
        assert last_error is not None
        raise last_error

    def wait_until_healthy(self, timeout_seconds: int = 60, interval_seconds: float = 2.0) -> dict:
        deadline = time.time() + timeout_seconds
        last_error: Exception | None = None
        while time.time() < deadline:
            try:
                return self.health()
            except Exception as exc:
                last_error = exc
                time.sleep(interval_seconds)
        raise ServerApiError(f"Server is not healthy after {timeout_seconds}s: {last_error}")

    def download_job_result_file(self, *, external_job_id: str, destination_dir: Path) -> Path:
        url = f"{self.base_url}/jobs/{parse.quote(external_job_id)}/artifacts/result/download"
        return self.download_file(url=url, destination_dir=destination_dir)

    def _filename_from_response(self, response) -> str | None:
        content_disposition = response.headers.get("Content-Disposition")
        if not content_disposition:
            return None
        match = re.search(r'filename="?([^";]+)"?', content_disposition)
        return match.group(1) if match else None

    def _headers(self, *, include_json: bool = True, content_type: str | None = None) -> dict[str, str]:
        headers: dict[str, str] = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        if include_json and content_type is None:
            headers["Content-Type"] = "application/json"
        elif content_type is not None:
            headers["Content-Type"] = content_type
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers
