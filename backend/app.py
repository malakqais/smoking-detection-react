from flask import Flask, request, jsonify, send_from_directory
import sqlite3
import os
import datetime
from database import init_db
import detection as det

app = Flask(__name__)
init_db()


def _ensure_users_table():
    conn = sqlite3.connect('violations.db')
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
    conn.close()


ADMIN_DOMAIN = '@smoker.jr'


def _ensure_admin():
    """Ensure all @smoker.jr accounts have admin role and no other account does."""
    conn = sqlite3.connect('violations.db')
    conn.execute("UPDATE users SET role = 'admin' WHERE email LIKE ?", (f'%{ADMIN_DOMAIN}',))
    conn.execute("UPDATE users SET role = 'user' WHERE email NOT LIKE ?", (f'%{ADMIN_DOMAIN}',))
    conn.commit()
    conn.close()


_ensure_users_table()
_ensure_admin()


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
    try:
        conn = sqlite3.connect('violations.db')
        conn.execute("INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
                     (data['name'], email, data['password'], role))
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
    conn = sqlite3.connect('violations.db')
    user = conn.execute(
        "SELECT name, email, role FROM users WHERE email = ? AND password = ?",
        (data['email'], data['password'])
    ).fetchone()
    conn.close()
    if user:
        return jsonify({"status": "success", "user": {"name": user[0], "email": user[1], "role": user[2]}})
    return jsonify({"status": "error", "message": "Invalid credentials"}), 401


# ── users ─────────────────────────────────────────────────────────────────────

@app.route('/api/users', methods=['GET'])
def get_users():
    conn = sqlite3.connect('violations.db')
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
    conn = sqlite3.connect('violations.db')
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
    conn = sqlite3.connect('violations.db')
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
    conn = sqlite3.connect('violations.db')
    conn.execute("DELETE FROM users WHERE id = ?", (uid,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})


# ── violations ────────────────────────────────────────────────────────────────

@app.route('/api/violations', methods=['GET'])
def api_violations():
    limit = request.args.get('limit', 500, type=int)
    conn = sqlite3.connect('violations.db')
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
    conn = sqlite3.connect('violations.db')
    conn.execute("DELETE FROM violations WHERE id = ?", (vid,))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


@app.route('/api/violations/stats', methods=['GET'])
def api_stats():
    conn = sqlite3.connect('violations.db')

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
    conn = sqlite3.connect('violations.db')
    conn.execute("DELETE FROM violations")
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


# ── detection control ─────────────────────────────────────────────────────────

@app.route('/api/detection/start', methods=['POST'])
def api_det_start():
    data = request.json or {}
    camera = data.get('camera', 0)
    location = data.get('location', 'Camera 1')
    started = det.start_detection(camera, location)
    return jsonify({'status': 'started' if started else 'already_running'})


@app.route('/api/detection/stop', methods=['POST'])
def api_det_stop():
    det.stop_detection()
    return jsonify({'status': 'stopped'})


@app.route('/api/detection/status', methods=['GET'])
def api_det_status():
    return jsonify({'running': det.is_running()})


# ── static image serving ──────────────────────────────────────────────────────

@app.route('/static/images/<path:filename>')
def serve_image(filename):
    img_dir = os.path.join(os.path.dirname(__file__), 'static', 'images')
    return send_from_directory(img_dir, filename)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
