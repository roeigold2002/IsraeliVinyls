#!/usr/bin/env python3
"""Discover catalog URLs from Israeli vinyl stores."""

import requests
from bs4 import BeautifulSoup
import re
from urllib.parse import urljoin

stores = {
    "האוזן השלישית": "https://www.third-ear.com/",
    "ביטניק": "https://www.beatnik.co.il/",
    "שבלול תקליטים": "https://shabloolrecords.co.il/",
    "דיסק סנטר": "https://www.disccenter.co.il/",
    "התו השמיני": "https://www.tav8.co.il/",
    "גיורא תקליטים": "https://www.giorarecords.co.il/",
    "בית התקליט": "https://www.taklithouse.com/",
    "הסיבוב": "https://hasivoov.co.il/",
    "דה ויניל רום": "https://thevinylroom.co.il/",
    "התקליטים שלי": "https://www.my-records.co.il/",
    "וינילסטוק": "https://www.vinylstock.co.il/",
    "רולינג דייס": "https://www.rollindise.com/"
}

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

print("Analyzing store structures to find catalog links...\n")
print("=" * 80)

for name, url in stores.items():
    try:
        response = requests.get(url, headers=headers, timeout=5)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Find all links with shop/products/catalog/vinyl keywords
        relevant_links = set()
        for link in soup.find_all('a', href=True):
            href = link.get('href', '').lower()
            if any(keyword in href for keyword in ['shop', 'products', 'catalog', 'vinyl', 'records', 'category']):
                full_url = urljoin(url, link['href'])
                relevant_links.add(full_url)
        
        print(f"\n🎵 {name}")
        print(f"   URL: {url}")
        
        if relevant_links:
            print(f"   Found {len(relevant_links)} potential catalog links:")
            for i, link in enumerate(sorted(relevant_links)[:3], 1):
                print(f"     {i}. {link}")
        else:
            print(f"   ⚠️  No obvious catalog links found - may need manual navigation")
            
    except Exception as e:
        print(f"\n❌ {name}")
        print(f"   Error: {str(e)[:100]}")

print("\n" + "=" * 80)
print("\nPlease verify which URL is the correct product catalog for each store.")
