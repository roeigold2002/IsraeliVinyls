#!/usr/bin/env python3
"""Canonical ingestion registry for all supported vinyl stores."""

from __future__ import annotations

from dataclasses import dataclass, field

DEFAULT_SEARCH_TEMPLATES = (
    "/?post_type=product&s={query}",
    "/?s={query}&post_type=product",
    "/?s={query}",
    "/search?q={query}",
)

DEFAULT_QUERY_SEEDS = (
    "vinyl",
    "lp",
    "record",
    "תקליט",
)

DEFAULT_CATEGORY_PATHS = (
    "/shop/",
    "/store/",
    "/records/",
    "/vinyl/",
    "/lp/",
    "/product-category/vinyl/",
    "/product-category/%D7%AA%D7%A7%D7%9C%D7%99%D7%98%D7%99%D7%9D/",
)


@dataclass(frozen=True)
class StoreConfig:
    id: str
    store_name: str
    website: str
    search_templates: tuple[str, ...] = field(default_factory=lambda: DEFAULT_SEARCH_TEMPLATES)
    query_seeds: tuple[str, ...] = field(default_factory=lambda: DEFAULT_QUERY_SEEDS)
    category_paths: tuple[str, ...] = field(default_factory=lambda: DEFAULT_CATEGORY_PATHS)
    aliases: tuple[str, ...] = field(default_factory=tuple)
    use_browser_fallback: bool = True
    use_proxy_fallback: bool = True
    enabled: bool = True
    connectivity_note: str = ""


STORE_CONFIGS: tuple[StoreConfig, ...] = (
    StoreConfig(
        id="beatnik",
        store_name="Beatnik",
        website="https://www.beatnik.co.il/",
        search_templates=(
            "/product/?s={query}",
            "/shop/?s={query}",
            "/?post_type=product&s={query}",
            "/search?q={query}",
        ),
    ),
    StoreConfig(
        id="giora_records",
        store_name="Giora",
        website="https://www.giorarecords.co.il/",
        connectivity_note="Previously blocked — re-enabled for scrape attempt",
    ),
    StoreConfig(
        id="tav8",
        store_name="Tav8",
        website="https://www.tav8.co.il/",
        search_templates=(
            "/?search={query}",
            "/search?q={query}",
            "/?s={query}",
        ),
    ),
    StoreConfig(
        id="the_vinyl_room",
        store_name="The Vinyl Room",
        website="https://thevinylroom.co.il/",
        search_templates=(
            "/?search={query}",
            "/search?q={query}",
            "/?s={query}",
        ),
    ),
    StoreConfig(
        id="rockstore_1970",
        store_name="Rock Store 1970",
        website="https://rockstore1970.co.il/",
        search_templates=(
            "/?search={query}",
            "/search?q={query}",
            "/?s={query}",
        ),
    ),
    StoreConfig(
        id="third_ear",
        store_name="Third Ear",
        website="https://third-ear.com/",
        connectivity_note="Previously blocked — re-enabled for scrape attempt",
    ),
    StoreConfig(
        id="hod_hamahat",
        store_name="Hod Hamahat",
        website="https://hodhamahat.com/",
    ),
    StoreConfig(
        id="holit_records",
        store_name="Holit Records",
        website="https://holit-records.co.il/",
    ),
    StoreConfig(
        id="disc_center",
        store_name="Disc Center",
        website="https://www.disccenter.co.il/",
        connectivity_note="Previously blocked — re-enabled for scrape attempt",
    ),
    StoreConfig(
        id="taklit_house",
        store_name="Taklit House",
        website="https://www.taklithouse.com/",
    ),
    StoreConfig(
        id="shablool",
        store_name="Shablool",
        website="https://shabloolrecords.co.il/",
        connectivity_note="Previously blocked — re-enabled for scrape attempt",
    ),
    StoreConfig(
        id="bside_haifa",
        store_name="B-Side Haifa",
        website="https://www.bsidehaifa.co.il/",
    ),
    StoreConfig(
        id="vinyl_stock",
        store_name="Vinyl Stock",
        website="https://www.vinylstock.co.il/",
    ),
    StoreConfig(
        id="vinylia_records",
        store_name="Vinylia Records",
        website="https://vinyliarecords.co.il/",
    ),
    StoreConfig(
        id="transistore",
        store_name="Transistore",
        website="https://transistore.co.il/",
    ),
    StoreConfig(
        id="my_records",
        store_name="My Records",
        website="https://www.my-records.co.il/",
        connectivity_note="Previously blocked — re-enabled for scrape attempt",
    ),
    StoreConfig(
        id="rolling_dise",
        store_name="Rolling Dise",
        website="https://www.rollindise.com/",
    ),
    StoreConfig(
        id="hasivoov",
        store_name="HaSivoov",
        website="https://hasivoov.co.il/",
        connectivity_note="Previously blocked — re-enabled for scrape attempt",
    ),
    StoreConfig(
        id="h2shop",
        store_name="H2Shop",
        website="https://h2shop.co.il/",
        search_templates=(
            "/product-category/%D7%AA%D7%A7%D7%9C%D7%99%D7%98%D7%99%D7%9D/?s={query}",
            "/?s={query}&post_type=product",
            "/search?q={query}",
        ),
    ),
)

STORE_BY_ID = {store.id: store for store in STORE_CONFIGS}
STORE_NAME_SET = {store.store_name for store in STORE_CONFIGS}


def get_all_stores() -> tuple[StoreConfig, ...]:
    return STORE_CONFIGS


def get_store_by_id(store_id: str) -> StoreConfig | None:
    return STORE_BY_ID.get(store_id)
