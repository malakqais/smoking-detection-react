import os
import threading
import datetime
import time
from collections import deque
import cv2
from ultralytics import YOLO
from database import insert_violation, get_user_email, get_app_setting
from email_service import send_violation_email
from config import ALERT_COOLDOWN_SECONDS, CONFIRM_FRAMES, PERSON_CONF_THRESHOLD

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE_DIR, "VIRSION 1", "models")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "images")

_threads = []
_stop_event = threading.Event()
_models = {}
_latest_frames = {}
_recent_logs = deque(maxlen=300)
_logs_lock = threading.Lock()

# Runtime-configurable settings (updated via API)
_detection_settings = {
    'enabled_classes': {'cigarette': True, 'smoke': True, 'vape': True},
    'conf_thresh': None,  # None = use hardcoded defaults per class
    'email_alerts': True,
    'alert_cooldown': ALERT_COOLDOWN_SECONDS,
}


def _log_event(message, level="info"):
    entry = {
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "level": level,
        "message": message,
    }
    with _logs_lock:
        _recent_logs.appendleft(entry)


def get_recent_logs(limit=50):
    with _logs_lock:
        return list(_recent_logs)[:max(1, int(limit))]


def update_detection_settings(enabled_classes=None, conf_thresh=None, email_alerts=None, alert_cooldown=None):
    """Called by the Flask API to update detection behaviour at runtime."""
    global _detection_settings
    if enabled_classes is not None:
        _detection_settings['enabled_classes'] = enabled_classes
    if conf_thresh is not None:
        _detection_settings['conf_thresh'] = conf_thresh
    if email_alerts is not None:
        _detection_settings['email_alerts'] = bool(email_alerts)
    if alert_cooldown is not None:
        try:
            _detection_settings['alert_cooldown'] = max(1, int(alert_cooldown))
        except (TypeError, ValueError):
            pass
    print(
        "[Detection] Settings updated: "
        f"classes={_detection_settings['enabled_classes']}, "
        f"thresh={_detection_settings['conf_thresh']}, "
        f"email_alerts={_detection_settings['email_alerts']}, "
        f"alert_cooldown={_detection_settings['alert_cooldown']}"
    )
    _log_event(
        "Settings updated "
        f"(classes={_detection_settings['enabled_classes']}, "
        f"thresh={_detection_settings['conf_thresh']}, "
        f"email_alerts={_detection_settings['email_alerts']}, "
        f"cooldown={_detection_settings['alert_cooldown']}s)"
    )


def get_detection_settings():
    return dict(_detection_settings)


def _load_models():
    global _models
    if _models:
        return
    _models = {
        'person':    YOLO(os.path.join(BASE_DIR, "VIRSION 1", "yolov8n.pt")),
        'cigarette': YOLO(os.path.join(MODEL_DIR, "cigarette_best1.pt")),
        'smoke':     YOLO(os.path.join(MODEL_DIR, "smoke_best.pt")),
        'vape':      YOLO(os.path.join(MODEL_DIR, "vape_best.pt")),
        'face':      YOLO(os.path.join(MODEL_DIR, "face_best.pt")),
    }


CONF_THRESHOLD = 0.55   # optimized threshold for targeted crops
ALERT_COOLDOWN = ALERT_COOLDOWN_SECONDS


def _class_threshold(cls_name, override_thresh):
    default_thresh = 0.68 if cls_name in ('cigarette', 'vape') else 0.55
    return (override_thresh / 100.0) if override_thresh else default_thresh


def _is_candidate_size_valid(cls_name, rel_h, rel_w):
    if cls_name == 'cigarette' and (rel_h > 0.18 or rel_w > 0.18):
        return False
    if cls_name == 'vape' and (rel_h > 0.22 or rel_w > 0.22):
        return False
    if cls_name == 'smoke' and (rel_h > 0.50 or rel_w > 0.50):
        return False
    return True


def _iter_person_boxes(frame):
    person_results = _models['person'](frame, classes=[0], conf=PERSON_CONF_THRESHOLD, verbose=False)
    boxes = []
    for pr in person_results:
        for pbox in pr.boxes:
            boxes.append(tuple(map(int, pbox.xyxy[0])))
    return person_results, boxes


