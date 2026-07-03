import os
import threading
import datetime
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import cv2
from ultralytics import YOLO
from database import insert_violation, get_user_email, get_user_email_by_id, get_app_setting, get_user_id_by_label, resolve_user_by_name
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
    SMOKE_TOBACCO_EXPAND_RATIO,
    SMOKE_UPPER_BODY_FRAC,
    STREAM_JPEG_QUALITY,
    CAMERA_DETECT_EVERY_N,
    USER_DETECT_WORKERS,
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE_DIR, "VIRSION 1", "models")
TOBACCO_MODEL_PATH = os.path.join(
    BASE_DIR, "00_model_weights", "00_model_weights", "best_yolov8l_cigarette_vape_v2.pt"
)
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "images")

_threads = []
_stop_event = threading.Event()
_models = {}
_latest_frames = {}
_latest_frame_seq = {}
_recent_logs = deque(maxlen=300)
_logs_lock = threading.Lock()

# User webcam streams — raw preview is updated immediately; AI runs async
_user_raw_frames = {}
_user_frame_seq = {}
_user_latest_time = {}
_user_frame_lock = threading.Lock()
_user_frame_pending = {}
_user_detect_executor = ThreadPoolExecutor(max_workers=USER_DETECT_WORKERS, thread_name_prefix='webcam-det')

DEFAULT_CONF_THRESH_PCT = int(round(TOBACCO_CONF_THRESHOLD * 100))

