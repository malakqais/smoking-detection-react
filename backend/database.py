import sqlite3
from config import DB_PATH, SUPERVISOR_BOOTSTRAP_EMAIL, SUPERVISOR_EMAIL_DOMAIN


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
    cursor.execute('''CREATE TABLE IF NOT EXISTS users
                      (id INTEGER PRIMARY KEY AUTOINCREMENT,
                       name TEXT,
                       email TEXT UNIQUE,
                       password TEXT,
                       role TEXT DEFAULT 'user',
                       created_at TEXT,
                       account_status TEXT DEFAULT 'active',
                       two_factor_secret TEXT,
                       two_factor_enabled INTEGER DEFAULT 0,
                       suspended_at TEXT,
                       suspended_by INTEGER,
                       suspend_reason TEXT,
                       promoted_by INTEGER)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS auth_sessions
                      (token TEXT PRIMARY KEY,
                       user_id INTEGER NOT NULL,
                       expires_at TEXT NOT NULL)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS audit_logs
                      (id INTEGER PRIMARY KEY AUTOINCREMENT,
                       actor_id INTEGER,
                       actor_email TEXT,
                       actor_role TEXT,
                       action TEXT NOT NULL,
                       target_type TEXT,
                       target_id TEXT,
                       details TEXT,
                       created_at TEXT NOT NULL)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS staff_requests
                      (id INTEGER PRIMARY KEY AUTOINCREMENT,
                       request_type TEXT NOT NULL,
                       subject_user_id INTEGER NOT NULL,
                       requested_by_id INTEGER,
                       status TEXT DEFAULT 'pending',
                       note TEXT,
                       reviewed_by_id INTEGER,
                       reviewed_at TEXT,
                       created_at TEXT NOT NULL)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS supervisor_action_grants
                      (token TEXT PRIMARY KEY,
                       supervisor_id INTEGER NOT NULL,
                       totp_time_step INTEGER NOT NULL,
                       created_at TEXT NOT NULL,
                       expires_at TEXT NOT NULL,
                       used_at TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS used_supervisor_totp_steps
                      (supervisor_id INTEGER NOT NULL,
                       totp_time_step INTEGER NOT NULL,
                       used_at TEXT NOT NULL,
                       PRIMARY KEY (supervisor_id, totp_time_step))''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS auth_email_codes
                      (id INTEGER PRIMARY KEY AUTOINCREMENT,
                       email TEXT NOT NULL,
                       purpose TEXT NOT NULL,
                       code_hash TEXT NOT NULL,
                       created_at TEXT NOT NULL,
                       expires_at TEXT NOT NULL,
                       used_at TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS violation_disputes
                      (id INTEGER PRIMARY KEY AUTOINCREMENT,
                       violation_id INTEGER NOT NULL,
                       user_id INTEGER NOT NULL,
                       reasons_json TEXT NOT NULL,
                       user_note TEXT,
                       status TEXT NOT NULL DEFAULT 'pending_admin',
                       supervisor_note TEXT,
                       created_at TEXT NOT NULL,
                       updated_at TEXT NOT NULL)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS dispute_admin_votes
                      (id INTEGER PRIMARY KEY AUTOINCREMENT,
                       dispute_id INTEGER NOT NULL,
                       admin_id INTEGER NOT NULL,
                       vote TEXT NOT NULL,
                       created_at TEXT NOT NULL,
                       UNIQUE(dispute_id, admin_id))''')
    conn.commit()
    conn.close()
    _migrate()
    bootstrap_roles()


def _migrate():
    conn = _connect()
    for sql in [
        "ALTER TABLE violations ADD COLUMN location TEXT DEFAULT 'Unknown'",
        "ALTER TABLE violations ADD COLUMN detected_type TEXT DEFAULT 'unknown'",
        "ALTER TABLE users ADD COLUMN account_status TEXT DEFAULT 'active'",
        "ALTER TABLE users ADD COLUMN suspended_at TEXT",
        "ALTER TABLE users ADD COLUMN suspended_by INTEGER",
        "ALTER TABLE users ADD COLUMN suspend_reason TEXT",
        "ALTER TABLE users ADD COLUMN promoted_by INTEGER",
        "ALTER TABLE users ADD COLUMN login_notifications_enabled INTEGER DEFAULT 1",
        "ALTER TABLE violations ADD COLUMN user_id INTEGER",
        "ALTER TABLE violations ADD COLUMN paid INTEGER DEFAULT 0",
        "ALTER TABLE violation_disputes ADD COLUMN manager_reviewer_id INTEGER",
        "ALTER TABLE violation_disputes ADD COLUMN manager_decision TEXT",
        "ALTER TABLE violation_disputes ADD COLUMN manager_note TEXT",
        "ALTER TABLE violation_disputes ADD COLUMN manager_reviewed_at TEXT",
    ]:
        try:
            conn.execute(sql)
            conn.commit()
        except sqlite3.OperationalError:
            pass

    conn.execute("UPDATE users SET account_status = 'active' WHERE account_status IS NULL")
    try:
        conn.execute(
            "UPDATE users SET login_notifications_enabled = 1 WHERE login_notifications_enabled IS NULL"
        )
        conn.commit()
    except sqlite3.OperationalError:
        pass
    conn.close()


