#!/usr/bin/env python3
"""
Export a Netlify-friendly JSON snapshot from the local SQLite catalog.

Outputs are written to netlify/data and consumed by netlify/functions/api.cjs.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from scripts.store_registry import get_all_stores


ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT_DIR / "netlify" / "data"
DEFAULT_DB_CANDIDATES = [
    ROOT_DIR / "music_stores.db",
    ROOT_DIR / "vinyl_records.db",
]

PRICING_COMPLETENESS_TARGET = 95.0

HEBREW_CHARS = set("אבגדהוזחטיכלמנסעפצקרשתןםןףץ")

OUT_OF_STOCK_MARKERS_HE = (
    "לא במלאי",
    "אזל מהמלאי",
    "אזל מהמלאי?",
    "אזל מהמלאי!",
    "אזל מהמלאי.",
    "אזל מהמלאיעדכנו אותי כשחזר למלאי",
    "אזל מהמלאי עדכנו אותי כשחזר למלאי",
    "עדכנו אותי כשחזר למלאי",
    "אזל מהמלאי/",
    "אזל מהמלאי\u200f",
    "אזל מהמלאי\u200e",
    "אזל מהמלאי\u202c",
)

OUT_OF_STOCK_MARKERS_EN = (
    "out of stock",
    "sold out",
    "currently unavailable",
    "not available",
    "notify me when available",
    "back in stock notification",
)

IN_STOCK_MARKERS_HE = (
    "במלאי",
    "זמין",
)

IN_STOCK_MARKERS_EN = (
    "in stock",
    "available now",
)


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


def infer_in_stock(*values: Any) -> bool | None:
    parts = [str(value).strip() for value in values if value is not None and str(value).strip()]
    if not parts:
        return None

    combined = " | ".join(parts)
    lowered = combined.lower()

    if any(marker in combined for marker in OUT_OF_STOCK_MARKERS_HE):
        return False
    if any(marker in lowered for marker in OUT_OF_STOCK_MARKERS_EN):
        return False

    if re.search(r"\b\d+\s*במלאי\b", combined):
        return True
    if re.search(r"\b\d+\s*in\s*stock\b", lowered):
        return True

    if any(marker in combined for marker in IN_STOCK_MARKERS_HE):
        return True
    if any(marker in lowered for marker in IN_STOCK_MARKERS_EN):
        return True

    return None


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
        artist = (row["artist"] or "").strip()
        album = (row["album"] or "").strip()
        condition = (row["condition"] or "").strip() or None
        records.append(
            {
                "id": str(row["id"]),
                "artist": artist,
                "album": album,
                "genre": (row["genre"] or "").strip() or None,
                "format": (row["format"] or "").strip() or None,
                "condition": condition,
                "year": parse_year(row["year"]),
                "price": parse_price(row["price"]),
                "store_name": (row["store_name"] or "Unknown").strip() or "Unknown",
                "store_url": (row["store_url"] or "").strip() or None,
                "product_url": (row["product_url"] or "").strip() or None,
                "currency": (row["currency"] or "ILS").strip() or "ILS",
                "cover_url": (row["cover_url"] or "").strip() or None,
                "in_stock": infer_in_stock(artist, album, condition),
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
        price = float(record.get("price") or 0)

        if store_name not in grouped:
            grouped[store_name] = {
                "record_count": 0,
                "artists": set(),
                "genres": set(),
                "priced_records": 0,
                "price_sum": 0.0,
                "min_price": None,
                "max_price": None,
            }

        grouped[store_name]["record_count"] += 1
        if artist:
            grouped[store_name]["artists"].add(artist)
        if genre:
            grouped[store_name]["genres"].add(genre)
        if price > 0:
            grouped[store_name]["priced_records"] += 1
            grouped[store_name]["price_sum"] += price
            current_min = grouped[store_name]["min_price"]
            current_max = grouped[store_name]["max_price"]
            grouped[store_name]["min_price"] = price if current_min is None else min(current_min, price)
            grouped[store_name]["max_price"] = price if current_max is None else max(current_max, price)

    stores_payload = []
    for store_name, stats in grouped.items():
        priced_records = int(stats["priced_records"])
        avg_price = round(float(stats["price_sum"]) / priced_records, 2) if priced_records else 0
        min_price = round(float(stats["min_price"]), 2) if stats["min_price"] is not None else 0
        max_price = round(float(stats["max_price"]), 2) if stats["max_price"] is not None else 0
        stores_payload.append(
            {
                "name": store_name,
                "record_count": int(stats["record_count"]),
                "unique_artists": len(stats["artists"]),
                "genres_represented": len(stats["genres"]),
                "priced_records": priced_records,
                "avg_price": avg_price,
                "min_price": min_price,
                "max_price": max_price,
            }
        )

    stores_payload.sort(key=lambda item: item["record_count"], reverse=True)
    return stores_payload


def enrich_store_health(
    stores_payload: list[dict[str, Any]],
    *,
    expected_stores: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    stores_by_name = {
        str(item.get("name") or ""): dict(item)
        for item in stores_payload
        if item.get("name")
    }

    for config in expected_stores:
        store_name = str(config.get("store_name") or "").strip()
        if not store_name:
            continue

        current = stores_by_name.get(store_name)
        if current is None:
            current = {
                "name": store_name,
                "record_count": 0,
                "unique_artists": 0,
                "genres_represented": 0,
                "priced_records": 0,
                "avg_price": 0,
                "min_price": 0,
                "max_price": 0,
            }
            stores_by_name[store_name] = current

        record_count = int(current.get("record_count") or 0)
        priced_records = int(current.get("priced_records") or 0)
        enabled = bool(config.get("enabled", True))

        coverage = round((100.0 * priced_records / record_count), 1) if record_count else 0.0
        if not enabled:
            connectivity_status = "blocked"
            pricing_status = "blocked"
        elif record_count <= 0:
            connectivity_status = "pending"
            pricing_status = "no_data"
        elif priced_records <= 0:
            connectivity_status = "enabled"
            pricing_status = "missing"
        elif coverage >= PRICING_COMPLETENESS_TARGET:
            connectivity_status = "enabled"
            pricing_status = "healthy"
        else:
            connectivity_status = "enabled"
            pricing_status = "degraded"

        current["connectivity_status"] = connectivity_status
        current["connectivity_note"] = str(config.get("connectivity_note") or "")
        current["pricing_coverage_percent"] = coverage
        current["pricing_status"] = pricing_status

    enriched = list(stores_by_name.values())
    enriched.sort(key=lambda item: int(item.get("record_count") or 0), reverse=True)
    return enriched


def build_connectivity_summary(stores_payload: list[dict[str, Any]]) -> dict[str, Any]:
    blocked = [store for store in stores_payload if store.get("connectivity_status") == "blocked"]
    enabled = [store for store in stores_payload if store.get("connectivity_status") == "enabled"]
    pending = [store for store in stores_payload if store.get("connectivity_status") == "pending"]

    return {
        "enabled_stores": len(enabled),
        "blocked_stores": len(blocked),
        "pending_stores": len(pending),
        "blocked_store_names": [store.get("name") for store in blocked],
    }


def build_pricing_integrity(stores_payload: list[dict[str, Any]]) -> dict[str, Any]:
    enabled = [store for store in stores_payload if store.get("connectivity_status") != "blocked"]
    enabled_records = sum(int(store.get("record_count") or 0) for store in enabled)
    enabled_priced = sum(int(store.get("priced_records") or 0) for store in enabled)

    enabled_coverage = round((100.0 * enabled_priced / enabled_records), 1) if enabled_records else 0.0
    below_target = [
        str(store.get("name") or "")
        for store in enabled
        if int(store.get("record_count") or 0) > 0
        and float(store.get("pricing_coverage_percent") or 0.0) < PRICING_COMPLETENESS_TARGET
    ]
    missing_prices = [
        str(store.get("name") or "")
        for store in enabled
        if int(store.get("record_count") or 0) > 0 and int(store.get("priced_records") or 0) <= 0
    ]

    return {
        "target_percent": PRICING_COMPLETENESS_TARGET,
        "enabled_store_count": len(enabled),
        "enabled_records": enabled_records,
        "enabled_priced_records": enabled_priced,
        "enabled_coverage_percent": enabled_coverage,
        "meets_target": enabled_coverage >= PRICING_COMPLETENESS_TARGET,
        "stores_below_target": below_target,
        "stores_missing_prices": missing_prices,
    }


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
    in_stock = 0
    out_of_stock = 0
    unknown_stock = 0

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

        stock_value = record.get("in_stock")
        if stock_value is True:
            in_stock += 1
        elif stock_value is False:
            out_of_stock += 1
        else:
            unknown_stock += 1

    known_stock = in_stock + out_of_stock

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
            "records_in_stock": in_stock,
            "records_out_of_stock": out_of_stock,
            "records_stock_unknown": unknown_stock,
            "records_with_known_stock": known_stock,
            "coverage_percent_stock_known": round((100.0 * known_stock / total), 1) if total else 0,
        },
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))


def read_existing_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def snapshot_store_configs() -> list[dict[str, Any]]:
    return [
        {
            "id": config.id,
            "store_name": config.store_name,
            "enabled": config.enabled,
            "connectivity_note": config.connectivity_note,
        }
        for config in get_all_stores()
    ]


def main() -> None:
    db_path = pick_database()
    store_configs = snapshot_store_configs()

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

        records = read_existing_json(OUTPUT_DIR / "records.json")
        search_records = (
            read_existing_json(OUTPUT_DIR / "search_records.json")
            if (OUTPUT_DIR / "search_records.json").exists()
            else records
        )
        stores_raw = read_existing_json(OUTPUT_DIR / "stores.json")
        genres = read_existing_json(OUTPUT_DIR / "genres.json")
        database_info = read_existing_json(OUTPUT_DIR / "database_info.json")

        stores = enrich_store_health(stores_raw, expected_stores=store_configs)
        pricing_integrity = build_pricing_integrity(stores)
        connectivity = build_connectivity_summary(stores)

        if isinstance(database_info, dict):
            database_info["pricing_integrity"] = pricing_integrity
            database_info["connectivity"] = connectivity

        write_json(OUTPUT_DIR / "stores.json", stores)
        write_json(OUTPUT_DIR / "database_info.json", database_info)
        write_json(
            OUTPUT_DIR / "snapshot_meta.json",
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "source_db": "snapshot-files",
                "records": len(records),
                "search_records": len(search_records),
                "stores": len(stores),
                "genres": len(genres),
                "pricing_integrity": pricing_integrity,
                "connectivity": connectivity,
                "asset_integrity": {
                    "records_with_cover": int(database_info.get("data_quality", {}).get("records_with_cover", 0))
                    if isinstance(database_info, dict)
                    else 0,
                    "coverage_percent_covers": float(
                        database_info.get("data_quality", {}).get("coverage_percent_covers", 0)
                    )
                    if isinstance(database_info, dict)
                    else 0,
                },
            },
        )

        print("No SQLite database found; refreshed snapshot metadata from netlify/data")
        return

    records = load_records(db_path)
    search_records = build_search_records(records)
    stores = enrich_store_health(build_stores(records), expected_stores=store_configs)
    genres = build_genres(records)
    database_info = build_database_info(records)
    pricing_integrity = build_pricing_integrity(stores)
    connectivity = build_connectivity_summary(stores)
    database_info["pricing_integrity"] = pricing_integrity
    database_info["connectivity"] = connectivity

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
            "pricing_integrity": pricing_integrity,
            "connectivity": connectivity,
            "asset_integrity": {
                "records_with_cover": database_info["data_quality"]["records_with_cover"],
                "coverage_percent_covers": database_info["data_quality"]["coverage_percent_covers"],
            },
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
