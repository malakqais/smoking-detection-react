import os
import threading
import datetime
import time
from collections import deque
import cv2
from ultralytics import YOLO
from database import insert_violation, get_user_email, get_app_setting
from email_service import send_violation_email
from config import (
    ALERT_COOLDOWN_SECONDS,
    CONFIRM_FRAMES,
    PERSON_CONF_THRESHOLD,
    PERSON_CROP_PAD_RATIO,
    YOLO_INFER_CONF,
    TOBACCO_CONF_THRESHOLD,
    SMOKE_CONF_THRESHOLD,
    SMOKE_ONLY_VIOLATION_CONF,
)

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

# OpenCV BGR
COLOR_ORANGE = (0, 165, 255)
COLOR_RED = (0, 0, 255)
COLOR_GREEN = (0, 255, 0)

_CLASS_DEFAULT_THRESH = {
    'cigarette': TOBACCO_CONF_THRESHOLD,
    'vape': TOBACCO_CONF_THRESHOLD,
    'smoke': SMOKE_CONF_THRESHOLD,
}


def _class_threshold(cls_name, override_thresh):
    base = _CLASS_DEFAULT_THRESH.get(cls_name, SMOKE_CONF_THRESHOLD)
    if override_thresh is None:
        return base
    return override_thresh / 100.0


def _yolo_infer_conf(cls_name):
    if cls_name in ('cigarette', 'vape'):
        return min(YOLO_INFER_CONF, 0.22)
    return min(YOLO_INFER_CONF + 0.05, 0.30)


def _is_candidate_size_valid(cls_name, rel_h, rel_w):
    if rel_h < 0.008 and rel_w < 0.008:
        return False
    if cls_name == 'cigarette' and (rel_h > 0.28 or rel_w > 0.32):
        return False
    if cls_name == 'vape' and (rel_h > 0.32 or rel_w > 0.35):
        return False
    if cls_name == 'smoke' and (rel_h > 0.55 or rel_w > 0.55):
        return False
    return True


def _iter_person_boxes(frame):
    person_results = _models['person'](frame, classes=[0], conf=PERSON_CONF_THRESHOLD, verbose=False)
    boxes = []
    for pr in person_results:
        for pbox in pr.boxes:
            boxes.append(tuple(map(int, pbox.xyxy[0])))
    return person_results, boxes


def _compute_person_crop(frame_shape, person_box, pad_ratio=None):
    if pad_ratio is None:
        pad_ratio = PERSON_CROP_PAD_RATIO
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
        results = _models[cls_name](
            crop,
            conf=_yolo_infer_conf(cls_name),
            imgsz=640,
            verbose=False,
        )
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


def _merge_candidates(merged, crop, offset_x, offset_y):
    """Merge detections from a crop into global coordinates (keeps best conf per class)."""
    partial = _collect_candidates(crop)
    for cls_name, (c, cx1, cy1, cx2, cy2) in partial.items():
        global_box = (cx1 + offset_x, cy1 + offset_y, cx2 + offset_x, cy2 + offset_y)
        if cls_name not in merged or c > merged[cls_name][0]:
            merged[cls_name] = (c, *global_box)


def _gather_candidates_for_person(frame, person_box):
    """Full person crop + upper-body focus for better cigarette/vape near face/hands."""
    merged = {}
    x1, y1, x2, y2 = _compute_person_crop(frame.shape, person_box)
    person_crop = frame[y1:y2, x1:x2]
    if person_crop.size > 0:
        _merge_candidates(merged, person_crop, x1, y1)

    crop_h = y2 - y1
    upper_y2 = y1 + max(int(crop_h * 0.72), 48)
    if upper_y2 > y1 + 24:
        upper_crop = frame[y1:upper_y2, x1:x2]
        if upper_crop.size > 0:
            _merge_candidates(merged, upper_crop, x1, y1)
    return merged


def _gather_candidates_for_frame(frame):
    """Fallback when no person box: scan entire frame for tobacco/smoke."""
    merged = {}
    h, w = frame.shape[:2]
    _merge_candidates(merged, frame, 0, 0)
    return merged, (0, 0, w, h)


def _to_global_box(local_box, x1_crop, y1_crop):
    cx1, cy1, cx2, cy2 = local_box
    return (cx1 + x1_crop, cy1 + y1_crop, cx2 + x1_crop, cy2 + y1_crop)


def _violation_label(candidates):
    has_smoke = 'smoke' in candidates
    has_cigarette = 'cigarette' in candidates
    has_vape = 'vape' in candidates
    if has_smoke and (has_cigarette or has_vape):
        parts = []
        if has_cigarette:
            parts.append('CIGARETTE')
        if has_vape:
            parts.append('VAPE')
        parts.append('SMOKE')
        return '+'.join(parts)
    if has_cigarette:
        return 'CIGARETTE'
    if has_vape:
        return 'VAPE'
    if has_smoke:
        return 'SMOKE'
    return 'VIOLATION'


