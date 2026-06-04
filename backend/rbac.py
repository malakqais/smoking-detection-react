"""Role-based access control, sessions, and audit logging."""
import datetime
import secrets
import sqlite3
from functools import wraps

from flask import jsonify, request
from werkzeug.security import check_password_hash

from config import DB_PATH, SESSION_TTL_HOURS, SUPERVISOR_GRANT_TTL_MINUTES

ROLES = ("user", "manager", "admin", "supervisor")
STAFF_ROLES = ("manager", "admin", "supervisor")
ELEVATED_STAFF_ROLES = ("admin", "supervisor")

# Legacy DB values were migrated to manager in database._migrate()
ROLE_ALIASES = {}


def _connect():
    return sqlite3.connect(DB_PATH)


def normalize_role(role):
    if not role:
        return "user"
    role = role.strip().lower()
    return ROLE_ALIASES.get(role, role)


def role_rank(role):
    role = normalize_role(role)
    order = {"user": 0, "manager": 1, "admin": 2, "supervisor": 3}
    return order.get(role, 0)


def user_has_role(user, *allowed):
    if not user:
        return False
    role = normalize_role(user.get("role"))
    allowed_norm = {normalize_role(r) for r in allowed}
    return role in allowed_norm


def is_staff(user):
    return user_has_role(user, *STAFF_ROLES)


def is_elevated_staff(user):
    return user_has_role(user, *ELEVATED_STAFF_ROLES)


def is_supervisor(user):
    return user_has_role(user, "supervisor")


def can_use_supervisor_console(user):
    return is_supervisor(user)


def permissions_for(role):
    role = normalize_role(role)
    return {
        "user": {
            "dashboard_scope": "self",
            "view_all_violations": False,
            "manage_detection": False,
            "manage_users": False,
            "manage_managers": False,
            "manage_admins": False,
            "view_audit": False,
            "clear_violations": False,
            "smtp_settings": False,
            "supervisor_console": False,
            "apply_manager_role": True,
        },
        "manager": {
            "dashboard_scope": "all",
            "view_all_violations": True,
            "manage_detection": True,
            "manage_users": False,
            "suspend_users": False,
            "export_reports": False,
            "manage_managers": False,
            "manage_admins": False,
            "view_audit": False,
            "review_disputes": True,
            "vote_disputes": False,
            "decide_disputes": False,
            "remove_violations": True,
            "smtp_settings": False,
            "supervisor_console": False,
            "admin_panel": True,
        },
        "admin": {
            "dashboard_scope": "all",
            "view_all_violations": True,
            "manage_detection": True,
            "manage_users": True,
            "suspend_users": True,
            "export_reports": True,
            "manage_managers": False,
            "manage_admins": False,
            "view_audit": True,
            "review_disputes": False,
            "vote_disputes": True,
            "decide_disputes": False,
            "remove_violations": False,
            "smtp_settings": True,
            "supervisor_console": False,
            "admin_panel": True,
        },
        "supervisor": {
            "dashboard_scope": "all",
            "view_all_violations": True,
            "manage_detection": True,
            "manage_users": True,
            "suspend_users": True,
            "export_reports": True,
            "manage_managers": True,
            "manage_admins": True,
            "view_audit": True,
            "review_disputes": True,
            "vote_disputes": False,
            "decide_disputes": True,
            "remove_violations": True,
            "smtp_settings": True,
            "supervisor_console": True,
            "admin_panel": True,
        },
    }.get(role, {})


def _row_to_user(row):
    if not row:
        return None
    keys = (
        "id", "name", "email", "role", "created_at", "account_status",
        "two_factor_enabled", "suspended_at", "suspend_reason",
        "login_notifications_enabled",
    )
    data = dict(zip(keys, row))
    data["role"] = normalize_role(data["role"])
    data["permissions"] = permissions_for(data["role"])
    data["two_factor_enabled"] = bool(data.get("two_factor_enabled"))
    raw_ln = data.get("login_notifications_enabled")
    data["login_notifications_enabled"] = True if raw_ln is None else bool(raw_ln)
    return data


def get_user_by_email(email):
    conn = _connect()
    row = conn.execute(
        """SELECT id, name, email, role, created_at, account_status,
                  two_factor_enabled, suspended_at, suspend_reason,
                  login_notifications_enabled
           FROM users WHERE email = ?""",
        (email,),
    ).fetchone()
    conn.close()
    return _row_to_user(row)


