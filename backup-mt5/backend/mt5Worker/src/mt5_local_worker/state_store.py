from __future__ import annotations

import json
from pathlib import Path

from .models import RunState


class StateStore:
    def __init__(self, state_file: Path) -> None:
        self.state_file = state_file

    def save(self, state: RunState) -> None:
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        payload = state.to_dict()
        self.state_file.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