# Runtime-configurable settings (updated via API)
_detection_settings = {
    'enabled_classes': {'cigarette': True, 'smoke': True, 'vape': True},
    'conf_thresh': DEFAULT_CONF_THRESH_PCT,
    'email_alerts': True,
    'alert_cooldown': 60,
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
    settings = dict(_detection_settings)
    if settings.get('conf_thresh') is None:
        settings['conf_thresh'] = DEFAULT_CONF_THRESH_PCT
    return settings


def _load_models():
    global _models
    if _models:
        return
    from gpu_runtime import device_for_model, gpu_status, use_fp16, warmup_model

    paths = {
        'person':         os.path.join(BASE_DIR, "VIRSION 1", "yolov8n.pt"),
        'cigarette_vape': TOBACCO_MODEL_PATH,
        'face':           os.path.join(MODEL_DIR, "face_best.pt"),
    }
    smoke_path = os.path.join(MODEL_DIR, "smoke_best.pt")
    if os.path.isfile(smoke_path):
        paths['smoke'] = smoke_path
    else:
        print(f"[Detection] smoke_best.pt not found — tobacco violations require smoke corroboration but smoke model is unavailable")
        _log_event("smoke_best.pt missing — enable smoke model file for corroborated tobacco alerts", "warn")
    _models = {}
    for key, path in paths.items():
        dev = device_for_model(key)
        model = YOLO(path)
        if dev != 'cpu':
            try:
                model.to(dev)
            except Exception as exc:
                print(f"[GPU] Could not move {key} to {dev}: {exc}")
                dev = 'cpu'
        _models[key] = model
        warmup_model(model, dev)
        print(f"[GPU] Loaded {key} on {dev}")

    info = gpu_status()
    mode = info.get('mode', 'cpu')
    if mode == 'gpu_farm':
        _log_event(f"GPU farm active — {info['gpu_count']} GPU(s), map={info['model_device_map']}")
    elif mode == 'gpu':
        _log_event(f"GPU inference on {info['primary_device']} (FP16={info['fp16_enabled']})")
    else:
        _log_event("Running on CPU — install CUDA PyTorch for GPU acceleration")


def _predict(model_key, source, **kwargs):
    """Run YOLO on the GPU assigned to this model (multi-GPU farm when configured)."""
    from gpu_runtime import device_for_model, use_fp16
    if model_key not in _models:
        _load_models()
    dev = device_for_model(model_key)
    opts = dict(kwargs, device=dev, verbose=False)
    if use_fp16() and dev.startswith('cuda'):
        opts['half'] = True
    return _models[model_key].predict(source, **opts)


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


def _box_intersection_area(box_a, box_b):
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0
    return (ix2 - ix1) * (iy2 - iy1)


def _smoke_corroborates_tobacco(tobacco_box, smoke_box, expand_ratio=None):
    """Loose zone around the object — smoke often appears above/near mouth, not on the bbox."""
    if expand_ratio is None:
        expand_ratio = SMOKE_TOBACCO_EXPAND_RATIO
    tx1, ty1, tx2, ty2 = tobacco_box
    tw = max(1, tx2 - tx1)
    th = max(1, ty2 - ty1)
    pad_side = int(tw * expand_ratio * 0.85)
    pad_up = int(th * expand_ratio * 1.35)
    pad_down = int(th * expand_ratio * 0.45)
    expanded = (tx1 - pad_side, ty1 - pad_up, tx2 + pad_side, ty2 + pad_down)

    scx = (smoke_box[0] + smoke_box[2]) / 2
    scy = (smoke_box[1] + smoke_box[3]) / 2
    if expanded[0] <= scx <= expanded[2] and expanded[1] <= scy <= expanded[3]:
        return True
    return _box_intersection_area(expanded, smoke_box) > 0


def _person_upper_body_zone(person_box):
    px1, py1, px2, py2 = person_box
    pw = max(1, px2 - px1)
    ph = max(1, py2 - py1)
    pad_x = int(pw * 0.12)
    upper_y2 = py1 + int(ph * SMOKE_UPPER_BODY_FRAC)
    return (px1 - pad_x, py1, px2 + pad_x, upper_y2)


def _smoke_in_zone(smoke_box, zone):
    scx = (smoke_box[0] + smoke_box[2]) / 2
    scy = (smoke_box[1] + smoke_box[3]) / 2
    if zone[0] <= scx <= zone[2] and zone[1] <= scy <= zone[3]:
        return True
    return _box_intersection_area(smoke_box, zone) > 0


def _tobacco_smoke_spatially_linked(candidates, person_box=None):
    if 'smoke' not in candidates:
        return False
    smoke_box = candidates['smoke'][1:]
    tobacco_present = 'cigarette' in candidates or 'vape' in candidates
    if not tobacco_present:
        return False

    for cls_name in ('cigarette', 'vape'):
        if cls_name in candidates and _smoke_corroborates_tobacco(candidates[cls_name][1:], smoke_box):
            return True

    if person_box is not None and _smoke_in_zone(smoke_box, _person_upper_body_zone(person_box)):
        return True
    return False


def _iter_person_boxes(frame):
    person_results = _predict('person', frame, classes=[0], conf=PERSON_CONF_THRESHOLD)
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


def _add_detection_candidate(candidates, cls_name, c, cx1, cy1, cx2, cy2, crop_h, crop_w, override_thresh):
    current_threshold = _class_threshold(cls_name, override_thresh)
    if c < current_threshold:
        return
    obj_w = cx2 - cx1
    obj_h = cy2 - cy1
    rel_h = obj_h / crop_h
    rel_w = obj_w / crop_w
    if not _is_candidate_size_valid(cls_name, rel_h, rel_w):
        return
    if cls_name not in candidates or c > candidates[cls_name][0]:
        candidates[cls_name] = (c, cx1, cy1, cx2, cy2)


def _collect_candidates(crop):
    candidates = {}  # cls_name -> (conf, cx1, cy1, cx2, cy2)
    enabled = _detection_settings['enabled_classes']
    override_thresh = _detection_settings['conf_thresh']
    crop_h, crop_w, _ = crop.shape

    tobacco_enabled = enabled.get('cigarette', True) or enabled.get('vape', True)
    if tobacco_enabled:
        results = _predict(
            'cigarette_vape',
            crop,
            conf=min(YOLO_INFER_CONF, 0.22),
            imgsz=640,
        )
        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                cls_name = r.names.get(cls_id, '')
                if cls_name not in ('cigarette', 'vape'):
                    continue
                if not enabled.get(cls_name, True):
                    continue
                c = float(box.conf[0])
                cx1, cy1, cx2, cy2 = map(int, box.xyxy[0])
                _add_detection_candidate(
                    candidates, cls_name, c, cx1, cy1, cx2, cy2, crop_h, crop_w, override_thresh
                )

    if enabled.get('smoke', True) and 'smoke' in _models:
        results = _predict(
            'smoke',
            crop,
            conf=_yolo_infer_conf('smoke'),
            imgsz=640,
        )
        for r in results:
            for box in r.boxes:
                c = float(box.conf[0])
                cx1, cy1, cx2, cy2 = map(int, box.xyxy[0])
                _add_detection_candidate(
                    candidates, 'smoke', c, cx1, cy1, cx2, cy2, crop_h, crop_w, override_thresh
                )
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
    
    # Check if smoke detection is active in settings and models
    smoke_enabled = _detection_settings.get('enabled_classes', {}).get('smoke', True) and 'smoke' in _models
    
    corroborated = (
        smoke_present
        and tobacco_present
        and _tobacco_smoke_spatially_linked(candidates, person_box)
    )

    # If corroborated, or if we have tobacco but smoke detection is disabled by user
    if corroborated or (tobacco_present and not smoke_enabled):
        combo_conf = 0.0
        combo_cls = None
        for cls_name in ('cigarette', 'vape', 'smoke'):
            if cls_name not in candidates:
                continue
            if cls_name == 'smoke' and not smoke_enabled:
                continue
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
                'label': f"SUSPECT {cls_name.upper()} {c:.0%}",
                'box': (gx1, gy1, gx2, gy2),
            })
        if smoke_present:
            c, gx1, gy1, gx2, gy2 = candidates['smoke']
            draw_payloads.append({
                'kind': 'cigarette_only',
                'label': f"SMOKE {c:.0%} (away from face)",
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
                with self.lock:
                    cmds = list(self.draw_commands)
                if cmds:
                    annotated = self.frame.copy()
                    for cmd in cmds:
                        if cmd[0] == 'rect':
                            cv2.rectangle(annotated, cmd[1], cmd[2], cmd[3], cmd[4])
                        elif cmd[0] == 'text':
                            cv2.putText(annotated, cmd[1], cmd[2], cv2.FONT_HERSHEY_SIMPLEX, cmd[3], cmd[4], cmd[5])
                    display = annotated
                else:
                    display = self.frame
                _latest_frames[self.camera_index] = display
                _latest_frame_seq[self.camera_index] = _latest_frame_seq.get(self.camera_index, 0) + 1
            time.sleep(0.001)

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

    frame_idx = 0
    while not _stop_event.is_set():
        ret, frame = cam.read()
        if not ret or frame is None:
            time.sleep(0.001)
            continue

        frame_idx += 1
        if frame_idx % CAMERA_DETECT_EVERY_N != 0:
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
        resolved_uid = None
        resolved_email = None

        face_results = _predict('face', frame, conf=0.45)
        for r in face_results:
            for box in r.boxes:
                fx1, fy1, fx2, fy2 = map(int, box.xyxy[0])
                h, w = frame.shape[:2]
                fx1, fy1 = max(0, fx1), max(0, fy1)
                fx2, fy2 = min(w, fx2), min(h, fy2)
                if fx2 > fx1 and fy2 > fy1:
                    face_crop = frame[fy1:fy2, fx1:fx2]
                    matched_name = recognize_face(face_crop)
                    if matched_name:
                        uid, email = resolve_user_by_name(matched_name)
                        if uid:
                            person_name = matched_name
                            resolved_uid = uid
                            resolved_email = email
                            break
            if resolved_uid:
                break

        if person_name == "Unknown":
            for r in face_results:
                if len(r.boxes) > 0:
                    person_name = "Person Detected"
                    break

        log_type = (violation_summary or pending_cls or 'unknown').lower()
        insert_violation(timestamp, rel_path, person_name, location, detected_type=log_type, user_id=resolved_uid)
        print(f"[Detection] ✓ {pending_cls} ({conf:.0%}) confirmed at {location} — {timestamp}")
        _log_event(f"Violation confirmed: {pending_cls} at {location} ({conf:.0%})", "warn")

        if _detection_settings.get('email_alerts', True):
            email_cooldown = _detection_settings.get('alert_cooldown', ALERT_COOLDOWN)
            if (now - last_email_time).total_seconds() >= email_cooldown:
                try:
                    recipient = resolved_email or get_user_email(person_name) or get_app_setting("smtp_recipient", "admin@example.com")
                    send_violation_email(img_path, recipient, person_name, pending_cls, location, timestamp)
                    last_email_time = now
                except Exception as e:
                    print(f"[Detection] Email failed: {e}")

    cam.stop()
    print(f"[Detection] Stopped on camera {camera_index}")
    _log_event(f"Camera {camera_index} stopped at {location}")


_user_cooldowns = {}
_user_confirm_state = {}

def process_user_frame(frame, username, location="Student Webcam", user_id=None):
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

    publish_user_stream_frame(username, annotated_frame)

    if detected_cls:
        global _user_cooldowns, _user_confirm_state
        state = _user_confirm_state.setdefault(username, {'cls': None, 'consecutive': 0})
        if detected_cls == state['cls']:
            state['consecutive'] += 1
        else:
            state['cls'] = detected_cls
            state['consecutive'] = 1

        if state['consecutive'] >= CONFIRM_FRAMES:
            now = datetime.datetime.now()
            last_t = _user_cooldowns.get(username, datetime.datetime.min)
            current_cooldown = _detection_settings.get('alert_cooldown', ALERT_COOLDOWN)
            if (now - last_t).total_seconds() >= current_cooldown:
                _user_cooldowns[username] = now
                state['consecutive'] = 0

                timestamp = now.strftime("%Y-%m-%d %H-%M-%S")
                img_filename = f"user_{username.replace(' ', '_')}_{timestamp}.jpg"
                img_path = os.path.join(STATIC_DIR, img_filename)
                cv2.imwrite(img_path, annotated_frame)
                rel_path = f"static/images/{img_filename}"

                uid = user_id or get_user_id_by_label(username)
                log_type = (violation_summary or detected_cls or 'unknown').lower()
                insert_violation(
                    timestamp, rel_path, username, location,
                    detected_type=log_type, user_id=uid,
                )
                print(f"[AI Multi-Stream] VIOLATION LOGGED: user {username} (uid={uid}) — {detected_cls} at {location}")
                _log_event(f"Webcam violation: {username} with {detected_cls} at {location}", "warn")

                if _detection_settings.get('email_alerts', True):
                    try:
                        recipient = get_user_email_by_id(uid) if uid else None
                        if not recipient:
                            recipient = get_user_email(username) or get_app_setting("smtp_recipient", "admin@example.com")
                        send_violation_email(img_path, recipient, username, detected_cls, location, timestamp)
                    except Exception as e:
                        print(f"[Detection] Email failed: {e}")
    else:
        _user_confirm_state[username] = {'cls': None, 'consecutive': 0}

    return annotated_frame, detected_cls is not None


def publish_user_stream_frame(username, frame):
    """Update live preview immediately (no YOLO on this path)."""
    with _user_frame_lock:
        _user_raw_frames[username] = frame
        _user_frame_seq[username] = _user_frame_seq.get(username, 0) + 1
        _user_latest_time[username] = datetime.datetime.now()


def _drain_user_detection(username):
    while True:
        with _user_frame_lock:
            pending = _user_frame_pending.pop(username, None)
        if pending is None:
            return
        frame, location, user_id = pending
        try:
            process_user_frame(frame, username, location, user_id=user_id)
        except Exception as exc:
            print(f"[Webcam] Detection error for {username}: {exc}")


def queue_user_stream_detection(username, frame, location="Student Webcam", user_id=None):
    """Run YOLO on a copy in the background; always keeps only the newest pending frame."""
    with _user_frame_lock:
        _user_frame_pending[username] = (frame.copy(), location, user_id)
    _user_detect_executor.submit(_drain_user_detection, username)


def get_user_stream_frame(username):
    with _user_frame_lock:
        return _user_raw_frames.get(username)


def get_user_stream_seq(username):
    with _user_frame_lock:
        return _user_frame_seq.get(username, 0)


def list_active_user_streams(max_age_seconds=60.0):
    now = datetime.datetime.now()
    active = []
    with _user_frame_lock:
        for name, t in list(_user_latest_time.items()):
            if (now - t).total_seconds() < max_age_seconds:
                active.append(name)
    return active


def encode_stream_jpeg(frame, quality=None):
    q = STREAM_JPEG_QUALITY if quality is None else quality
    ok, buf = cv2.imencode(
        '.jpg',
        frame,
        [int(cv2.IMWRITE_JPEG_QUALITY), int(q), int(cv2.IMWRITE_JPEG_OPTIMIZE), 1],
    )
    return buf.tobytes() if ok else None


import torch
import numpy as np
from facenet_pytorch import InceptionResnetV1

_facenet_resnet = None
_known_face_embeddings = {}

def _load_facenet():
    global _facenet_resnet
    if _facenet_resnet is None:
        try:
            _facenet_resnet = InceptionResnetV1(pretrained='vggface2').eval()
            print("[FaceNet] Pretrained model loaded successfully.", flush=True)
        except Exception as e:
            print(f"[FaceNet] Error loading model: {e}", flush=True)
            _log_event(f"FaceNet failed to load: {e}", "error")

def _preprocess_face_crop(crop):
    crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(crop_rgb, (160, 160))
    normalized = (resized.astype(np.float32) - 127.5) / 128.0
    tensor = torch.tensor(normalized).permute(2, 0, 1).unsqueeze(0)
    return tensor

def init_known_faces():
    global _known_face_embeddings
    if _known_face_embeddings:
        return
    _load_facenet()
    if _facenet_resnet is None:
        return
    known_dir = os.path.join(BASE_DIR, "backend", "known_faces")
    if not os.path.isdir(known_dir):
        print(f"[FaceNet] Directory {known_dir} does not exist.", flush=True)
        return
    print("[FaceNet] Computing embeddings for known faces...", flush=True)
    for filename in os.listdir(known_dir):
        if not filename.lower().endswith(('.jpg', '.jpeg', '.png')):
            continue
        filepath = os.path.join(known_dir, filename)
        name = os.path.splitext(filename)[0].capitalize()
        img = cv2.imread(filepath)
        if img is None:
            continue
        face_results = _predict('face', img, conf=0.50)
        crop = img
        for r in face_results:
            if len(r.boxes) > 0:
                box = r.boxes[0]
                fx1, fy1, fx2, fy2 = map(int, box.xyxy[0])
                h, w = img.shape[:2]
                fx1, fy1 = max(0, fx1), max(0, fy1)
                fx2, fy2 = min(w, fx2), min(h, fy2)
                if fx2 > fx1 and fy2 > fy1:
                    crop = img[fy1:fy2, fx1:fx2]
                break
        try:
            tensor = _preprocess_face_crop(crop)
            with torch.no_grad():
                embedding = _facenet_resnet(tensor).squeeze(0).numpy()
            _known_face_embeddings[name] = embedding
            print(f"[FaceNet] Loaded known face: {name}", flush=True)
        except Exception as e:
            print(f"[FaceNet] Failed to load {name}: {e}", flush=True)

def recognize_face(face_crop):
    global _known_face_embeddings
    if not _known_face_embeddings:
        init_known_faces()
    if not _known_face_embeddings or _facenet_resnet is None:
        return None
    try:
        tensor = _preprocess_face_crop(face_crop)
        with torch.no_grad():
            emb = _facenet_resnet(tensor).squeeze(0).numpy()
        best_name = None
        best_dist = 999.0
        for name, known_emb in _known_face_embeddings.items():
            dist = np.linalg.norm(emb - known_emb)
            print(f"[FaceNet] Distance to {name}: {dist:.3f}", flush=True)
            if dist < best_dist:
                best_dist = dist
                best_name = name
        if best_dist < 1.1:
            print(f"[FaceNet] Recognized face as {best_name} (distance={best_dist:.3f})", flush=True)
            return best_name
    except Exception as e:
        print(f"[FaceNet] Recognition error: {e}", flush=True)
    return None



_detection_active = False

def start_detection(cameras=None):
    global _detection_active
    if _detection_active:
        return False
    _detection_active = True
    _stop_event.clear()
    if cameras:
        for cam in cameras:
            idx = cam.get('index', 0)
            loc = cam.get('location') or f'Camera {idx}'
            t = threading.Thread(
                target=_detection_loop,
                args=(idx, loc),
                daemon=True,
                name=f'det-cam-{idx}',
            )
            t.start()
            _threads.append(t)
    print("[AI Surveillance] Detection mode activated. Live preview decoupled from inference.")
    _log_event("Detection mode activated")
    return True


def stop_detection():
    global _detection_active
    _detection_active = False
    _stop_event.set()
    for t in list(_threads):
        t.join(timeout=2.0)
    _threads.clear()
    _stop_event.clear()
    with _user_frame_lock:
        _user_raw_frames.clear()
        _user_frame_seq.clear()
        _user_latest_time.clear()
        _user_frame_pending.clear()
    print("[AI Surveillance] Detection mode deactivated.")
    _log_event("Detection mode deactivated")


def get_gpu_status():
    from gpu_runtime import gpu_status
    return gpu_status()


def is_running():
    global _detection_active
    return _detection_active


def get_latest_frame(camera_index):
    return _latest_frames.get(camera_index, None)


def get_latest_frame_seq(camera_index):
    return _latest_frame_seq.get(camera_index, 0)


if __name__ == "__main__":
    start_detection()
    import time
    try:
        while is_running():
            time.sleep(1)
    except KeyboardInterrupt:
        stop_detection()
