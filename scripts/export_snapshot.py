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
from urllib.parse import urlparse

from scripts.store_registry import get_all_stores


ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT_DIR / "netlify" / "data"
STORE_CONNECTIVITY_OVERRIDES_PATH = OUTPUT_DIR / "store_connectivity_overrides.json"
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

VALID_IMAGE_EXTENSIONS = (
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".avif",
    ".gif",
)

INVALID_COVER_TOKENS = (
    "logo",
    "favicon",
    "sprite",
    "banner",
    "placeholder",
    "avatar",
)

_PRICE_RE = re.compile(r"\s*₪\s*\d[\d.,]*", re.UNICODE)
_STOCK_SUFFIX_RE = re.compile(
    r"\s*[-–—,]\s*(חסר\s*במלאי|אזל\s*מ(?:ה)?מלאי|לא\s*במלאי|במלאי"
    r"|out\s*of\s*stock|sold\s*out|in\s*stock)\b.*",
    re.IGNORECASE | re.UNICODE,
)
_STOCK_PREFIX_RE = re.compile(
    r"(חסר\s*במלאי|אזל\s*מ(?:ה)?מלאי|לא\s*במלאי|במלאי"
    r"|out\s*of\s*stock|sold\s*out|in\s*stock)\s*[-–—,]?\s*",
    re.IGNORECASE | re.UNICODE,
)
_TRAILING_SEP_RE = re.compile(r"[-–—,|/:;.\s]+$", re.UNICODE)
_DUMMY_COVER_RE = re.compile(
    r"(?:dummyimage\.com|via\.placeholder\.com|placehold\.co)", re.IGNORECASE
)
_ONLINE_PRICE_PREFIX_RE = re.compile(
    r"^(?:מחיר\s+אונליין|מחיר\s+online|מחיר\s*:)\s*",
    re.IGNORECASE | re.UNICODE,
)
_URL_FILENAME_RE = re.compile(r"\.(aspx|php|html?|jsp|cfm)(\?|$)", re.IGNORECASE)


def clean_record_text(value: str | None) -> str:
    """Strip embedded prices (₪160), Hebrew/English stock markers, and trailing separators."""
    if not value:
        return ""
    s = _PRICE_RE.sub("", value)
    s = _STOCK_SUFFIX_RE.sub("", s)
    s = _STOCK_PREFIX_RE.sub("", s)
    s = _ONLINE_PRICE_PREFIX_RE.sub("", s)
    s = _TRAILING_SEP_RE.sub("", s).strip()
    return s or value.strip()


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


def has_required_text(value: Any) -> bool:
    return bool(str(value or "").strip())


def is_valid_http_url(value: Any) -> bool:
    text = str(value or "").strip()
    if not text:
        return False

    try:
        parsed = urlparse(text)
    except ValueError:
        return False

    if parsed.scheme not in {"http", "https"}:
        return False
    if not parsed.netloc:
        return False

    host = (parsed.hostname or "").lower()
    if not host:
        return False

    if (
        host == "localhost"
        or host == "127.0.0.1"
        or host == "::1"
        or host.endswith(".local")
        or host.startswith("10.")
        or host.startswith("192.168.")
        or re.match(r"^172\.(1[6-9]|2[0-9]|3[0-1])\.", host)
    ):
        return False

    return True


def is_valid_cover_url(value: Any) -> bool:
    text = str(value or "").strip()
    if not is_valid_http_url(text):
        return False

    parsed = urlparse(text)
    lowered = f"{parsed.path.lower()}?{parsed.query.lower()}"
    if not any(parsed.path.lower().endswith(ext) for ext in VALID_IMAGE_EXTENSIONS):
        return False

    if any(token in lowered for token in INVALID_COVER_TOKENS):
        return False

    return True


