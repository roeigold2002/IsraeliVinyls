#!/usr/bin/env python3
"""All-store ingestion orchestrator."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
import os
from pathlib import Path
from typing import Any

from scripts.ingest.database import DatabaseWriter
from scripts.ingest.fetchers import fetch_store_pages
from scripts.ingest.parsers import parse_store_pages
from scripts.store_registry import StoreConfig, get_all_stores, get_store_by_id


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


@dataclass
class StoreRun:
    store_id: str
    store_name: str
    mode: str
    records_found: int
    records_written: int
    success: bool
    error: str = ""


class IngestionOrchestrator:
    def __init__(
        self,
        db_path: Path | None = None,
        strict: bool = False,
        min_records: int = 1,
        timeout_seconds: int = 10,
        max_pages_per_store: int = 35,
        max_crawl_depth: int = 2,
        require_query_match: bool = False,
        max_workers: int = 5,
        dry_run: bool = False,
    ):
        self.root = _project_root()
        self.db_path = Path(db_path) if db_path else self.root / "music_stores.db"
        self.strict = strict
        self.min_records = max(1, int(min_records))
        self.timeout_seconds = max(3, int(timeout_seconds))
        self.max_pages_per_store = max(5, int(max_pages_per_store))
        self.max_crawl_depth = max(1, int(max_crawl_depth))
        self.require_query_match = require_query_match
        self.max_workers = max(1, int(max_workers))
        self.dry_run = dry_run
        self.writer = DatabaseWriter(self.db_path)

    def _query_terms(self, store: StoreConfig) -> list[str]:
        custom = [s.strip() for s in os.environ.get("INGEST_QUERY_SEEDS", "").split(",") if s.strip()]
        if custom:
            return custom
        return list(store.query_seeds)

    def _run_store(self, store: StoreConfig) -> StoreRun:
        started_at = datetime.now(timezone.utc)
        mode = "failed"
        records_found = 0
        records_written = 0
        error_message = ""

        try:
            query_terms = self._query_terms(store)
            fetch_result = fetch_store_pages(
                store=store,
                query_terms=query_terms,
                timeout_seconds=self.timeout_seconds,
                max_pages_per_store=self.max_pages_per_store,
                max_crawl_depth=self.max_crawl_depth,
            )
            mode = fetch_result.mode
            parsed_rows = parse_store_pages(
                store,
                fetch_result.pages,
                query_terms,
                require_query_match=self.require_query_match,
            )
            records_found = len(parsed_rows)

            if fetch_result.errors and records_found == 0:
                error_message = "; ".join(fetch_result.errors[:4])

            if records_found < self.min_records:
                if self.strict:
                    success = False
                    error_message = error_message or f"found {records_found} records (< min {self.min_records})"
                else:
                    success = True
                ended_at = datetime.now(timezone.utc)
                self.writer.log_run(
                    store_id=store.id,
                    store_name=store.store_name,
                    started_at=started_at,
                    ended_at=ended_at,
                    success=success,
                    mode=mode,
                    records_found=records_found,
                    records_written=0,
                    error_message=error_message,
                )
                return StoreRun(
                    store_id=store.id,
                    store_name=store.store_name,
                    mode=mode,
                    records_found=records_found,
                    records_written=0,
                    success=success,
                    error=error_message,
                )

            if not self.dry_run:
                replace_result = self.writer.replace_store_records(store.store_name, parsed_rows)
                records_written = replace_result.written_count
                if replace_result.reason:
                    error_message = error_message or replace_result.reason
            else:
                records_written = records_found

            success = records_written >= self.min_records
            ended_at = datetime.now(timezone.utc)
            self.writer.log_run(
                store_id=store.id,
                store_name=store.store_name,
                started_at=started_at,
                ended_at=ended_at,
                success=success,
                mode=mode,
                records_found=records_found,
                records_written=records_written,
                error_message=error_message,
            )
            return StoreRun(
                store_id=store.id,
                store_name=store.store_name,
                mode=mode,
                records_found=records_found,
                records_written=records_written,
                success=success,
                error=error_message,
            )
        except Exception as exc:
            ended_at = datetime.now(timezone.utc)
            error_message = str(exc)
            self.writer.log_run(
                store_id=store.id,
                store_name=store.store_name,
                started_at=started_at,
                ended_at=ended_at,
                success=False,
                mode=mode,
                records_found=records_found,
                records_written=records_written,
                error_message=error_message,
            )
            return StoreRun(
                store_id=store.id,
                store_name=store.store_name,
                mode=mode,
                records_found=records_found,
                records_written=records_written,
                success=False,
                error=error_message,
            )

    def ingest_store(self, store_id: str) -> dict[str, Any]:
        store = get_store_by_id(store_id)
        if not store:
            raise ValueError(f"Unknown store id: {store_id}")

        self.writer.ensure_tracking_table()
        run = self._run_store(store)
        return {
            "store_id": run.store_id,
            "store_name": run.store_name,
            "mode": run.mode,
            "records_found": run.records_found,
            "records_written": run.records_written,
            "success": run.success,
            "error": run.error,
        }

    def ingest_all(self) -> dict[str, Any]:
        self.writer.ensure_tracking_table()
        stores = list(get_all_stores())

        runs: list[StoreRun] = []
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_map = {executor.submit(self._run_store, store): store for store in stores}
            for future in as_completed(future_map):
                runs.append(future.result())

        runs.sort(key=lambda r: r.store_name)

        failures = [r for r in runs if not r.success]
        summary = {
            "expected_stores": len(stores),
            "successful_stores": len(runs) - len(failures),
            "failed_stores": len(failures),
            "records_found_total": sum(r.records_found for r in runs),
            "records_written_total": sum(r.records_written for r in runs),
            "strict": self.strict,
            "dry_run": self.dry_run,
            "results": [
                {
                    "store_id": r.store_id,
                    "store_name": r.store_name,
                    "mode": r.mode,
                    "records_found": r.records_found,
                    "records_written": r.records_written,
                    "success": r.success,
                    "error": r.error,
                }
                for r in runs
            ],
        }

        if self.strict and failures:
            summary["status"] = "failed"
        else:
            summary["status"] = "ok"

        return summary
