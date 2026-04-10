from bs4 import BeautifulSoup
import os

print("="*70)
print("SHABLOOL - Finding title extraction method")
print("="*70)
if os.path.exists('shablool_pages/page_1.html'):
    with open('shablool_pages/page_1.html', 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    
    products = soup.select('.product-box, .entry.product')
    if products:
        p = products[0]
        print("First product HTML:")
        print(str(p)[:1000])
        print("\n...")
        
        # Find anchor
        anchor = p.select_one('a')
        if anchor:
            print(f"\nFound anchor: {anchor.text[:50]}")
            print(f"  href: {anchor.get('href')}")

print("\n" + "="*70)
print("ROLLINDICE - Checking if JSON or HTML")
print("="*70)
if os.path.exists('rollindice_pages/page_1.html'):
    with open('rollindice_pages/page_1.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    # Check for JSON
    if '"products"' in html or 'json' in html.lower():
        print("Found JSON data in HTML")
        start = html.find('{')
        if start > 0:
            print(f"JSON starts at position {start}")
            print(html[start:start+200])
    
    # Check product structure
    soup = BeautifulSoup(html, 'html.parser')
    cards = soup.select('[class*="product-card"]')
    if cards:
        print(f"\nFound {len(cards)} product cards")
        print("First card HTML:")
        print(str(cards[0])[:500])

print("\n" + "="*70)
print("TAKLITHOUSE - Product structure")
print("="*70)
if os.path.exists('taklithouse_pages/page_1.html'):
    with open('taklithouse_pages/page_1.html', 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    
    # Look for product containers
    main = soup.find('main') or soup.find('[role="main"]')
    if main:
        items = main.select('*[data-id], *[data-product], .product, li, .item')
        print(f"Found {len(items)} potential product items in main")
        
        # Show structure
        if items:
            print("First item:")
            print(str(items[0])[:500])
