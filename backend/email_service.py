import smtplib
from email.message import EmailMessage
from database import get_app_setting

# Gmail SMTP credentials
# NOTE: For production, move these to environment variables (os.environ)
SMTP_EMAIL = "smokingdetection@gmail.com"
SMTP_APP_PASSWORD = "eakzvbwwarvjlvrm"


def _smtp_credentials():
    configured_email = get_app_setting("smtp_sender_email", SMTP_EMAIL)
    configured_password = get_app_setting("smtp_app_password", SMTP_APP_PASSWORD)
    return configured_email, configured_password


def send_violation_email(image_path, recipient_email, violator_name="Unknown", detected_item="Unknown", location="Monitored Zone", timestamp="Unknown"):
    """
    Sends a violation notification email with the evidence image attached.
    
    Args:
        image_path: Absolute path to the captured violation screenshot.
        recipient_email: The email address to send the notification to.
        violator_name: The detected person's name (default: "Unknown").
        detected_item: What was detected (e.g. Cigarette, Vape).
        location: The camera location.
        timestamp: Time of the violation.
    
    Returns:
        True if sent successfully, False otherwise.
    """
    msg = EmailMessage()
    smtp_email, smtp_password = _smtp_credentials()
    msg['Subject'] = f'⚠️ URGENT: {detected_item} Violation Detected — SmokeDet System'
    msg['From'] = smtp_email
    msg['To'] = recipient_email

    body = f"""
    Dear {violator_name},

    Our AI surveillance system has detected a policy violation in a monitored campus zone.

    ─────────────────────────────────────
    INCIDENT REPORT
    ─────────────────────────────────────
    Identified Person:  {violator_name}
    Recipient Email:    {recipient_email}
    Detected Object:    {detected_item}
    Location:           {location}
    Time of Incident:   {timestamp}
    Action Taken:       Fine Penalty Issued ($20.00)
    ─────────────────────────────────────

    Please review the attached evidence image for details.
    A $20.00 fine has been automatically applied to your student account.

    If you believe this detection was made in error, please contact the campus
    administration office within 48 hours to file a dispute.

    This is an automated notification from the SmokeDet AI Detection System.
    Please follow campus safety regulations to avoid further penalties.

    — SmokeDet Automated Surveillance System
    """
    msg.set_content(body)

    try:
        # Read and attach the violation evidence image
        with open(image_path, 'rb') as f:
            file_data = f.read()
            msg.add_attachment(
                file_data,
                maintype='image',
                subtype='jpeg',
                filename='violation_evidence.jpg'
            )

        # Connect to Gmail SMTP with TLS encryption on port 587
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.send_message(msg)

        print(f"✅ Violation email sent successfully to {recipient_email} (violator: {violator_name})")
        return True

    except Exception as e:
        print(f"❌ Email Delivery Failed: {e}")
        return False

def send_test_email(recipient_email, smtp_email=None, smtp_app_password=None):
    """
    Sends a test connection email to verify SMTP settings.
    """
    if smtp_email and smtp_app_password:
        test_email, test_password = smtp_email, smtp_app_password
    else:
        test_email, test_password = _smtp_credentials()

    msg = EmailMessage()
    msg['Subject'] = '✅ SMTP Connection Test — SmokeDet System'
    msg['From'] = test_email
    msg['To'] = recipient_email

    body = f"""
    Hello,

    This is a test email sent from the SmokeDet AI Surveillance System dashboard.
    If you are reading this, your SMTP configuration is successfully working!

    — SmokeDet Automated Surveillance System
    """
    msg.set_content(body)

    try:
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(test_email, test_password)
            server.send_message(msg)

        print(f"✅ Test email sent successfully to {recipient_email}")
        return True
    except Exception as e:
        print(f"❌ Test Email Delivery Failed: {e}")
        return False