import base64
import hmac
import hashlib
import re
import time

TOTP_CODE_RE = re.compile(r"^\d{6}$")


def normalize_totp_code(code):
    return str(code or "").strip()


def validate_totp_format(code):
    normalized = normalize_totp_code(code)
    if not TOTP_CODE_RE.match(normalized):
        return False, "Enter a valid 6-digit code"
    return True, normalized


def verify_totp_token(secret, code_str):
    ok, _step = verify_totp_token_with_step(secret, code_str)
    return ok


def verify_totp_token_with_step(secret, code_str):
    code_str = normalize_totp_code(code_str)
    if not TOTP_CODE_RE.match(code_str):
        return False, None
    try:
        for offset_step in (-1, 0, 1):
            missing_padding = len(secret) % 8
            padded_secret = secret + ("=" * (8 - missing_padding) if missing_padding else "")
            key = base64.b32decode(padded_secret, casefold=True)
            counter = int(time.time() / 30) + offset_step
            msg = counter.to_bytes(8, byteorder="big")
            hs = hmac.new(key, msg, hashlib.sha1).digest()
            offset = hs[-1] & 0x0F
            val = (
                (hs[offset] & 0x7F) << 24
                | (hs[offset + 1] & 0xFF) << 16
                | (hs[offset + 2] & 0xFF) << 8
                | (hs[offset + 3] & 0xFF)
            )
            calc_code = str(val % 1000000).zfill(6)
            if calc_code == code_str:
                return True, counter
        return False, None
    except Exception as e:
        print(f"[2FA] Error verifying token: {e}")
        return False, None
