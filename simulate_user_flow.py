from app import app
import json

client = app.test_client()

# Step 1: Get search results
print("=== FULL USER FLOW SIMULATION ===\n")
print("Step 1: User searches for 'Beatles'")
response = client.get('/api/search?q=Beatles')
data = response.get_json()

if data and data.get('records'):
    record = data['records'][0]
    print(f"  ✓ API returns record")
    print(f"    - album: {record.get('album')}")
    print(f"    - product_url: {repr(record.get('product_url'))}")
    
    # Step 2: Simulate HTML rendering
    print("\nStep 2: Frontend renders HTML card")
    product_url = record.get('product_url', '')
    html_value = product_url.replace('"', '&quot;')
    print(f"  data-url=\"{html_value}\"")
    
    # Step 3: Simulate JavaScript getting the attribute
    print("\nStep 3: User clicks card")
    print(f"  JavaScript: card.getAttribute('data-url')")
    extracted_url = html_value.replace('&quot;', '"')
    print(f"  Result: {repr(extracted_url)}")
    
    # Step 4: showRecord function
    print("\nStep 4: showRecord() is called")
    if extracted_url and extracted_url != '':
        print(f"  ✓ URL is valid")
        print(f"  window.open('{extracted_url}', '_blank')")
        print(f"\n✅ BROWSER OPENS: {extracted_url}")
    else:
        print(f"  ✗ URL is empty!")
        print(f"  Shows alert instead")
else:
    print("✗ No records found")
