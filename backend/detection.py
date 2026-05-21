import os
import threading
import datetime
import cv2
from ultralytics import YOLO
from database import insert_violation, get_user_email
from email_service import send_violation_email

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE_DIR, "VIRSION 1", "models")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "images")

_threads = []
_stop_event = threading.Event()
_models = {}
_latest_frames = {}


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
ALERT_COOLDOWN = 10     # seconds between logged violations
CONFIRM_FRAMES = 2      # reduced consecutive frames since search is highly targeted


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

        # Generate live frame with annotations
        annotated_frame = frame.copy()
        detected_cls, conf = None, 0.0
        
        # Load models safely
        _load_models()
        
        # Stage 1: Fast Pretrained Person Detection
        person_results = _models['person'](frame, classes=[0], conf=0.45, verbose=False)
        has_person = False
        culprit_box = None
        
        for pr in person_results:
            for pbox in pr.boxes:
                has_person = True
                px1, py1, px2, py2 = map(int, pbox.xyxy[0])
                
                # Dynamic crop padding (extract upper-body / surrounding of the person)
                h, w, _ = frame.shape
                pad_x = int((px2 - px1) * 0.15)
                pad_y = int((py2 - py1) * 0.15)
                
                x1_crop = max(0, px1 - pad_x)
                y1_crop = max(0, py1 - pad_y)
                x2_crop = min(w, px2 + pad_x)
                y2_crop = min(h, py2 + pad_y)
                
                crop = frame[y1_crop:y2_crop, x1_crop:x2_crop]
                if crop.size == 0:
                    continue
                
                # Stage 2: Smoking, Vape, and Smoke Cloud targeted local classification
                for cls_name in ('cigarette', 'smoke', 'vape'):
                    if cls_name in _models:
                        # Elevate threshold for high-false-positive categories
                        current_threshold = 0.68 if cls_name in ('cigarette', 'vape') else 0.55
                        
                        results = _models[cls_name](crop, conf=current_threshold, verbose=False)
                        for r in results:
                            for box in r.boxes:
                                c = float(box.conf[0])
                                if c >= current_threshold and c > conf:
                                    # Translate local crop coordinates
                                    cx1, cy1, cx2, cy2 = map(int, box.xyxy[0])
                                    obj_w = cx2 - cx1
                                    obj_h = cy2 - cy1
                                    crop_h, crop_w, _ = crop.shape
                                    
                                    # Spatial scale heuristic: a vape or cigarette is a small hand-held item.
                                    # Discard massive vertical objects (like faces, phones, or whole forearms).
                                    rel_h = obj_h / crop_h
                                    rel_w = obj_w / crop_w
                                    
                                    if cls_name == 'cigarette':
                                        if rel_h > 0.18 or rel_w > 0.18:
                                            continue  # Discard massive false-positive shapes
                                    elif cls_name == 'vape':
                                        if rel_h > 0.22 or rel_w > 0.22:
                                            continue  # Discard massive false-positive shapes
                                    elif cls_name == 'smoke':
                                        if rel_h > 0.50 or rel_w > 0.50:
                                            continue  # Discard large shadows/reflections
                                            
                                    detected_cls, conf = cls_name, c
                                    culprit_box = (px1, py1, px2, py2)
                                    
                                    fx1, fy1, fx2, fy2 = cx1 + x1_crop, cy1 + y1_crop, cx2 + x1_crop, cy2 + y1_crop
                                    
                                    # Highlight exact violation object
                                    cv2.rectangle(annotated_frame, (fx1, fy1), (fx2, fy2), (0, 0, 255), 2)
                                    cv2.putText(annotated_frame, f"{cls_name.upper()} {c:.0%}", (fx1, fy1 - 10),
                                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

        # Draw real-time reactive bounding boxes over persons
        if has_person:
            for pr in person_results:
                for pbox in pr.boxes:
                    px1, py1, px2, py2 = map(int, pbox.xyxy[0])
                    if culprit_box and culprit_box == (px1, py1, px2, py2):
                        # Red warning border for verified violators
                        cv2.rectangle(annotated_frame, (px1, py1), (px2, py2), (0, 0, 255), 2)
                        cv2.putText(annotated_frame, f"VIOLATION: {detected_cls.upper()}", (px1, py1 - 10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                    else:
                        # Green compliant border for healthy bystanders
                        cv2.rectangle(annotated_frame, (px1, py1), (px2, py2), (0, 255, 0), 2)
                        cv2.putText(annotated_frame, "COMPLIANT", (px1, py1 - 10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        _latest_frames[camera_index] = annotated_frame

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
                recipient = get_user_email(person_name) or "admin@example.com"
                send_violation_email(img_path, recipient, person_name, pending_cls, location, timestamp)
                last_email_time = now
            except Exception as e:
                print(f"[Detection] Email failed: {e}")

    cap.release()
    print(f"[Detection] Stopped on camera {camera_index}")


_user_cooldowns = {}

def process_user_frame(frame, username, location="Student Webcam"):
    _load_models()
    annotated_frame = frame.copy()
    detected_cls, conf = None, 0.0
    
    # Stage 1: Fast Pretrained Person Detection
    person_results = _models['person'](frame, classes=[0], conf=0.45, verbose=False)
    has_person = False
    culprit_box = None
    
    for pr in person_results:
        for pbox in pr.boxes:
            has_person = True
            px1, py1, px2, py2 = map(int, pbox.xyxy[0])
            
            # Dynamic crop padding (extract upper-body)
            h, w, _ = frame.shape
            pad_x = int((px2 - px1) * 0.15)
            pad_y = int((py2 - py1) * 0.15)
            
            x1_crop = max(0, px1 - pad_x)
            y1_crop = max(0, py1 - pad_y)
            x2_crop = min(w, px2 + pad_x)
            y2_crop = min(h, py2 + pad_y)
            
            crop = frame[y1_crop:y2_crop, x1_crop:x2_crop]
            if crop.size == 0:
                continue
                
            # Stage 2: Smoking, Vape, and Smoke Cloud targeted local classification
            for cls_name in ('cigarette', 'smoke', 'vape'):
                if cls_name in _models:
                    current_threshold = 0.68 if cls_name in ('cigarette', 'vape') else 0.55
                    results = _models[cls_name](crop, conf=current_threshold, verbose=False)
                    for r in results:
                        for box in r.boxes:
                            c = float(box.conf[0])
                            if c >= current_threshold and c > conf:
                                cx1, cy1, cx2, cy2 = map(int, box.xyxy[0])
                                obj_w = cx2 - cx1
                                obj_h = cy2 - cy1
                                crop_h, crop_w, _ = crop.shape
                                
                                rel_h = obj_h / crop_h
                                rel_w = obj_w / crop_w
                                
                                # Guardrails
                                if cls_name == 'cigarette':
                                    if rel_h > 0.18 or rel_w > 0.18:
                                        continue
                                elif cls_name == 'vape':
                                    if rel_h > 0.22 or rel_w > 0.22:
                                        continue
                                elif cls_name == 'smoke':
                                    if rel_h > 0.50 or rel_w > 0.50:
                                        continue
                                        
                                detected_cls, conf = cls_name, c
                                culprit_box = (px1, py1, px2, py2)
                                
                                fx1, fy1, fx2, fy2 = cx1 + x1_crop, cy1 + y1_crop, cx2 + x1_crop, cy2 + y1_crop
                                cv2.rectangle(annotated_frame, (fx1, fy1), (fx2, fy2), (0, 0, 255), 2)
                                cv2.putText(annotated_frame, f"{cls_name.upper()} {c:.0%}", (fx1, fy1 - 10),
                                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                                            
    # Bounding boxes
    if has_person:
        for pr in person_results:
            for pbox in pr.boxes:
                px1, py1, px2, py2 = map(int, pbox.xyxy[0])
                if culprit_box and culprit_box == (px1, py1, px2, py2):
                    cv2.rectangle(annotated_frame, (px1, py1), (px2, py2), (0, 0, 255), 2)
                    cv2.putText(annotated_frame, f"VIOLATION: {detected_cls.upper()}", (px1, py1 - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                else:
                    cv2.rectangle(annotated_frame, (px1, py1), (px2, py2), (0, 255, 0), 2)
                    cv2.putText(annotated_frame, "COMPLIANT", (px1, py1 - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

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
            
            try:
                recipient = get_user_email(username) or "admin@example.com"
                send_violation_email(img_path, recipient, username, detected_cls, location, timestamp)
            except Exception as e:
                print(f"[Detection] Email failed: {e}")
                
    return annotated_frame, detected_cls is not None


_detection_active = False

def start_detection(cameras=None):
    global _detection_active
    _detection_active = True
    print("[AI Surveillance] Detection mode activated globally. Listening for client webcam streams...")
    return True


def stop_detection():
    global _detection_active
    _detection_active = False
    print("[AI Surveillance] Detection mode deactivated.")


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
