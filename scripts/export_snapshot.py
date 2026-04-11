#!/usr/bin/env python3
"""
Export a Netlify-friendly JSON snapshot from the local SQLite catalog.

Outputs are written to netlify/data and consumed by netlify/functions/api.cjs.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT_DIR / "netlify" / "data"
DEFAULT_DB_CANDIDATES = [
    ROOT_DIR / "music_stores.db",
    ROOT_DIR / "vinyl_records.db",
]

HEBREW_CHARS = set("אבגדהוזחטיכלמנסעפצקרשתןםןףץ")


def pick_database() -> Path | None:
    env_path = os.environ.get("SNAPSHOT_DB_PATH", "").strip()
    if env_path:
        candidate = Path(env_path)
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"SNAPSHOT_DB_PATH does not exist: {candidate}")

    for candidate in DEFAULT_DB_CANDIDATES:
        if candidate.exists():
            return candidate

    return None


def parse_year(value: Any) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = int(float(text))
    except ValueError:
        return None
    return parsed


def parse_price(value: Any) -> float:
    if value is None:
        return 0.0
    text = str(value).strip()
    if not text:
        return 0.0
    cleaned = text.replace("₪", "").replace("ILS", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def normalize_album_for_dedupe(album: str) -> str:
    normalized = (album or "").strip()
    normalized = normalized.lstrip("+").strip()

    while normalized and normalized[0] in HEBREW_CHARS:
        normalized = normalized[1:].strip()

    paren_pos = normalized.rfind(")")
    if paren_pos > 0:
        normalized = normalized[: paren_pos + 1]

    normalized = normalized.replace(" ₪", "").replace(" ILS", "")

    parts = normalized.rsplit(" ", 1)
    if len(parts) == 2:
        tail = parts[-1].replace(".", "").replace(",", "")
        if tail.isdigit():
            normalized = parts[0]

    return normalized.strip()


def load_records(db_path: Path) -> list[dict[str, Any]]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT
            id,
            artist,
            album,
            genre,
            format,
            condition,
            year,
            price,
            store_name,
            store_url,
            product_url,
            currency,
            cover_url
        FROM records
        """
    )

    rows = cursor.fetchall()
    conn.close()

    records: list[dict[str, Any]] = []
    for row in rows:
        records.append(
            {
                "id": str(row["id"]),
                "artist": (row["artist"] or "").strip(),
                "album": (row["album"] or "").strip(),
                "genre": (row["genre"] or "").strip() or None,
                "format": (row["format"] or "").strip() or None,
                "condition": (row["condition"] or "").strip() or None,
                "year": parse_year(row["year"]),
                "price": parse_price(row["price"]),
                "store_name": (row["store_name"] or "Unknown").strip() or "Unknown",
                "store_url": (row["store_url"] or "").strip() or None,
                "product_url": (row["product_url"] or "").strip() or None,
                "currency": (row["currency"] or "ILS").strip() or "ILS",
                "cover_url": (row["cover_url"] or "").strip() or None,
            }
        )

    return records


def build_search_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    deduped: list[dict[str, Any]] = []

    for record in records:
        key = (
            record.get("store_name", "Unknown"),
            normalize_album_for_dedupe(record.get("album", "") or ""),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(record)

    return deduped


def build_stores(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}

    for record in records:
        store_name = record.get("store_name", "Unknown") or "Unknown"
        genre = record.get("genre")
        artist = record.get("artist")

        if store_name not in grouped:
            grouped[store_name] = {
                "record_count": 0,
                "artists": set(),
                "genres": set(),
            }

        grouped[store_name]["record_count"] += 1
        if artist:
            grouped[store_name]["artists"].add(artist)
        if genre:
            grouped[store_name]["genres"].add(genre)

    stores_payload = []
    for store_name, stats in grouped.items():
        stores_payload.append(
            {
                "name": store_name,
                "record_count": int(stats["record_count"]),
                "unique_artists": len(stats["artists"]),
                "genres_represented": len(stats["genres"]),
            }
        )

    stores_payload.sort(key=lambda item: item["record_count"], reverse=True)
    return stores_payload


def build_genres(records: list[dict[str, Any]]) -> list[str]:
    genres = sorted({r["genre"] for r in records if r.get("genre")})
    return genres


def build_database_info(records: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(records)

    store_counts: dict[str, int] = {}
    genre_counts: dict[str, int] = {}
    covers = 0
    with_genre = 0
    with_year = 0

    for record in records:
        store_name = record.get("store_name", "Unknown") or "Unknown"
        store_counts[store_name] = store_counts.get(store_name, 0) + 1

        genre = record.get("genre")
        if genre:
            with_genre += 1
            genre_counts[genre] = genre_counts.get(genre, 0) + 1

        if record.get("cover_url"):
            covers += 1

        if record.get("year") is not None:
            with_year += 1

    return {
        "total_records": total,
        "stores": dict(sorted(store_counts.items(), key=lambda item: item[1], reverse=True)),
        "store_count": len(store_counts),
        "genres": dict(sorted(genre_counts.items(), key=lambda item: item[1], reverse=True)),
        "genre_count": len(genre_counts),
        "data_quality": {
            "records_with_cover": covers,
            "coverage_percent_covers": round((100.0 * covers / total), 1) if total else 0,
            "records_with_genre": with_genre,
            "coverage_percent_genres": round((100.0 * with_genre / total), 1) if total else 0,
            "records_with_year": with_year,
            "coverage_percent_years": round((100.0 * with_year / total), 1) if total else 0,
        },
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    db_path = pick_database()

    if db_path is None:
        required_files = [
            "records.json",
            "stores.json",
            "genres.json",
            "database_info.json",
        ]
        missing = [
            file_name
            for file_name in required_files
            if not (OUTPUT_DIR / file_name).exists()
        ]

        if missing:
            checked = ", ".join(str(p) for p in DEFAULT_DB_CANDIDATES)
            missing_list = ", ".join(missing)
            raise FileNotFoundError(
                f"No SQLite database found ({checked}) and missing pre-generated snapshot files: {missing_list}"
            )

        print("No SQLite database found; using pre-generated snapshot files from netlify/data")
        return

    records = load_records(db_path)
    search_records = build_search_records(records)
    stores = build_stores(records)
    genres = build_genres(records)
    database_info = build_database_info(records)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    write_json(OUTPUT_DIR / "records.json", records)
    write_json(OUTPUT_DIR / "search_records.json", search_records)
    write_json(OUTPUT_DIR / "stores.json", stores)
    write_json(OUTPUT_DIR / "genres.json", genres)
    write_json(OUTPUT_DIR / "database_info.json", database_info)
    write_json(
        OUTPUT_DIR / "snapshot_meta.json",
        {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source_db": str(db_path),
            "records": len(records),
            "search_records": len(search_records),
            "stores": len(stores),
            "genres": len(genres),
        },
    )

    print(
        "Snapshot exported:",
        f"records={len(records)}",
        f"search_records={len(search_records)}",
        f"stores={len(stores)}",
        f"genres={len(genres)}",
    )


if __name__ == "__main__":
    main()
