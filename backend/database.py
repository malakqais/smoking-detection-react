import sqlite3
from config import DB_PATH


def _connect():
    return sqlite3.connect(DB_PATH)


def init_db():
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS violations
                      (id INTEGER PRIMARY KEY AUTOINCREMENT,
                       timestamp TEXT,
                       image_path TEXT,
                       person_name TEXT,
                       location TEXT DEFAULT 'Unknown')''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS team
                      (id INTEGER PRIMARY KEY AUTOINCREMENT,
                       name TEXT,
                       email TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS app_settings
                      (key TEXT PRIMARY KEY,
                       value TEXT)''')
    conn.commit()
    conn.close()
    _migrate()


def _migrate():
    conn = _connect()
    for sql in [
        "ALTER TABLE violations ADD COLUMN location TEXT DEFAULT 'Unknown'",
        "ALTER TABLE violations ADD COLUMN detected_type TEXT DEFAULT 'unknown'",
    ]:
        try:
            conn.execute(sql)
            conn.commit()
        except sqlite3.OperationalError:
            pass
    conn.close()


def insert_violation(timestamp, image_path, person_name="Unknown", location="Unknown", detected_type="unknown"):
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO violations (timestamp, image_path, person_name, location, detected_type) VALUES (?, ?, ?, ?, ?)",
        (timestamp, image_path, person_name, location, detected_type)
    )
    conn.commit()
    conn.close()


def get_user_email(name):
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute("SELECT email FROM users WHERE name = ?", (name,))
    result = cursor.fetchone()
    conn.close()
    return result[0] if result else None


def get_app_setting(key, default=None):
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else default


def set_app_setting(key, value):
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()
    conn.close()
