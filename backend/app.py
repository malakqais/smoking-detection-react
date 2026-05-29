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
from werkzeug.security import generate_password_hash, check_password_hash
from database import init_db, get_app_setting, set_app_setting
from email_service import send_test_email
from config import DB_PATH, ADMIN_DOMAIN, API_PORT, FLASK_DEBUG
import detection as det

app = Flask(__name__)
init_db()


def _connect_db():
    return sqlite3.connect(DB_PATH)


def _ensure_users_table():
    conn = _connect_db()
    conn.execute('''CREATE TABLE IF NOT EXISTS users
                    (id INTEGER PRIMARY KEY AUTOINCREMENT,
                     name TEXT,
                     email TEXT UNIQUE,
                     password TEXT,
                     role TEXT DEFAULT 'user',
                     created_at TEXT)''')
    conn.commit()
    cols = [row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()]
    if 'created_at' not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN created_at TEXT")
        conn.execute("UPDATE users SET created_at = datetime('now') WHERE created_at IS NULL")
        conn.commit()
    if 'two_factor_secret' not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN two_factor_secret TEXT")
        conn.commit()
    if 'two_factor_enabled' not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0")
        conn.commit()
    conn.close()


def _ensure_admin():
    """Ensure all @smoker.jr accounts have admin role and no other account does."""
    conn = _connect_db()
    conn.execute("UPDATE users SET role = 'admin' WHERE email LIKE ?", (f'%{ADMIN_DOMAIN}',))
    conn.execute("UPDATE users SET role = 'user' WHERE email NOT LIKE ?", (f'%{ADMIN_DOMAIN}',))
    conn.commit()
    conn.close()


_ensure_users_table()
_ensure_admin()


def verify_totp_token(secret, code_str):
    try:
        # Check current, past, and next time steps for 30s clock drift tolerance
        for offset_step in (-1, 0, 1):
            missing_padding = len(secret) % 8
            padded_secret = secret + ('=' * (8 - missing_padding) if missing_padding else '')
            key = base64.b32decode(padded_secret, casefold=True)
            counter = int(time.time() / 30) + offset_step
            msg = counter.to_bytes(8, byteorder='big')
            hs = hmac.new(key, msg, hashlib.sha1).digest()
            offset = hs[-1] & 0x0F
            val = ((hs[offset] & 0x7f) << 24 |
                   (hs[offset+1] & 0xff) << 16 |
                   (hs[offset+2] & 0xff) << 8 |
                   (hs[offset+3] & 0xff))
            calc_code = str(val % 1000000).zfill(6)
            if calc_code == code_str:
                return True
        return False
    except Exception as e:
        print(f"[2FA] Error verifying token: {e}")
        return False


