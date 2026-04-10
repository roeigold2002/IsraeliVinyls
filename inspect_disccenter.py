#!/usr/bin/env python3
"""
Inspect Disccenter HTML structure
"""

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup
import time

options = Options()
options.add_argument('--headless')
options.add_argument('--no-sandbox')

driver = webdriver.Chrome(options=options)

print("Inspecting Disccenter structure...")
driver.get('https://www.disccenter.co.il/sale/1')
time.sleep(3)

soup = BeautifulSoup(driver.page_source, 'html.parser')

# Save HTML for inspection
with open('disccenter_sample.html', 'w', encoding='utf-8') as f:
    f.write(soup.prettify()[:50000])

# Find all div classes
divs = soup.find_all('div', limit=20)
print(f"\nFirst 20 divs:")
for div in divs:
    classes = div.get('class', [])
    content = div.get_text(strip=True)[:50] if div.get_text(strip=True) else ''
    print(f"  Classes: {classes} | Content: {content}")

# Look for product patterns
print("\n\nLooking for product-like elements...")
for elem in soup.find_all(['div', 'article', 'li'], limit=50):
    text = elem.get_text(strip=True)
    if len(text) > 10 and any(word in text.lower() for word in ['cd', 'album', 'vinyl', 'music']):
        print(f"  Found: {text[:100]}")
        print(f"    Tag: {elem.name}, Classes: {elem.get('class', [])}")

driver.quit()
print("\nHTML saved to disccenter_sample.html")
