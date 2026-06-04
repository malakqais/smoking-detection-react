"""Client IP and User-Agent parsing for login notifications."""
import re

from flask import request


def get_client_ip():
    forwarded = (request.headers.get("X-Forwarded-For") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = (request.headers.get("X-Real-IP") or "").strip()
    if real_ip:
        return real_ip
    return request.remote_addr or "unknown"


def parse_user_agent(user_agent="", platform_hint=""):
    ua = user_agent or ""
    platform = platform_hint or ""

    os_name = "Unknown OS"
    if re.search(r"Windows NT 10", ua, re.I):
        os_name = "Windows 10/11"
    elif re.search(r"Windows", ua, re.I):
        os_name = "Windows"
    elif re.search(r"Mac OS X|Macintosh", ua, re.I):
        os_name = "macOS"
    elif re.search(r"Android", ua, re.I):
        os_name = "Android"
    elif re.search(r"iPhone|iPad|iPod", ua, re.I):
        os_name = "iOS"
    elif re.search(r"Linux", ua, re.I):
        os_name = "Linux"
    elif platform:
        os_name = platform

    browser = "Unknown browser"
    if re.search(r"Edg/", ua):
        browser = "Microsoft Edge"
    elif re.search(r"OPR/|Opera", ua):
        browser = "Opera"
    elif re.search(r"Firefox/", ua):
        browser = "Firefox"
    elif re.search(r"Chrome/", ua) and not re.search(r"Edg/", ua):
        browser = "Chrome"
    elif re.search(r"Safari/", ua) and not re.search(r"Chrome/", ua):
        browser = "Safari"

    return os_name, browser


def login_context_from_request(data=None):
    data = data or {}
    client = data.get("client") if isinstance(data.get("client"), dict) else {}
    ua = (client.get("user_agent") or request.headers.get("User-Agent") or "").strip()
    platform = (client.get("platform") or "").strip()
    os_name, browser = parse_user_agent(ua, platform)
    return {
        "ip_address": get_client_ip(),
        "user_agent": ua or "Not provided",
        "os_name": os_name,
        "browser": browser,
        "language": (client.get("language") or request.headers.get("Accept-Language", "") or "")[:80],
    }