@app.after_request
def after_request(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response


@app.before_request
def log_request():
    print(f"[Flask] {request.method} {request.path}")


# ── auth ──────────────────────────────────────────────────────────────────────

@app.route('/signup', methods=['POST'])
def signup():
    data = request.json
    email = data.get('email', '')
    role = 'admin' if email.endswith(ADMIN_DOMAIN) else 'user'
    hashed_pass = generate_password_hash(data['password'])
    try:
        conn = _connect_db()
        conn.execute("INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
                     (data['name'], email, hashed_pass, role))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Account created", "role": role}), 201
    except sqlite3.IntegrityError:
        return jsonify({"status": "error", "message": "Email already exists"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/login', methods=['POST'])
def login():
    data = request.json
    conn = _connect_db()
    user = conn.execute(
        "SELECT name, email, role, created_at, password, two_factor_enabled, two_factor_secret FROM users WHERE email = ?",
        (data['email'],)
    ).fetchone()
    conn.close()
    if user:
        name, email, role, created_at, stored_pass, two_fa_enabled, two_fa_secret = user
        if stored_pass == data['password'] or check_password_hash(stored_pass, data['password']):
            # Auto-migrate password to hashed if it was plaintext
            if stored_pass == data['password']:
                conn = _connect_db()
                conn.execute("UPDATE users SET password = ? WHERE email = ?", (generate_password_hash(data['password']), email))
                conn.commit()
                conn.close()

            if two_fa_enabled == 1:
                return jsonify({
                    "status": "2fa_required",
                    "email": email,
                    "user": {"name": name, "email": email, "role": role, "created_at": created_at, "two_factor_enabled": 1}
                })
            else:
                return jsonify({
                    "status": "success",
                    "user": {"name": name, "email": email, "role": role, "created_at": created_at, "two_factor_enabled": 0}
                })
    return jsonify({"status": "error", "message": "Invalid credentials"}), 401


@app.route('/api/settings/test-email', methods=['POST'])
def test_email_endpoint():
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
def get_smtp_settings():
    saved_password = get_app_setting("smtp_app_password", "")
    return jsonify({
        "smtp_sender": get_app_setting("smtp_sender_email", ""),
        "smtp_recipient": get_app_setting("smtp_recipient", ""),
        "smtp_password_set": bool(saved_password),
        "smtp_password_masked": ("*" * 8) if saved_password else "",
    })


@app.route('/api/settings/smtp', methods=['POST'])
def update_smtp_settings():
    data = request.json or {}
    smtp_sender = (data.get('smtp_sender') or '').strip()
    smtp_app_password = data.get('smtp_app_password') or ''
    smtp_recipient = (data.get('smtp_recipient') or '').strip()

    set_app_setting("smtp_sender_email", smtp_sender)
    if smtp_app_password:
        set_app_setting("smtp_app_password", smtp_app_password)
    if smtp_recipient:
        set_app_setting("smtp_recipient", smtp_recipient)

    return jsonify({"status": "ok"})

@app.route('/login/2fa', methods=['POST'])
def login_2fa():
    data = request.json or {}
    email = data.get('email')
    code = data.get('code')
    
    conn = _connect_db()
    user = conn.execute("SELECT name, email, role, created_at, two_factor_secret FROM users WHERE email = ? AND two_factor_enabled = 1", (email,)).fetchone()
    conn.close()
    
    if not user:
        return jsonify({"status": "error", "message": "2FA setup not found"}), 404
        
    name, email, role, created_at, secret = user
    if verify_totp_token(secret, code):
        return jsonify({
            "status": "success",
            "user": {"name": name, "email": email, "role": role, "created_at": created_at, "two_factor_enabled": 1}
        })
    else:
        return jsonify({"status": "error", "message": "Invalid verification code. Please check Authenticator."}), 400


@app.route('/api/2fa/setup', methods=['POST'])
def setup_2fa():
    import qrcode
    import io
    import base64

    data = request.json or {}
    email = data.get('email')
    
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
    email = data.get('email')
    code = data.get('code')
    secret = data.get('secret')
    
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
def disable_2fa():
    data = request.json or {}
    email = data.get('email')
    
    conn = _connect_db()
    conn.execute("UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE email = ?", (email,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success", "message": "Two-factor authentication disabled."})


@app.route('/api/users/update', methods=['POST'])
def update_user():
    data = request.json
    conn = _connect_db()
    if data.get('password'):
        hashed = generate_password_hash(data['password'])
        conn.execute("UPDATE users SET name = ?, password = ? WHERE email = ?", (data['name'], hashed, data['email']))
    else:
        conn.execute("UPDATE users SET name = ? WHERE email = ?", (data['name'], data['email']))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})


# ── users ─────────────────────────────────────────────────────────────────────

@app.route('/api/users', methods=['GET'])
def get_users():
    conn = _connect_db()
    users = conn.execute("SELECT id, name, email, role, created_at FROM users ORDER BY id ASC").fetchall()
    result = []
    for u in users:
        uid, name, email, role, created_at = u
        vcount = conn.execute(
            "SELECT COUNT(*) FROM violations WHERE person_name = ?", (name,)
        ).fetchone()[0]
        top_loc = conn.execute(
            "SELECT location FROM violations WHERE person_name = ? GROUP BY location ORDER BY COUNT(*) DESC LIMIT 1",
            (name,)
        ).fetchone()
        last_v = conn.execute(
            "SELECT timestamp FROM violations WHERE person_name = ? ORDER BY id DESC LIMIT 1",
            (name,)
        ).fetchone()
        result.append({
            "id": uid, "name": name, "email": email, "role": role,
            "created_at": created_at or '', "status": "active",
            "violation_count": vcount,
            "top_location": top_loc[0] if top_loc else None,
            "last_violation": last_v[0] if last_v else None,
        })
    conn.close()
    return jsonify(result)


@app.route('/api/users/<int:uid>/report', methods=['GET'])
def user_report(uid):
    import io, csv
    conn = _connect_db()
    user = conn.execute(
        "SELECT id, name, email, role, created_at FROM users WHERE id = ?", (uid,)
    ).fetchone()
    if not user:
        conn.close()
        return jsonify({"status": "error", "message": "User not found"}), 404
    uid_, name, email, role, created_at = user
    violations = conn.execute(
        "SELECT id, timestamp, location, person_name FROM violations WHERE person_name = ? ORDER BY timestamp DESC",
        (name,)
    ).fetchall()
    top_loc = conn.execute(
        "SELECT location, COUNT(*) as cnt FROM violations WHERE person_name = ? GROUP BY location ORDER BY cnt DESC LIMIT 1",
        (name,)
    ).fetchone()
    conn.close()

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["SMOKEDET SYSTEM — USER REPORT"])
    w.writerow(["Generated", datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")])
    w.writerow([])
    w.writerow(["=== ACCOUNT INFORMATION ==="])
    w.writerow(["Name", name])
    w.writerow(["Email", email])
    w.writerow(["Role", role])
    w.writerow(["Joined", created_at or "N/A"])
    w.writerow(["Account ID", f"UID-{str(uid_).zfill(4)}"])
    w.writerow([])
    w.writerow(["=== VIOLATION SUMMARY ==="])
    w.writerow(["Total Violations", len(violations)])
    w.writerow(["Top Location", top_loc[0] if top_loc else "N/A"])
    w.writerow([])
    if violations:
        w.writerow(["=== VIOLATION LOG ==="])
        w.writerow(["#", "Timestamp", "Location", "Detected As"])
        for i, v in enumerate(violations, 1):
            w.writerow([i, v[1], v[2], v[3]])
    else:
        w.writerow(["No violations recorded for this user."])

    from flask import Response
    filename = f"report_{name.replace(' ', '_')}_{datetime.date.today()}.csv"
    return Response(
        out.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.route('/api/users/toggle_role', methods=['POST'])
def toggle_role():
    uid = request.json.get('id')
    conn = _connect_db()
    user = conn.execute("SELECT role, email FROM users WHERE id = ?", (uid,)).fetchone()
    if not user:
        conn.close()
        return jsonify({"status": "error", "message": "User not found"}), 404
    current_role, email = user
    if email.endswith(ADMIN_DOMAIN):
        conn.close()
        return jsonify({"status": "error", "message": f"Admin role is locked — accounts with {ADMIN_DOMAIN} are always admins"}), 403
    if current_role == 'user':
        conn.close()
        return jsonify({"status": "error", "message": f"Cannot promote to admin — only {ADMIN_DOMAIN} emails can have admin role"}), 403
    conn.close()
    return jsonify({"status": "error", "message": "Role cannot be changed"}), 403


@app.route('/api/users/delete', methods=['POST'])
def delete_user():
    uid = request.json.get('id')
    conn = _connect_db()
    conn.execute("DELETE FROM users WHERE id = ?", (uid,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})


# ── violations ────────────────────────────────────────────────────────────────

@app.route('/api/violations', methods=['GET'])
def api_violations():
    limit = request.args.get('limit', 500, type=int)
    conn = _connect_db()
    rows = conn.execute(
        "SELECT id, timestamp, image_path, person_name, location, detected_type FROM violations ORDER BY id DESC LIMIT ?",
        (limit,)
    ).fetchall()
    conn.close()
    return jsonify([{
        'id': r[0],
        'time': r[1],
        'image': '/' + r[2] if r[2] else '',
        'name': r[3] or 'Unknown',
        'location': r[4] or 'Unknown',
        'detected_type': r[5] or 'unknown',
    } for r in rows])


@app.route('/api/violations/<int:vid>/delete', methods=['POST'])
def delete_violation(vid):
    conn = _connect_db()
    conn.execute("DELETE FROM violations WHERE id = ?", (vid,))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


@app.route('/api/violations/stats', methods=['GET'])
def api_stats():
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


@app.route('/api/violations/clear', methods=['POST'])
def api_clear():
    conn = _connect_db()
    conn.execute("DELETE FROM violations")
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


# ── detection control ─────────────────────────────────────────────────────────

@app.route('/api/detection/start', methods=['POST'])
def api_det_start():
    data = request.json or {}
    cameras = data.get('cameras', [{'index': 0, 'location': 'Main Lobby'}])
    started = det.start_detection(cameras)
    return jsonify({'status': 'started' if started else 'already_running'})


@app.route('/api/detection/stop', methods=['POST'])
def api_det_stop():
    det.stop_detection()
    return jsonify({'status': 'stopped'})


@app.route('/api/detection/status', methods=['GET'])
def api_det_status():
    return jsonify({'running': det.is_running()})


@app.route('/api/detection/settings', methods=['GET'])
def api_det_settings_get():
    """Return current detection settings so the frontend can sync on load."""
    return jsonify(det.get_detection_settings())


@app.route('/api/detection/settings', methods=['POST'])
def api_det_settings_post():
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
    return jsonify({'status': 'ok', 'settings': det.get_detection_settings()})


@app.route('/api/detection/logs', methods=['GET'])
def api_det_logs():
    limit = request.args.get('limit', 50, type=int)
    return jsonify(det.get_recent_logs(limit=limit))


@app.route('/api/detection/video_feed/<int:camera_id>')
def video_feed(camera_id):
    def gen():
        import time
        import cv2
        import numpy as np
        while True:
            time.sleep(0.04)  # stream at ~25 FPS
            frame = det.get_latest_frame(camera_id)
            if frame is not None:
                ret, jpeg = cv2.imencode('.jpg', frame)
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n\r\n')
            else:
                # yield dark placeholder
                img = np.zeros((480, 640, 3), np.uint8)
                cv2.putText(img, "OFFLINE", (240, 250), cv2.FONT_HERSHEY_SIMPLEX, 1, (100, 100, 100), 2)
                ret, jpeg = cv2.imencode('.jpg', img)
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n\r\n')
    from flask import Response
    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')

# ── multi-client webcam streaming ───────────────────────────────────────────

import base64
import numpy as np
import cv2

_user_raw_frames = {}
_user_annotated_frames = {}
_user_latest_time = {}

@app.route('/api/detection/upload_frame', methods=['POST'])
def upload_frame():
    data = request.json or {}
    username = data.get('username', 'Unknown')
    image_data = data.get('image', '')
    
    if not image_data:
        return jsonify({"status": "error", "message": "No image data"}), 400

    try:
        header, encoded = image_data.split(",", 1) if "," in image_data else ("", image_data)
        img_bytes = base64.b64decode(encoded)
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None or frame.size == 0:
            return jsonify({"status": "error", "message": "Decode failed"}), 400

        # Process the incoming client frame with our custom guardrails
        annotated_frame, detected = det.process_user_frame(frame, username, f"{username}'s Screen Cam")
        
        # Save streams in active registry
        _user_raw_frames[username] = frame
        _user_annotated_frames[username] = annotated_frame
        _user_latest_time[username] = datetime.datetime.now()

        return jsonify({"status": "success", "detected": detected})
    except Exception as e:
        print(f"[Upload] Error processing frame from {username}: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/detection/active_streams', methods=['GET'])
def active_streams():
    now = datetime.datetime.now()
    active = []
    for name, t in list(_user_latest_time.items()):
        if (now - t).total_seconds() < 30.0:  # Keep stream active window wider for stability
            active.append(name)
    return jsonify(active)


@app.route('/api/detection/video_feed_user/<username>')
def video_feed_user(username):
    def gen():
        import time
        while True:
            time.sleep(0.033)  # stream at ~30 FPS
            frame = _user_annotated_frames.get(username, None)
            if frame is not None:
                ret, jpeg = cv2.imencode('.jpg', frame)
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n\r\n')
            else:
                img = np.zeros((480, 640, 3), np.uint8)
                cv2.putText(img, "WAITING FOR FEED...", (140, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 165, 255), 2)
                ret, jpeg = cv2.imencode('.jpg', img)
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n\r\n')
    from flask import Response
    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')


# ── static image serving ──────────────────────────────────────────────────────

@app.route('/static/images/<path:filename>')
def serve_image(filename):
    img_dir = os.path.join(os.path.dirname(__file__), 'static', 'images')
    return send_from_directory(img_dir, filename)


if __name__ == "__main__":
    app.run(debug=FLASK_DEBUG, port=API_PORT)
