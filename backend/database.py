import sqlite3

def init_db():
    conn = sqlite3.connect('violations.db')
    cursor = conn.cursor()
    # إنشاء جدول المخالفات
    cursor.execute('''CREATE TABLE IF NOT EXISTS violations
                      (id INTEGER PRIMARY KEY AUTOINCREMENT,
                       timestamp TEXT,
                       image_path TEXT,
                       person_name TEXT)''')
    # إنشاء جدول الفريق (عشان الإيميلات)
    cursor.execute('''CREATE TABLE IF NOT EXISTS team
                      (id INTEGER PRIMARY KEY AUTOINCREMENT,
                       name TEXT,
                       email TEXT)''')
    conn.commit()
    conn.close()

def insert_violation(timestamp, image_path, person_name):
    conn = sqlite3.connect('violations.db')
    cursor = conn.cursor()
    cursor.execute("INSERT INTO violations (timestamp, image_path, person_name) VALUES (?, ?, ?)",
                   (timestamp, image_path, person_name))
    conn.commit()
    conn.close()

# هذه هي الوظيفة اللي كانت ناقصة ومسببة المشكلة!
def get_user_email(name):
    conn = sqlite3.connect('violations.db')
    cursor = conn.cursor()
    cursor.execute("SELECT email FROM team WHERE name = ?", (name,))
    result = cursor.fetchone()
    conn.close()
    return result[0] if result else None