def _compute_person_crop(frame_shape, person_box, pad_ratio=0.15):
    h, w = frame_shape[:2]
    px1, py1, px2, py2 = person_box
    pad_x = int((px2 - px1) * pad_ratio)
    pad_y = int((py2 - py1) * pad_ratio)
    x1_crop = max(0, px1 - pad_x)
    y1_crop = max(0, py1 - pad_y)
    x2_crop = min(w, px2 + pad_x)
    y2_crop = min(h, py2 + pad_y)
    return x1_crop, y1_crop, x2_crop, y2_crop


def _collect_candidates(crop):
    candidates = {}  # cls_name -> (conf, cx1, cy1, cx2, cy2)
    enabled = _detection_settings['enabled_classes']
    override_thresh = _detection_settings['conf_thresh']

    for cls_name in ('cigarette', 'smoke', 'vape'):
        if not enabled.get(cls_name, True):
            continue
        if cls_name not in _models:
            continue

        current_threshold = _class_threshold(cls_name, override_thresh)
        results = _models[cls_name](crop, conf=current_threshold, verbose=False)
        crop_h, crop_w, _ = crop.shape

        for r in results:
            for box in r.boxes:
                c = float(box.conf[0])
                if c < current_threshold:
                    continue
                cx1, cy1, cx2, cy2 = map(int, box.xyxy[0])
                obj_w = cx2 - cx1
                obj_h = cy2 - cy1
                rel_h = obj_h / crop_h
                rel_w = obj_w / crop_w
                if not _is_candidate_size_valid(cls_name, rel_h, rel_w):
                    continue
                if cls_name not in candidates or c > candidates[cls_name][0]:
                    candidates[cls_name] = (c, cx1, cy1, cx2, cy2)
    return candidates


def _confirm_candidate(candidates):
    smoke_present = 'smoke' in candidates
    confirmed_cls = None
    confirmed_conf = 0.0
    confirmed_box_local = None
    skipped_no_smoke = []

    for cls_name in ('cigarette', 'vape', 'smoke'):
        if cls_name not in candidates:
            continue
        c, cx1, cy1, cx2, cy2 = candidates[cls_name]
        if cls_name in ('cigarette', 'vape'):
            if not smoke_present:
                skipped_no_smoke.append((cls_name, c))
                continue
        else:
            if c < 0.70:
                continue

        if c > confirmed_conf:
            confirmed_cls = cls_name
            confirmed_conf = c
            confirmed_box_local = (cx1, cy1, cx2, cy2)

    return confirmed_cls, confirmed_conf, confirmed_box_local, skipped_no_smoke


def _analyze_frame(frame):
    detected_cls, conf = None, 0.0
    culprit_box = None
    person_results, person_boxes = _iter_person_boxes(frame)
    draw_payloads = []

    for person_box in person_boxes:
        px1, py1, px2, py2 = person_box
        x1_crop, y1_crop, x2_crop, y2_crop = _compute_person_crop(frame.shape, person_box)
        crop = frame[y1_crop:y2_crop, x1_crop:x2_crop]
        if crop.size == 0:
            continue

        candidates = _collect_candidates(crop)
        confirmed_cls, confirmed_conf, confirmed_box_local, skipped_no_smoke = _confirm_candidate(candidates)
        for cls_name, c in skipped_no_smoke:
            draw_payloads.append({
                'kind': 'hint_no_smoke',
                'text': f"{cls_name.upper()} {c:.0%} (no smoke)",
                'origin': (x1_crop, y1_crop - 10),
            })

        if not confirmed_cls:
            continue

        cx1, cy1, cx2, cy2 = confirmed_box_local
        if confirmed_conf > conf:
            detected_cls, conf = confirmed_cls, confirmed_conf
            culprit_box = person_box

        draw_payloads.append({
            'kind': 'violation_object',
            'label': f"{confirmed_cls.upper()} {confirmed_conf:.0%}",
            'box': (cx1 + x1_crop, cy1 + y1_crop, cx2 + x1_crop, cy2 + y1_crop),
        })

    return {
        'person_results': person_results,
        'person_boxes': person_boxes,
        'detected_cls': detected_cls,
        'conf': conf,
        'culprit_box': culprit_box,
        'draw_payloads': draw_payloads,
    }


