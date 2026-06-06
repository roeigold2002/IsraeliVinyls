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

# Promotional badge text that appears nested inside anchor elements on some stores
_PROMO_PREFIX_RE = re.compile(
    r"^(?:מחיר\s+אונליין|מחיר\s+online|מחיר\s*:)\s*",
    re.IGNORECASE | re.UNICODE,
)

# Separators used between artist and album in product titles (em-dash first, then plain hyphen)
_ARTIST_SEP_RE = re.compile(r"\s*[–—]\s*", re.UNICODE)
_ARTIST_SEP_HYPHEN_RE = re.compile(r"\s+-\s+", re.UNICODE)
# Format/edition suffixes to strip from album part
_FORMAT_SUFFIX_RE = re.compile(
    r"\s+(?:\d{1,2}[xX]?)?"
    r"(?:LP|2LP|3LP|4LP|EP|CD|DVD|7\"|10\"|12\"|Single|Vinyl|Box\s*Set|Deluxe|Remaster(?:ed)?|"
    r"Limited|Edition|Reissue|Colored?\s*Vinyl)\b.*$",
    re.IGNORECASE,
)


def _split_artist_album(title: str) -> tuple[str | None, str]:
    """Try to separate 'Artist – Album' into (artist, album). Returns (None, title) on failure."""
    for sep_re in (_ARTIST_SEP_RE, _ARTIST_SEP_HYPHEN_RE):
        parts = sep_re.split(title, maxsplit=1)
        if len(parts) == 2:
            artist_part, album_part = parts[0].strip(), parts[1].strip()
            if not artist_part or not album_part:
                continue
            word_count = len(artist_part.split())
            # Heuristic: artist part should be 1–5 words, no price markers, not all-caps format token
            if word_count <= 5 and "₪" not in artist_part and not artist_part.isupper():
                album_clean = _FORMAT_SUFFIX_RE.sub("", album_part).strip() or album_part
                return artist_part, album_clean
    # No clear separator — still try to strip trailing format suffix
    album_clean = _FORMAT_SUFFIX_RE.sub("", title).strip() or title
    return None, album_clean


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
    in_stock: bool | None = None


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
    if re.search(r"\.(aspx|php|html?|jsp|cfm)(\?|$)", lowered):
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
    # Reject category/listing pages (e.g. store-products.aspx, products.aspx?catId=...)
    _filename = path.rsplit("/", 1)[-1] if "/" in path else path
    if re.search(r"\.(aspx|php|html?|jsp|cfm)(\?|$)", _filename) and re.search(
        r"(?:^|[-_])products?(?:[-_.]|$)|catalog|categor|listing|browse", _filename
    ):
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
        if "#" in product_url:
            product_url = product_url[: product_url.index("#")]
        image = _first_string(product.get("image")) or og_image
        image = urljoin(page.url, image) if image else None

        artist_parsed, album_parsed = _split_artist_album(title)

        # Genre: try JSON-LD fields first
        genre_raw = (
            _first_string(product.get("genre"))
            or _first_string(product.get("musicGenre"))
            or None
        )
        genre = genre_raw.strip() if genre_raw else None

        # Year: parse from releaseDate or datePublished
        year_raw = (
            _first_string(product.get("releaseDate"))
            or _first_string(product.get("datePublished"))
            or None
        )
        year: str | None = None
        if year_raw:
            year_str = str(year_raw)[:4]
            if year_str.isdigit() and 1900 <= int(year_str) <= 2100:
                year = year_str

        # Stock: parse offers.availability (schema.org)
        availability = str(offers.get("availability") or "").lower()
        in_stock: bool | None = None
        if "instock" in availability or "instoreonly" in availability or "onlineonly" in availability:
            in_stock = True
        elif "outofstock" in availability or "discontinued" in availability or "soldout" in availability:
            in_stock = False

        rows.append(
            ParsedRecord(
                source_key=_product_key(store.id, product_url, title),
                artist=artist_parsed,
                album=album_parsed,
                genre=genre,
                year=year,
                store_name=store.store_name,
                price=_parse_price(offers.get("price")),
                currency="ILS",
                format=None,
                condition=None,
                store_url=store.website,
                product_url=product_url,
                cover_url=image,
                in_stock=in_stock,
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
        if "#" in href:
            href = href[: href.index("#")]
        text = _PROMO_PREFIX_RE.sub("", anchor.get_text(" ", strip=True)).strip()
        if not _looks_like_product_link(href):
            continue
        if not _looks_like_real_title(text):
            continue
        if require_query_match and not _query_matches(f"{text} {href}", query_terms):
            continue

        # Try to find a cover image inside or near the anchor element
        img_tag = anchor.find("img")
        if img_tag is None:
            parent = anchor.parent
            img_tag = parent.find("img") if parent else None
        cover_url: str | None = None
        if img_tag:
            raw_src = img_tag.get("src") or img_tag.get("data-src") or img_tag.get("data-lazy-src")
            if raw_src:
                abs_src = urljoin(page.url, str(raw_src))
                if abs_src.startswith("http"):
                    cover_url = abs_src

        artist_parsed, album_parsed = _split_artist_album(text)

        rows.append(
            ParsedRecord(
                source_key=_product_key(store.id, href, text),
                artist=artist_parsed,
                album=album_parsed,
                genre=None,
                year=None,
                store_name=store.store_name,
                price="",
                currency="ILS",
                format=None,
                condition=None,
                store_url=store.website,
                product_url=href,
                cover_url=cover_url,
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
                "in_stock": row.in_stock,
            }
        )

    return deduped
