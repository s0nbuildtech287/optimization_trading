from __future__ import annotations

import shutil
import zipfile
from pathlib import Path


class ArtifactStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def save_bundle(self, *, external_job_id: str, filename: str, content: bytes) -> str:
        job_root = self.root / external_job_id
        if job_root.exists():
            shutil.rmtree(job_root)
        bundle_dir = job_root / "bundle"
        bundle_dir.mkdir(parents=True, exist_ok=True)

        upload_name = Path(filename).name or f"{external_job_id}.zip"
        upload_path = bundle_dir / upload_name
        upload_path.write_bytes(content)

        if upload_path.suffix.lower() == ".zip":
            extract_dir = bundle_dir / "extracted"
            extract_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(upload_path, "r") as archive:
                archive.extractall(extract_dir)
            return self._to_relpath(extract_dir)

        if upload_path.suffix.lower() == ".ini":
            return self._to_relpath(bundle_dir)

        raise ValueError("Only .zip or .ini bundle uploads are supported")

    def list_ini_files(self, bundle_relpath: str) -> list[str]:
        bundle_dir = self.resolve_relpath(bundle_relpath)
        if not bundle_dir.exists() or not bundle_dir.is_dir():
            raise FileNotFoundError(f"Bundle path does not exist: {bundle_relpath}")
        ini_files = sorted(path for path in bundle_dir.rglob("*.ini") if path.is_file())
        return [self._to_relpath(path) for path in ini_files]

    def save_job_result(self, *, external_job_id: str, filename: str, content: bytes) -> str:
        job_root = self.root / external_job_id / "results"
        job_root.mkdir(parents=True, exist_ok=True)
        target = job_root / (Path(filename).name or f"{external_job_id}.zip")
        target.write_bytes(content)
        return self._to_relpath(target)

    def resolve_relpath(self, relpath: str) -> Path:
        candidate = (self.root / relpath).resolve()
        root = self.root.resolve()
        if candidate != root and root not in candidate.parents:
            raise ValueError("Artifact path escapes artifact root")
        return candidate

    def _to_relpath(self, path: Path) -> str:
        return str(path.resolve().relative_to(self.root.resolve()))
