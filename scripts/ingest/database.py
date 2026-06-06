#!/usr/bin/env python3
"""SQLite persistence helpers for ingestion jobs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import sqlite3
from pathlib import Path
from typing import Any


@dataclass
class ReplaceResult:
    store_name: str
    previous_count: int
    new_count: int
    written_count: int
    replaced: bool
    reason: str = ""


class DatabaseWriter:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=20.0)
        conn.row_factory = sqlite3.Row
        return conn

    def ensure_tracking_table(self) -> None:
        conn = self._connect()
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ingestion_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    store_id TEXT NOT NULL,
                    store_name TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    ended_at TEXT NOT NULL,
                    success INTEGER NOT NULL,
                    mode TEXT,
                    records_found INTEGER NOT NULL,
                    records_written INTEGER NOT NULL,
                    error_message TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    artist TEXT,
                    album TEXT,
                    genre TEXT,
                    year TEXT,
                    store_name TEXT,
                    price TEXT,
                    currency TEXT DEFAULT 'ILS',
                    format TEXT,
                    condition TEXT,
                    store_url TEXT,
                    product_url TEXT,
                    cover_url TEXT,
                    in_stock INTEGER DEFAULT NULL
                )
                """
            )
            conn.commit()
        finally:
            conn.close()

    def _ensure_in_stock_column(self, conn: "sqlite3.Connection") -> None:
        try:
            conn.execute("ALTER TABLE records ADD COLUMN in_stock INTEGER DEFAULT NULL")
            conn.commit()
        except Exception:
            pass  # column already exists

    def replace_store_records(
        self,
        store_name: str,
        rows: list[dict[str, Any]],
        allow_empty_replace: bool = False,
        allow_shrink: bool = False,
    ) -> ReplaceResult:
        conn = self._connect()
        try:
            self._ensure_in_stock_column(conn)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM records WHERE store_name = ?", (store_name,))
            previous_count = int(cursor.fetchone()[0])

            normalized_rows = [
                row
                for row in rows
                if str(row.get("album") or "").strip()
            ]

            if not normalized_rows and not allow_empty_replace:
                return ReplaceResult(
                    store_name=store_name,
                    previous_count=previous_count,
                    new_count=previous_count,
                    written_count=0,
                    replaced=False,
                    reason="empty scrape result; keeping previous data",
                )

            # Guard existing high-volume stores from destructive shrink.
            if previous_count > 0 and len(normalized_rows) < previous_count and not allow_shrink:
                cursor.execute(
                    "SELECT product_url, album FROM records WHERE store_name = ?",
                    (store_name,),
                )
                existing_keys = set()
                for product_url, album in cursor.fetchall():
                    key = (str(product_url or "").strip().lower(), str(album or "").strip().lower())
                    existing_keys.add(key)

                to_insert: list[tuple] = []
                for row in normalized_rows:
                    key = (
                        str(row.get("product_url") or "").strip().lower(),
                        str(row.get("album") or "").strip().lower(),
                    )
                    if key in existing_keys:
                        continue
                    existing_keys.add(key)
                    in_stock_val = row.get("in_stock")
                    to_insert.append(
                        (
                            (row.get("artist") or "").strip(),
                            (row.get("album") or "").strip(),
                            (row.get("genre") or "").strip(),
                            (row.get("year") or "").strip(),
                            store_name,
                            (row.get("price") or "").strip(),
                            (row.get("currency") or "ILS").strip() or "ILS",
                            (row.get("format") or "").strip(),
                            (row.get("condition") or "").strip(),
                            (row.get("store_url") or "").strip(),
                            (row.get("product_url") or "").strip(),
                            (row.get("cover_url") or "").strip(),
                            1 if in_stock_val is True else (0 if in_stock_val is False else None),
                        )
                    )

                if to_insert:
                    cursor.executemany(
                        """
                        INSERT INTO records (
                            artist,
                            album,
                            genre,
                            year,
                            store_name,
                            price,
                            currency,
                            format,
                            condition,
                            store_url,
                            product_url,
                            cover_url,
                            in_stock
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        to_insert,
                    )
                    conn.commit()

                cursor.execute("SELECT COUNT(*) FROM records WHERE store_name = ?", (store_name,))
                merged_count = int(cursor.fetchone()[0])
                return ReplaceResult(
                    store_name=store_name,
                    previous_count=previous_count,
                    new_count=merged_count,
                    written_count=len(to_insert),
                    replaced=False,
                    reason="protected existing data; merged new unique rows",
                )

            cursor.execute("BEGIN")
            cursor.execute("DELETE FROM records WHERE store_name = ?", (store_name,))

            if normalized_rows:
                cursor.executemany(
                    """
                    INSERT INTO records (
                        artist,
                        album,
                        genre,
                        year,
                        store_name,
                        price,
                        currency,
                        format,
                        condition,
                        store_url,
                        product_url,
                        cover_url,
                        in_stock
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            (row.get("artist") or "").strip(),
                            (row.get("album") or "").strip(),
                            (row.get("genre") or "").strip(),
                            (row.get("year") or "").strip(),
                            store_name,
                            (row.get("price") or "").strip(),
                            (row.get("currency") or "ILS").strip() or "ILS",
                            (row.get("format") or "").strip(),
                            (row.get("condition") or "").strip(),
                            (row.get("store_url") or "").strip(),
                            (row.get("product_url") or "").strip(),
                            (row.get("cover_url") or "").strip(),
                            1 if row.get("in_stock") is True else (0 if row.get("in_stock") is False else None),
                        )
                        for row in normalized_rows
                    ],
                )

            conn.commit()

            cursor.execute("SELECT COUNT(*) FROM records WHERE store_name = ?", (store_name,))
            new_count = int(cursor.fetchone()[0])
            return ReplaceResult(
                store_name=store_name,
                previous_count=previous_count,
                new_count=new_count,
                written_count=len(normalized_rows),
                replaced=True,
            )
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def log_run(
        self,
        store_id: str,
        store_name: str,
        started_at: datetime,
        ended_at: datetime,
        success: bool,
        mode: str,
        records_found: int,
        records_written: int,
        error_message: str = "",
    ) -> None:
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT INTO ingestion_runs (
                    store_id,
                    store_name,
                    started_at,
                    ended_at,
                    success,
                    mode,
                    records_found,
                    records_written,
                    error_message
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    store_id,
                    store_name,
                    started_at.astimezone(timezone.utc).isoformat(),
                    ended_at.astimezone(timezone.utc).isoformat(),
                    1 if success else 0,
                    mode,
                    int(records_found),
                    int(records_written),
                    error_message,
                ),
            )
            conn.commit()
        finally:
            conn.close()
