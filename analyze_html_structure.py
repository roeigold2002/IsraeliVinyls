#!/usr/bin/env python3
from bs4 import BeautifulSoup

# Read the HTML and look for products
with open('beatnik_pages/page_0002.html', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

soup = BeautifulSoup(content, 'html.parser')

# Look for product containers
print('=== Trying different selectors ===\n')

selectors = [
    'ul.products li',
    'div.product',
    'article.product',
    '.woocommerce-LoopProduct-link',
    'div.postid-',
    'li.product',
    '.product-item',
]

for selector in selectors:
    elements = soup.select(selector)
    if elements:
        print(f'✓ Found {len(elements)} with selector: {selector}')
        # Show structure of first one
        first = elements[0]
        print(f'  HTML: {str(first)[:400]}...')
        
        # Try to find title
        title = first.select_one('h2, h3, a')
        if title:
            print(f'  Title element: {title.name} - {title.get_text(strip=True)[:100]}')
        print()

# Also list all unique classes
print('\n=== Scanning all div classes ===')
all_divs = soup.find_all('div', class_=True, limit=50)
classes_found = set()
for div in all_divs:
    for cls in div.get('class', []):
        if 'product' in cls.lower or 'item' in cls.lower:
            classes_found.add(cls)

for cls in sorted(classes_found):
    print(f'  {cls}')
