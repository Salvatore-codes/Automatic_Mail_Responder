import sqlite3
import os

print("CWD:", os.getcwd())
for root, dirs, files in os.walk('.'):
    for f in files:
        if f.endswith('.db') and '.git' not in root:
            db_path = os.path.join(root, f)
            print("DB Found:", db_path)
            try:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                print("  Tables:", cursor.fetchall())
                # If there's a verticals or settings table, print its rows
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%vertical%'")
                tbls = cursor.fetchall()
                if tbls:
                    for t in tbls:
                        tname = t[0]
                        cursor.execute(f"SELECT * FROM {tname} LIMIT 5")
                        print(f"  Rows from {tname}:", cursor.fetchall())
                conn.close()
            except Exception as e:
                print("  Error:", e)
