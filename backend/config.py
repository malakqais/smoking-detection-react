import os


def _env_int(name, default):
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(name, default=False):
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Core app / database
DB_PATH = os.getenv("SMOKEDET_DB_PATH", os.path.join(BACKEND_DIR, "violations.db"))
ADMIN_DOMAIN = os.getenv("SMOKEDET_ADMIN_DOMAIN", "@smoker.jr")
API_PORT = _env_int("SMOKEDET_API_PORT", 5000)
FLASK_DEBUG = _env_bool("SMOKEDET_DEBUG", True)

# Detection defaults
ALERT_COOLDOWN_SECONDS = _env_int("SMOKEDET_ALERT_COOLDOWN_SECONDS", 10)
CONFIRM_FRAMES = _env_int("SMOKEDET_CONFIRM_FRAMES", 2)
PERSON_CONF_THRESHOLD = float(os.getenv("SMOKEDET_PERSON_CONF_THRESHOLD", "0.40"))
PERSON_CROP_PAD_RATIO = float(os.getenv("SMOKEDET_PERSON_PAD", "0.25"))
YOLO_INFER_CONF = float(os.getenv("SMOKEDET_YOLO_INFER_CONF", "0.18"))
TOBACCO_CONF_THRESHOLD = float(os.getenv("SMOKEDET_TOBACCO_CONF", "0.48"))
SMOKE_CONF_THRESHOLD = float(os.getenv("SMOKEDET_SMOKE_CONF", "0.55"))
SMOKE_ONLY_VIOLATION_CONF = float(os.getenv("SMOKEDET_SMOKE_ONLY_CONF", "0.68"))
