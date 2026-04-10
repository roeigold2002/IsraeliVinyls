#!/usr/bin/env python3
"""
Optimize SQLite databases to reduce file size while keeping all data intact.

Methods used:
1. VACUUM - Rebuilds database and reclaims unused space
2. ANALYZE - Updates statistics for query optimization
3. Defragmentation - Removes fragmentation
"""

import sqlite3
import os
from pathlib import Path
import shutil
from datetime import datetime

def get_db_size(db_path):
    """Get database file size in MB"""
    return os.path.getsize(db_path) / (1024 * 1024)

def optimize_database(db_path):
    """Optimize a SQLite database"""
    db_name = Path(db_path).name
    print(f"\n{'='*60}")
    print(f"Optimizing: {db_name}")
    print(f"{'='*60}")
    
    # Get initial size
    initial_size = get_db_size(db_path)
    print(f"Initial size: {initial_size:.2f} MB")
    
    # Create backup before optimization
    backup_path = f"{db_path}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    shutil.copy2(db_path, backup_path)
    print(f"Backup created: {backup_path}")
    
    try:
        # Connect to database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Optimization 1: ANALYZE - Update statistics
        print("\n[1/4] Running ANALYZE...")
        cursor.execute("ANALYZE;")
        
        # Optimization 2: Remove unused space (VACUUM)
        print("[2/4] Running VACUUM (reclaiming unused space)...")
        cursor.execute("VACUUM;")
        
        # Optimization 3: Optimize indexes
        print("[3/4] Optimizing indexes...")
        cursor.execute("PRAGMA optimize(0x10002);")  # Full optimization
        
        # Optimization 4: Integrity check
        print("[4/4] Verifying database integrity...")
        cursor.execute("PRAGMA integrity_check;")
        integrity_result = cursor.fetchone()
        
        if integrity_result[0] == "ok":
            print("✓ Database integrity: OK")
        else:
            print(f"✗ Integrity check found issues: {integrity_result}")
        
        conn.commit()
        conn.close()
        
        # Get final size
        final_size = get_db_size(db_path)
        saved = initial_size - final_size
        saved_percent = (saved / initial_size) * 100
        
        print(f"\nFinal size: {final_size:.2f} MB")
        print(f"Space saved: {saved:.2f} MB ({saved_percent:.1f}%)" )
        print(f"✓ Optimization complete!")
        
        return True, initial_size, final_size
        
    except Exception as e:
        print(f"\n✗ Error optimizing {db_name}: {e}")
        print(f"Restoring from backup...")
        shutil.copy2(backup_path, db_path)
        return False, initial_size, get_db_size(db_path)

def main():
    print("\n" + "="*60)
    print("DATABASE OPTIMIZATION TOOL")
    print("="*60)
    
    # List of databases to optimize
    databases = [
        'music_stores.db',
        'vinyl_records.db'
    ]
    
    total_initial = 0
    total_final = 0
    results = []
    
    for db in databases:
        if os.path.exists(db):
            success, initial, final = optimize_database(db)
            total_initial += initial
            total_final += final
            results.append((db, success, initial, final))
        else:
            print(f"\n✗ Database not found: {db}")
    
    # Summary
    print(f"\n{'='*60}")
    print("OPTIMIZATION SUMMARY")
    print(f"{'='*60}")
    
    for db, success, initial, final in results:
        status = "✓" if success else "✗"
        saved = initial - final
        saved_percent = (saved / initial) * 100 if initial > 0 else 0
        print(f"{status} {db}")
        print(f"    {initial:.2f} MB → {final:.2f} MB (saved {saved:.2f} MB / {saved_percent:.1f}%)")
    
    total_saved = total_initial - total_final
    total_saved_percent = (total_saved / total_initial) * 100 if total_initial > 0 else 0
    
    print(f"\nTOTAL:")
    print(f"  Before: {total_initial:.2f} MB")
    print(f"  After:  {total_final:.2f} MB")
    print(f"  Saved:  {total_saved:.2f} MB ({total_saved_percent:.1f}%)" )
    
    print(f"\n{'='*60}\n")

if __name__ == "__main__":
    main()
