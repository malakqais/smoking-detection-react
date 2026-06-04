import importlib
import os
import sqlite3
import sys
import tempfile
import types
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _fresh_app_with_temp_db(temp_db_path):
    os.environ["SMOKEDET_DB_PATH"] = temp_db_path
    os.environ["SMOKEDET_DEBUG"] = "false"
    os.environ["SMOKEDET_SUPERVISOR_EMAIL"] = "chief@smoker.jr"

    detection_stub = types.ModuleType("detection")
    detection_stub._running = False
    detection_stub._settings = {
        "enabled_classes": {"cigarette": True, "smoke": True, "vape": True},
        "conf_thresh": None,
    }

    def start_detection(_cameras=None):
        detection_stub._running = True
        return True

    def stop_detection():
        detection_stub._running = False

    def is_running():
        return detection_stub._running

    def get_detection_settings():
        return dict(detection_stub._settings)

    def update_detection_settings(enabled_classes=None, conf_thresh=None, **kwargs):
        if enabled_classes is not None:
            detection_stub._settings["enabled_classes"] = enabled_classes
        if conf_thresh is not None:
            detection_stub._settings["conf_thresh"] = conf_thresh

    def get_latest_frame(_camera_index):
        return None

    def process_user_frame(frame, _username, _location=None):
        return frame, False

    detection_stub.start_detection = start_detection
    detection_stub.stop_detection = stop_detection
    detection_stub.is_running = is_running
    detection_stub.get_detection_settings = get_detection_settings
    detection_stub.update_detection_settings = update_detection_settings
    detection_stub.get_latest_frame = get_latest_frame
    detection_stub.process_user_frame = process_user_frame
    sys.modules["detection"] = detection_stub

    for module_name in ("config", "database", "rbac", "app"):
        if module_name in sys.modules:
            del sys.modules[module_name]

    app_module = importlib.import_module("app")
    return app_module.app.test_client()


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class AppBasicsTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "test_violations.db")
        self.client = _fresh_app_with_temp_db(self.db_path)

    def tearDown(self):
        self.tmpdir.cleanup()

    def _login(self, email, password):
        res = self.client.post("/login", json={"email": email, "password": password})
        self.assertEqual(res.status_code, 200)
        data = res.json
        self.assertEqual(data["status"], "success")
        return data["user"]["session_token"]

    def test_signup_always_user_role(self):
        signup_res = self.client.post(
            "/signup",
            json={
                "name": "Rayen",
                "email": "chief@smoker.jr",
                "password": "StrongP@ss123",
            },
        )
        self.assertEqual(signup_res.status_code, 201)
        self.assertEqual(signup_res.json["role"], "supervisor")

        conn = sqlite3.connect(self.db_path)
        role = conn.execute("SELECT role FROM users WHERE email = ?", ("chief@smoker.jr",)).fetchone()[0]
        conn.close()
        self.assertEqual(role, "supervisor")

    def test_signup_and_login_with_session(self):
        self.client.post(
            "/signup",
            json={"name": "Student", "email": "rayen@student.com", "password": "StrongP@ss123"},
        )
        token = self._login("rayen@student.com", "StrongP@ss123")
        me = self.client.get("/api/auth/me", headers=_auth_headers(token))
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json["user"]["role"], "user")

    def test_detection_settings_requires_staff(self):
        self.client.post(
            "/signup",
            json={"name": "Student", "email": "s@student.com", "password": "pass12345"},
        )
        token = self._login("s@student.com", "pass12345")
        res = self.client.post(
            "/api/detection/settings",
            json={"conf_thresh": 72},
            headers=_auth_headers(token),
        )
        self.assertEqual(res.status_code, 403)

    def test_canonical_supervisor_replaces_wrong_one(self):
        db_path = str(Path(self.tmpdir.name) / "canonical.db")
        os.environ["SMOKEDET_DB_PATH"] = db_path
        os.environ["SMOKEDET_SUPERVISOR_EMAIL"] = "rayenoueslati153@gmail.com"
        os.environ["SMOKEDET_SUPERVISOR_EMAIL_DOMAIN"] = "@no-match.invalid"
        for module_name in ("config", "database"):
            sys.modules.pop(module_name, None)
        database = importlib.import_module("database")
        database.init_db()
        conn = sqlite3.connect(db_path)
        conn.execute(
            "INSERT INTO users (name, email, password, role, created_at, account_status) VALUES (?, ?, ?, ?, ?, ?)",
            ("Rayen", "rayenoueslati153@gmail.com", "hash", "manager", "2026-01-01", "active"),
        )
        conn.execute(
            "INSERT INTO users (name, email, password, role, created_at, account_status) VALUES (?, ?, ?, ?, ?, ?)",
            ("Malak", "zoubimalak45@gmail.com", "hash", "supervisor", "2026-01-02", "active"),
        )
        conn.commit()
        database.bootstrap_roles()
        rows = {
            email: role
            for email, role in conn.execute("SELECT email, role FROM users").fetchall()
        }
        conn.close()
        self.assertEqual(rows["rayenoueslati153@gmail.com"], "supervisor")
        self.assertEqual(rows["zoubimalak45@gmail.com"], "manager")

    def test_dedupe_two_supervisors_keeps_env_email(self):
        db_path = str(Path(self.tmpdir.name) / "dedupe.db")
        os.environ["SMOKEDET_DB_PATH"] = db_path
        os.environ["SMOKEDET_SUPERVISOR_EMAIL"] = "zoubimalak45@gmail.com"
        os.environ["SMOKEDET_SUPERVISOR_EMAIL_DOMAIN"] = "@no-match.invalid"
        for module_name in ("config", "database"):
            sys.modules.pop(module_name, None)
        database = importlib.import_module("database")
        database.init_db()
        conn = sqlite3.connect(db_path)
        conn.execute(
            "INSERT INTO users (name, email, password, role, created_at, account_status) VALUES (?, ?, ?, ?, ?, ?)",
            ("Rayen", "rayenoueslati153@gmail.com", "hash", "supervisor", "2026-01-01", "active"),
        )
        conn.execute(
            "INSERT INTO users (name, email, password, role, created_at, account_status) VALUES (?, ?, ?, ?, ?, ?)",
            ("Malak", "zoubimalak45@gmail.com", "hash", "supervisor", "2026-01-02", "active"),
        )
        conn.commit()
        database.bootstrap_roles()
        rows = {
            email: role
            for email, role in conn.execute("SELECT email, role FROM users").fetchall()
        }
        conn.close()
        self.assertEqual(rows["zoubimalak45@gmail.com"], "supervisor")
        self.assertEqual(rows["rayenoueslati153@gmail.com"], "manager")

    def test_detection_settings_roundtrip_as_supervisor(self):
        self.client.post(
            "/signup",
            json={"name": "Boss", "email": "chief@smoker.jr", "password": "admin-pass"},
        )
        token = self._login("chief@smoker.jr", "admin-pass")
        update_res = self.client.post(
            "/api/detection/settings",
            json={
                "enabled_classes": {"cigarette": True, "smoke": False, "vape": True},
                "conf_thresh": 72,
            },
            headers=_auth_headers(token),
        )
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json["settings"]["enabled_classes"]["smoke"], False)


    def test_supervisor_totp_grant_single_use(self):
        self.client.post(
            "/signup",
            json={"name": "Sup", "email": "chief@smoker.jr", "password": "admin-pass"},
        )
        sup_token = self._login("chief@smoker.jr", "admin-pass")

        self.client.post(
            "/signup",
            json={"name": "Worker", "email": "worker@test.com", "password": "pass12345"},
        )
        worker = self.client.get("/api/auth/me", headers=_auth_headers(sup_token))
        self.assertEqual(worker.status_code, 200)

        verify = self.client.post(
            "/api/auth/supervisor-2fa/verify",
            headers=_auth_headers(sup_token),
            json={"totp_code": "000000"},
        )
        self.assertIn(verify.status_code, (403, 400))

    def test_promote_manager_requires_grant(self):
        self.client.post(
            "/signup",
            json={"name": "Sup", "email": "boss@smoker.jr", "password": "admin-pass"},
        )
        sup_token = self._login("boss@smoker.jr", "admin-pass")
        self.client.post(
            "/signup",
            json={"name": "U1", "email": "u1@test.com", "password": "pass12345"},
        )
        conn = sqlite3.connect(self.db_path)
        uid = conn.execute("SELECT id FROM users WHERE email = ?", ("u1@test.com",)).fetchone()[0]
        conn.execute(
            "UPDATE users SET two_factor_enabled = 1, two_factor_secret = 'JBSWY3DPEHPK3PXP' WHERE id = ?",
            (uid,),
        )
        conn.commit()
        conn.close()

        res = self.client.post(
            "/api/staff/promote-manager",
            headers=_auth_headers(sup_token),
            json={"user_id": uid, "action_grant_token": "invalid"},
        )
        self.assertEqual(res.status_code, 403)


if __name__ == "__main__":
    unittest.main()