def evaluate_record_integrity(
    records: list[dict[str, Any]],
    stores_payload: list[dict[str, Any]],
) -> dict[str, Any]:
    store_connectivity = {
        str(store.get("name") or ""): str(store.get("connectivity_status") or "pending")
        for store in stores_payload
    }

    renderable_ids: list[str] = []
    quarantined_ids: list[str] = []
    reason_counts: dict[str, int] = {}
    store_breakdown: dict[str, dict[str, Any]] = {}
    quarantined_samples: list[dict[str, Any]] = []
    blocked_quarantined = 0
    non_blocked_quarantined = 0

    for record in records:
        record_id = str(record.get("id") or "")
        store_name = str(record.get("store_name") or "Unknown") or "Unknown"
        connectivity_status = store_connectivity.get(store_name, "pending")
        blocked_store = connectivity_status == "blocked"

        breakdown = store_breakdown.setdefault(
            store_name,
            {
                "name": store_name,
                "connectivity_status": connectivity_status,
                "records": 0,
                "renderable": 0,
                "quarantined": 0,
            },
        )
        breakdown["records"] += 1

        reasons: list[str] = []

        price = parse_price(record.get("price"))
        if blocked_store:
            pricing_state = "blocked_store"
            reasons.append("pricing:blocked_store")
        elif price > 0:
            pricing_state = "verified"
        else:
            pricing_state = "missing_or_invalid"
            reasons.append("pricing:missing_or_invalid")

        cover_url = record.get("cover_url")
        if is_valid_cover_url(cover_url):
            asset_state = "verified"
        elif has_required_text(cover_url):
            asset_state = "invalid_url"
            reasons.append("asset:invalid_url")
        else:
            asset_state = "missing"
            reasons.append("asset:missing")

        completeness_issues: list[str] = []
        for field in ("id", "album", "store_name"):
            if not has_required_text(record.get(field)):
                completeness_issues.append(f"missing_{field}")

        has_link = is_valid_http_url(record.get("product_url")) or is_valid_http_url(record.get("store_url"))
        if not has_link:
            completeness_issues.append("missing_product_or_store_url")

        if completeness_issues:
            completeness_state = "incomplete"
            reasons.extend(f"completeness:{issue}" for issue in completeness_issues)
        else:
            completeness_state = "complete"

        # Reject category/listing page URLs (e.g. store-products.aspx, products.aspx)
        _purl = str(record.get("product_url") or "")
        _ppath = urlparse(_purl).path.lower()
        _pfile = _ppath.rsplit("/", 1)[-1] if "/" in _ppath else _ppath
        _is_listing_page = bool(
            re.search(r"\.(aspx|php|html?|jsp|cfm)$", _pfile)
            and re.search(r"(?:^|[-_])products?(?:[-_.]|$)|catalog|categor|listing|browse", _pfile)
        )
        if _is_listing_page:
            reasons.append("product_url:listing_page")

        # Require album + store + any outbound link; price/cover fetched live in UI
        renderable = (
            has_required_text(record.get("album"))
            and has_required_text(record.get("store_name"))
            and has_link
            and not _is_listing_page
        )

        if renderable:
            renderable_ids.append(record_id)
            breakdown["renderable"] += 1
        else:
            quarantined_ids.append(record_id)
            breakdown["quarantined"] += 1

            if blocked_store:
                blocked_quarantined += 1
            else:
                non_blocked_quarantined += 1

            for reason in reasons:
                reason_counts[reason] = reason_counts.get(reason, 0) + 1

            if len(quarantined_samples) < 250:
                quarantined_samples.append(
                    {
                        "id": record_id,
                        "store_name": store_name,
                        "pricing_state": pricing_state,
                        "asset_state": asset_state,
                        "completeness_state": completeness_state,
                        "reasons": reasons,
                    }
                )

    total = len(records)
    renderable_count = len(renderable_ids)
    quarantined_count = len(quarantined_ids)
    coverage = round((100.0 * renderable_count / total), 2) if total else 0.0

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "requires_price_for_renderable": True,
            "requires_valid_cover_for_renderable": True,
            "requires_complete_metadata_for_renderable": True,
            "quarantine_blocked_stores": True,
        },
        "summary": {
            "total_records": total,
            "renderable_records": renderable_count,
            "quarantined_records": quarantined_count,
            "blocked_store_quarantined_records": blocked_quarantined,
            "non_blocked_quarantined_records": non_blocked_quarantined,
            "renderable_coverage_percent": coverage,
            "reason_counts": dict(sorted(reason_counts.items(), key=lambda item: item[0])),
            "quarantined_sample_ids": [sample["id"] for sample in quarantined_samples[:25]],
        },
        "renderable_ids": renderable_ids,
        "quarantined_ids": quarantined_ids,
        "quarantined_samples": quarantined_samples,
        "store_breakdown": sorted(
            store_breakdown.values(),
            key=lambda item: int(item.get("records") or 0),
            reverse=True,
        ),
    }


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
            cover_url,
            in_stock
        FROM records
        """
    )

    rows = cursor.fetchall()
    conn.close()

    records: list[dict[str, Any]] = []
    for row in rows:
        raw_artist = (row["artist"] or "").strip()
        raw_album = (row["album"] or "").strip()
        condition = (row["condition"] or "").strip() or None

        # Prefer stored in_stock value (scraped from JSON-LD); fall back to text-marker inference
        try:
            stored_in_stock = row["in_stock"]
        except (IndexError, KeyError):
            stored_in_stock = None
        if stored_in_stock is not None:
            in_stock: bool | None = bool(stored_in_stock)
        else:
            # Infer BEFORE cleaning so embedded markers like "Kind of Blue – במלאי" are detected
            in_stock = infer_in_stock(raw_artist, raw_album, condition)

        artist = clean_record_text(raw_artist)
        album = clean_record_text(raw_album)
        if _URL_FILENAME_RE.search(album):
            album = ""

        raw_cover = (row["cover_url"] or "").strip()
        cover_url = raw_cover if raw_cover and not _DUMMY_COVER_RE.search(raw_cover) else None

        records.append(
            {
                "id": str(row["id"]),
                "artist": artist or raw_artist,
                "album": album or raw_album,
                "genre": (row["genre"] or "").strip() or None,
                "format": (row["format"] or "").strip() or None,
                "condition": condition,
                "year": parse_year(row["year"]),
                "price": parse_price(row["price"]),
                "store_name": (row["store_name"] or "Unknown").strip() or "Unknown",
                "store_url": (row["store_url"] or "").strip() or None,
                "product_url": (row["product_url"] or "").strip() or None,
                "currency": (row["currency"] or "ILS").strip() or "ILS",
                "cover_url": cover_url,
                "in_stock": in_stock,
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


def preserve_enrichment_fields(
    new_records: list[dict[str, Any]],
    existing_path: Path,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """
    Two-pass merge against existing records.json:

    Pass 1 — URL-keyed fallback: any record in the existing snapshot whose
    product_url is NOT present in the fresh SQLite export is carried forward.
    This preserves historical listings that the scraper didn't reach this run
    (pagination limits, bot-blocking, etc.) without losing accumulated data.

    Pass 2 — Enrichment merge: for matched records (same product_url), copy
    genre/year/cover_url from the existing snapshot when the new SQLite row has
    nothing useful.  Preserves Deezer / Last.fm enrichment across re-exports.
    """
    stats = {"genre": 0, "year": 0, "cover": 0, "stores_restored": 0, "records_restored": 0}
    if not existing_path.exists():
        return new_records, stats

    try:
        existing_list: list[dict[str, Any]] = json.loads(
            existing_path.read_text(encoding="utf-8")
        )
    except Exception:
        return new_records, stats

    def _norm_url(raw: Any) -> str:
        """Normalize for dedup: strip whitespace, fragment, and trailing slash."""
        s = str(raw or "").strip()
        if "#" in s:
            s = s[: s.index("#")]
        if s.endswith("/") and s.count("/") > 3:
            s = s.rstrip("/")
        return s.lower()

    # Build URL lookup for enrichment pass (normalized keys)
    existing_by_url: dict[str, dict[str, Any]] = {}
    for rec in existing_list:
        url = _norm_url(rec.get("product_url"))
        if url:
            existing_by_url[url] = rec

    # Pass 1: preserve all existing records whose product_url is absent from the
    # fresh SQLite scrape (handles pagination limits, bot-blocking, etc.)
    new_urls: set[str] = set()
    for r in new_records:
        url = _norm_url(r.get("product_url"))
        if url:
            new_urls.add(url)

    restored_map: dict[str, dict[str, Any]] = {}
    restored_stores: set[str] = set()
    for rec in existing_list:
        url = _norm_url(rec.get("product_url"))
        if url and url not in new_urls and url not in restored_map:
            restored_map[url] = rec
            store = str(rec.get("store_name") or "").strip()
            if store:
                restored_stores.add(store)
    restored = list(restored_map.values())
    stats["stores_restored"] = len(restored_stores)
    stats["records_restored"] = len(restored)

    # Pass 2: merge enrichment into new records
    for rec in new_records:
        url = _norm_url(rec.get("product_url"))
        old = existing_by_url.get(url)
        if not old:
            continue

        if not rec.get("genre") and old.get("genre"):
            rec["genre"] = old["genre"]
            stats["genre"] += 1

        if not rec.get("year") and old.get("year"):
            rec["year"] = old["year"]
            stats["year"] += 1

        if not rec.get("cover_url") and old.get("cover_url"):
            old_cover = str(old["cover_url"] or "").strip()
            if old_cover and not _DUMMY_COVER_RE.search(old_cover) and not old_cover.startswith("data:"):
                rec["cover_url"] = old_cover
                stats["cover"] += 1

        # Preserve remediated/enriched prices — these are not in the DB
        old_price = old.get("price")
        if not (float(rec.get("price") or 0) > 0) and float(old_price or 0) > 0:
            rec["price"] = old_price
            if old.get("price_source"):
                rec["price_source"] = old["price_source"]

        # Preserve live-checked in_stock and checked_at — set by remediate_prices, not in DB
        if rec.get("in_stock") is None and old.get("in_stock") is not None:
            rec["in_stock"] = old["in_stock"]
        if old.get("checked_at"):
            rec["checked_at"] = old["checked_at"]

    return new_records + restored, stats


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))


def read_existing_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_connectivity_overrides() -> dict[str, dict[str, Any]]:
    if not STORE_CONNECTIVITY_OVERRIDES_PATH.exists():
        return {}

    try:
        payload = json.loads(STORE_CONNECTIVITY_OVERRIDES_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}

    stores_section = payload.get("stores") if isinstance(payload, dict) else None
    if not isinstance(stores_section, dict):
        return {}

    normalized: dict[str, dict[str, Any]] = {}
    for store_name, override in stores_section.items():
        if not isinstance(override, dict):
            continue
        key = str(store_name or "").strip()
        if not key:
            continue
        normalized[key] = override

    return normalized


def snapshot_store_configs() -> list[dict[str, Any]]:
    overrides = load_connectivity_overrides()
    return [
        {
            "id": config.id,
            "store_name": config.store_name,
            "enabled": bool(overrides.get(config.store_name, {}).get("enabled", config.enabled)),
            "connectivity_note": str(
                overrides.get(config.store_name, {}).get("connectivity_note", config.connectivity_note)
            ),
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
        stores_raw = build_stores(records)
        genres = build_genres(records)
        database_info = build_database_info(records)

        stores = enrich_store_health(stores_raw, expected_stores=store_configs)
        pricing_integrity = build_pricing_integrity(stores)
        connectivity = build_connectivity_summary(stores)
        record_integrity = evaluate_record_integrity(records, stores)

        if isinstance(database_info, dict):
            database_info["pricing_integrity"] = pricing_integrity
            database_info["connectivity"] = connectivity
            database_info["record_integrity"] = record_integrity["summary"]

        write_json(OUTPUT_DIR / "stores.json", stores)
        write_json(OUTPUT_DIR / "database_info.json", database_info)
        write_json(OUTPUT_DIR / "record_integrity.json", record_integrity)
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
                "record_integrity": record_integrity["summary"],
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
    records, enrich_stats = preserve_enrichment_fields(
        records, OUTPUT_DIR / "records.json"
    )
    # Final dedup by normalized product_url (new SQLite records take priority
    # since they appear first; keeps one record per unique URL)
    _seen_urls: set[str] = set()
    _deduped: list[dict] = []
    for _rec in records:
        _raw = str(_rec.get("product_url") or "").strip()
        if "#" in _raw:
            _raw = _raw[: _raw.index("#")]
        if _raw.endswith("/") and _raw.count("/") > 3:
            _raw = _raw.rstrip("/")
        _key = _raw.lower()
        if _key and _key in _seen_urls:
            continue
        if _key:
            _seen_urls.add(_key)
        _deduped.append(_rec)
    records = _deduped
    # Clean artist/album on all records (restored records bypass the per-row loop)
    for _rec in records:
        raw_a = str(_rec.get("artist") or "")
        raw_b = str(_rec.get("album") or "")
        cleaned_a = clean_record_text(raw_a)
        cleaned_b = clean_record_text(raw_b)
        if _URL_FILENAME_RE.search(cleaned_b):
            cleaned_b = ""
        _rec["artist"] = cleaned_a or raw_a
        _rec["album"] = cleaned_b or raw_b
    # Reassign sequential IDs after merge to guarantee uniqueness
    for idx, rec in enumerate(records, start=1):
        rec["id"] = str(idx)
    if any(enrich_stats.values()):
        print(
            f"Preserved enrichment: genre={enrich_stats['genre']},"
            f" year={enrich_stats['year']}, cover={enrich_stats['cover']}"
        )
        if enrich_stats["stores_restored"]:
            print(
                f"Restored {enrich_stats['records_restored']} records from"
                f" {enrich_stats['stores_restored']} failed/blocked stores (from existing snapshot)"
            )
    search_records = build_search_records(records)
    stores = enrich_store_health(build_stores(records), expected_stores=store_configs)
    genres = build_genres(records)
    database_info = build_database_info(records)
    pricing_integrity = build_pricing_integrity(stores)
    connectivity = build_connectivity_summary(stores)
    record_integrity = evaluate_record_integrity(records, stores)
    database_info["pricing_integrity"] = pricing_integrity
    database_info["connectivity"] = connectivity
    database_info["record_integrity"] = record_integrity["summary"]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    write_json(OUTPUT_DIR / "records.json", records)
    write_json(OUTPUT_DIR / "search_records.json", search_records)
    write_json(OUTPUT_DIR / "stores.json", stores)
    write_json(OUTPUT_DIR / "genres.json", genres)
    write_json(OUTPUT_DIR / "database_info.json", database_info)
    write_json(OUTPUT_DIR / "record_integrity.json", record_integrity)
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
            "record_integrity": record_integrity["summary"],
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
