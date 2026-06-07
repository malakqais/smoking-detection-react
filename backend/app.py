from flask import Flask, request, jsonify, send_from_directory
import sqlite3
import os
import datetime
import hmac
import hashlib
import time
import base64
import secrets
import urllib.parse
import numpy as np
import cv2
from werkzeug.security import generate_password_hash, check_password_hash
from database import init_db, get_app_setting, set_app_setting, bootstrap_roles, mark_user_violations_paid
from config import AUTH_CODE_EXPIRY_MINUTES, DB_PATH, API_PORT, FLASK_DEBUG, SUPERVISOR_GRANT_TTL_MINUTES
from auth_codes import (
    PURPOSE_DISABLE_2FA,
    PURPOSE_LOGIN_2FA,
    PURPOSE_PASSWORD_RESET,
    create_and_store_code,
    verify_email_code,
)
from email_service import send_login_notification_email, send_security_code_email, send_test_email
from client_info import login_context_from_request
import detection as det
from rbac import (
    actor_may_suspend_target,
    consume_supervisor_action_grant,
    create_session,
    create_supervisor_action_grant,
    extract_bearer_token,
    get_current_user,
    get_user_by_email,
    get_user_by_id,
    is_staff,
    log_audit,
    normalize_role,
    public_user_payload,
    require_auth,
    require_roles,
    require_supervisor_2fa,
    require_manager_2fa,
    revoke_session,
    revoke_user_sessions,
    STAFF_ROLES,
)
from totp_util import verify_totp_token

app = Flask(__name__)
init_db()


def _connect_db():
    return sqlite3.connect(DB_PATH)


@app.after_request
def after_request(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Session-Token'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return response


@app.route('/api/auth/me', methods=['GET'])
@require_auth
def auth_me(user):
    bootstrap_roles()
    fresh = get_user_by_id(user["id"]) or user
    return jsonify({"status": "success", "user": public_user_payload(fresh)})


_AUTH_RECOVERY_MSG = "If an account exists for this email, a verification code has been sent."


def _maybe_send_login_notification(user_obj, request_data=None):
    if not user_obj or not user_obj.get("login_notifications_enabled", True):
        return False
    try:
        ctx = login_context_from_request(request_data)
        login_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return send_login_notification_email(
            user_obj["email"],
            user_obj.get("name") or "User",
            ip_address=ctx["ip_address"],
            os_name=ctx["os_name"],
            browser=ctx["browser"],
            user_agent=ctx["user_agent"],
            login_time=login_time,
            language=ctx.get("language") or "",
        )
    except Exception as exc:
        print(f"[Auth] Login notification skipped: {exc}")
        return False


def _send_auth_code(email, purpose, label):
    user = get_user_by_email(email)
    if not user or (user.get("account_status") or "active") == "suspended":
        return True, None
    code, err = create_and_store_code(email, purpose)
    if err:
        return False, err
    if code and not send_security_code_email(email, code, label, AUTH_CODE_EXPIRY_MINUTES):
        return False, "Could not send email. Check SMTP settings."
    return True, None


@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({"status": "error", "message": "Email is required"}), 400
    ok, err = _send_auth_code(email, PURPOSE_PASSWORD_RESET, "Password reset")
    if not ok and err:
        return jsonify({"status": "error", "message": err}), 429
    return jsonify({"status": "success", "message": _AUTH_RECOVERY_MSG})


@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    code = data.get('code')
    new_password = data.get('new_password') or data.get('password') or ""

    if not email or not code:
        return jsonify({"status": "error", "message": "Email and code are required"}), 400
    if len(new_password) < 8:
        return jsonify({"status": "error", "message": "Password must be at least 8 characters"}), 400

    ok, err = verify_email_code(email, PURPOSE_PASSWORD_RESET, code)
    if not ok:
        return jsonify({"status": "error", "message": err}), 403

    user = get_user_by_email(email)
    if not user:
        return jsonify({"status": "error", "message": "Account not found"}), 404

    hashed = generate_password_hash(new_password)
    conn = _connect_db()
    conn.execute("UPDATE users SET password = ? WHERE email = ?", (hashed, email))
    conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user["id"],))
    conn.commit()
    conn.close()
    log_audit(user, "auth.password_reset")
    return jsonify({"status": "success", "message": "Password updated. You can sign in now."})


@app.route('/api/auth/2fa/send-email-code', methods=['POST'])
def send_2fa_email_code():
    data = request.json or {}
    purpose = (data.get('purpose') or PURPOSE_LOGIN_2FA).strip()
    email = (data.get('email') or '').strip().lower()

    if purpose == PURPOSE_DISABLE_2FA:
        user = get_current_user()
        if not user:
            return jsonify({"status": "error", "message": "Authentication required"}), 401
        email = user["email"]
        if not user.get("two_factor_enabled"):
            return jsonify({"status": "error", "message": "2FA is not enabled on this account"}), 400
        label = "Disable two-factor authentication"
    elif purpose == PURPOSE_LOGIN_2FA:
        if not email:
            return jsonify({"status": "error", "message": "Email is required"}), 400
        target = get_user_by_email(email)
        if not target or not target.get("two_factor_enabled"):
            return jsonify({"status": "success", "message": _AUTH_RECOVERY_MSG})
        label = "Sign-in verification"
    else:
        return jsonify({"status": "error", "message": "Invalid purpose"}), 400

    ok, err = _send_auth_code(email, purpose, label)
    if not ok and err:
        return jsonify({"status": "error", "message": err}), 429
    return jsonify({"status": "success", "message": _AUTH_RECOVERY_MSG})


