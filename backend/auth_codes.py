"""Email verification codes for password reset and 2FA recovery."""
import datetime
import hashlib
import secrets
import sqlite3

from config import AUTH_CODE_EXPIRY_MINUTES, AUTH_CODE_PEPPER, DB_PATH

PURPOSE_PASSWORD_RESET = "password_reset"
PURPOSE_LOGIN_2FA = "login_2fa"
PURPOSE_DISABLE_2FA = "disable_2fa"

RATE_LIMIT_WINDOW_MINUTES = 15
RATE_LIMIT_MAX_SENDS = 5


def _connect():
    return sqlite3.connect(DB_PATH)


def _hash_code(email, purpose, code):
    payload = f"{AUTH_CODE_PEPPER}:{email.strip().lower()}:{purpose}:{code.strip()}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def generate_email_code():
    return f"{secrets.randbelow(1_000_000):06d}"


def _count_recent_sends(email, purpose):
    conn = _connect()
    since = (datetime.datetime.utcnow() - datetime.timedelta(minutes=RATE_LIMIT_WINDOW_MINUTES)).isoformat()
    count = conn.execute(
        """SELECT COUNT(*) FROM auth_email_codes
           WHERE email = ? AND purpose = ? AND created_at >= ?""",
        (email.strip().lower(), purpose, since),
    ).fetchone()[0]
    conn.close()
    return count


def create_and_store_code(email, purpose):
    email = email.strip().lower()
    if _count_recent_sends(email, purpose) >= RATE_LIMIT_MAX_SENDS:
        return None, "Too many codes requested. Wait a few minutes and try again."

    code = generate_email_code()
    code_hash = _hash_code(email, purpose, code)
    now = datetime.datetime.utcnow()
    expires = now + datetime.timedelta(minutes=AUTH_CODE_EXPIRY_MINUTES)

    conn = _connect()
    conn.execute(
        "UPDATE auth_email_codes SET used_at = ? WHERE email = ? AND purpose = ? AND used_at IS NULL",
        (now.isoformat(), email, purpose),
    )
    conn.execute(
        """INSERT INTO auth_email_codes (email, purpose, code_hash, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?)""",
        (email, purpose, code_hash, now.isoformat(), expires.isoformat()),
    )
    conn.commit()
    conn.close()
    return code, None


def verify_email_code(email, purpose, code):
    email = email.strip().lower()
    if not code or len(str(code).strip()) != 6 or not str(code).strip().isdigit():
        return False, "Enter a valid 6-digit code"

    code_hash = _hash_code(email, purpose, str(code).strip())
    conn = _connect()
    row = conn.execute(
        """SELECT id, expires_at, used_at FROM auth_email_codes
           WHERE email = ? AND purpose = ? AND code_hash = ?
           ORDER BY id DESC LIMIT 1""",
        (email, purpose, code_hash),
    ).fetchone()

    if not row:
        conn.close()
        return False, "Invalid or expired code"

    row_id, expires_at, used_at = row
    if used_at:
        conn.close()
        return False, "This code was already used"

    try:
        expires = datetime.datetime.fromisoformat(expires_at)
    except ValueError:
        expires = datetime.datetime.utcnow()
    if datetime.datetime.utcnow() > expires:
        conn.close()
        return False, "Code expired. Request a new one."

    used_now = datetime.datetime.utcnow().isoformat()
    conn.execute("UPDATE auth_email_codes SET used_at = ? WHERE id = ?", (used_now, row_id))
    conn.commit()
    conn.close()
    return True, None
