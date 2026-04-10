from bs4 import BeautifulSoup
import os

print("="*70)
print("SHABLOOL - Finding PRODUCT TITLE (not add-to-cart button)")
print("="*70)
if os.path.exists('shablool_pages/page_1.html'):
    with open('shablool_pages/page_1.html', 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    
    products = soup.select('.product-box, .entry.product')
    if products:
        p = products[0]
        
        # Get all anchors
        anchors = p.select('a')
        print(f"Found {len(anchors)} anchors in first product:")
        for i, a in enumerate(anchors[:5]):
            link_text = a.get_text(strip=True)[:50]
            href = a.get('href', '')[:60]
            print(f"  {i}: '{link_text}' → {href}")
        
        # Check if title is in data attributes
        print(f"\nData attributes in product container:")
        for key, value in p.attrs.items():
            if key.startswith('data-'):
                print(f"  {key}: {str(value)[:60]}")

print("\n" + "="*70)
print("ROLLINDICE - Product data structure")
print("="*70)
if os.path.exists('rollindice_pages/page_1.html'):
    with open('rollindice_pages/page_1.html', 'r', encoding='utf-8') as f:
        html = f.read()
        soup = BeautifulSoup(html, 'html.parser')
    
    # Get first product card
    cards = soup.select('[class*="product-card"]')
    if cards:
        card = cards[0]
        
        # Check data attributes
        print("Data attributes on product card:")
        for key, value in card.attrs.items():
            print(f"  {key}: {str(value)[:100]}")
        
        # Check for text content that looks like product name
        text_content = card.get_text(strip=True)
        print(f"\nText content (first 200 chars):")
        print(f"  {text_content[:200]}")
        
        # Check for price patterns
        if '₪' in card.get_text() or '$' in card.get_text() or '€' in card.get_text():
            print("\nFound price symbol in card text")

print("\n" + "="*70)
print("TAKLITHOUSE - Check page type")
print("="*70)
if os.path.exists('taklithouse_pages/page_1.html'):
    with open('taklithouse_pages/page_1.html', 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    
    text = soup.get_text(strip=True)
    # Look for product-related text
    import re
    prices = re.findall(r'[\₪$€]\s*[\d,]+', text)
    product_words = re.findall(r'(product|item|תקליט|vinyl|album|record)', text, re.IGNORECASE)
    
    print(f"Found {len(prices)} price-like patterns")
    print(f"Found {len(product_words)} product-related words")
    
    if len(prices) > 0:
        print(f"Sample prices: {prices[:3]}")
