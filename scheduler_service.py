#!/usr/bin/env python3
"""Background scheduler tasks for ingestion and snapshot refresh."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
from typing import Any


def _env_truthy(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


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

        trueup_result = None
        if _env_truthy(os.environ.get("TRUEUP_AFTER_DAILY"), True):
            trueup_result = self.incremental_data_trueup()
            if trueup_result["exit_code"] != 0:
                return {
                    "status": "failed",
                    "step": "trueup",
                    "ingest": ingest_result,
                    "export": export_result,
                    "verify": verify_result,
                    "trueup": trueup_result,
                }

        return {
            "status": "ok",
            "ingest": ingest_result,
            "export": export_result,
            "verify": verify_result,
            "trueup": trueup_result,
        }

    def incremental_data_trueup(self) -> dict[str, Any]:
        node_bin = os.environ.get("NODE_BIN", "node")
        cmd = [
            node_bin,
            "scripts/trueup_worker.cjs",
            "--batch-size",
            os.environ.get("TRUEUP_BATCH_SIZE", "180"),
            "--concurrency",
            os.environ.get("TRUEUP_CONCURRENCY", "6"),
            "--timeout-ms",
            os.environ.get("TRUEUP_TIMEOUT_MS", "5000"),
            "--retries",
            os.environ.get("TRUEUP_RETRIES", "1"),
            "--max-attempts",
            os.environ.get("TRUEUP_MAX_ATTEMPTS", "6"),
            "--retry-base-ms",
            os.environ.get("TRUEUP_RETRY_BASE_MS", "20000"),
            "--save-every",
            os.environ.get("TRUEUP_SAVE_EVERY", "60"),
        ]

        if _env_truthy(os.environ.get("TRUEUP_REBUILD_QUEUE"), False):
            cmd.append("--rebuild-queue")
        if _env_truthy(os.environ.get("TRUEUP_USE_HEADLESS"), True):
            cmd.extend(["--max-headless", os.environ.get("TRUEUP_MAX_HEADLESS", "8")])
        else:
            cmd.append("--no-headless")
        if _env_truthy(os.environ.get("TRUEUP_REFRESH_SNAPSHOT"), False):
            cmd.append("--refresh-snapshot")
        if not _env_truthy(os.environ.get("TRUEUP_AUDIT_ALL_PRICES"), True):
            cmd.append("--no-audit-all-prices")

        return self._run(cmd)


scheduler_service = SchedulerService(root=Path(__file__).resolve().parent)