def get_user_by_id(uid):
    conn = _connect()
    row = conn.execute(
        """SELECT id, name, email, role, created_at, account_status,
                  two_factor_enabled, suspended_at, suspend_reason,
                  login_notifications_enabled
           FROM users WHERE id = ?""",
        (uid,),
    ).fetchone()
    conn.close()
    return _row_to_user(row)


def public_user_payload(user, session_token=None):
    perms = user.get("permissions") or permissions_for(user["role"])
    payload = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "created_at": user.get("created_at"),
        "account_status": user.get("account_status") or "active",
        "two_factor_enabled": user.get("two_factor_enabled", False),
        "login_notifications_enabled": user.get("login_notifications_enabled", True),
        "permissions": perms,
        "requires_staff_2fa_setup": is_staff(user) and not user.get("two_factor_enabled"),
    }
    if session_token:
        payload["session_token"] = session_token
    return payload


def create_session(user_id):
    token = secrets.token_urlsafe(48)
    expires = datetime.datetime.utcnow() + datetime.timedelta(hours=SESSION_TTL_HOURS)
    conn = _connect()
    conn.execute(
        "INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
        (token, user_id, expires.isoformat()),
    )
    conn.commit()
    conn.close()
    return token


def revoke_session(token):
    if not token:
        return
    conn = _connect()
    conn.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def revoke_user_sessions(user_id):
    if not user_id:
        return
    conn = _connect()
    conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()


