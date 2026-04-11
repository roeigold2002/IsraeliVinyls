#!/usr/bin/env python3
"""HTML parsing and record normalization for ingestion."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import re
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from scripts.ingest.fetchers import FetchedPage
from scripts.store_registry import StoreConfig

NOISE_TITLE_TOKENS = {
    "add to cart",
    "quick view",
    "view product",
    "details",
    "read more",
    "buy now",
    "wishlist",
    "compare",
    "catalog",
    "shop",
    "store",
    "checkout",
    "cart",
    "כניסה",
    "עגלת קניות",
    "פרטים נוספים",
    "למעבר",
}


@dataclass
class ParsedRecord:
    source_key: str
    artist: str | None
    album: str
    genre: str | None
    year: str | None
    store_name: str
    price: str
    currency: str
    format: str | None
    condition: str | None
    store_url: str
    product_url: str
    cover_url: str | None


def _normalize_text(value: str | None) -> str:
    return re.sub(r"[^\w\u0590-\u05FF]+", " ", (value or "").lower()).strip()


def _query_matches(text: str, query_terms: list[str]) -> bool:
    if not query_terms:
        return True

    normalized = _normalize_text(text)
    if not normalized:
        return False

    for query in query_terms:
        qn = _normalize_text(query)
        if not qn:
            continue
        tokens = [token for token in qn.split(" ") if len(token) > 1]
        if not tokens:
            continue
        if any(token in normalized for token in tokens):
            return True
    return False


def _looks_like_real_title(text: str) -> bool:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if len(cleaned) < 3 or len(cleaned) > 180:
        return False
    lowered = cleaned.lower()
    if lowered in NOISE_TITLE_TOKENS:
        return False
    if any(token in lowered for token in NOISE_TITLE_TOKENS):
        return False
    if not re.search(r"[a-zA-Z\u0590-\u05FF0-9]", cleaned):
        return False
    return True


def _parse_price(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return f"{float(value):.2f}".rstrip("0").rstrip(".")

    match = re.search(r"(\d+(?:[.,]\d{1,2})?)", str(value).replace(",", ""))
    if not match:
        return ""
    return match.group(1)


def _first_string(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, list):
        for item in value:
            found = _first_string(item)
            if found:
                return found
    if isinstance(value, dict):
        return _first_string(value.get("url")) or _first_string(value.get("@id"))
    return None


def _extract_jsonld_products(soup: BeautifulSoup) -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []

    def collect(node: Any) -> None:
        if isinstance(node, list):
            for item in node:
                collect(item)
            return
        if not isinstance(node, dict):
            return

        node_type = node.get("@type")
        type_values = node_type if isinstance(node_type, list) else [node_type]
        if any(str(t).lower() == "product" for t in type_values if t is not None):
            products.append(node)

        collect(node.get("@graph"))
        collect(node.get("itemListElement"))

    scripts = soup.find_all("script", attrs={"type": "application/ld+json"})
    for script in scripts:
        raw = (script.string or script.text or "").strip()
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except Exception:
            continue
        collect(payload)

    return products


def _looks_like_product_link(url: str) -> bool:
    path = (urlparse(url).path or "").lower()
    if any(marker in path for marker in ("cart", "checkout", "account", "login", "register")):
        return False
    return any(marker in path for marker in ("product", "item", "album", "record", "vinyl", "lp"))


def _product_key(store_id: str, product_url: str, album: str) -> str:
    base = product_url or album
    digest = hashlib.sha256(f"{store_id}:{base}".encode("utf-8")).hexdigest()
    return digest[:24]


def _parse_jsonld_records(
    store: StoreConfig,
    page: FetchedPage,
    query_terms: list[str],
    require_query_match: bool,
) -> list[ParsedRecord]:
    soup = BeautifulSoup(page.html, "html.parser")
    rows: list[ParsedRecord] = []

    image_tag = soup.find("meta", attrs={"property": "og:image"}) or soup.find("meta", attrs={"name": "og:image"})
    og_image = image_tag.get("content") if image_tag else None

    for product in _extract_jsonld_products(soup):
        title = _first_string(product.get("name"))
        if not title or not _looks_like_real_title(title):
            continue
        if require_query_match and not _query_matches(title, query_terms):
            continue

        offers = product.get("offers")
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        if not isinstance(offers, dict):
            offers = {}

        product_url = _first_string(product.get("url")) or page.url
        product_url = urljoin(page.url, product_url)
        image = _first_string(product.get("image")) or og_image
        image = urljoin(page.url, image) if image else None

        rows.append(
            ParsedRecord(
                source_key=_product_key(store.id, product_url, title),
                artist=None,
                album=title,
                genre=None,
                year=None,
                store_name=store.store_name,
                price=_parse_price(offers.get("price")),
                currency="ILS",
                format=None,
                condition=None,
                store_url=store.website,
                product_url=product_url,
                cover_url=image,
            )
        )

    return rows


def _parse_anchor_fallback(
    store: StoreConfig,
    page: FetchedPage,
    query_terms: list[str],
    require_query_match: bool,
) -> list[ParsedRecord]:
    soup = BeautifulSoup(page.html, "html.parser")
    rows: list[ParsedRecord] = []

    for anchor in soup.find_all("a", href=True):
        href = urljoin(page.url, anchor["href"])
        text = anchor.get_text(" ", strip=True)
        if not _looks_like_product_link(href):
            continue
        if not _looks_like_real_title(text):
            continue
        if require_query_match and not _query_matches(f"{text} {href}", query_terms):
            continue

        rows.append(
            ParsedRecord(
                source_key=_product_key(store.id, href, text),
                artist=None,
                album=text,
                genre=None,
                year=None,
                store_name=store.store_name,
                price="",
                currency="ILS",
                format=None,
                condition=None,
                store_url=store.website,
                product_url=href,
                cover_url=None,
            )
        )

    return rows


def parse_store_pages(
    store: StoreConfig,
    pages: list[FetchedPage],
    query_terms: list[str],
    require_query_match: bool = False,
) -> list[dict[str, Any]]:
    collected: list[ParsedRecord] = []

    for page in pages:
        collected.extend(_parse_jsonld_records(store, page, query_terms, require_query_match))

    for page in pages:
        collected.extend(_parse_anchor_fallback(store, page, query_terms, require_query_match))

    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in collected:
        key = row.source_key
        if key in seen:
            continue
        seen.add(key)
        deduped.append(
            {
                "artist": row.artist or "",
                "album": row.album,
                "genre": row.genre or "",
                "year": row.year or "",
                "store_name": row.store_name,
                "price": row.price or "",
                "currency": row.currency or "ILS",
                "format": row.format or "",
                "condition": row.condition or "",
                "store_url": row.store_url,
                "product_url": row.product_url,
                "cover_url": row.cover_url or "",
            }
        )

    return deduped
