import os
import threading
import datetime
import cv2
from ultralytics import YOLO
from database import insert_violation
from email_service import send_violation_email

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE_DIR, "VIRSION 1", "models")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "images")

_thread = None
_stop_event = threading.Event()
_models = {}


def _load_models():
    global _models
    if _models:
        return
    _models = {
        'cigarette': YOLO(os.path.join(MODEL_DIR, "cigarette_best1.pt")),
        'smoke':     YOLO(os.path.join(MODEL_DIR, "smoke_best.pt")),
        'vape':      YOLO(os.path.join(MODEL_DIR, "vape_best.pt")),
        'face':      YOLO(os.path.join(MODEL_DIR, "face_best.pt")),
    }


CONF_THRESHOLD = 0.65   # minimum confidence to consider a detection
CONFIRM_FRAMES = 3      # consecutive frames that must agree before logging
ALERT_COOLDOWN = 10     # seconds between logged violations


def _detect_class(frame):
    """Return (class_name, confidence) of highest-confidence detection, or (None, 0)."""
    best_cls, best_conf = None, 0.0
    for cls_name in ('cigarette', 'smoke', 'vape'):
        results = _models[cls_name](frame, conf=CONF_THRESHOLD, verbose=False)
        for r in results:
            for box in r.boxes:
                c = float(box.conf[0])
                if c >= CONF_THRESHOLD and c > best_conf:
                    best_cls, best_conf = cls_name, c
    return best_cls, best_conf


def _detection_loop(camera_index, location):
    os.makedirs(STATIC_DIR, exist_ok=True)
    _load_models()

    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        print(f"[Detection] Could not open camera {camera_index}")
        return

    last_alert_time = datetime.datetime.min
    last_email_time = datetime.datetime.min
    consecutive = 0          # how many frames in a row had a detection
    pending_cls  = None       # class seen in those frames
    print(f"[Detection] Started on camera {camera_index} — location: {location}")

    while not _stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            break

        detected_cls, conf = _detect_class(frame)

        # Require CONFIRM_FRAMES consecutive detections of the same class
        if detected_cls and detected_cls == pending_cls:
            consecutive += 1
        else:
            consecutive = 1 if detected_cls else 0
            pending_cls  = detected_cls

        if consecutive < CONFIRM_FRAMES:
            continue

        # Confirmed detection — apply cooldown
        now = datetime.datetime.now()
        if (now - last_alert_time).total_seconds() < ALERT_COOLDOWN:
            continue

        last_alert_time = now
        consecutive = 0

        timestamp    = now.strftime("%Y-%m-%d %H-%M-%S")
        img_filename = f"{timestamp}.jpg"
        img_path     = os.path.join(STATIC_DIR, img_filename)
        cv2.imwrite(img_path, frame)
        rel_path = f"static/images/{img_filename}"

        person_name = "Unknown"
        face_results = _models['face'](frame, conf=0.55, verbose=False)
        for r in face_results:
            if len(r.boxes) > 0:
                person_name = "Person Detected"
                break

        insert_violation(timestamp, rel_path, person_name, location, detected_type=pending_cls)
        print(f"[Detection] ✓ {pending_cls} ({conf:.0%}) confirmed at {location} — {timestamp}")

        if (now - last_email_time).total_seconds() > 60:
            try:
                send_violation_email(img_path, "admin@example.com")
                last_email_time = now
            except Exception as e:
                print(f"[Detection] Email failed: {e}")

    cap.release()
    print(f"[Detection] Stopped on camera {camera_index}")


def start_detection(camera_index=0, location="Camera 1"):
    global _thread
    if _thread and _thread.is_alive():
        return False
    _stop_event.clear()
    _thread = threading.Thread(
        target=_detection_loop,
        args=(camera_index, location),
        daemon=True
    )
    _thread.start()
    return True


def stop_detection():
    _stop_event.set()


def is_running():
    return _thread is not None and _thread.is_alive()


if __name__ == "__main__":
    start_detection()
    import time
    try:
        while is_running():
            time.sleep(1)
    except KeyboardInterrupt:
        stop_detection()
