import sqlite3
import os
import re
import time
import argparse
from datetime import datetime, timedelta
from pathlib import Path

# Paths
BASE_DIR = Path.home() / "flock-cli"
DB_PATH = BASE_DIR / "flock_vault.db"
LOG_PATH = BASE_DIR / "executed.log"
POSITION_FILE = BASE_DIR / ".knowledge_pos"

# Config
TAGS = ["#SYS", "#UTIL", "#SCRIPT", "#CONFIG", "#NETWORK", "#GPT"]

def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db

def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS knowledge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tag TEXT,
                content TEXT UNIQUE,
                source TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                execution_count INTEGER DEFAULT 1
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS archive (
                id INTEGER PRIMARY KEY,
                tag TEXT,
                content TEXT,
                source TEXT,
                timestamp DATETIME,
                execution_count INTEGER
            )
        """)
        db.commit()

def auto_tag(line):
    for tag in TAGS:
        if tag in line:
            return tag
    return "#MISC"

def process_logs():
    if not LOG_PATH.exists():
        return

    # Keep track of last read position
    last_pos = 0
    if POSITION_FILE.exists():
        try:
            last_pos = int(POSITION_FILE.read_text().strip())
        except:
            last_pos = 0

    with open(LOG_PATH, 'r') as f:
        f.seek(last_pos)
        lines = f.readlines()
        new_pos = f.tell()

    if not lines:
        return

    with get_db() as db:
        for line in lines:
            line = line.strip()
            if not line: continue
            
            tag = auto_tag(line)
            try:
                db.execute("""
                    INSERT INTO knowledge (tag, content, source) 
                    VALUES (?, ?, ?)
                    ON CONFLICT(content) DO UPDATE SET 
                    execution_count = execution_count + 1,
                    timestamp = CURRENT_TIMESTAMP
                """, (tag, line, "executed.log"))
            except Exception as e:
                print(f"Error storing line: {e}")
        db.commit()

    POSITION_FILE.write_text(str(new_pos))

def archive_old_entries():
    with get_db() as db:
        # Move entries older than 7 days
        cutoff = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')
        db.execute("""
            INSERT INTO archive (id, tag, content, source, timestamp, execution_count)
            SELECT id, tag, content, source, timestamp, execution_count 
            FROM knowledge 
            WHERE timestamp < ?
        """, (cutoff,))
        db.execute("DELETE FROM knowledge WHERE timestamp < ?", (cutoff,))
        db.commit()

def query_knowledge(tag):
    with get_db() as db:
        cursor = db.execute("SELECT * FROM knowledge WHERE tag = ? ORDER BY timestamp DESC", (tag,))
        rows = cursor.fetchall()
        if not rows:
            print(f"No entries found for tag: {tag}")
            return
        
        print(f"\n--- Knowledge matching {tag} ---")
        for row in rows:
            print(f"[{row['timestamp']}] (x{row['execution_count']}): {row['content']}")

def run_daemon():
    print("Flock Knowledge Daemon started. Monitoring logs...")
    while True:
        process_logs()
        archive_old_entries()
        time.sleep(60)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Flock Knowledge Vault")
    parser.add_argument("--query", type=str, help="Query entries by tag (e.g., #SCRIPT)")
    parser.add_argument("--daemon", action="store_true", help="Run as monitoring daemon")
    
    args = parser.parse_args()
    
    init_db()
    
    if args.query:
        query_knowledge(args.query)
    elif args.daemon:
        run_daemon()
    else:
        # Default behavior: single process pass
        process_logs()
        archive_old_entries()
        print("Log processing complete.")
