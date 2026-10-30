from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


class RunLogger:
    def __init__(self, log_path: Path, events_path: Path) -> None:
        self.log_path = log_path
        self.events_path = events_path
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.events_path.parent.mkdir(parents=True, exist_ok=True)

    def info(self, message: str, **fields: object) -> None:
        self._write("INFO", message, fields)

    def error(self, message: str, **fields: object) -> None:
        self._write("ERROR", message, fields)

    def _write(self, level: str, message: str, fields: dict[str, object]) -> None:
        stamp = _timestamp()
        line = f"{stamp} [{level}] {message}"
        if fields:
            rendered = " ".join(f"{key}={json.dumps(value, ensure_ascii=False)}" for key, value in fields.items())
            line = f"{line} {rendered}"

        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")

        event = {
            "timestamp": stamp,
            "level": level,
            "message": message,
            "fields": fields,
        }
        with self.events_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")

        print(line, flush=True)