def get_user_from_token(token):
    if not token:
        return None
    conn = _connect()
    row = conn.execute(
        """SELECT u.id, u.name, u.email, u.role, u.created_at, u.account_status,
                  u.two_factor_enabled, u.suspended_at, u.suspend_reason, s.expires_at
           FROM auth_sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.token = ?""",
        (token,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    expires_at = row[-1]
    try:
        if datetime.datetime.fromisoformat(expires_at) < datetime.datetime.utcnow():
            revoke_session(token)
            return None
    except ValueError:
        pass
    user = _row_to_user(row[:-1])
    if user.get("account_status") == "suspended":
        return None
    return user


def extract_bearer_token():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return request.headers.get("X-Session-Token")


def get_current_user():
    return get_user_from_token(extract_bearer_token())


def log_audit(actor, action, target_type=None, target_id=None, details=None):
    conn = _connect()
    conn.execute(
        """INSERT INTO audit_logs
           (actor_id, actor_email, actor_role, action, target_type, target_id, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
        (
            actor["id"] if actor else None,
            actor.get("email") if actor else "system",
            actor.get("role") if actor else "system",
            action,
            target_type,
            str(target_id) if target_id is not None else None,
            details,
        ),
    )
    conn.commit()
    conn.close()


def count_supervisors(conn=None):
    own = conn is None
    if own:
        conn = _connect()
    count = conn.execute(
        "SELECT COUNT(*) FROM users WHERE role = 'supervisor' AND account_status = 'active'"
    ).fetchone()[0]
    if own:
        conn.close()
    return count


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"status": "error", "message": "Authentication required"}), 401
        return fn(user, *args, **kwargs)
    return wrapper


def require_roles(*roles):
    def decorator(fn):
        @wraps(fn)
        @require_auth
        def wrapper(user, *args, **kwargs):
            if not user_has_role(user, *roles):
                return jsonify({
                    "status": "error",
                    "message": "You do not have permission for this action",
                }), 403
            return fn(user, *args, **kwargs)
        return wrapper
    return decorator


def _user_totp_secret(user_id):
    conn = _connect()
    row = conn.execute(
        "SELECT two_factor_secret FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    conn.close()
    return row[0] if row and row[0] else None


def require_manager_2fa(actor, totp_code, verify_totp_fn):
    """Managers and admins confirm sensitive actions with 2FA; supervisors are exempt."""
    role = normalize_role(actor["role"])
    if role == "supervisor":
        return True, None
    if role not in ("manager", "admin"):
        return True, None
    if not actor.get("two_factor_enabled"):
        return False, "You must enable 2FA before this action"
    secret = _user_totp_secret(actor["id"])
    if not secret:
        return False, "2FA is not configured on your account"
    if not totp_code or not verify_totp_fn(secret, str(totp_code).strip()):
        return False, "Invalid 2FA code"
    return True, None


def actor_may_suspend_target(actor, target):
    """Who may suspend whom."""
    actor_role = normalize_role(actor["role"])
    target_role = normalize_role(target["role"])
    if target_role == "supervisor":
        return False, "The supervisor account cannot be suspended"
    if actor["id"] == target["id"]:
        return False, "You cannot suspend your own account"
    if target_role in ("manager", "admin") and actor_role != "supervisor":
        return False, "Only the supervisor can suspend managers or admins"
    return True, None


def require_supervisor_2fa(user, totp_code, verify_totp_fn):
    if normalize_role(user["role"]) != "supervisor":
        return False, "Only the system supervisor can perform this action"
    if not user.get("two_factor_enabled"):
        return False, "Supervisor must enable 2FA before privileged actions"
    secret = _user_totp_secret(user["id"])
    if not secret:
        return False, "2FA is not configured for supervisor account"
    if not totp_code or not verify_totp_fn(secret, str(totp_code).strip()):
        return False, "Invalid supervisor 2FA code"
    return True, None


def _supervisor_totp_step_used(supervisor_id, time_step, conn=None):
    own = conn is None
    if own:
        conn = _connect()
    row = conn.execute(
        "SELECT 1 FROM used_supervisor_totp_steps WHERE supervisor_id = ? AND totp_time_step = ?",
        (supervisor_id, time_step),
    ).fetchone()
    if own:
        conn.close()
    return row is not None


def create_supervisor_action_grant(supervisor, totp_code):
    from totp_util import validate_totp_format, verify_totp_token_with_step

    if normalize_role(supervisor["role"]) != "supervisor":
        return False, "Only the system supervisor can perform this action", None
    if not supervisor.get("two_factor_enabled"):
        return False, "Supervisor must enable 2FA before privileged actions", None

    ok_fmt, fmt_or_err = validate_totp_format(totp_code)
    if not ok_fmt:
        return False, fmt_or_err, None

    secret = _user_totp_secret(supervisor["id"])
    if not secret:
        return False, "2FA is not configured for supervisor account", None

    ok, time_step = verify_totp_token_with_step(secret, fmt_or_err)
    if not ok or time_step is None:
        return False, "Invalid or expired 6-digit code", None

    conn = _connect()
    if _supervisor_totp_step_used(supervisor["id"], time_step, conn):
        conn.close()
        return False, "This code was already used. Wait for a new code from your authenticator.", None

    now = datetime.datetime.utcnow()
    expires = now + datetime.timedelta(minutes=SUPERVISOR_GRANT_TTL_MINUTES)
    token = secrets.token_urlsafe(32)
    used_now = now.isoformat()
    conn.execute(
        "DELETE FROM supervisor_action_grants WHERE supervisor_id = ?",
        (supervisor["id"],),
    )
    conn.execute(
        """INSERT INTO supervisor_action_grants
           (token, supervisor_id, totp_time_step, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?)""",
        (token, supervisor["id"], time_step, used_now, expires.isoformat()),
    )
    conn.execute(
        """INSERT OR IGNORE INTO used_supervisor_totp_steps
           (supervisor_id, totp_time_step, used_at) VALUES (?, ?, ?)""",
        (supervisor["id"], time_step, used_now),
    )
    conn.commit()
    conn.close()
    return True, None, token


def validate_supervisor_action_grant(supervisor_id, grant_token):
    """Check console unlock token; reusable until expiry (not single-action)."""
    if not grant_token:
        return False, "Validate your 6-digit code first"

    conn = _connect()
    row = conn.execute(
        """SELECT expires_at, used_at
           FROM supervisor_action_grants
           WHERE token = ? AND supervisor_id = ?""",
        (grant_token, supervisor_id),
    ).fetchone()
    if not row:
        conn.close()
        return False, "Invalid or expired verification. Validate a new 6-digit code."

    expires_at, used_at = row
    if used_at:
        conn.close()
        return False, "This session ended. Validate a new 6-digit code."

    try:
        expires = datetime.datetime.fromisoformat(expires_at)
    except ValueError:
        expires = datetime.datetime.utcnow()
    if datetime.datetime.utcnow() > expires:
        conn.close()
        return False, "Console unlock expired. Validate your 6-digit code again."

    conn.close()
    return True, None


def consume_supervisor_action_grant(supervisor_id, grant_token):
    """Backward-compatible alias for validate_supervisor_action_grant."""
    return validate_supervisor_action_grant(supervisor_id, grant_token)


def verify_password(email, password):
    conn = _connect()
    row = conn.execute(
        "SELECT id, password, account_status FROM users WHERE email = ?", (email,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    uid, stored, status = row
    if status == "suspended":
        return "suspended"
    if stored == password or check_password_hash(stored, password):
        return uid
    return None
