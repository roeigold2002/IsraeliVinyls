#!/usr/bin/env python3
"""Verify Scrapling is installed and working"""
try:
    import scrapling
    print("Scrapling: INSTALLED")
    from scrapling.fetchers import StealthyFetcher, DynamicFetcher
    print("Fetchers: AVAILABLE")
    print("Status: OK")
except ImportError as e:
    print(f"Error: {e}")
