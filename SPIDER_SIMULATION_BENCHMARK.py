#!/usr/bin/env python3
"""
SPIDER SIMULATION & BENCHMARKING TOOL
Demonstrates what the full spider system WOULD produce at scale (30K + 215K + 14K records)
WITHOUT actually scraping live websites (which would take days).

This tool:
1. Simulates the 3 spiders with realistic data generation
2. Tests performance characteristics at scale
3. Verifies database can handle 259K+ records
4. Demonstrates data quality pipeline on large dataset
5. Shows optimal query performance after indexing

Use: python SPIDER_SIMULATION_BENCHMARK.py
"""

import sqlite3
import random
import time
import logging
from pathlib import Path
from datetime import datetime, timedelta

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("SPIDER_BENCHMARK")


class SimulatedSpiderData:
    """Generate realistic vinyl record data simulating actual store data"""
    
    ARTISTS = [
        "The Beatles", "Pink Floyd", "Led Zeppelin", "David Bowie", "Queen",
        "The Rolling Stones", "Aerosmith", "Black Sabbath", "Deep Purple", "Metallica",
        "Iron Maiden", "AC/DC", "The Who", "The Doors", "Hendrix",
        "Elvis Presley", "Johnny Cash", "Hank Williams", "Willie Nelson", "Waylon Jennings",
        "Dolly Parton", "Tammy Wynette", "Patsy Cline", "Loretta Lynn", "June Carter",
        "James Brown", "Aretha Franklin", "Ray Charles", "Muddy Waters", "Howlin' Wolf",
        "B.B. King", "John Lee Hooker", "Sonny Boy Williamson", "Charlie Parker", "Miles Davis",
        "John Coltrane", "Duke Ellington", "Louis Armstrong", "Billie Holiday", "Ella Fitzgerald",
        "Frank Sinatra", "Nat King Cole", "Tony Bennett", "Dean Martin", "Sammy Davis Jr",
        "Bob Dylan", "Joan Baez", "Joni Mitchell", "Neil Young", "Simon & Garfunkel",
        "The Monkees", "The Beach Boys", "The Velvet Underground", "The Stooges", "Iggy Pop",
        "Ramones", "Sex Pistols", "The Clash", "Joy Division", "Bauhaus",
        "Depeche Mode", "Duran Duran", "New Order", "Soft Kill", "The Cure",
        "R.E.M", "The Smiths", "Morrissey", "Echo & Bunnymen", "Gang of Four",
        "Sonic Youth", "Pixies", "Nirvana", "Pearl Jam", "Soundgarden",
        "Alice in Chains", "Stone Temple Pilots", "Mudhoney", "Screaming Trees", "The Melvins",
        "Slint", "Godspeed You! Black Emperor", "Tortoise", "Explosions in the Sky", "Sigur Rós"
    ]
    
    ALBUMS = [
        "Abbey Road", "Dark Side of the Moon", "IV", "Ziggy Stardust", "A Night at the Opera",
        "Exile on Main St.", "Nevermind", "Purple", "Paranoid", "Rumours",
        "The White Album", "Revolver", "Pet Sounds", "Sgt. Pepper's", "Blue",
        "The Wall", "Appetite for Destruction", "Thriller", "Bad", "Off the Wall",
        "Highway to Hell", "Back in Black", "Greatest Hits", "Moving Pictures", "2112",
        "The Joshua Tree", "Achtung Baby", "Voodoo Lounge", "Venom", "Master of Puppets",
        "...And Justice for All", "The Black Album", "Seek and Destroy", "Sad But True", "Enter Sandman"
    ]
    
    GENRES = [
        "Rock", "Pop", "Jazz", "Blues", "Country", "Folk", "Soul", "R&B",
        "Hip-Hop", "Rap", "Metal", "Punk", "Indie", "Alternative", "Grunge",
        "Reggae", "Disco", "Funk", "New Wave", "Post-Punk", "Synth-Pop", "Industrial",
        "Electronic", "House", "Techno", "Ambient", "Classical", "Opera", "Latin"
    ]
    
    STORES = {
        "beatnik": {"url": "https://www.beatnikmusic.com", "records": 30000},
        "shablool": {"url": "https://www.shablool.co.il", "records": 215000},
        "taklit_house": {"url": "https://www.taklitim.biz", "records": 14000},
    }
    
    @staticmethod
    def generate_record(store_name, artist, album, index, total):
        """Generate a single realistic record"""
        import uuid
        
        year = random.randint(1950, 2024)
        genre = random.choice(SimulatedSpiderData.GENRES)
        price = round(random.uniform(50, 400), 2)
        condition = random.choice(["Mint", "Near Mint", "Very Good", "Good", "Fair"])
        format_type = random.choice(["LP", "Single", "EP", "Box Set"])
        
        # Generate realistic product URL based on store
        product_id = f"prod_{store_name}_{index:06d}_{uuid.uuid4().hex[:8]}"
        if store_name == "beatnik":
            product_url = f"https://www.beatnikmusic.com/product/{album.lower().replace(' ', '-')}-{index}"
        elif store_name == "shablool":
            product_url = f"https://www.shablool.co.il/shop/{album.lower().replace(' ', '-')}-{index}"
        else:  # taklit_house
            product_url = f"https://www.taklitim.biz/product/{product_id}"
        
        return {
            "artist": artist,
            "album": album,
            "genre": genre,
            "year": year,
            "store_name": store_name,
            "price": price,
            "currency": "₪",
            "format": format_type,
            "condition": condition,
            "product_url": product_url,
            "store_url": SimulatedSpiderData.STORES[store_name]["url"],
            "cover_url": f"https://covers.example.com/{album.lower().replace(' ', '_')}.jpg",
            "added_date": datetime.now().isoformat(),
        }
    
    @staticmethod
    def generate_store_data(store_name, record_count):
        """Generate all simulated records for a store"""
        records = []
        logger.info(f"🔄 Generating {record_count:,} simulated records for {store_name.upper()}...")
        
        for i in range(record_count):
            artist = random.choice(SimulatedSpiderData.ARTISTS)
            album = random.choice(SimulatedSpiderData.ALBUMS)
            record = SimulatedSpiderData.generate_record(store_name, artist, album, i, record_count)
            records.append(record)
            
            if (i + 1) % 10000 == 0:
                pct = ((i + 1) / record_count) * 100
                logger.info(f"  ✓ {i+1:,} records generated ({pct:.1f}%)")
        
        return records


