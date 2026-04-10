#!/usr/bin/env python3
"""Save HTML to file to inspect directly."""

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import time

def get_selenium_driver():
    chrome_options = Options()
    chrome_options.add_argument("--start-maximized")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    driver.set_page_load_timeout(15)
    return driver

def save_html(name, url, output_file):
    """Save rendered HTML to file."""
    print(f"Fetching {name}...")
    try:
        driver = get_selenium_driver()
        driver.get(url)
        time.sleep(3)
        
        # Scroll to load more content
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(2)
        
        html = driver.page_source
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(html)
        
        print(f"✅ Saved {len(html)} bytes to {output_file}")
        driver.quit()
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

# Save HTML for each store
save_html("Third Ear", "https://third-ear.com/product-category/vinyls/jsf/epro-archive-products/pagenum/1/", "third_ear_page.html")
save_html("Beatnik", "https://www.beatnik.co.il/online-store/page/2/", "beatnik_page.html")
save_html("Shablool", "https://shabloolrecords.co.il/shop/page/1/", "shablool_page.html")
