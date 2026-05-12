from flask import Flask, render_template, request, jsonify
import sqlite3
import json
from database import init_db

app = Flask(__name__)
init_db()

@app.before_request
def log_request_info():
    print(f"DEBUG: {request.method} request to {request.path}")

# Add users table to DB if not exists
def create_users_table():
    conn = sqlite3.connect('violations.db')
    conn.execute('''CREATE TABLE IF NOT EXISTS users
                    (id INTEGER PRIMARY KEY AUTOINCREMENT,
                     name TEXT,
                     email TEXT UNIQUE,
                     password TEXT,
                     role TEXT DEFAULT 'user')''')
    conn.commit()
    conn.close()

create_users_table()

# Migration: Ensure at least one admin exists (or promote first user)
def migrate_admins():
    conn = sqlite3.connect('violations.db')
    users = conn.execute("SELECT * FROM users").fetchall()
    if users:
        # If no admin exists, make the first user an admin
        admin_exists = any(u[4] == 'admin' for u in users)
        if not admin_exists:
            conn.execute("UPDATE users SET role = 'admin' WHERE id = ?", (users[0][0],))
            conn.commit()
    conn.close()

migrate_admins()

@app.route('/signup', methods=['POST'])
def signup():
    data = request.json
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    
    try:
        conn = sqlite3.connect('violations.db')
        conn.execute("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", (name, email, password))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Account created"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"status": "error", "message": "Email already exists"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    conn = sqlite3.connect('violations.db')
    user = conn.execute("SELECT name, email, role FROM users WHERE email = ? AND password = ?", (email, password)).fetchone()
    conn.close()
    
    if user:
        return jsonify({
            "status": "success",
            "user": {"name": user[0], "email": user[1], "role": user[2]}
        })
    else:
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

@app.route('/api/users', methods=['GET'])
def get_users():
    conn = sqlite3.connect('violations.db')
    users = conn.execute("SELECT id, name, email, role FROM users").fetchall()
    conn.close()
    
    user_list = [{"id": u[0], "name": u[1], "email": u[2], "role": u[3], "status": "active"} for u in users]
    return jsonify(user_list)

@app.route('/api/users/toggle_role', methods=['POST'])
def toggle_role():
    data = request.json
    user_id = data.get('id')
    
    conn = sqlite3.connect('violations.db')
    user = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
    if user:
        new_role = 'admin' if user[0] == 'user' else 'user'
        conn.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, user_id))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "new_role": new_role})
    conn.close()
    return jsonify({"status": "error", "message": "User not found"}), 404

@app.route('/api/users/delete', methods=['POST'])
def delete_user():
    data = request.json
    user_id = data.get('id')
    
    conn = sqlite3.connect('violations.db')
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route('/admin')
def admin():
    return render_template("admin.html")

@app.route("/")
def index():
    conn = sqlite3.connect("violations.db")
    data = conn.execute("SELECT * FROM violations ORDER BY id DESC").fetchall()
    conn.close()
    return render_template("index1.html", data=data)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
    