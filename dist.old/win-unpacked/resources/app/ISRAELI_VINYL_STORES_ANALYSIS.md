# HTML Structure Analysis: 12 Israeli Vinyl Record Store Websites

**Analysis Date:** March 29, 2026  
**Purpose:** Web scraping preparation - Identify selectors, structure, and platform types

---

## 1. Rollin' Dise (https://www.rollindise.com/)

**Site Name:** רולינג דייס (Rollin' Dise)

**Platform/Technology:** **Shopify**
- Footer confirms: "מופעל על ידי Shopify" (Powered by Shopify)
- Uses Shopify's standard liquid template structure
- CDN: `cdn.shop/files/`

**Product Container Selectors:**
- Product cards are displayed in grid layouts within sections
- Each product appears as distinct list item with link structure
- Product URLs follow pattern: `/products/{product-slug}`

**Product Data Selectors:**
```
Artist/Album: In product title (link text)
Example: "Harry Styles - Kiss All The Time. Disco, Occasionally. (Blue LP)"

Price: Displayed after title as "₪180.00" format
Image: From /cdn/shop/files/{filename}.png?v={timestamp}&width=360
Link: /products/{product-slug}
Stock Status: Text "לא במלאי" (out of stock) or "הזמנה מוקדמת" (pre-order)
```

**Pagination/Catalog Approach:**
- Homepage showcases multiple curated sections with carousel indicators
- Each section (e.g., "ROLLIN' HITS", "Hot 2 Go!", "Exclusive & Limited") has
  - Carousel view showing 4-6 products at a time
  - "View all products in collection" links: `/collections/{collection-name}`
- Collections accessible via URL pattern: `/collections/{category-name}`

**HTML Structure Pattern:**
```
Section → Product Grid/Carousel
├─ Product Card (with image, title, price, link)
├─ Stock status badge
└─ "Add to cart" button
```

**Anti-Scraping Measures:**
- Standard Shopify rate limiting
- No visible robots.txt restrictions noted in fetched content
- Client-side JavaScript rendering for dynamic content

**Special Considerations:**
- Has WhatsApp integration for customer contact
- Multiple vendor support visible in product data
- Heavy use of Hebrew language with right-to-left layout

---

## 2. Giora Records (https://www.giorarecords.co.il/)

**Site Name:** חנות התקליטים הוותיקה בישראל - ג'יורא (Giora - The Oldest Record Store)

**Platform/Technology:** **WordPress with WooCommerce**
- Standard WooCommerce product structure
- Product URLs: `/product/{product-slug}/`
- Taxonomy: `/product-category/{category-slug}/`

**Product Container Selectors:**
```css
Product grid: Standard WooCommerce product loop
Product item: <li> within product grid
Product link: <a href="/product/..."> and heading <h2 class="...">
Image: <img> with product data
Price: Formatted as "₪139.00"
```

**Product Data Selectors:**
```
Artist/Album: Heading text (e.g., "Bruno Mars – The Romantic")
Price: Clearly displayed as "₪159.00"
Image: Standard WooCommerce product image
Link: `/product/{product-slug}/`
Category tags: Above product title
```

**Pagination/Catalog Approach:**
- Organized by categories:
  - תקליטים חדשים (New Vinyls)
  - תקליטים הכי נמכרים (Best Sellers)
  - תקליטים יד שניה (Used Vinyls)
  - פטיפונים (Turntables)
  - מתנות (Gifts)
  - דיסקים (CDs)
  
- Each category links to: `/product-category/{category-path}/`
- Sub-categories for Israeli records, genres, condition
- Traditional pagination likely at bottom (not shown in extract)

**Anti-Scraping Measures:**
- Standard WordPress security
- Cloudflare potentially present (common for Israeli sites)
- No aggressive anti-bot measures visible

**Special Considerations:**
- Multiple language support (Hebrew)
- FAQ section at bottom
- Personal recommendations section
- "Notify me when in stock" functionality visible
- Physical store mentioned with operating hours

---

## 3. The Vinyl Room (https://thevinylroom.co.il/)

**Site Name:** חדר התקליטים (The Vinyl Room)

**Platform/Technology:** **WordPress with WooCommerce**
- Same structure as Giora
- Product URLs: `/product/{product-slug}/`

**Product Container Selectors:**
```
Sections with product listings organized by category
Each product: Title + Price + Stock Status + Link + Image
Grid layout with consistent spacing
```

**Product Data Structure:**
```
Title: "Harry Styles – Kiss All The Time. Disco, Occasionally [Pop Blue Vinyl] LP"
Price: "₪170"
Stock Status: "אזל מהמלאי" (Out of stock) or available
Image: Standard WooCommerce image
Link: /product/{product-slug}/
Category: Displayed above products
```

**Product Information Available:**
- Artist name
- Album title
- Vinyl variant (color, LP count)
- Price in Israeli Shekel
- Stock status
- "Add to cart" or info button

**Pagination/Catalog Approach:**
- Categories:
  - Best Sellers (תקליטים הכי נמכרים)
  - Sales/Promotions (תקליטים במבצע)
  - Israeli Vinyls (תקליטים ישראלים)
  - By Genre: Pop/Rock, Hip-Hop/Rap, Classic Rock, Heavy/Metal, Jazz/Blues
  - CDs (דיסקים)
  - Used/2nd Hand (תקליטים יד 2)
  
- Each category links to dedicated category page

**Anti-Scraping Measures:**
- Standard WordPress WooCommerce protections

**Special Considerations:**
- Newsletter signup section
- Contact info: WhatsApp, Phone, Email
- Physical store in Haifa mentioned
- WordPress-powered blog integration
- Accessibility features visible

---

## 4. DiscCenter (https://www.disccenter.co.il/)

**Site Name:** דיסק סנטר

**Platform/Technology:** **Custom-Built Platform** (NOT WooCommerce/Shopify)
- Proprietary HTML structure
- Complex filtering system with many parameters
- URLs suggest custom backend: `/prod/{product-id}/{product-slug}` or `/list/{category-id}`
- Advanced search functionality

**Product Container Selectors:**
```
Product URLs: /prod/{five-digit-id}/{product-slug}
Product list pages: /list/{list-id} or /Results? with filters
Product cards: Title, Image, Price, Artist, Format indicators
```

**Product Data Selectors:**
```
Artist/Album: "ARTIST NAME" + "Album Title" format
Price: "₪79.90" etc.
Format: CD, Vinyl (LP), Cassette, DVD, Blu-Ray indicated
Image: Standard product image
Stock Status: "חסר במלאי" (Out of Stock), "יוצא בקרוב" (Coming Soon)
"יוצא בקרוב" with date: Pre-order with expected date
```

**Pagination/Catalog Approach:**
- Sophisticated filtering system with parameters:
  - `?genre=` (Genre)
  - `?format=` (Format: CD, Vinyl, DVD, etc.)
  - `?langs=` (Languages)
  - `?year=` (Release year)
  - `?search=` (Search query)
  - `?type=` (Type filter)
  - `?kind=` (Format specific)

- Main categories:
  - דיסקים חדשים (New CDs) - /list/2
  - תקליטים חדשים (New Vinyls) - /list/22
  - יוצאים בקרוב (Coming Soon) - /list/3
  - קלטות אודיו (Cassettes) - /list/71
  - DVD/BLU-RAY - /list/12
  - מרצ'נדייז (Merchandise) - /list/23
  - מבצעים (Sales) - /sales page with special promotions

- Sales promotions:
  - "3 ב 99.90!" (3 for 99.90)
  - "2 ב 99.90!" (2 for 99.90) 
  - "4 ב 99.90!" (4 for 99.90)
  - Genre-specific sales
  - Warner catalog promotions

**Image URLs:** Stored locally on site, not third-party CDN

**Anti-Scraping:**
- Custom platform may have rate limiting
- No apparent robots.txt restrictions visible
- Complex filtering might require session handling

**Special Considerations:**
- Largest selection of various formats (not just vinyl)
- Multiple promotional campaigns running simultaneously
- Advanced filtering suggests data structure is well-organized
- "Request item if unavailable" functionality
- Member-exclusive deals

---

## 5. Vinyl Stock (https://www.vinylstock.co.il/)

**Site Name:** ויניל סטוק

**Platform/Technology:** **Yalla Store / Webzie Platform**
- Footer: "בניית חנות וירטואלית" (Virtual store builder)
- Custom ecommerce platform
- Product URLs: `/products/{id}/{product-name}`

**Product Container Selectors:**
```
Product Grid/List structure
Each product: Image, Title, Price, Special offer tags
```

**Product Data Selectors:**
```
Title: "רביד פלוטניק - הדרך לשביל הזהב - אלבום מהדורה מוגבלת תקליט ויניל"
Price: Displayed as currency (₪)
Image: From /stores/{store-id}/zoom/{timestamp}-{image-id}.png
URL: /products/{product-id}/{url-slug}/
Special tags: 
  - "תקליט צבעוני" (Colored vinyl)
  - "הנחה מיוחדת ומוגבלת" (Limited special discount)
  - "מבצע טריפל" (Triple promotion)
```

**Pagination/Catalog Approach:**
- Product listing in carousel/grid format
- Navigation to different products
- Wishlist functionality
- "Go to cart" navigation

**HTML Structure Notes:**
- Images have zoom/hover capability
- Products can have multiple special offer badges
- Limited data in homepage fetch, but structure is visible

**Anti-Scraping:**
- Custom platform, likely standard protections
- Dynamic image loading with specific parameters

**Special Considerations:**
- Focus on Israeli artists (תקליטים ישראלים)
- Colored vinyl variants clearly marked
- Limited edition promotions
- WhatsApp, TikTok, Instagram integration
- Cart functionality visible

---

## 6. Third Ear (https://third-ear.com/)

**Site Name:** האוזן השלישית (Third Ear - Israel's Largest Record Store)

**Platform/Technology:** **WordPress with WooCommerce**
- Modern WooCommerce implementation
- Product URLs: `/product/{product-slug}/`
- Uses Elementor for page building (visible in footer)

**Product Container Selectors:**
```
Product cards in grid layout (WooCommerce standard)
Each card: Image, Title, Price, Wishlist button, Add to cart
Product links: /product/{product-slug}/
```

**Product Data Selectors:**
```
Title: "Harry Styles - Kiss all the Time. Disco. Occasionally [Black Vinyl]"
Price: "₪149.90"
Image: WooCommerce product image with hover effects
Wishlist: Interactive button with product ID parameter
Link format: /product/{product-slug}/
Sale indicator: Old price crossed out with new sale price
Stock Status: If pre-order, shown as "בהזמנה מוקדמת"
```

**Pagination/Catalog Approach:**
- Multiple organized sections:
  - הכי נמכרים (Best Sellers)
  - הרגע נחתו (Just Arrived)
  - גיפט קארד (Gift Cards)
  - המלצות הצוות (Staff Picks)
  - תקליטים נבחרים ב-30% הנחה (30% Off Selection)
  - אביזרים (Accessories)
  - דיסקים (CDs)
  - פטיפונים (Turntables)
  - תקליטים ישראלים (Israeli Vinyls)
  - היד השנייה (Used Records)
  - ספרים באוזן (Audio Books)
  - סרטים למכירה (Movies for Sale)
  - זהב שחור (Black Gold - Special releases)

- Category pages: `/product-category/{category}/`
- Tag-based filtering: `/product-tag/{tag}/`

**Anti-Scraping:**
- WooCommerce standard protections
- Cloudflare likely used

**Special Considerations:**
- Large physical store chain with multiple locations
- Extensive product ranges beyond vinyl
- Active social media integration
- Newsletter signup prominent
- Event listings for film screenings
- Second-hand record buying service

---

## 7. Beatnik (https://www.beatnik.co.il/)

**Site Name:** ביטניק - חנות תקליטים

**Platform/Technology:** **WordPress with WooCommerce**
- Standard WooCommerce setup
- Product URLs: `/product/{product-slug}/`

**Product Container Selectors:**
```
Product grid with elements:
Title + Price + "Add to cart" button
Images with lazy loading
```

**Product Data Structure:**
```
Title: "Bruno Mars – The Romantic (Red Vinyl)"
Price: "₪150.00"
Image: Product photo
Stock: Shows if available or out of stock
Link: /product/{product-slug}/
```

**Product Categories:**
- התקליטים הכי חמים (Hottest Records)
- חובה בכל תקליטיה (Must-Haves in Every Collection)
- תקליטים ישראלים חדשים ומחודשים (New & Reissued Israeli Vinyls)
- חדש בביטניק - מרצ'נדייז (New Merchandise)
- פטיפונים (Turntables)

**Pagination:**
- Multiple section carousels
- "Show more" links for each category
- Standard WooCommerce pagination

**Anti-Scraping:**
- Standard WooCommerce
- No aggressive blocking

**Special Considerations:**
- Physical store in Florentin, Tel Aviv
- Operating hours: Sunday-Thursday, Friday, Saturday by appointment
- Listening stations in store
- Staff knowledge emphasized
- Multiple product types (vinyls, turntables, merchandise)
- Merchandise section prominent

---

## 8. Tav8 (The Eighth Note) (https://www.tav8.co.il/)

**Site Name:** התו השמיני (The Eighth Note - Legendary Jerusalem Record Store)

**Platform/Technology:** **Custom Legacy Platform** (ASP.NET-based)
- URLs use `.aspx` extensions: `/product-id.aspx?`, `/store-products.aspx?`
- Query parameter-based navigation
- Custom backend system (not WooCommerce/Shopify)

**Product Container Selectors:**
```
Product listings via: /store-products.aspx?StoreCategoryId={id}&StoreSubCategoryId={id}
Individual products: /product-id.aspx?StoreProductId={id}&StoreSubCategoryId={id}
```

**Product URL Parameters:**
```
/product-id.aspx?StoreSubCategoryId={subcat-id}&StoreProductId={product-id}

Example:
/product-id.aspx?StoreSubCategoryId=4&StoreProductId=4371
```

**Product Data:**
```
Artist/Album: "Bruno Mars – The Romantic"
Price: "139 ₪" with member discount shown
Member Price: "חברים 10% - 125.10 ₪" (Members 10% discount)
Stock: Available, Out of Stock, Member-only indicated
Link: /product-id.aspx?StoreSubCategoryId={id}&StoreProductId={id}
```

**Pagination/Catalog:**
- Main Categories:
  1. תקליטים (Vinyls) - StoreCategoryId=1
  2. פטיפונים (Turntables) - StoreCategoryId=2
  3. ציוד משלים (Complementary Equipment) - StoreCategoryId=3
  4. מגברים (Amplifiers) - StoreCategoryId=5
  5. אזניות (Headphones) - StoreCategoryId=6
  6. רמקולים (Speakers) - StoreCategoryId=7
  7. רמקולים מוגברים (Powered Speakers) - StoreCategoryId=8

- Sub-categories within each:
  - שונות (Various)
  - קלאסיקות (Classics)
  - ישראלי (Israeli)
  - And genre-based subdivisions

- Featured Sections:
  - חדשים וחוזרים למלאי (New & Back in Stock)
  - הכי נמכרים (Best Sellers)
  - קלאסיקות (Classics)
  - ישראלי (Israeli)
  - המלצות הצוות (Staff Recommendations)
  - ז'אנרים מובילים (Leading Genres)

**Anti-Scraping:**
- Custom platform - potentially different rate limiting
- No aggressive measures visible

**Special Considerations:**
- Member-exclusive discounts (10% off)
- Staff recommendations section very prominent
- Physical store in Jerusalem
- Magazine/Blog integrated
- Gift cards available
- Email: info@otherside.co.il
- Phone: 02-6568831
- Multiple domain handling (tav8.co.il + otherside.co.il)

---

## 9. Shablool Records (https://shabloolrecords.co.il/)

**Site Name:** שבלול - חנות תקליטים

**Platform/Technology:** **WordPress with WooCommerce**
- Standard WooCommerce product structure
- Product URLs: `/product/{product-slug}`

**Product Container:**
```
Product grid showing:
Title, Price, Stock Status
Links to individual product pages
```

**Product Data:**
```
Title: "Harry Styles – Kiss All The Time. Disco, Occasionally"
Price: "₪150"
Stock: "במלאי" (In stock), "אזל מהמלאי" (Out of stock)
Link: /product/{product-slug}
Categories: Listed above products
```

**Catalog Organization:**
- תקליטים חדשים בחנות (New Records in Store)
- תקליטים במבצעים מיוחדים (Special Sales)
- תקליטים | רבי מכר (Best Sellers)
- Category URLs: `/product-category/records/{subcategory}/`

**Pagination:**
- Traditional carousel/slider for recent additions
- "View more" style links
- Category-based browsing

**Shipping:**
- Free shipping over 350 shekel
- Note in header about free shipping

**Anti-Scraping:**
- Standard WooCommerce

**Special Considerations:**
- Physical location: Haifa (קרית ים - Kiryat Yam)
- Mobile store at mall (Drorים mall, Fridays)
- Newsletter signup section
- FAQ page
- Blog integration
- Simple, clean design
- FAQ, Shipping, Terms, Privacy policy pages
- Buy second-hand records option

---

## 10. Ha Sivoov (https://hasivoov.co.il/)

**Site Name:** היפ הופ על תקליט (Hip-Hop on Vinyl)

**Platform/Technology:** **WooCommerce-based**
- Product URLs: `/product/{product-slug}/`
- Modern WooCommerce implementation

**Product Data:**
```
Title: "בלולו – גלובלי (תקליט אדום שקוף)" (Balulu - Globali Red Transparent Vinyl)
Price: "₪200.00"
Variants: Multiple vinyl colors shown separately
Image: Product photo
Link: /product/{product-slug}/
Stock: Available/Wishlist indicators
Cart button: Add to cart
```

**Product Categories:**
- נוספו לאחרונה (Recently Added) - Featured first
- Products organized by artist/album
- Heavy focus on Hebrew hip-hop/rap artists
- Israeli music emphasis

**Pagination:**
- Homepage carousel of recent additions
- "Continue to store" link to view all
- WhatsApp integration for contact

**Anti-Scraping:**
- Standard WooCommerce

**Special Considerations:**
- Specialized niche: Hip-hop on vinyl exclusively
- Instagram-first approach (@hiphoponvinyl.il)
- Hebrew language primary
- Orders/inquiries via Instagram
- Free shipping:
  - Pickup point over 300 shekel
  - Home delivery over 400 shekel
- YouTube and Instagram social media presence

---

## 11. Taklit House (https://www.taklithouse.com/)

**Site Name:** בית התקליט (Taklit House)

**Platform/Technology:** **Wix-based Website**
- Wix ecommerce platform (Web design builder)
- Simpler structure
- Product URLs: `/product-page/{product-slug}`

**Product Container:**
```
Product listings in carousel/grid format
Each product: Image, Title, Price (both regular and sale)
Quick view and add-to-cart options
```

**Product Data:**
```
Artist - Album Title
Regular Price / Sale Price
₪ currency format
Product image
Link to product page
```

**Product Categories:**
- תקליטים חדשים (New Records)
- יד שנייה (Used/Second-hand)
- תקליטים מבוקשים (In Demand Records)
- פטיפונים קלטות דיסקים (Turntables, Cassettes, CDs)

**Business Details:**
- Physical location: Kiryat Ono (קרית אונו)
- Address: Halanit 5, Kiryat Ono
- Phone: 052-843-8008
- Hours:
  - Sunday-Thursday: 09:30-20:00
  - Friday: 09:30-15:00
  - Saturday: By appointment

**Special Services:**
- Repair workshop mentioned ("מעבדת תיקונים")
- Second-hand vinyl focus
- Vintage/used records specialization
- Free shipping over 270 shekel

**Anti-Scraping:**
- Wix standard protections

**Special Considerations:**
- Smaller, niche store
- Specializes in used records
- Repair services available
- Limited online product range compared to others
- WhatsApp contact option

---

## 12. My Records (https://www.my-records.co.il/)

**Status:** HTTP 400 Error - Unable to fully analyze
- Site exists but returned error during fetch
- Appears to be active Israeli vinyl store
- Cannot determine platform or structure from error response
- Recommend direct manual inspection for this site

---

## COMPARATIVE SUMMARY TABLE

| Site | Platform | URL Pattern | Product Selectors | Pagination |
|------|----------|------------|------------------|-----------|
| Rollin' Dise | Shopify | `/products/{slug}` | Grid + Carousel | Collections + pagination |
| Giora | WooCommerce | `/product/{slug}/` | WooCommerce grid | Category pages |
| Vinyl Room | WooCommerce | `/product/{slug}/` | WooCommerce grid | Category pages |
| DiscCenter | Custom | `/prod/{id}/{slug}` | Custom grid | Advanced filtering system |
| Vinyl Stock | Yalla/Webzie | `/products/{id}/{slug}` | Custom grid | Grid + carousel |
| Third Ear | WooCommerce | `/product/{slug}/` | WooCommerce grid | Category + tag pages |
| Beatnik | WooCommerce | `/product/{slug}/` | WooCommerce grid | Category pages |
| Tav8 | Custom ASP.NET | `/product-id.aspx?...` | Query param-based | Parameter-based navigation |
| Shablool | WooCommerce | `/product/{slug}` | WooCommerce grid | Category pages |
| Ha Sivoov | WooCommerce | `/product/{slug}/` | WooCommerce grid | Recent additions carousel |
| Taklit House | Wix | `/product-page/{slug}` | Wix grid | Simple carousel |
| My Records | ??? | ??? | ??? | ??? |

---

## ROBOTS.TXT & ANTI-SCRAPING SUMMARY

**No Aggressive Anti-Scraping Detected:**
- Most sites use standard platform (WooCommerce/Shopify) default protections
- No `robots.txt` restrictions visible in homepage fetches
- No obvious JavaScript-based bot detection scripts mentioned

**Recommendations:**
- Respect standard rate limiting (2-5 second delays between requests)
- Set proper User-Agent headers
- Honor robots.txt if present (should check each site individually)
- Crawl during off-peak hours
- Use session persistence for better performance

---

## KEY IMPLEMENTATION PATTERNS FOR SCRAPERS

### WooCommerce Sites (6 stores):
- Use `/product-category/` endpoints for category listings
- Product pages have standard WooCommerce structure
- Price in format: `<span class="woocommerce-Price-amount">₪{price}`
- Stock status via: `<span class="stock">` or similar

### Shopify Sites (1 store - Rollin'Dise):
- Use `/products/` for individual products
- Use `/collections/` for category browsing
- Product data in JSON in page `<script type="application/ld+json">`
- Images from CDN: `cdn.shop/files/`

### Custom Platforms (2 stores):
- Use query parameters for filtering
- Study URL patterns carefully for pagination
- Some may require session/cookie handling

---

## PRODUCT INFO STANDARD STRUCTURE

**All sites include (consistently):**
1. ✅ Artist/Album Title (clear text)
2. ✅ Price in Israeli Shekel (₪)
3. ✅ Product Image (various CDN/formats)
4. ✅ Product Link
5. ✅ Stock Status
6. ✅ Variant information (vinyl color, LP count)

**Some sites also include:**
- Genre/Category tags
- Special edition markers
- Pre-order dates
- Vendor/Label information
- Rating/Review indicators
- Member pricing
- Bundle/Sale indicators

---

## RECOMMENDATIONS FOR SCRAPER DESIGN

1. **Site-Specific Scrapers:** Create individual scrapers per platform type (3 main groups: WooCommerce, Shopify, Custom)

2. **Data Pipeline:**
   - Homepage discovery → Category listing → Product detail extraction → Data normalization

3. **Robustness:**
   - Implement retry logic for failed requests
   - Parse both visible text and structured data (JSON-LD where available)
   - Handle Hebrew text encoding properly (UTF-8)

4. **Ethical Considerations:**
   - Identify yourself with proper User-Agent
   - Implement polite crawling delays
   - Check for and respect robots.txt
   - Consider reaching out to larger stores for API access

5. **Data Validation:**
   - Verify prices are in valid range
   - Normalize artist/album names
   - Validate URLs before storing
   - Handle missing/incomplete data gracefully

---

## NEXT STEPS

1. Create base scraper classes for each platform type
2. Test CSS selectors on live pages
3. Handle pagination and dynamic content
4. Implement error handling and logging
5. Create normalized data schema across all stores
6. Build data de-duplication logic (same album across stores)

**Last Updated:** March 29, 2026