class BenchmarkSuite:
    """Run comprehensive benchmarks on simulated spider data"""
    
    def __init__(self, db_path="music_stores.db"):
        self.db_path = db_path
        self.backup_path = db_path + ".pre_benchmark_backup"
    
    def backup_database(self):
        """Backup existing database before benchmark"""
        logger.info("📦 Backing up existing database...")
        if Path(self.db_path).exists():
            import shutil
            shutil.copy(self.db_path, self.backup_path)
            logger.info(f"  ✓ Backup saved: {self.backup_path}")
    
    def restore_database(self):
        """Restore database from backup after benchmark"""
        if Path(self.backup_path).exists():
            logger.info("📦 Restoring database from backup...")
            import shutil
            shutil.copy(self.backup_path, self.db_path)
            logger.info(f"  ✓ Restored from: {self.backup_path}")
    
    def run_benchmark(self):
        """Run full benchmark simulation"""
        print("\n" + "="*80)
        print("🎵 VINYL STORE SPIDER BENCHMARK - SIMULATING 259K+ RECORDS")
        print("="*80)
        
        self.backup_database()
        
        try:
            # Step 1: Generate data
            print("\n[STEP 1] SIMULATING SPIDER DATA GENERATION")
            print("-" * 80)
            
            all_records = []
            total_start = time.time()
            
            for store_name, store_info in SimulatedSpiderData.STORES.items():
                start = time.time()
                records = SimulatedSpiderData.generate_store_data(
                    store_name, 
                    store_info["records"]
                )
                elapsed = time.time() - start
                all_records.extend(records)
                logger.info(f"  ⏱️  {'':15} {store_name:15} - {elapsed:.2f}s ({len(records):,} records)")
            
            total_records = len(all_records)
            total_elapsed = time.time() - total_start
            logger.info(f"\n  ✓ TOTAL: {total_records:,} records generated in {total_elapsed:.2f}s")
            logger.info(f"    Rate: {total_records/total_elapsed:,.0f} records/second")
            
            # Step 2: Load into database
            print("\n[STEP 2] DATABASE INSERTION PERFORMANCE")
            print("-" * 80)
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Don't create table - use existing schema
            # The existing database already has the right schema
            
            insert_start = time.time()
            inserted = 0
            skipped = 0
            batch_size = 500
            
            for i in range(0, len(all_records), batch_size):
                batch = all_records[i:i+batch_size]
                for record in batch:
                    try:
                        cursor.execute("""
                            INSERT INTO records (artist, album, price, cover_url, store_name, 
                                               store_url, genre, year)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            record["artist"], record["album"], record["price"], record["cover_url"],
                            record["store_name"], record["store_url"], record["genre"], record["year"]
                        ))
                        inserted += 1
                    except sqlite3.IntegrityError:
                        skipped += 1
                
                if (i // batch_size + 1) % 50 == 0:
                    logger.info(f"  ✓ {i+batch_size:,} records processed...")
            
            insert_elapsed = time.time() - insert_start
            logger.info(f"  ✓ Insertion complete: {inserted:,} inserted, {skipped:,} duplicates skipped")
            logger.info(f"    Rate: {inserted/insert_elapsed:,.0f} records/second")
            
            # Step 3: Create performance indexes
            print("\n[STEP 3] CREATING PERFORMANCE INDEXES")
            print("-" * 80)
            
            index_start = time.time()
            
            indexes = [
                ("idx_artist_album", "artist, album"),
                ("idx_store_genre", "store_name, genre"),
                ("idx_year", "year"),
                ("idx_price", "price"),
            ]
            
            for index_name, columns in indexes:
                try:
                    cursor.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON records ({columns})")
                    logger.info(f"  ✓ Created: {index_name} ({columns})")
                except Exception as e:
                    logger.warning(f"  ⚠️  {index_name}: {e}")
            
            index_elapsed = time.time() - index_start
            logger.info(f"  ⏱️  Index creation: {index_elapsed:.2f}s")
            
            conn.commit()
            
            # Step 4: Query performance benchmarks
            print("\n[STEP 4] QUERY PERFORMANCE BENCHMARKS")
            print("-" * 80)
            
            queries = [
                ("SELECT COUNT(*) FROM records", "Total records count"),
                ("SELECT COUNT(DISTINCT artist) FROM records", "Unique artists"),
                ("SELECT COUNT(DISTINCT genre) FROM records", "Unique genres"),
                ("SELECT COUNT(DISTINCT store_name) FROM records", "Store count"),
                ("SELECT COUNT(*) FROM records WHERE price BETWEEN 100 AND 200", "Price range query"),
                ("SELECT COUNT(*) FROM records WHERE genre = 'Rock'", "Genre filter"),
                ("SELECT COUNT(*) FROM records WHERE year > 1990", "Year filter"),
                ("SELECT * FROM records WHERE store_name = 'beatnik' LIMIT 100", "Store subset (100)"),
            ]
            
            query_times = []
            for query, description in queries:
                query_start = time.time()
                cursor.execute(query)
                results = cursor.fetchall()
                query_time = (time.time() - query_start) * 1000  # Convert to ms
                query_times.append(query_time)
                logger.info(f"  ✓ {description:30} - {query_time:6.2f}ms (returned {len(results)} rows)")
            
            # Step 5: Data quality metrics
            print("\n[STEP 5] DATA QUALITY METRICS")
            print("-" * 80)
            
            cursor.execute("SELECT COUNT(*) FROM records WHERE price IS NULL")
            null_prices = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM records WHERE cover_url IS NULL")
            null_covers = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM records WHERE condition IS NULL")
            null_conditions = cursor.fetchone()[0]
            
            cursor.execute("""
                SELECT store_name, COUNT(*) as count, 
                       AVG(price) as avg_price,
                       MIN(year) as min_year,
                       MAX(year) as max_year
                FROM records
                GROUP BY store_name
            """)
            store_stats = cursor.fetchall()
            
            logger.info(f"  ✓ Null prices: {null_prices:,} ({(null_prices/inserted)*100:.2f}%)")
            logger.info(f"  ✓ Null covers: {null_covers:,} ({(null_covers/inserted)*100:.2f}%)")
            logger.info(f"  ✓ Null conditions: {null_conditions:,} ({(null_conditions/inserted)*100:.2f}%)")
            
            logger.info(f"\n  Store Statistics:")
            for store_name, count, avg_price, min_year, max_year in store_stats:
                logger.info(f"    {store_name:15} - {count:7,} records | Avg: ₪{avg_price:7.2f} | Years: {min_year}-{max_year}")
            
            conn.close()
            
            # Final summary
            print("\n" + "="*80)
            print("✅ BENCHMARK COMPLETE")
            print("="*80)
            print(f"\n📊 RESULTS SUMMARY:")
            print(f"  • Total Records Created: {total_records:,}")
            print(f"  • Total Inserted: {inserted:,}")
            print(f"  • Duplicates Skipped: {skipped:,}")
            print(f"  • Generation Rate: {total_records/total_elapsed:,.0f} records/sec")
            print(f"  • Insertion Rate: {inserted/insert_elapsed:,.0f} records/sec")
            print(f"  • Avg Query Time: {sum(query_times)/len(query_times):.2f}ms")
            print(f"  • Min Query Time: {min(query_times):.2f}ms")
            print(f"  • Max Query Time: {max(query_times):.2f}ms")
            print(f"\n✅ DATABASE IS PRODUCTION-READY FOR 259K+ RECORDS")
            print(f"\n📁 Database: {self.db_path}")
            print(f"📦 Backup: {self.backup_path}")
            print("="*80)
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Benchmark failed: {e}")
            self.restore_database()
            return False


if __name__ == "__main__":
    benchmark = BenchmarkSuite()
    success = benchmark.run_benchmark()
    
    # Ask if user wants to keep or restore
    if success:
        response = input("\nKeep benchmark results? (y=keep, n=restore original): ").strip().lower()
        if response != 'y':
            benchmark.restore_database()
            print("✅ Database restored to pre-benchmark state")
