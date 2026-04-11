#!/usr/bin/env python3
"""Add cover_url column to existing records table."""

import sqlite3
import os

DB_PATH = "music_stores.db"

def add_cover_column():
    """Add cover_url column to records table if it doesn't exist."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(records)")
        columns = {row[1]: row[2] for row in cursor.fetchall()}
        
        if 'cover_url' not in columns:
            print("[MIGRATE] Adding cover_url column to records table...")
            cursor.execute("ALTER TABLE records ADD COLUMN cover_url TEXT")
            conn.commit()
            print("[MIGRATE] ✓ cover_url column added successfully")
        else:
            print("[MIGRATE] cover_url column already exists")
        
        conn.close()
        return True
    except Exception as e:
        print(f"[ERROR] Migration failed: {e}")
        return False

if __name__ == "__main__":
    if add_cover_column():
        print("[SUCCESS] Database migration completed")
    else:
        print("[FAILED] Database migration failed")
