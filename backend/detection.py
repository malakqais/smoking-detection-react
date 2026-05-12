from ultralytics import YOLO
import cv2
import datetime
from database import insert_violation
from email_service import send_violation_email # استيراد دالة الإيميل

model = YOLO("yolov8n.pt")

def start_detection():
    cap = cv2.VideoCapture(0)
    last_email_time = datetime.datetime.now() # لمنع إرسال 100 إيميل في نفس الدقيقة

    while True:
        ret, frame = cap.read()
        if not ret: break
        
        results = model(frame)

        for r in results:
            # سنقوم بالتحقق من وجود "شخص" (class 0) أو أي جسم مشبوه
            for box in r.boxes:
                conf = float(box.conf[0]) # نسبة التأكد
                
                # تعديل: لا يسجل إلا إذا كانت الثقة أعلى من85% 
                # (يمكنك رفعها لـ0.9 لتقليل الخطأ)
                if conf > 0.85: 
                    now = datetime.datetime.now()
                    timestamp = now.strftime("%Y-%m-%d %H-%M-%S")
                    image_path = f"static/images/{timestamp}.jpg"
                    
                    cv2.imwrite(image_path, frame)
                    insert_violation(timestamp, image_path)

                    # إرسال إيميل واحد كل دقيقة كحد أقصى لمنع الإزعاج
                    if (now - last_email_time).seconds > 60:
                        send_violation_email(image_path, "receiver_email@gmail.com")
                        last_email_time = now

        annotated = results[0].plot()
        cv2.imshow("Detection System", annotated)

        if cv2.waitKey(1) == 27: break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    start_detection()