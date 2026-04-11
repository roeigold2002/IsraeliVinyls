#!/usr/bin/env python3
"""Background scheduler tasks for ingestion and snapshot refresh."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
from typing import Any


@dataclass
class SchedulerService:
    root: Path

    def _run(self, args: list[str]) -> dict[str, Any]:
        started = datetime.now(timezone.utc)
        proc = subprocess.run(
            args,
            cwd=str(self.root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        ended = datetime.now(timezone.utc)
        return {
            "command": " ".join(args),
            "exit_code": proc.returncode,
            "stdout": (proc.stdout or "").strip()[-8000:],
            "stderr": (proc.stderr or "").strip()[-8000:],
            "started_at": started.isoformat(),
            "ended_at": ended.isoformat(),
        }

    def daily_automated_growth(self) -> dict[str, Any]:
        python_bin = os.environ.get("PYTHON_BIN", "python")

        strict = os.environ.get("INGEST_STRICT", "1").strip() not in {"0", "false", "False"}
        timeout = os.environ.get("INGEST_TIMEOUT", "10").strip() or "10"
        workers = os.environ.get("INGEST_WORKERS", "5").strip() or "5"
        max_pages = os.environ.get("INGEST_MAX_PAGES_PER_STORE", "35").strip() or "35"
        max_depth = os.environ.get("INGEST_MAX_CRAWL_DEPTH", "2").strip() or "2"
        require_query_match = os.environ.get("INGEST_REQUIRE_QUERY_MATCH", "0").strip() in {"1", "true", "True"}

        ingest_cmd = [
            python_bin,
            "-m",
            "scripts.ingest_all_stores",
            "--timeout",
            timeout,
            "--max-pages",
            max_pages,
            "--max-depth",
            max_depth,
            "--max-workers",
            workers,
        ]
        if strict:
            ingest_cmd.append("--strict")
        if require_query_match:
            ingest_cmd.append("--require-query-match")

        ingest_result = self._run(ingest_cmd)
        if ingest_result["exit_code"] != 0:
            return {
                "status": "failed",
                "step": "ingest",
                "ingest": ingest_result,
            }

        export_cmd = [python_bin, "-m", "scripts.export_snapshot"]
        export_result = self._run(export_cmd)
        if export_result["exit_code"] != 0:
            return {
                "status": "failed",
                "step": "export_snapshot",
                "ingest": ingest_result,
                "export": export_result,
            }

        verify_cmd = [python_bin, "-m", "scripts.verify_store_coverage"]
        if strict:
            verify_cmd.append("--strict")
        verify_result = self._run(verify_cmd)
        if verify_result["exit_code"] != 0:
            return {
                "status": "failed",
                "step": "verify_coverage",
                "ingest": ingest_result,
                "export": export_result,
                "verify": verify_result,
            }

        return {
            "status": "ok",
            "ingest": ingest_result,
            "export": export_result,
            "verify": verify_result,
        }


scheduler_service = SchedulerService(root=Path(__file__).resolve().parent)