class CameraStream:
    def __init__(self, src, camera_index):
        self.stream = cv2.VideoCapture(src)
        self.stream.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.ret, self.frame = self.stream.read()
        self.stopped = False
        self.camera_index = camera_index
        self.draw_commands = []  # List of tuples (type, *args)
        self.lock = threading.Lock()

    def start(self):
        threading.Thread(target=self.update, args=(), daemon=True).start()
        return self

    def update(self):
        while not self.stopped:
            self.ret, self.frame = self.stream.read()
            if self.ret and self.frame is not None:
                annotated = self.frame.copy()
                with self.lock:
                    cmds = list(self.draw_commands)
                for cmd in cmds:
                    if cmd[0] == 'rect':
                        cv2.rectangle(annotated, cmd[1], cmd[2], cmd[3], cmd[4])
                    elif cmd[0] == 'text':
                        cv2.putText(annotated, cmd[1], cmd[2], cv2.FONT_HERSHEY_SIMPLEX, cmd[3], cmd[4], cmd[5])
                _latest_frames[self.camera_index] = annotated
            time.sleep(0.01)

    def read(self):
        return self.ret, self.frame

    def stop(self):
        self.stopped = True
        self.stream.release()

def _detection_loop(camera_index, location):
    os.makedirs(STATIC_DIR, exist_ok=True)
    _load_models()

    cam = CameraStream(camera_index, camera_index).start()
    if not cam.stream.isOpened():
        print(f"[Detection] Could not open camera {camera_index}")
        _log_event(f"Camera {camera_index} could not be opened", "error")
        cam.stop()
        return

    last_alert_time = datetime.datetime.min
    last_email_time = datetime.datetime.min
    consecutive = 0          # how many frames in a row had a detection
    pending_cls  = None       # class seen in those frames
    print(f"[Detection] Started on camera {camera_index} — location: {location}")
    _log_event(f"Camera {camera_index} started at {location}")

    while not _stop_event.is_set():
        ret, frame = cam.read()
        if not ret or frame is None:
            time.sleep(0.01)
            continue

        _load_models()
        analysis = _analyze_frame(frame)
        detected_cls = analysis['detected_cls']
        conf = analysis['conf']
        culprit_box = analysis['culprit_box']
        current_draws = []

        for payload in analysis['draw_payloads']:
            if payload['kind'] == 'hint_no_smoke':
                current_draws.append(('text', payload['text'], payload['origin'], 0.4, (0, 165, 255), 1))
            elif payload['kind'] == 'violation_object':
                fx1, fy1, fx2, fy2 = payload['box']
                current_draws.append(('rect', (fx1, fy1), (fx2, fy2), (0, 0, 255), 2))
                current_draws.append(('text', payload['label'], (fx1, fy1 - 10), 0.5, (0, 0, 255), 2))

        # Draw person bounding boxes
        for px1, py1, px2, py2 in analysis['person_boxes']:
            if culprit_box and culprit_box == (px1, py1, px2, py2):
                current_draws.append(('rect', (px1, py1), (px2, py2), (0, 0, 255), 2))
                current_draws.append(('text', f"VIOLATION: {detected_cls.upper()}", (px1, py1 - 10), 0.6, (0, 0, 255), 2))
            else:
                current_draws.append(('rect', (px1, py1), (px2, py2), (0, 255, 0), 2))
                current_draws.append(('text', "COMPLIANT", (px1, py1 - 10), 0.5, (0, 255, 0), 2))

        with cam.lock:
            cam.draw_commands = current_draws

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
        current_cooldown = _detection_settings.get('alert_cooldown', ALERT_COOLDOWN)
        if (now - last_alert_time).total_seconds() < current_cooldown:
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
        _log_event(f"Violation confirmed: {pending_cls} at {location} ({conf:.0%})", "warn")

        if _detection_settings.get('email_alerts', True) and (now - last_email_time).total_seconds() > 60:
            try:
                recipient = get_user_email(person_name) or get_app_setting("smtp_recipient", "admin@example.com")
                send_violation_email(img_path, recipient, person_name, pending_cls, location, timestamp)
                last_email_time = now
            except Exception as e:
                print(f"[Detection] Email failed: {e}")

    cam.stop()
    print(f"[Detection] Stopped on camera {camera_index}")
    _log_event(f"Camera {camera_index} stopped at {location}")


