import importlib
import os
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

    # Ensure deterministic default behavior in tests.
    os.environ["SMOKEDET_ADMIN_DOMAIN"] = "@smoker.jr"
    os.environ["SMOKEDET_DEBUG"] = "false"

    # Use a lightweight detection stub to keep tests fast and independent
    # from heavy CV/ML runtime dependencies.
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

    def update_detection_settings(enabled_classes=None, conf_thresh=None):
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

    for module_name in ("config", "database", "app"):
        if module_name in sys.modules:
            del sys.modules[module_name]

    app_module = importlib.import_module("app")
    return app_module.app.test_client()


class AppBasicsTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "test_violations.db")
        self.client = _fresh_app_with_temp_db(self.db_path)

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_signup_and_login_success(self):
        signup_res = self.client.post(
            "/signup",
            json={
                "name": "Rayen",
                "email": "rayen@student.com",
                "password": "StrongP@ss123",
            },
        )
        self.assertEqual(signup_res.status_code, 201)
        self.assertEqual(signup_res.json["status"], "success")

        login_res = self.client.post(
            "/login",
            json={"email": "rayen@student.com", "password": "StrongP@ss123"},
        )
        self.assertEqual(login_res.status_code, 200)
        self.assertEqual(login_res.json["status"], "success")
        self.assertEqual(login_res.json["user"]["email"], "rayen@student.com")
        self.assertEqual(login_res.json["user"]["role"], "user")

    def test_admin_domain_role_assignment(self):
        signup_res = self.client.post(
            "/signup",
            json={
                "name": "Admin User",
                "email": "chief@smoker.jr",
                "password": "admin-pass",
            },
        )
        self.assertEqual(signup_res.status_code, 201)
        self.assertEqual(signup_res.json["role"], "admin")

    def test_detection_settings_roundtrip(self):
        default_res = self.client.get("/api/detection/settings")
        self.assertEqual(default_res.status_code, 200)
        self.assertIn("enabled_classes", default_res.json)
        self.assertIn("conf_thresh", default_res.json)

        update_payload = {
            "enabled_classes": {"cigarette": True, "smoke": False, "vape": True},
            "conf_thresh": 72,
        }
        update_res = self.client.post("/api/detection/settings", json=update_payload)
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json["status"], "ok")
        self.assertEqual(update_res.json["settings"]["enabled_classes"]["smoke"], False)
        self.assertEqual(update_res.json["settings"]["conf_thresh"], 72)


if __name__ == "__main__":
    unittest.main()
