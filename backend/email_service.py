import smtplib
from email.message import EmailMessage

def send_violation_email(image_path, recipient_email):
    msg = EmailMessage()
    msg['Subject'] = 'تنبيه: مخالفة تدخين وغرامة مالية'
    msg['From'] = "your_email@gmail.com" # إيميلك هنا
    msg['To'] = recipient_email

    msg.set_content(f"""
    تم رصد مخالفة تدخين في مكان ممنوع.
    بناءً على أنظمة المكان، تم تسجيل غرامة مالية بقيمة (حدد المبلغ) بحقك.
    تجدون مرفقاً صورة توثق المخالفة.
    يرجى الالتزام بالتعليمات لتجنب مضاعفة الغرامة.
    """)

    with open(image_path, 'rb') as f:
        msg.add_attachment(f.read(), maintype='image', subtype='jpeg', filename='violation.jpg')

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login("your_email@gmail.com", "your_app_password") # إيميلك وباسورد التطبيق
            smtp.send_message(msg)
            print("✅ تم إرسال إيميل الغرامة بنجاح")
    except Exception as e:
        print(f"❌ فشل إرسال الإيميل: {e}")