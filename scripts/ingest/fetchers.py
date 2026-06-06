#!/usr/bin/env python3
"""HTTP/Playwright/proxy fetch layer for store ingestion with deep crawling."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import os
import re
from typing import Callable, Iterable
from urllib.parse import parse_qsl, quote, urlencode, urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

from scripts.store_registry import StoreConfig

DEFAULT_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9,he;q=0.8",
}

DEFAULT_MAX_PAGES_PER_STORE = 5000
DEFAULT_MAX_CRAWL_DEPTH = 2
DEFAULT_MAX_LINKS_PER_PAGE = 60
DEFAULT_MAX_QUEUE_SIZE_FACTOR = 6

TRACKING_QUERY_KEYS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
}

EXCLUDED_PATH_MARKERS = {
    "/cart",
    "/checkout",
    "/account",
    "/wishlist",
    "/login",
    "/register",
    "/wp-admin",
    "/my-account",
}

FOLLOW_PATH_MARKERS = {
    "product",
    "products",
    "product-category",
    "category",
    "shop",
    "catalog",
    "collection",
    "record",
    "records",
    "vinyl",
    "album",
    "lp",
    "page",
}

FOLLOW_TEXT_MARKERS = {
    "next",
    "older",
    "more",
    "pagination",
    "page",
    "עמוד",
    "הבא",
    "עוד",
}


@dataclass
class FetchedPage:
    url: str
    html: str
    status_code: int
    source: str


@dataclass
class FetchResult:
    pages: list[FetchedPage]
    mode: str
    errors: list[str]


def _strip_tracking_query(url: str) -> str:
    parsed = urlparse(url)
    query = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k not in TRACKING_QUERY_KEYS]
    clean_query = urlencode(query)
    normalized_path = parsed.path or "/"
    if normalized_path != "/" and normalized_path.endswith("/"):
        normalized_path = normalized_path.rstrip("/")
    return urlunparse((parsed.scheme, parsed.netloc, normalized_path, "", clean_query, ""))


def _same_host(left_url: str, right_url: str) -> bool:
    left_host = (urlparse(left_url).hostname or "").lower().removeprefix("www.")
    right_host = (urlparse(right_url).hostname or "").lower().removeprefix("www.")
    return bool(left_host and right_host and left_host == right_host)


def _is_excluded_path(path: str) -> bool:
    lowered = path.lower()
    return any(marker in lowered for marker in EXCLUDED_PATH_MARKERS)


def _looks_followable(url: str, text: str, rel: str, class_name: str) -> bool:
    parsed = urlparse(url)
    path = (parsed.path or "").lower()
    query = (parsed.query or "").lower()
    text_lower = (text or "").lower()
    rel_lower = (rel or "").lower()
    class_lower = (class_name or "").lower()

    if not path:
        return False
    if _is_excluded_path(path):
        return False

    if any(marker in rel_lower for marker in ("next", "prev")):
        return True
    if any(marker in class_lower for marker in ("next", "prev", "pagination", "pager", "page-numbers")):
        return True
    if any(marker in text_lower for marker in FOLLOW_TEXT_MARKERS):
        return True
    if any(marker in path for marker in FOLLOW_PATH_MARKERS):
        return True
    if any(marker in query for marker in ("page=", "paged=", "pagenumber=", "offset=", "s=")):
        return True
    if re.search(r"/page/\d+", path):
        return True

    return False


def _extract_followup_links(page_url: str, html: str, max_links_per_page: int) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    links: list[str] = []
    seen: set[str] = set()

    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "").strip()
        if not href:
            continue
        absolute = _strip_tracking_query(urljoin(page_url, href))
        parsed = urlparse(absolute)
        if parsed.scheme not in ("http", "https"):
            continue
        if not _same_host(page_url, absolute):
            continue

        text = anchor.get_text(" ", strip=True)
        rel = " ".join(anchor.get("rel") or [])
        class_name = " ".join(anchor.get("class") or [])
        if not _looks_followable(absolute, text, rel, class_name):
            continue

        if absolute in seen:
            continue
        seen.add(absolute)
        links.append(absolute)
        if len(links) >= max_links_per_page:
            break

    return links


def _build_search_urls(store: StoreConfig, query: str) -> list[str]:
    encoded = quote(query or "")
    urls: list[str] = []
    for template in store.search_templates:
        filled = template.replace("{query}", encoded)
        urls.append(_strip_tracking_query(urljoin(store.website, filled)))
    return urls


def _build_seed_urls(store: StoreConfig, query_terms: Iterable[str]) -> list[str]:
    seeds: list[str] = [_strip_tracking_query(store.website)]

    for path in store.category_paths:
        seeds.append(_strip_tracking_query(urljoin(store.website, path)))

    for term in query_terms:
        seeds.extend(_build_search_urls(store, term))

    deduped: list[str] = []
    seen: set[str] = set()
    for seed in seeds:
        if seed in seen:
            continue
        seen.add(seed)
        deduped.append(seed)
    return deduped


_PAGINATION_RE = re.compile(r"/page/\d+", re.IGNORECASE)


def _is_pagination_link(url: str) -> bool:
    parsed = urlparse(url)
    path = parsed.path or ""
    query = (parsed.query or "").lower()
    if _PAGINATION_RE.search(path):
        return True
    if "paged=" in query:
        return True
    if re.search(r"(?<!\w)page=\d", query):
        return True
    return False


def _proxy_options(proxy_url: str | None) -> dict[str, str] | None:
    if not proxy_url:
        return None
    return {"http": proxy_url, "https": proxy_url}


def _crawl_urls(
    seed_urls: Iterable[str],
    fetch_one: Callable[[str], tuple[FetchedPage | None, str | None]],
    max_pages: int,
    max_depth: int,
    max_links_per_page: int,
) -> tuple[list[FetchedPage], list[str]]:
    pages: list[FetchedPage] = []
    errors: list[str] = []
    seen: set[str] = set()
    queue: deque[tuple[str, int]] = deque((url, 0) for url in seed_urls)
    max_queue_size = max_pages * DEFAULT_MAX_QUEUE_SIZE_FACTOR

    while queue and len(pages) < max_pages:
        url, depth = queue.popleft()
        normalized = _strip_tracking_query(url)
        if normalized in seen:
            continue
        seen.add(normalized)

        page, error = fetch_one(normalized)
        if error:
            errors.append(error)
        if not page:
            continue

        pages.append(page)

        if depth >= max_depth:
            continue

        for link in _extract_followup_links(page.url, page.html, max_links_per_page=max_links_per_page):
            if link in seen:
                continue
            if len(queue) >= max_queue_size:
                break
            # Pagination links keep current depth so chains follow to completion
            link_depth = depth if _is_pagination_link(link) else depth + 1
            queue.append((link, link_depth))

    return pages, errors


def _fetch_http_page(url: str, timeout_seconds: int, proxy_url: str | None = None) -> tuple[FetchedPage | None, str | None]:
    proxies = _proxy_options(proxy_url)
    try:
        response = requests.get(url, headers=DEFAULT_HEADERS, timeout=timeout_seconds, proxies=proxies)
        if response.status_code >= 400:
            return None, f"HTTP {response.status_code} for {url}"
        if "text/html" not in (response.headers.get("content-type") or "").lower():
            return None, f"Non-HTML response for {url}"
        source = "http" if not proxy_url else "proxy"
        return FetchedPage(url=url, html=response.text, status_code=response.status_code, source=source), None
    except Exception as exc:
        return None, f"Request failed for {url}: {exc}"


def _crawl_http(
    seed_urls: Iterable[str],
    timeout_seconds: int,
    max_pages: int,
    max_depth: int,
    max_links_per_page: int,
    proxy_url: str | None = None,
) -> tuple[list[FetchedPage], list[str]]:
    return _crawl_urls(
        seed_urls=seed_urls,
        fetch_one=lambda url: _fetch_http_page(url, timeout_seconds, proxy_url=proxy_url),
        max_pages=max_pages,
        max_depth=max_depth,
        max_links_per_page=max_links_per_page,
    )


def _crawl_with_playwright(
    seed_urls: Iterable[str],
    timeout_seconds: int,
    max_pages: int,
    max_depth: int,
    max_links_per_page: int,
    proxy_url: str | None = None,
) -> tuple[list[FetchedPage], list[str]]:
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return [], ["Playwright is not installed; skipping browser fallback"]

    errors: list[str] = []

    try:
        with sync_playwright() as playwright:
            launch_args: dict[str, object] = {"headless": True}
            if proxy_url:
                launch_args["proxy"] = {"server": proxy_url}

            browser = playwright.chromium.launch(**launch_args)
            context = browser.new_context(user_agent=DEFAULT_HEADERS["user-agent"])

            def fetch_one(url: str) -> tuple[FetchedPage | None, str | None]:
                page = context.new_page()
                try:
                    response = page.goto(url, wait_until="domcontentloaded", timeout=timeout_seconds * 1000)
                    status_code = response.status if response else 0
                    if status_code >= 400:
                        return None, f"Browser HTTP {status_code} for {url}"
                    html = page.content()
                    if "<html" not in html.lower():
                        return None, f"Browser received non-HTML content for {url}"
                    source = "browser" if not proxy_url else "browser-proxy"
                    return FetchedPage(url=url, html=html, status_code=status_code, source=source), None
                except Exception as exc:
                    return None, f"Browser fetch failed for {url}: {exc}"
                finally:
                    page.close()

            pages, crawl_errors = _crawl_urls(
                seed_urls=seed_urls,
                fetch_one=fetch_one,
                max_pages=max_pages,
                max_depth=max_depth,
                max_links_per_page=max_links_per_page,
            )
            errors.extend(crawl_errors)

            context.close()
            browser.close()
            return pages, errors
    except Exception as exc:
        errors.append(f"Playwright bootstrap failed: {exc}")
        return [], errors


def fetch_store_pages(
    store: StoreConfig,
    query_terms: Iterable[str],
    timeout_seconds: int = 10,
    max_pages_per_store: int = DEFAULT_MAX_PAGES_PER_STORE,
    max_crawl_depth: int = DEFAULT_MAX_CRAWL_DEPTH,
) -> FetchResult:
    errors: list[str] = []

    proxy_urls = [p.strip() for p in os.environ.get("INGEST_PROXY_URLS", "").split(",") if p.strip()]

    env_max_pages = int(os.environ.get("INGEST_MAX_PAGES_PER_STORE", str(max_pages_per_store)))
    env_max_depth = int(os.environ.get("INGEST_MAX_CRAWL_DEPTH", str(max_crawl_depth)))
    max_links_per_page = int(os.environ.get("INGEST_MAX_LINKS_PER_PAGE", str(DEFAULT_MAX_LINKS_PER_PAGE)))

    max_pages = max(5, env_max_pages)
    max_depth = max(1, env_max_depth)
    max_links_per_page = max(10, max_links_per_page)

    seed_urls = _build_seed_urls(store, query_terms)

    http_pages, http_errors = _crawl_http(
        seed_urls,
        timeout_seconds,
        max_pages=max_pages,
        max_depth=max_depth,
        max_links_per_page=max_links_per_page,
    )
    errors.extend(http_errors)
    if http_pages:
        return FetchResult(pages=http_pages, mode="http-deep", errors=errors)

    if store.use_browser_fallback:
        browser_pages, browser_errors = _crawl_with_playwright(
            seed_urls,
            timeout_seconds,
            max_pages=max_pages,
            max_depth=max_depth,
            max_links_per_page=max_links_per_page,
        )
        errors.extend(browser_errors)
        if browser_pages:
            return FetchResult(pages=browser_pages, mode="browser-deep", errors=errors)

    if store.use_proxy_fallback and proxy_urls:
        for proxy_url in proxy_urls:
            proxy_pages, proxy_errors = _crawl_http(
                seed_urls,
                timeout_seconds,
                max_pages=max_pages,
                max_depth=max_depth,
                max_links_per_page=max_links_per_page,
                proxy_url=proxy_url,
            )
            errors.extend(proxy_errors)
            if proxy_pages:
                return FetchResult(pages=proxy_pages, mode=f"proxy-deep:{proxy_url}", errors=errors)

            if store.use_browser_fallback:
                browser_proxy_pages, browser_proxy_errors = _crawl_with_playwright(
                    seed_urls,
                    timeout_seconds,
                    max_pages=max_pages,
                    max_depth=max_depth,
                    max_links_per_page=max_links_per_page,
                    proxy_url=proxy_url,
                )
                errors.extend(browser_proxy_errors)
                if browser_proxy_pages:
                    return FetchResult(pages=browser_proxy_pages, mode=f"browser-proxy-deep:{proxy_url}", errors=errors)

    return FetchResult(pages=[], mode="failed", errors=errors)
