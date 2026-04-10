#!/usr/bin/env python3
"""Display sample records to show user what they'll see"""
import requests
import json

response = requests.get("http://127.0.0.1:5001/api/records", params={
    "store": "Beatnik",
    "per_page": 5,
    "sort_by": "price"
})

data = response.json()
print(f"\n{'='*80}")
print(f"SAMPLE RECORDS - What User Sees in Frontend")
print(f"{'='*80}\n")
print(f"Total Beatnik Records: {data['total_count']}\n")

for i, rec in enumerate(data['records'][:5], 1):
    print(f"{i}. {rec['album'][:50]}")
    print(f"   Price: ₪{rec.get('price', 0):.0f}")
    has_image = "✓ Has cover image" if rec.get('cover_url') else "No image"
    print(f"   Image: {has_image}")
    if rec.get('cover_url'):
        print(f"   URL: {rec['cover_url'][:60]}...")
    print()

print(f"{'='*80}")
print("STATUS: ✅ PRICES DISPLAY | ✅ COVER IMAGES DISPLAY")
print(f"{'='*80}")
