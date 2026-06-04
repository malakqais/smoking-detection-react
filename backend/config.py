import os


def _load_env_files():
    """Load backend/.env and repo-root .env without extra dependencies."""
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(backend_dir)
    for path in (os.path.join(backend_dir, ".env"), os.path.join(base_dir, ".env")):
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value


_load_env_files()


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
API_PORT = _env_int("SMOKEDET_API_PORT", 5000)
FLASK_DEBUG = _env_bool("SMOKEDET_DEBUG", True)

# Auth / RBAC
SESSION_TTL_HOURS = _env_int("SMOKEDET_SESSION_TTL_HOURS", 168)
AUTH_CODE_PEPPER = os.getenv("SMOKEDET_AUTH_CODE_PEPPER", "smokedet-auth-code-pepper-change-me")
AUTH_CODE_EXPIRY_MINUTES = _env_int("SMOKEDET_AUTH_CODE_EXPIRY_MINUTES", 10)
# How long one supervisor-console 2FA unlock lasts (many actions per code)
SUPERVISOR_GRANT_TTL_MINUTES = _env_int("SMOKEDET_SUPERVISOR_GRANT_TTL_MINUTES", 30)
SUPERVISOR_BOOTSTRAP_EMAIL = os.getenv("SMOKEDET_SUPERVISOR_EMAIL", "").strip().lower()
# When no supervisor exists yet, promote first matching account (if env email not set)
SUPERVISOR_EMAIL_DOMAIN = os.getenv("SMOKEDET_SUPERVISOR_EMAIL_DOMAIN", "@smoker.jr").strip().lower()
ADMIN_DOMAIN = os.getenv("SMOKEDET_ADMIN_DOMAIN", "@smoker.jr")

# Detection defaults
ALERT_COOLDOWN_SECONDS = _env_int("SMOKEDET_ALERT_COOLDOWN_SECONDS", 10)
CONFIRM_FRAMES = _env_int("SMOKEDET_CONFIRM_FRAMES", 2)
PERSON_CONF_THRESHOLD = float(os.getenv("SMOKEDET_PERSON_CONF_THRESHOLD", "0.40"))
PERSON_CROP_PAD_RATIO = float(os.getenv("SMOKEDET_PERSON_PAD", "0.25"))
YOLO_INFER_CONF = float(os.getenv("SMOKEDET_YOLO_INFER_CONF", "0.18"))
TOBACCO_CONF_THRESHOLD = float(os.getenv("SMOKEDET_TOBACCO_CONF", "0.48"))
SMOKE_CONF_THRESHOLD = float(os.getenv("SMOKEDET_SMOKE_CONF", "0.55"))
SMOKE_ONLY_VIOLATION_CONF = float(os.getenv("SMOKEDET_SMOKE_ONLY_CONF", "0.68"))

# Live stream latency tuning
STREAM_JPEG_QUALITY = _env_int("SMOKEDET_STREAM_JPEG_QUALITY", 72)
CAMERA_DETECT_EVERY_N = max(1, _env_int("SMOKEDET_CAMERA_DETECT_EVERY_N", 3))
USER_DETECT_WORKERS = max(1, _env_int("SMOKEDET_USER_DETECT_WORKERS", 3))

# GPU inference (auto = CUDA when available)
# SMOKEDET_DEVICE=auto|cpu|cuda|cuda:0
# SMOKEDET_CUDA_DEVICES=0,1,2  — spread models across GPUs ("GPU farm")
# SMOKEDET_YOLO_HALF=true      — FP16 on GPU for faster inference
