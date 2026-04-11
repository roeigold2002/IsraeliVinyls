#!/usr/bin/env python3
"""Verify database and snapshot contain all canonical stores."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

from scripts.store_registry import STORE_NAME_SET


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify all configured stores are represented")
    parser.add_argument("--db", default="music_stores.db", help="SQLite database path")
    parser.add_argument("--snapshot", default="netlify/data/stores.json", help="Snapshot stores JSON path")
    parser.add_argument("--strict", action="store_true", help="Require every store to have at least one record")
    parser.add_argument("--allow-zero", action="store_true", help="Allow stores with zero records")
    return parser.parse_args()


def load_db_counts(db_path: Path) -> dict[str, int]:
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.execute("SELECT store_name, COUNT(*) FROM records GROUP BY store_name")
        return {str(name): int(count) for name, count in cur.fetchall()}
    finally:
        conn.close()


def load_snapshot_counts(snapshot_path: Path) -> dict[str, int]:
    if not snapshot_path.exists():
        return {}
    payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    return {str(item.get("name")): int(item.get("record_count") or 0) for item in payload if item.get("name")}


def main() -> int:
    args = parse_args()
    root = Path(__file__).resolve().parents[1]

    db_path = Path(args.db)
    if not db_path.is_absolute():
        db_path = root / db_path

    snapshot_path = Path(args.snapshot)
    if not snapshot_path.is_absolute():
        snapshot_path = root / snapshot_path

    db_counts = load_db_counts(db_path)
    snapshot_counts = load_snapshot_counts(snapshot_path)

    expected = set(STORE_NAME_SET)
    db_present = set(db_counts.keys())
    snapshot_present = set(snapshot_counts.keys())

    missing_in_db = sorted(expected - db_present)
    missing_in_snapshot = sorted(expected - snapshot_present)

    zero_in_db = sorted(name for name in expected if db_counts.get(name, 0) <= 0)
    zero_in_snapshot = sorted(name for name in expected if snapshot_counts and snapshot_counts.get(name, 0) <= 0)

    print("Expected stores:", len(expected))
    print("Stores in DB:", len(db_present))
    print("Stores in snapshot:", len(snapshot_present) if snapshot_counts else 0)

    if missing_in_db:
        print("Missing in DB:", ", ".join(missing_in_db))
    if missing_in_snapshot and snapshot_counts:
        print("Missing in snapshot:", ", ".join(missing_in_snapshot))

    strict_counts = args.strict and not args.allow_zero
    if strict_counts and zero_in_db:
        print("Zero-count in DB:", ", ".join(zero_in_db))
    if strict_counts and snapshot_counts and zero_in_snapshot:
        print("Zero-count in snapshot:", ", ".join(zero_in_snapshot))

    failed = False
    if missing_in_db:
        failed = True
    if snapshot_counts and missing_in_snapshot:
        failed = True
    if strict_counts and zero_in_db:
        failed = True
    if strict_counts and snapshot_counts and zero_in_snapshot:
        failed = True

    if failed:
        print("COVERAGE_CHECK=FAIL")
        return 1

    print("COVERAGE_CHECK=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
