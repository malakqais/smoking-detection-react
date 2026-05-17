import sqlite3


def init_db():
    conn = sqlite3.connect('violations.db')
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
    conn.commit()
    conn.close()
    _migrate()


def _migrate():
    conn = sqlite3.connect('violations.db')
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
    conn = sqlite3.connect('violations.db')
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO violations (timestamp, image_path, person_name, location, detected_type) VALUES (?, ?, ?, ?, ?)",
        (timestamp, image_path, person_name, location, detected_type)
    )
    conn.commit()
    conn.close()


def get_user_email(name):
    conn = sqlite3.connect('violations.db')
    cursor = conn.cursor()
    cursor.execute("SELECT email FROM team WHERE name = ?", (name,))
    result = cursor.fetchone()
    conn.close()
    return result[0] if result else None