@app.route('/api/auth/login/email-2fa', methods=['POST'])
def login_email_2fa():
    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password', "")
    code = data.get('code')

    if not email or not password or not code:
        return jsonify({"status": "error", "message": "Email, password, and code are required"}), 400

    conn = _connect_db()
    user_row = conn.execute(
        """SELECT name, email, role, created_at, password, two_factor_enabled, id, account_status
           FROM users WHERE email = ?""",
        (email,),
    ).fetchone()
    conn.close()
    if not user_row:
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

    name, email, role, created_at, stored_pass, two_fa_enabled, uid, account_status = user_row
    if account_status == "suspended":
        return jsonify({"status": "error", "message": "Account suspended"}), 403
    if not two_fa_enabled:
        return jsonify({"status": "error", "message": "2FA is not enabled for this account"}), 400
    if not (stored_pass == password or check_password_hash(stored_pass, password)):
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

    ok, err = verify_email_code(email, PURPOSE_LOGIN_2FA, code)
    if not ok:
        return jsonify({"status": "error", "message": err}), 403

    bootstrap_roles()
    user_obj = get_user_by_id(uid)
    token = create_session(uid)
    log_audit(user_obj, "auth.login_email_2fa")
    login_notif_sent = _maybe_send_login_notification(user_obj, data)
    return jsonify({
        "status": "success",
        "user": public_user_payload(user_obj, session_token=token),
        "login_notification_sent": login_notif_sent,
    })


@app.route('/api/auth/2fa/disable-email', methods=['POST'])
@require_auth
def disable_2fa_via_email(user):
    data = request.json or {}
    code = data.get('code')
    if not user.get("two_factor_enabled"):
        return jsonify({"status": "success", "message": "2FA is already disabled"})

    ok, err = verify_email_code(user["email"], PURPOSE_DISABLE_2FA, code)
    if not ok:
        return jsonify({"status": "error", "message": err}), 403

    conn = _connect_db()
    conn.execute(
        "UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?",
        (user["id"],),
    )
    conn.commit()
    conn.close()
    log_audit(user, "auth.2fa_disable_email")
    return jsonify({"status": "success", "message": "Two-factor authentication disabled. You can set it up again in Settings."})


@app.route('/api/auth/supervisor-2fa/verify', methods=['POST'])
@require_roles('supervisor')
def verify_supervisor_2fa(supervisor):
    data = request.json or {}
    totp_code = data.get('totp_code')
    ok, err, grant_token = create_supervisor_action_grant(supervisor, totp_code)
    if not ok:
        return jsonify({"status": "error", "message": err}), 403
    return jsonify({
        "status": "success",
        "message": f"Console unlocked for {SUPERVISOR_GRANT_TTL_MINUTES} minutes.",
        "action_grant_token": grant_token,
        "expires_in_seconds": SUPERVISOR_GRANT_TTL_MINUTES * 60,
    })


@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    token = extract_bearer_token()
    user = get_current_user()
    if user:
        log_audit(user, "auth.logout")
    revoke_session(token)
    return jsonify({"status": "success"})


@app.before_request
def log_request():
    print(f"[Flask] {request.method} {request.path}")


# ── auth ──────────────────────────────────────────────────────────────────────

