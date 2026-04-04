"""
AES-256-GCM field-level encryption for PII (phone, email, income).

─ Algorithm  : AES-256-GCM (authenticated encryption — confidentiality + integrity)
─ Key        : 256-bit derived from FIELD_ENCRYPTION_KEY env var
─ Nonce      : 96-bit random per encryption (prepended to ciphertext)
─ Tag        : 128-bit GCM authentication tag (appended to ciphertext)
─ Output     : base64url(nonce || ciphertext || tag) — safe for DB TEXT columns
"""

import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.core.config import get_settings

settings = get_settings()

_NONCE_SIZE = 12    # 96-bit nonce (GCM standard)
_KEY_SIZE = 32      # 256-bit key

def _get_key() -> bytes:
    return bytes.fromhex(settings.FIELD_ENCRYPTION_KEY)


def encrypt_field(plaintext: str) -> str:
    """Encrypt a string field. Returns base64url-encoded ciphertext."""
    key = _get_key()
    nonce = os.urandom(_NONCE_SIZE)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)     # ct includes GCM tag
    return base64.urlsafe_b64encode(nonce + ct).decode()


def decrypt_field(token: str) -> str:
    """Decrypt a field encrypted with encrypt_field. Raises on tamper."""
    key = _get_key()
    raw = base64.urlsafe_b64decode(token.encode())
    nonce, ct = raw[:_NONCE_SIZE], raw[_NONCE_SIZE:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, None).decode()
