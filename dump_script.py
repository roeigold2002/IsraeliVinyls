import requests
import re

r = requests.get('http://localhost:5001/', timeout=5)

# Extract the script content
match = re.search(r'<script>\n(.*?)</script>', r.text, re.DOTALL)

if match:
    script = match.group(1)
    print(f"Script length: {len(script)}\n")
    
    # Show first 1000 chars
    print("First 1000 characters:")
    print("=" * 60)
    print(script[:1000])
    
    print("\n\n... SKIPPED ...\n\n")
    
    # Show last 500 chars
    print("Last 500 characters:")
    print("=" * 60)
    print(script[-500:])
    
    # Check key functions
    print("\n\n Key functions:")
    print(f"doSearch: {'doSearch' in script}")
    print(f"showRecord: {'showRecord' in script}")
    print(f"const STATE: {'const STATE' in script}")
    
else:
    print("No <script> tag found")