@app.route('/signup', methods=['POST'])
def signup():
    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    role = 'user'
    hashed_pass = generate_password_hash(data['password'])
    try:
        conn = _connect_db()
        conn.execute(
            """INSERT INTO users (name, email, password, role, created_at, account_status)
               VALUES (?, ?, ?, ?, datetime('now'), 'active')""",
            (data['name'], email, hashed_pass, role),
        )
        conn.commit()
        conn.close()
        bootstrap_roles()
        created = get_user_by_email(email)
        return jsonify({
            "status": "success",
            "message": "Account created.",
            "role": created["role"] if created else role,
        }), 201
    except sqlite3.IntegrityError:
        return jsonify({"status": "error", "message": "Email already exists"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/login', methods=['POST'])
def login():
    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password', '')
    conn = _connect_db()
    user = conn.execute(
        """SELECT name, email, role, created_at, password, two_factor_enabled, id, account_status
           FROM users WHERE email = ?""",
        (email,),
    ).fetchone()
    conn.close()
    if not user:
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

    name, email, role, created_at, stored_pass, two_fa_enabled, uid, account_status = user
    if account_status == 'suspended':
        return jsonify({"status": "error", "message": "Account suspended. Contact a manager or supervisor."}), 403

    if stored_pass == password or check_password_hash(stored_pass, password):
        if stored_pass == password:
            conn = _connect_db()
            conn.execute(
                "UPDATE users SET password = ? WHERE email = ?",
                (generate_password_hash(password), email),
            )
            conn.commit()
            conn.close()

        bootstrap_roles()
        user_obj = get_user_by_id(uid)
        role = user_obj["role"] if user_obj else normalize_role(role)
        if two_fa_enabled == 1:
            return jsonify({
                "status": "2fa_required",
                "email": email,
                "user": {
                    "name": name, "email": email, "role": role,
                    "created_at": created_at, "two_factor_enabled": 1,
                },
            })
        token = create_session(uid)
        user_obj = get_user_by_id(uid)
        log_audit(user_obj, "auth.login")
        login_notif_sent = _maybe_send_login_notification(user_obj, data)
        return jsonify({
            "status": "success",
            "user": public_user_payload(user_obj, session_token=token),
            "login_notification_sent": login_notif_sent,
        })
    return jsonify({"status": "error", "message": "Invalid credentials"}), 401


@app.route('/api/settings/test-email', methods=['POST'])
@require_roles(*STAFF_ROLES)
def test_email_endpoint(user):
    data = request.json or {}
    recipient = data.get('recipient')
    if not recipient:
        return jsonify({"status": "error", "message": "Recipient required"}), 400

    smtp_email = data.get('smtp_sender')
    smtp_app_password = data.get('smtp_app_password')
    success = send_test_email(recipient, smtp_email=smtp_email, smtp_app_password=smtp_app_password)
    if success:
        return jsonify({"status": "success", "message": f"Test email sent to {recipient}"})
    else:
        return jsonify({"status": "error", "message": "Failed to send email. Check SMTP configuration."}), 500


@app.route('/api/settings/smtp', methods=['GET'])
@require_roles(*STAFF_ROLES)
def get_smtp_settings(user):
    saved_password = get_app_setting("smtp_app_password", "")
    return jsonify({
        "smtp_sender": get_app_setting("smtp_sender_email", ""),
        "smtp_recipient": get_app_setting("smtp_recipient", ""),
        "smtp_password_set": bool(saved_password),
        "smtp_password_masked": ("*" * 8) if saved_password else "",
    })


@app.route('/api/settings/smtp', methods=['POST'])
@require_roles(*STAFF_ROLES)
def update_smtp_settings(user):
    data = request.json or {}
    smtp_sender = (data.get('smtp_sender') or '').strip()
    smtp_app_password = data.get('smtp_app_password') or ''
    smtp_recipient = (data.get('smtp_recipient') or '').strip()

    set_app_setting("smtp_sender_email", smtp_sender)
    if smtp_app_password:
        set_app_setting("smtp_app_password", smtp_app_password)
    if smtp_recipient:
        set_app_setting("smtp_recipient", smtp_recipient)

    log_audit(user, "settings.smtp_update")
    return jsonify({"status": "ok"})

@app.route('/login/2fa', methods=['POST'])
def login_2fa():
    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    code = (data.get('code') or '').strip()

    if not email or not code:
        return jsonify({"status": "error", "message": "Email and verification code are required"}), 400

    conn = _connect_db()
    user = conn.execute(
        """SELECT name, email, role, created_at, two_factor_secret, two_factor_enabled
           FROM users WHERE email = ?""",
        (email,),
    ).fetchone()
    conn.close()

    if not user:
        return jsonify({"status": "error", "message": "Account not found"}), 404

    name, email, role, created_at, secret, two_fa_enabled = user
    if not two_fa_enabled:
        return jsonify({
            "status": "error",
            "message": "2FA is not enabled on this account. Sign in with email and password only.",
        }), 400
    if not secret:
        return jsonify({
            "status": "error",
            "message": "Authenticator is not fully configured. Use “Email code instead” below, or re-enable 2FA in Settings.",
        }), 400

    if verify_totp_token(secret, code):
        conn = _connect_db()
        uid = conn.execute("SELECT id, account_status FROM users WHERE email = ?", (email,)).fetchone()
        conn.close()
        if not uid or uid[1] == 'suspended':
            return jsonify({"status": "error", "message": "Account suspended"}), 403
        bootstrap_roles()
        user_obj = get_user_by_id(uid[0])
        token = create_session(uid[0])
        user_obj = get_user_by_id(uid[0])
        log_audit(user_obj, "auth.login_2fa")
        login_notif_sent = _maybe_send_login_notification(user_obj, data)
        return jsonify({
            "status": "success",
            "user": public_user_payload(user_obj, session_token=token),
            "login_notification_sent": login_notif_sent,
        })
    else:
        return jsonify({"status": "error", "message": "Invalid verification code. Please check Authenticator."}), 400


@app.route('/api/2fa/setup', methods=['POST'])
def setup_2fa():
    import qrcode
    import io
    import base64

    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({"status": "error", "message": "Email is required"}), 400
    
    # Generate a random 16-char Base32 secret for Google Authenticator
    secret = "".join(secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567") for _ in range(16))
    
    label = f"SmokeDet:{email}"
    issuer = "SmokeDet"
    otpauth_url = f"otpauth://totp/{urllib.parse.quote(label)}?secret={secret}&issuer={urllib.parse.quote(issuer)}"
    
    # Generate actual local QR code PNG image as base64 string
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(otpauth_url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    qr_code_url = f"data:image/png;base64,{img_str}"
    
    return jsonify({
        "status": "success",
        "secret": secret,
        "qr_code_url": qr_code_url
    })


@app.route('/api/2fa/verify', methods=['POST'])
def verify_2fa():
    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    code = (data.get('code') or '').strip()
    secret = (data.get('secret') or '').strip()
    
    if not code or not secret:
        return jsonify({"status": "error", "message": "Missing credentials"}), 400
        
    if verify_totp_token(secret, code):
        conn = _connect_db()
        conn.execute("UPDATE users SET two_factor_enabled = 1, two_factor_secret = ? WHERE email = ?", (secret, email))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Two-factor authentication successfully configured!"})
    else:
        return jsonify({"status": "error", "message": "Invalid code. Please try again."}), 400


@app.route('/api/2fa/disable', methods=['POST'])
@require_auth
def disable_2fa(user):
    return jsonify({
        "status": "error",
        "message": "Use email verification: request a code via /api/auth/2fa/send-email-code then POST /api/auth/2fa/disable-email",
    }), 400


@app.route('/api/users/update', methods=['POST'])
def update_user():
    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({"status": "error", "message": "Email is required"}), 400
    conn = _connect_db()
    if data.get('password'):
        hashed = generate_password_hash(data['password'])
        conn.execute(
            "UPDATE users SET name = ?, password = ? WHERE email = ?",
            (data.get('name'), hashed, email),
        )
    elif data.get('name') is not None:
        conn.execute("UPDATE users SET name = ? WHERE email = ?", (data.get('name'), email))
    if 'login_notifications_enabled' in data:
        enabled = 1 if data.get('login_notifications_enabled') else 0
        conn.execute(
            "UPDATE users SET login_notifications_enabled = ? WHERE email = ?",
            (enabled, email),
        )
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})


# ── users ─────────────────────────────────────────────────────────────────────

def _parse_user_id(raw):
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _build_users_list():
    conn = _connect_db()
    users = conn.execute(
        """SELECT id, name, email, role, created_at, account_status, suspended_at, suspend_reason,
                  two_factor_enabled
           FROM users ORDER BY id ASC"""
    ).fetchall()
    result = []
    for u in users:
        uid, name, email, role, created_at, account_status, suspended_at, suspend_reason, two_fa = u
        role = normalize_role(role)
        vcount = conn.execute(
            "SELECT COUNT(*) FROM violations WHERE person_name = ? OR user_id = ?",
            (name, uid),
        ).fetchone()[0]
        top_loc = conn.execute(
            "SELECT location FROM violations WHERE person_name = ? OR user_id = ? GROUP BY location ORDER BY COUNT(*) DESC LIMIT 1",
            (name, uid),
        ).fetchone()
        last_v = conn.execute(
            "SELECT timestamp FROM violations WHERE person_name = ? OR user_id = ? ORDER BY id DESC LIMIT 1",
            (name, uid),
        ).fetchone()
        result.append({
            "id": uid, "name": name, "email": email, "role": role,
            "created_at": created_at or '', "status": account_status or 'active',
            "suspended_at": suspended_at, "suspend_reason": suspend_reason,
            "two_factor_enabled": bool(two_fa),
            "violation_count": vcount,
            "top_location": top_loc[0] if top_loc else None,
            "last_violation": last_v[0] if last_v else None,
        })
    conn.close()
    return result


@app.route('/api/users', methods=['GET'])
@require_roles(*STAFF_ROLES)
def get_users(actor):
    return jsonify(_build_users_list())


@app.route('/api/supervisor/users', methods=['GET'])
@require_roles('supervisor')
def supervisor_users(supervisor):
    return jsonify(_build_users_list())


@app.route('/api/users/<int:uid>/report', methods=['GET'])
@require_roles('admin', 'supervisor')
def user_report(actor, uid):
    from flask import Response
    try:
        from reports import build_user_report_xlsx
        payload = build_user_report_xlsx(uid)
    except ImportError:
        return jsonify({
            "status": "error",
            "message": "Excel support missing. Install openpyxl: pip install openpyxl",
        }), 500
    if not payload:
        return jsonify({"status": "error", "message": "User not found"}), 404
    data, filename, mimetype = payload
    return Response(
        data,
        mimetype=mimetype,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.route('/api/reports/platform', methods=['GET'])
@require_roles('admin', 'supervisor')
def platform_report(actor):
    from flask import Response
    try:
        from reports import build_platform_workbook
        data, filename, mimetype = build_platform_workbook()
    except ImportError:
        return jsonify({
            "status": "error",
            "message": "Excel support missing. Install openpyxl: pip install openpyxl",
        }), 500
    return Response(
        data,
        mimetype=mimetype,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.route('/api/users/suspend', methods=['POST'])
@require_roles('admin', 'supervisor')
def suspend_user(actor):
    data = request.json or {}
    uid = data.get('id')
    reason = (data.get('reason') or 'Policy violation').strip()
    totp_code = data.get('totp_code')
    ok, err = require_manager_2fa(actor, totp_code, verify_totp_token)
    if not ok:
        return jsonify({"status": "error", "message": err}), 403
    target = get_user_by_id(uid)
    if not target:
        return jsonify({"status": "error", "message": "User not found"}), 404
    ok_target, err_target = actor_may_suspend_target(actor, target)
    if not ok_target:
        return jsonify({"status": "error", "message": err_target}), 403

    conn = _connect_db()
    conn.execute(
        """UPDATE users SET account_status = 'suspended', suspended_at = datetime('now'),
           suspended_by = ?, suspend_reason = ? WHERE id = ?""",
        (actor['id'], reason, uid),
    )
    conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", (uid,))
    conn.commit()
    conn.close()
    log_audit(actor, "user.suspend", "user", uid, reason)
    return jsonify({"status": "success", "message": f"{target['name']} suspended"})


@app.route('/api/users/reactivate', methods=['POST'])
@require_roles('admin', 'supervisor')
def reactivate_user(actor):
    data = request.json or {}
    uid = data.get('id')
    totp_code = data.get('totp_code')
    ok, err = require_manager_2fa(actor, totp_code, verify_totp_token)
    if not ok:
        return jsonify({"status": "error", "message": err}), 403
    target = get_user_by_id(uid)
    if not target:
        return jsonify({"status": "error", "message": "User not found"}), 404

    conn = _connect_db()
    conn.execute(
        """UPDATE users SET account_status = 'active', suspended_at = NULL,
           suspended_by = NULL, suspend_reason = NULL WHERE id = ?""",
        (uid,),
    )
    conn.commit()
    conn.close()
    log_audit(actor, "user.reactivate", "user", uid)
    return jsonify({"status": "success", "message": f"{target['name']} reactivated"})


@app.route('/api/staff/promote-manager', methods=['POST'])
@require_roles('supervisor')
def promote_manager_direct(supervisor):
    data = request.json or {}
    uid = _parse_user_id(data.get('user_id') or data.get('id'))
    grant_token = data.get('action_grant_token')
    if uid is None:
        return jsonify({"status": "error", "message": "user_id is required"}), 400
    ok, err = consume_supervisor_action_grant(supervisor['id'], grant_token)
    if not ok:
        return jsonify({"status": "error", "message": err}), 403

    target = get_user_by_id(uid)
    if not target:
        return jsonify({"status": "error", "message": "User not found"}), 404
    if (target.get('account_status') or 'active') != 'active':
        return jsonify({"status": "error", "message": "User account is not active"}), 400
    if normalize_role(target['role']) != 'user':
        return jsonify({"status": "error", "message": "Only regular users can be promoted to manager"}), 400

    conn = _connect_db()
    conn.execute(
        "UPDATE users SET role = 'manager', promoted_by = ? WHERE id = ?",
        (supervisor['id'], uid),
    )
    conn.commit()
    conn.close()
    revoke_user_sessions(uid)
    log_audit(supervisor, "staff.promote_manager", "user", uid)
    extra = "" if target.get("two_factor_enabled") else " (2FA not enabled — recommend they turn it on in Settings)"
    return jsonify({
        "status": "success",
        "message": f"{target['name']} is now a manager. They should sign in again to access staff features.{extra}",
    })


@app.route('/api/staff/promote-admin', methods=['POST'])
@require_roles('supervisor')
def promote_admin_direct(supervisor):
    data = request.json or {}
    uid = _parse_user_id(data.get('user_id') or data.get('id'))
    grant_token = data.get('action_grant_token')
    if uid is None:
        return jsonify({"status": "error", "message": "user_id is required"}), 400
    ok, err = consume_supervisor_action_grant(supervisor['id'], grant_token)
    if not ok:
        return jsonify({"status": "error", "message": err}), 403

    target = get_user_by_id(uid)
    if not target:
        return jsonify({"status": "error", "message": "User not found"}), 404
    if (target.get('account_status') or 'active') != 'active':
        return jsonify({"status": "error", "message": "User account is not active"}), 400
    if normalize_role(target['role']) != 'user':
        return jsonify({"status": "error", "message": "Only regular users can be promoted to admin"}), 400

    conn = _connect_db()
    conn.execute(
        "UPDATE users SET role = 'admin', promoted_by = ? WHERE id = ?",
        (supervisor['id'], uid),
    )
    conn.commit()
    conn.close()
    revoke_user_sessions(uid)
    log_audit(supervisor, "staff.promote_admin", "user", uid)
    extra = "" if target.get("two_factor_enabled") else " (2FA not enabled — recommend they turn it on in Settings)"
    return jsonify({
        "status": "success",
        "message": f"{target['name']} is now an admin. They should sign in again to access the admin panel.{extra}",
    })


@app.route('/api/users/demote-admin', methods=['POST'])
@require_roles('supervisor')
def demote_admin(supervisor):
    data = request.json or {}
    uid = data.get('id')
    grant_token = data.get('action_grant_token')
    ok, err = consume_supervisor_action_grant(supervisor['id'], grant_token)
    if not ok:
        return jsonify({"status": "error", "message": err}), 403

    target = get_user_by_id(uid)
    if not target:
        return jsonify({"status": "error", "message": "User not found"}), 404
    if normalize_role(target['role']) != 'admin':
        return jsonify({"status": "error", "message": "Target is not an admin"}), 400

    conn = _connect_db()
    conn.execute("UPDATE users SET role = 'user' WHERE id = ?", (uid,))
    conn.commit()
    conn.close()
    revoke_user_sessions(uid)
    log_audit(supervisor, "user.demote_admin", "user", uid)
    return jsonify({
        "status": "success",
        "message": f"{target['name']} demoted to user. They should sign in again.",
    })


@app.route('/api/users/demote-manager', methods=['POST'])
@require_roles('supervisor')
def demote_manager(supervisor):
    data = request.json or {}
    uid = data.get('id')
    grant_token = data.get('action_grant_token')
    ok, err = consume_supervisor_action_grant(supervisor['id'], grant_token)
    if not ok:
        return jsonify({"status": "error", "message": err}), 403

    target = get_user_by_id(uid)
    if not target:
        return jsonify({"status": "error", "message": "User not found"}), 404
    if normalize_role(target['role']) != 'manager':
        return jsonify({"status": "error", "message": "Target is not a manager"}), 400

    conn = _connect_db()
    conn.execute("UPDATE users SET role = 'user' WHERE id = ?", (uid,))
    conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", (uid,))
    conn.commit()
    conn.close()
    log_audit(supervisor, "user.demote_manager", "user", uid)
    return jsonify({"status": "success", "message": f"{target['name']} demoted to user"})


@app.route('/api/users/transfer-supervisor', methods=['POST'])
@require_roles('supervisor')
def transfer_supervisor(supervisor):
    data = request.json or {}
    uid = data.get('id')
    grant_token = data.get('action_grant_token')
    ok, err = consume_supervisor_action_grant(supervisor['id'], grant_token)
    if not ok:
        return jsonify({"status": "error", "message": err}), 403

    target = get_user_by_id(uid)
    if not target or target['account_status'] == 'suspended':
        return jsonify({"status": "error", "message": "Invalid target user"}), 400
    if not target.get('two_factor_enabled'):
        return jsonify({"status": "error", "message": "New supervisor must have 2FA enabled"}), 400
    if target['id'] == supervisor['id']:
        return jsonify({"status": "error", "message": "Already supervisor"}), 400

    conn = _connect_db()
    conn.execute("UPDATE users SET role = 'manager' WHERE id = ?", (supervisor['id'],))
    conn.execute("UPDATE users SET role = 'supervisor' WHERE id = ?", (uid,))
    conn.execute("DELETE FROM auth_sessions WHERE user_id IN (?, ?)", (supervisor['id'], uid))
    conn.commit()
    conn.close()
    log_audit(supervisor, "user.transfer_supervisor", "user", uid)
    return jsonify({
        "status": "success",
        "message": f"Supervisor role transferred to {target['name']}. Please sign in again.",
        "requires_relogin": True,
    })


@app.route('/api/audit/logs', methods=['GET'])
@require_roles('admin', 'supervisor')
def audit_logs(actor):
    limit = request.args.get('limit', 100, type=int)
    conn = _connect_db()
    rows = conn.execute(
        """SELECT id, actor_email, actor_role, action, target_type, target_id, details, created_at
           FROM audit_logs ORDER BY id DESC LIMIT ?""",
        (limit,),
    ).fetchall()
    conn.close()
    return jsonify([
        {
            "id": r[0], "actor_email": r[1], "actor_role": r[2], "action": r[3],
            "target_type": r[4], "target_id": r[5], "details": r[6], "created_at": r[7],
        }
        for r in rows
    ])


# ── violations ────────────────────────────────────────────────────────────────

@app.route('/api/violations', methods=['GET'])
@require_auth
def api_violations(user):
    limit = request.args.get('limit', 500, type=int)
    conn = _connect_db()
    if is_staff(user):
        rows = conn.execute(
            """SELECT id, timestamp, image_path, person_name, location, detected_type, user_id,
                      COALESCE(paid, 0)
               FROM violations ORDER BY id DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT id, timestamp, image_path, person_name, location, detected_type, user_id,
                      COALESCE(paid, 0)
               FROM violations
               WHERE person_name = ? OR user_id = ?
               ORDER BY id DESC LIMIT ?""",
            (user['name'], user['id'], limit),
        ).fetchall()
    conn.close()
    return jsonify([{
        'id': r[0],
        'time': r[1],
        'image': '/' + r[2] if r[2] else '',
        'name': r[3] or 'Unknown',
        'location': r[4] or 'Unknown',
        'detected_type': r[5] or 'unknown',
        'user_id': r[6],
        'paid': bool(r[7]),
        'fine_amount': 20,
    } for r in rows])


@app.route('/api/violations/pay', methods=['POST'])
@require_auth
def pay_violations(user):
    """Mark the current user's unpaid violations as paid ($20 each)."""
    if is_staff(user):
        return jsonify({"status": "error", "message": "Staff accounts do not pay fines here"}), 400
    updated = mark_user_violations_paid(user['id'])
    log_audit(user, "violation.pay_fines", "user", user['id'], f"count={updated}")
    return jsonify({
        "status": "ok",
        "paid_count": updated,
        "amount": updated * 20,
    })


@app.route('/api/violations/<int:vid>/delete', methods=['POST'])
@require_roles('manager', 'supervisor')
def delete_violation(actor, vid):
    """Managers and supervisor may remove a mistaken violation (2FA required)."""
    data = request.json or {}
    role = normalize_role(actor['role'])
    reason = (data.get('reason') or data.get('note') or '').strip()

    if role == 'supervisor':
        grant_token = data.get('action_grant_token')
        ok, err = consume_supervisor_action_grant(actor['id'], grant_token)
        if not ok:
            ok, err = require_supervisor_2fa(actor, data.get('totp_code'), verify_totp_token)
    else:
        ok, err = require_manager_2fa(actor, data.get('totp_code'), verify_totp_token)
    if not ok:
        return jsonify({"status": "error", "message": err}), 403

    conn = _connect_db()
    row = conn.execute("SELECT id FROM violations WHERE id = ?", (vid,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"status": "error", "message": "Violation not found"}), 404
    conn.execute("DELETE FROM violations WHERE id = ?", (vid,))
    conn.execute(
        """UPDATE violation_disputes SET status = 'approved', updated_at = datetime('now'),
           manager_reviewer_id = COALESCE(manager_reviewer_id, ?),
           manager_decision = COALESCE(manager_decision, 'remove'),
           manager_note = COALESCE(NULLIF(manager_note, ''), ?)
           WHERE violation_id = ? AND status NOT IN ('approved', 'rejected')""",
        (actor['id'], reason or 'Removed by staff', vid),
    )
    conn.commit()
    conn.close()
    log_audit(actor, "violation.delete", "violation", vid, reason or None)
    return jsonify({"status": "ok", "message": "Violation removed"})


@app.route('/api/violations/stats', methods=['GET'])
@require_roles(*STAFF_ROLES)
def api_stats(user):
    conn = _connect_db()

    total = conn.execute("SELECT COUNT(*) FROM violations").fetchone()[0]

    by_location = conn.execute(
        "SELECT location, COUNT(*) FROM violations GROUP BY location ORDER BY COUNT(*) DESC"
    ).fetchall()

    by_hour = [0] * 24
    for row in conn.execute(
        "SELECT substr(timestamp,12,2), COUNT(*) FROM violations GROUP BY substr(timestamp,12,2)"
    ).fetchall():
        try:
            by_hour[int(row[0])] = row[1]
        except (ValueError, IndexError):
            pass

    today = datetime.date.today()
    days_7, prev_7 = [], []
    for i in range(6, -1, -1):
        d = (today - datetime.timedelta(days=i)).strftime('%Y-%m-%d')
        cnt = conn.execute(
            "SELECT COUNT(*) FROM violations WHERE substr(timestamp,1,10)=?", (d,)
        ).fetchone()[0]
        days_7.append({'date': d, 'count': cnt})

    for i in range(13, 6, -1):
        d = (today - datetime.timedelta(days=i)).strftime('%Y-%m-%d')
        cnt = conn.execute(
            "SELECT COUNT(*) FROM violations WHERE substr(timestamp,1,10)=?", (d,)
        ).fetchone()[0]
        prev_7.append({'date': d, 'count': cnt})

    conn.close()

    peak_hour = by_hour.index(max(by_hour)) if max(by_hour) > 0 else 0
    top_zone = by_location[0][0] if by_location else 'N/A'

    return jsonify({
        'total': total,
        'peak_hour': peak_hour,
        'top_zone': top_zone,
        'avg_per_day': round(total / 7, 1),
        'by_location': [{'name': r[0] or 'Unknown', 'count': r[1]} for r in by_location],
        'by_hour': by_hour,
        'days_7': days_7,
        'prev_7': prev_7,
    })


# ── violation disputes ────────────────────────────────────────────────────────

@app.route('/api/disputes/reasons', methods=['GET'])
@require_auth
def dispute_reasons(user):
    from disputes import DISPUTE_REASONS
    return jsonify(DISPUTE_REASONS)


@app.route('/api/disputes', methods=['GET'])
@require_auth
def list_disputes(user):
    from disputes import list_disputes_for_staff, list_disputes_for_user
    role = normalize_role(user['role'])
    if role in ('manager', 'admin', 'supervisor'):
        return jsonify(list_disputes_for_staff())
    return jsonify(list_disputes_for_user(user['id']))


@app.route('/api/disputes', methods=['POST'])
@require_auth
def file_dispute(user):
    from disputes import create_dispute
    data = request.json or {}
    dispute_id, err = create_dispute(
        user,
        data.get('violation_id'),
        data.get('reasons') or [],
        data.get('note') or '',
    )
    if err:
        return jsonify({"status": "error", "message": err}), 400
    log_audit(user, "dispute.file", "violation_dispute", dispute_id)
    return jsonify({
        "status": "success",
        "message": "Dispute submitted. A manager will review first, then admins vote, then the supervisor decides.",
        "dispute_id": dispute_id,
    })


@app.route('/api/disputes/<int:dispute_id>/manager-review', methods=['POST'])
@require_roles('manager', 'supervisor')
def manager_review_dispute(actor, dispute_id):
    from disputes import cast_manager_review
    data = request.json or {}
    role = normalize_role(actor['role'])
    if role == 'manager':
        ok, err = require_manager_2fa(actor, data.get('totp_code'), verify_totp_token)
        if not ok:
            return jsonify({"status": "error", "message": err}), 403
    elif data.get('totp_code') or data.get('action_grant_token'):
        grant_token = data.get('action_grant_token')
        ok, err = consume_supervisor_action_grant(actor['id'], grant_token)
        if not ok:
            ok, err = require_supervisor_2fa(actor, data.get('totp_code'), verify_totp_token)
        if not ok:
            return jsonify({"status": "error", "message": err}), 403

    dispute, msg = cast_manager_review(
        actor,
        dispute_id,
        data.get('decision'),
        data.get('note') or '',
    )
    if dispute is None:
        return jsonify({"status": "error", "message": msg}), 400
    log_audit(actor, "dispute.manager_review", "violation_dispute", dispute_id, data.get('decision'))
    return jsonify({"status": "success", "message": msg, "dispute": dispute})


@app.route('/api/disputes/<int:dispute_id>/vote', methods=['POST'])
@require_roles('admin')
def vote_dispute(admin, dispute_id):
    from disputes import cast_admin_vote
    data = request.json or {}
    dispute, err = cast_admin_vote(admin, dispute_id, data.get('vote'))
    if err:
        return jsonify({"status": "error", "message": err}), 400
    log_audit(admin, "dispute.vote", "violation_dispute", dispute_id, data.get('vote'))
    return jsonify({"status": "success", "dispute": dispute})


@app.route('/api/disputes/<int:dispute_id>/decide', methods=['POST'])
@require_roles('supervisor')
def decide_dispute(supervisor, dispute_id):
    from disputes import supervisor_decide
    data = request.json or {}
    grant_token = data.get('action_grant_token')
    ok, err = consume_supervisor_action_grant(supervisor['id'], grant_token)
    if not ok:
        ok, err = require_supervisor_2fa(supervisor, data.get('totp_code'), verify_totp_token)
    if not ok:
        return jsonify({"status": "error", "message": err}), 403

    dispute, msg = supervisor_decide(
        supervisor,
        dispute_id,
        data.get('decision'),
        data.get('note') or '',
    )
    if msg and dispute is None:
        return jsonify({"status": "error", "message": msg}), 400
    log_audit(supervisor, "dispute.decide", "violation_dispute", dispute_id, data.get('decision'))
    return jsonify({"status": "success", "message": msg, "dispute": dispute})


# ── detection control ─────────────────────────────────────────────────────────

@app.route('/api/detection/start', methods=['POST'])
@require_roles(*STAFF_ROLES)
def api_det_start(user):
    data = request.json or {}
    cameras = data.get('cameras', [{'index': 0, 'location': 'Main Lobby'}])
    started = det.start_detection(cameras)
    log_audit(user, "detection.start")
    return jsonify({'status': 'started' if started else 'already_running'})


@app.route('/api/detection/stop', methods=['POST'])
@require_roles(*STAFF_ROLES)
def api_det_stop(user):
    det.stop_detection()
    log_audit(user, "detection.stop")
    return jsonify({'status': 'stopped'})


@app.route('/api/detection/status', methods=['GET'])
@require_auth
def api_det_status(user):
    return jsonify({
        'running': det.is_running(),
        'gpu': det.get_gpu_status(),
    })


@app.route('/api/detection/settings', methods=['GET'])
@require_roles(*STAFF_ROLES)
def api_det_settings_get(user):
    """Return current detection settings so the frontend can sync on load."""
    return jsonify(det.get_detection_settings())


@app.route('/api/detection/settings', methods=['POST'])
@require_roles(*STAFF_ROLES)
def api_det_settings_post(user):
    """Update detection settings (enabled classes and/or confidence threshold)."""
    data = request.json or {}
    enabled_classes = data.get('enabled_classes')   # e.g. {"cigarette": true, "smoke": false, "vape": true}
    conf_thresh = data.get('conf_thresh')            # integer 30-99, or None to use defaults
    email_alerts = data.get('email_alerts')
    alert_cooldown = data.get('alert_cooldown')
    det.update_detection_settings(
        enabled_classes=enabled_classes,
        conf_thresh=conf_thresh,
        email_alerts=email_alerts,
        alert_cooldown=alert_cooldown,
    )
    log_audit(user, "detection.settings_update")
    return jsonify({'status': 'ok', 'settings': det.get_detection_settings()})


@app.route('/api/detection/logs', methods=['GET'])
@require_roles(*STAFF_ROLES)
def api_det_logs(user):
    limit = request.args.get('limit', 50, type=int)
    return jsonify(det.get_recent_logs(limit=limit))


@app.route('/api/detection/video_feed/<int:camera_id>')
def video_feed(camera_id):
    from flask import Response

    def gen():
        last_seq = -1
        while True:
            seq = det.get_latest_frame_seq(camera_id)
            frame = det.get_latest_frame(camera_id)
            if frame is None or seq == last_seq:
                time.sleep(0.001)
                if frame is None and last_seq < 0:
                    img = np.zeros((480, 640, 3), np.uint8)
                    cv2.putText(img, "OFFLINE", (240, 250), cv2.FONT_HERSHEY_SIMPLEX, 1, (100, 100, 100), 2)
                    jpeg = det.encode_stream_jpeg(img)
                    if jpeg:
                        yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + jpeg + b'\r\n\r\n'
                    time.sleep(0.05)
                continue
            last_seq = seq
            jpeg = det.encode_stream_jpeg(frame)
            if jpeg:
                yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + jpeg + b'\r\n\r\n'

    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')

# ── multi-client webcam streaming ───────────────────────────────────────────

@app.route('/api/detection/upload_frame', methods=['POST'])
@require_auth
def upload_frame(user):
    data = request.json or {}
    username = user['name']
    image_data = data.get('image', '')

    if not image_data:
        return jsonify({"status": "error", "message": "No image data"}), 400
    if not det.is_running():
        return jsonify({"status": "error", "message": "Detection is not active"}), 403

    try:
        header, encoded = image_data.split(",", 1) if "," in image_data else ("", image_data)
        img_bytes = base64.b64decode(encoded)
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None or frame.size == 0:
            return jsonify({"status": "error", "message": "Decode failed"}), 400

        location = data.get('location') or f"{username}'s Webcam"
        det.publish_user_stream_frame(username, frame)
        det.queue_user_stream_detection(username, frame, location, user_id=user['id'])
        return jsonify({"status": "success", "detected": False})
    except Exception as e:
        print(f"[Upload] Error from {username}: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/detection/active_streams', methods=['GET'])
@require_roles(*STAFF_ROLES)
def active_streams(user):
    return jsonify(det.list_active_user_streams())


@app.route('/api/detection/video_feed_user/<username>')
def video_feed_user(username):
    from flask import Response
    from urllib.parse import unquote
    username = unquote(username)

    def gen():
        last_seq = -1
        while True:
            seq = det.get_user_stream_seq(username)
            frame = det.get_user_stream_frame(username)
            if frame is None or seq == last_seq:
                time.sleep(0.001)
                if frame is None and last_seq < 0:
                    img = np.zeros((480, 640, 3), np.uint8)
                    cv2.putText(img, "WAITING FOR FEED...", (140, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 165, 255), 2)
                    jpeg = det.encode_stream_jpeg(img)
                    if jpeg:
                        yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + jpeg + b'\r\n\r\n'
                    time.sleep(0.05)
                continue
            last_seq = seq
            jpeg = det.encode_stream_jpeg(frame)
            if jpeg:
                yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + jpeg + b'\r\n\r\n'

    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')


# ── static image serving ──────────────────────────────────────────────────────

@app.route('/static/images/<path:filename>')
def serve_image(filename):
    img_dir = os.path.join(os.path.dirname(__file__), 'static', 'images')
    return send_from_directory(img_dir, filename)


if __name__ == "__main__":
    app.run(debug=FLASK_DEBUG, port=API_PORT)
