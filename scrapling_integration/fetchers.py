"""
Fetcher configurations and session management for Scrapling integration.
Handles HTTP requests, stealth mode, browser automation, and proxy rotation.
"""

import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass
from scrapling.fetchers import Fetcher, FetcherSession, StealthyFetcher, StealthySession, DynamicFetcher, DynamicSession

logger = logging.getLogger(__name__)


@dataclass
class FetcherConfig:
    """Configuration for Scrapling fetcher sessions."""
    impersonate: str = "chrome"  # Browser fingerprint: chrome, firefox, safari, edge
    headless: bool = True
    network_idle: bool = True
    timeout: int = 30000  # milliseconds
    stealthy: bool = False  # Use stealth mode (undetectable browser)
    proxy: Optional[str] = None
    disable_images: bool = True  # Faster loading
    user_agent: Optional[str] = None
    delay: float = 1.0  # Delay between requests (seconds)


def create_session(config: FetcherConfig) -> FetcherSession | StealthySession:
    """
    Create a Scrapling session for HTTP requests.
    
    Args:
        config: FetcherConfig with session parameters
        
    Returns:
        FetcherSession or StealthySession depending on config.stealthy
    """
    try:
        if config.stealthy:
            logger.info(f"Creating StealthySession with impersonate={config.impersonate}")
            session = StealthySession(
                impersonate=config.impersonate,
                headless=config.headless,
                proxy=config.proxy,
            )
        else:
            logger.info(f"Creating FetcherSession with impersonate={config.impersonate}")
            session = FetcherSession(
                impersonate=config.impersonate,
                proxy=config.proxy,
            )
        return session
    except Exception as e:
        logger.error(f"Failed to create session: {e}")
        raise


def create_fetcher(url: str, config: FetcherConfig, use_dynamic: bool = False):
    """
    Fetch a URL with appropriate fetcher based on config.
    
    Args:
        url: URL to fetch
        config: FetcherConfig with fetcher parameters
        use_dynamic: Use DynamicFetcher (browser automation) for JS-heavy sites
        
    Returns:
        Parsed page object (Selector)
    """
    try:
        if use_dynamic:
            logger.info(f"Fetching {url} with DynamicFetcher (JS rendering)")
            page = DynamicFetcher.fetch(
                url,
                headless=config.headless,
                network_idle=config.network_idle,
                timeout=config.timeout,
                disable_resources=config.disable_images,
            )
        elif config.stealthy:
            logger.info(f"Fetching {url} with StealthyFetcher (stealth mode)")
            page = StealthyFetcher.fetch(
                url,
                headless=config.headless,
                network_idle=config.network_idle,
                timeout=config.timeout,
                proxy=config.proxy,
                solve_cloudflare=True,
            )
        else:
            logger.info(f"Fetching {url} with Fetcher (HTTP)")
            page = Fetcher.get(url, timeout=config.timeout)
        
        return page
    except Exception as e:
        logger.error(f"Failed to fetch {url}: {e}")
        raise


class ProxyRotator:
    """Rotate through proxy list for request distribution."""
    
    def __init__(self, proxies: list[str]):
        """Initialize with list of proxy URLs."""
        self.proxies = proxies
        self.current_index = 0
    
    def get_next_proxy(self) -> Optional[str]:
        """Get next proxy in rotation."""
        if not self.proxies:
            return None
        proxy = self.proxies[self.current_index]
        self.current_index = (self.current_index + 1) % len(self.proxies)
        return proxy


# Pre-configured fetcher profiles for different store types
FETCHER_PROFILES = {
    "lightweight": FetcherConfig(
        impersonate="chrome",
        headless=True,
        stealthy=False,
        disable_images=True,
        delay=0.5,
    ),
    "stealth": FetcherConfig(
        impersonate="chrome",
        headless=True,
        stealthy=True,
        disable_images=True,
        delay=1.0,
    ),
    "dynamic": FetcherConfig(
        impersonate="chrome",
        headless=True,
        network_idle=True,
        disable_images=False,
        delay=2.0,
    ),
    "aggressive": FetcherConfig(
        impersonate="chrome",
        headless=True,
        stealthy=True,
        network_idle=True,
        disable_images=False,
        delay=3.0,
    ),
}
