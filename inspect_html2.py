from bs4 import BeautifulSoup
import os
import re

# Check shablool - we found div.product-box
print("="*70)
print("SHABLOOL - Examining product structure")
print("="*70)
if os.path.exists('shablool_pages/page_1.html'):
    with open('shablool_pages/page_1.html', 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    
    # Try to find product boxes
    boxes = soup.select('[class*="product-box"]')
    products = soup.select('.product-box, .entry.product')
    print(f"product-box elements: {len(boxes)}")
    print(f"entry.product elements: {len(products)}")
    
    if products:
        p = products[0]
        # Find title and price
        title = p.select_one('h2, h3, a[rel*=bookmark]')
        price = p.select_one('.price, .woocommerce-Price-amount')
        print(f"\nFirst product:")
        print(f"  Title selector (h2/h3): {bool(title)}")
        print(f"  Price selector: {bool(price)}")
        
        # Try other selectors
        all_h = p.select('h2, h3, h4, h5, h6')
        all_p = p.select('[class*=price]')
        print(f"  All heading tags: {len(all_h)}")
        print(f"  All price-related: {len(all_p)}")

print("\n" + "="*70)
print("ROLLINDICE - Examining product structure")  
print("="*70)
if os.path.exists('rollindice_pages/page_1.html'):
    with open('rollindice_pages/page_1.html', 'r', encoding='utf-8') as f:
        html = f.read()
        soup = BeautifulSoup(html, 'html.parser')
    
    # Find product cards
    cards = soup.select('[class*="product-card"], [class*=productCard]')
    print(f"Product card elements: {len(cards)}")
    
    # Look for grid with products
    grids = soup.select('[class*="product-grid"]')
    print(f"Product grid elements: {len(grids)}")
    
    if grids:
        grid = grids[0]
        # Find items within grid
        items = grid.select('[class*="product"], [class*="card"], li, div[data-id]')
        print(f"Items in first grid: {len(items)}")

print("\n" + "="*70)
print("TAKLITHOUSE - Examining product structure")
print("="*70)
if os.path.exists('taklithouse_pages/page_1.html'):
    with open('taklithouse_pages/page_1.html', 'r', encoding='utf-8') as f:
        html = f.read()
        soup = BeautifulSoup(html, 'html.parser')
    
    # Look for any container with product info
    containers = soup.select('[class*="item"], [class*="product"], main, [class*="grid"]')
    print(f"Potential containers: {len(containers)}")
    
    # Check if empty response or redirect
    if 'product' in html.lower() and len(soup.get_text(strip=True)) > 100:
        print("HTML contains product content")
    else:
        print("WARNING: HTML might be empty or redirect!")
        print(f"Text length: {len(soup.get_text(strip=True))}")