_user_cooldowns = {}

def process_user_frame(frame, username, location="Student Webcam"):
    _load_models()
    annotated_frame = frame.copy()
    analysis = _analyze_frame(frame)
    detected_cls = analysis['detected_cls']
    culprit_box = analysis['culprit_box']

    for payload in analysis['draw_payloads']:
        if payload['kind'] == 'hint_no_smoke':
            cv2.putText(
                annotated_frame,
                f"{payload['text']} - ignored",
                payload['origin'],
                cv2.FONT_HERSHEY_SIMPLEX,
                0.4,
                (0, 165, 255),
                1
            )
        elif payload['kind'] == 'violation_object':
            fx1, fy1, fx2, fy2 = payload['box']
            cv2.rectangle(annotated_frame, (fx1, fy1), (fx2, fy2), (0, 0, 255), 2)
            cv2.putText(
                annotated_frame,
                payload['label'],
                (fx1, fy1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 0, 255),
                2
            )

    for px1, py1, px2, py2 in analysis['person_boxes']:
        if culprit_box and culprit_box == (px1, py1, px2, py2):
            cv2.rectangle(annotated_frame, (px1, py1), (px2, py2), (0, 0, 255), 2)
            cv2.putText(
                annotated_frame,
                f"VIOLATION: {detected_cls.upper()}",
                (px1, py1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 0, 255),
                2
            )
        else:
            cv2.rectangle(annotated_frame, (px1, py1), (px2, py2), (0, 255, 0), 2)
            cv2.putText(
                annotated_frame,
                "COMPLIANT",
                (px1, py1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 255, 0),
                2
            )

    # Cooldown & log writing
    if detected_cls:
        global _user_cooldowns
        now = datetime.datetime.now()
        last_t = _user_cooldowns.get(username, datetime.datetime.min)
        if (now - last_t).total_seconds() >= 10.0:  # 10s cooldown per user to prevent duplicate fine logging
            _user_cooldowns[username] = now
            
            timestamp = now.strftime("%Y-%m-%d %H-%M-%S")
            img_filename = f"user_{username.replace(' ', '_')}_{timestamp}.jpg"
            img_path = os.path.join(STATIC_DIR, img_filename)
            cv2.imwrite(img_path, frame)
            rel_path = f"static/images/{img_filename}"
            
            insert_violation(timestamp, rel_path, username, location, detected_type=detected_cls)
            print(f"[AI Multi-Stream] VIOLATION LOGGED: user {username} caught with {detected_cls} on webcam")
            _log_event(f"Webcam violation: {username} with {detected_cls} at {location}", "warn")
            
            if _detection_settings.get('email_alerts', True):
                try:
                    recipient = get_user_email(username) or get_app_setting("smtp_recipient", "admin@example.com")
                    send_violation_email(img_path, recipient, username, detected_cls, location, timestamp)
                except Exception as e:
                    print(f"[Detection] Email failed: {e}")
                
    return annotated_frame, detected_cls is not None


_detection_active = False

def start_detection(cameras=None):
    global _detection_active
    _detection_active = True
    print("[AI Surveillance] Detection mode activated globally. Listening for client webcam streams...")
    _log_event("Detection mode activated")
    return True


def stop_detection():
    global _detection_active
    _detection_active = False
    print("[AI Surveillance] Detection mode deactivated.")
    _log_event("Detection mode deactivated")


def is_running():
    global _detection_active
    return _detection_active


def get_latest_frame(camera_index):
    return _latest_frames.get(camera_index, None)


if __name__ == "__main__":
    start_detection()
    import time
    try:
        while is_running():
            time.sleep(1)
    except KeyboardInterrupt:
        stop_detection()
