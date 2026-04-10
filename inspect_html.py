from bs4 import BeautifulSoup
import os

# Check shablool - we found div.product with 16 elements
print("="*70)
print("SHABLOOL - Examining div.product structure")
print("="*70)
if os.path.exists('shablool_pages/page_1.html'):
    with open('shablool_pages/page_1.html', 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    
    products = soup.select('div.product')
    print(f"Found {len(products)} div.product elements\n")
    if products:
        p = products[0]
        print("First product HTML structure:")
        print(str(p)[:500])
        print("\n\nChild elements:")
        for child in p.children:
            if hasattr(child, 'name') and child.name:
                print(f"  - <{child.name}> {child.get('class', [])}")

print("\n" + "="*70)
print("ROLLINDICE - Looking for ANY product elements")
print("="*70)
if os.path.exists('rollindice_pages/page_1.html'):
    with open('rollindice_pages/page_1.html', 'r', encoding='utf-8') as f:
        html = f.read()
        soup = BeautifulSoup(html, 'html.parser')
    
    # Check file size
    print(f"File size: {len(html)} bytes")
    print(f"HTML length: {len(soup.get_text())}")
    
    # Look for any class containing 'product'
    import re
    classes = re.findall(r'class="([^"]*product[^"]*)"', html, re.IGNORECASE)
    print(f"\nClasses containing 'product': {set(classes)}")
    
    # Look for data attributes
    data_attrs = re.findall(r'data-[a-z-]*=["\']([^"\']*)["\']', html)
    print(f"Unique data attributes: {set(data_attrs)[:5]}")

print("\n" + "="*70)
print("TAKLITHOUSE - Looking for ANY product elements")
print("="*70)
if os.path.exists('taklithouse_pages/page_1.html'):
    with open('taklithouse_pages/page_1.html', 'r', encoding='utf-8') as f:
        html = f.read()
        soup = BeautifulSoup(html, 'html.parser')
    
    print(f"File size: {len(html)} bytes")
    print(f"HTML content length: {len(soup.get_text())}")
    
    # Look for any class containing 'product'
    import re
    classes = re.findall(r'class="([^"]*product[^"]*)"', html, re.IGNORECASE)
    print(f"Classes containing 'product': {set(classes)}")
    classes = re.findall(r'class="([^"]*item[^"]*)"', html, re.IGNORECASE)
    print(f"Classes containing 'item': {set(classes)}")