def _pick_supervisor_to_keep(supervisors):
    """supervisors: list of (id, email, account_status). Returns id to keep."""
    if not supervisors:
        return None
    active = [s for s in supervisors if (s[2] or "active") == "active"]
    pool = active if active else list(supervisors)
    if SUPERVISOR_BOOTSTRAP_EMAIL:
        for sid, email, _status in pool:
            if (email or "").strip().lower() == SUPERVISOR_BOOTSTRAP_EMAIL:
                return sid
    pool.sort(key=lambda s: s[0])
    return pool[0][0]


def bootstrap_roles():
    """Ensure exactly one supervisor: explicit email, then @domain account, then first manager."""
    conn = _connect()
    supervisors = conn.execute(
        """SELECT id, email, account_status FROM users
           WHERE role = 'supervisor' ORDER BY id ASC"""
    ).fetchall()

    if len(supervisors) > 1:
        keep_id = _pick_supervisor_to_keep(supervisors)
        conn.execute(
            "UPDATE users SET role = 'manager' WHERE role = 'supervisor' AND id != ?",
            (keep_id,),
        )
        conn.commit()
        conn.close()
        return

    if len(supervisors) == 1 and _enforce_canonical_supervisor(conn):
        conn.close()
        return

    if len(supervisors) == 1:
        conn.close()
        return

    target_id = None
    if SUPERVISOR_BOOTSTRAP_EMAIL:
        row = conn.execute(
            "SELECT id FROM users WHERE lower(email) = ? AND account_status = 'active'",
            (SUPERVISOR_BOOTSTRAP_EMAIL,),
        ).fetchone()
        if row:
            target_id = row[0]

    if target_id is None and SUPERVISOR_EMAIL_DOMAIN:
        row = conn.execute(
            """SELECT id FROM users
               WHERE lower(email) LIKE ? AND account_status = 'active'
               ORDER BY id ASC LIMIT 1""",
            (f"%{SUPERVISOR_EMAIL_DOMAIN}",),
        ).fetchone()
        if row:
            target_id = row[0]

    if target_id is None:
        row = conn.execute(
            "SELECT id FROM users WHERE role = 'manager' AND account_status = 'active' ORDER BY id ASC LIMIT 1"
        ).fetchone()
        if row:
            target_id = row[0]

    if target_id is not None:
        conn.execute("UPDATE users SET role = 'supervisor' WHERE id = ?", (target_id,))
        conn.commit()

    _enforce_canonical_supervisor(conn)
    conn.close()


def _enforce_canonical_supervisor(conn):
    """When SMOKEDET_SUPERVISOR_EMAIL is set, that account becomes the only supervisor."""
    if not SUPERVISOR_BOOTSTRAP_EMAIL:
        return False
    row = conn.execute(
        "SELECT id, role FROM users WHERE lower(email) = ? AND account_status = 'active'",
        (SUPERVISOR_BOOTSTRAP_EMAIL,),
    ).fetchone()
    if not row:
        return False
    canonical_id, role = row
    if role == "supervisor":
        others = conn.execute(
            "SELECT COUNT(*) FROM users WHERE role = 'supervisor' AND id != ?",
            (canonical_id,),
        ).fetchone()[0]
        if others:
            conn.execute(
                "UPDATE users SET role = 'manager' WHERE role = 'supervisor' AND id != ?",
                (canonical_id,),
            )
            conn.commit()
        return True
    conn.execute(
        "UPDATE users SET role = 'manager' WHERE role = 'supervisor' AND id != ?",
        (canonical_id,),
    )
    conn.execute("UPDATE users SET role = 'supervisor' WHERE id = ?", (canonical_id,))
    conn.commit()
    return True


def insert_violation(
    timestamp,
    image_path,
    person_name="Unknown",
    location="Unknown",
    detected_type="unknown",
    user_id=None,
):
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO violations
           (timestamp, image_path, person_name, location, detected_type, user_id, paid)
           VALUES (?, ?, ?, ?, ?, ?, 0)""",
        (timestamp, image_path, person_name, location, detected_type, user_id),
    )
    conn.commit()
    conn.close()


def mark_user_violations_paid(user_id):
    """Mark all unpaid violations for a user as paid."""
    if not user_id:
        return 0
    conn = _connect()
    cur = conn.execute(
        "UPDATE violations SET paid = 1 WHERE user_id = ? AND COALESCE(paid, 0) = 0",
        (user_id,),
    )
    conn.commit()
    updated = cur.rowcount
    conn.close()
    return updated


def get_user_id_by_label(label):
    """Resolve webcam username or display name to users.id."""
    if not label:
        return None
    conn = _connect()
    row = conn.execute(
        "SELECT id FROM users WHERE name = ? OR email = ? LIMIT 1",
        (label, label),
    ).fetchone()
    conn.close()
    return row[0] if row else None


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