def _process_candidates(candidates, person_box, draw_payloads, state):
    """Apply draw rules and update best violation state. Boxes in candidates are global."""
    detected_cls, conf, culprit_box, violation_summary = state
    smoke_present = 'smoke' in candidates
    tobacco_present = 'cigarette' in candidates or 'vape' in candidates

    if smoke_present and tobacco_present:
        combo_conf = 0.0
        combo_cls = None
        for cls_name in ('cigarette', 'vape', 'smoke'):
            c, gx1, gy1, gx2, gy2 = candidates[cls_name]
            draw_payloads.append({
                'kind': 'violation_object',
                'label': f"{cls_name.upper()} {c:.0%}",
                'box': (gx1, gy1, gx2, gy2),
            })
            if cls_name in ('cigarette', 'vape') and c > combo_conf:
                combo_conf = c
                combo_cls = cls_name

        if combo_conf > conf:
            detected_cls, conf = combo_cls, combo_conf
            culprit_box = person_box
            violation_summary = _violation_label(candidates)
    elif tobacco_present:
        for cls_name in ('cigarette', 'vape'):
            if cls_name not in candidates:
                continue
            c, gx1, gy1, gx2, gy2 = candidates[cls_name]
            draw_payloads.append({
                'kind': 'cigarette_only',
                'label': f"{cls_name.upper()} {c:.0%}",
                'box': (gx1, gy1, gx2, gy2),
            })
    elif smoke_present:
        c, gx1, gy1, gx2, gy2 = candidates['smoke']
        if c >= SMOKE_ONLY_VIOLATION_CONF:
            draw_payloads.append({
                'kind': 'violation_object',
                'label': f"SMOKE {c:.0%}",
                'box': (gx1, gy1, gx2, gy2),
            })
            if c > conf:
                detected_cls, conf = 'smoke', c
                culprit_box = person_box
                violation_summary = 'SMOKE'

    return detected_cls, conf, culprit_box, violation_summary


def _analyze_frame(frame):
    detected_cls, conf = None, 0.0
    culprit_box = None
    violation_summary = None
    person_results, person_boxes = _iter_person_boxes(frame)
    draw_payloads = []

    if person_boxes:
        for person_box in person_boxes:
            candidates = _gather_candidates_for_person(frame, person_box)
            if not candidates:
                continue
            detected_cls, conf, culprit_box, violation_summary = _process_candidates(
                candidates,
                person_box,
                draw_payloads,
                (detected_cls, conf, culprit_box, violation_summary),
            )
    else:
        candidates, fallback_box = _gather_candidates_for_frame(frame)
        if candidates:
            detected_cls, conf, culprit_box, violation_summary = _process_candidates(
                candidates,
                fallback_box,
                draw_payloads,
                (detected_cls, conf, culprit_box, violation_summary),
            )

    return {
        'person_results': person_results,
        'person_boxes': person_boxes,
        'detected_cls': detected_cls,
        'conf': conf,
        'culprit_box': culprit_box,
        'violation_summary': violation_summary,
        'draw_payloads': draw_payloads,
    }


def _draw_payloads_on_frame(annotated_frame, draw_payloads):
    for payload in draw_payloads:
        fx1, fy1, fx2, fy2 = payload['box']
        if payload['kind'] == 'cigarette_only':
            color = COLOR_ORANGE
        else:
            color = COLOR_RED
        cv2.rectangle(annotated_frame, (fx1, fy1), (fx2, fy2), color, 2)
        cv2.putText(
            annotated_frame,
            payload['label'],
            (fx1, max(20, fy1 - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            color,
            2,
        )


def _payloads_to_draw_commands(draw_payloads):
    commands = []
    for payload in draw_payloads:
        fx1, fy1, fx2, fy2 = payload['box']
        color = COLOR_ORANGE if payload['kind'] == 'cigarette_only' else COLOR_RED
        commands.append(('rect', (fx1, fy1), (fx2, fy2), color, 2))
        commands.append(('text', payload['label'], (fx1, max(20, fy1 - 10)), 0.5, color, 2))
    return commands


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
        violation_summary = analysis.get('violation_summary')
        current_draws = _payloads_to_draw_commands(analysis['draw_payloads'])

        # Draw person bounding boxes
        for px1, py1, px2, py2 in analysis['person_boxes']:
            if culprit_box and culprit_box == (px1, py1, px2, py2):
                viol_text = violation_summary or (detected_cls.upper() if detected_cls else 'VIOLATION')
                current_draws.append(('rect', (px1, py1), (px2, py2), COLOR_RED, 2))
                current_draws.append(('text', f"VIOLATION: {viol_text}", (px1, py1 - 10), 0.6, COLOR_RED, 2))
            else:
                current_draws.append(('rect', (px1, py1), (px2, py2), COLOR_GREEN, 2))
                current_draws.append(('text', "COMPLIANT", (px1, py1 - 10), 0.5, COLOR_GREEN, 2))

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

        log_type = (violation_summary or pending_cls or 'unknown').lower()
        insert_violation(timestamp, rel_path, person_name, location, detected_type=log_type)
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
    violation_summary = analysis.get('violation_summary')

    _draw_payloads_on_frame(annotated_frame, analysis['draw_payloads'])

    for px1, py1, px2, py2 in analysis['person_boxes']:
        if culprit_box and culprit_box == (px1, py1, px2, py2):
            viol_text = violation_summary or (detected_cls.upper() if detected_cls else 'VIOLATION')
            cv2.rectangle(annotated_frame, (px1, py1), (px2, py2), COLOR_RED, 2)
            cv2.putText(
                annotated_frame,
                f"VIOLATION: {viol_text}",
                (px1, py1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                COLOR_RED,
                2
            )
        else:
            cv2.rectangle(annotated_frame, (px1, py1), (px2, py2), COLOR_GREEN, 2)
            cv2.putText(
                annotated_frame,
                "COMPLIANT",
                (px1, py1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                COLOR_GREEN,
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
            
            log_type = (violation_summary or detected_cls or 'unknown').lower()
            insert_violation(timestamp, rel_path, username, location, detected_type=log_type)
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
