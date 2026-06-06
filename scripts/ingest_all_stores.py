#!/usr/bin/env python3
"""CLI entrypoint for all-store ingestion."""

from __future__ import annotations

import argparse
import json
import sys

from scripts.ingest.orchestrator import IngestionOrchestrator


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest records from all configured stores")
    parser.add_argument("--strict", action="store_true", help="Fail when any store does not meet minimum record threshold")
    parser.add_argument("--min-records", type=int, default=1, help="Minimum records required per store")
    parser.add_argument("--timeout", type=int, default=10, help="HTTP/browser timeout in seconds")
    parser.add_argument("--max-pages", type=int, default=5000, help="Maximum crawled pages per store")
    parser.add_argument("--max-depth", type=int, default=2, help="Maximum crawl depth per store")
    parser.add_argument("--require-query-match", action="store_true", help="Require title/query token match during parsing")
    parser.add_argument("--max-workers", type=int, default=5, help="Parallel worker count")
    parser.add_argument("--dry-run", action="store_true", help="Do not write results to database")
    parser.add_argument("--store", type=str, default="", help="Run ingestion for one store id")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    orchestrator = IngestionOrchestrator(
        strict=args.strict,
        min_records=args.min_records,
        timeout_seconds=args.timeout,
        max_pages_per_store=args.max_pages,
        max_crawl_depth=args.max_depth,
        require_query_match=args.require_query_match,
        max_workers=args.max_workers,
        dry_run=args.dry_run,
    )

    if args.store:
        result = orchestrator.ingest_store(args.store)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if args.strict and not result.get("success"):
            return 1
        return 0

    summary = orchestrator.ingest_all()
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if summary.get("status") != "ok":
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
