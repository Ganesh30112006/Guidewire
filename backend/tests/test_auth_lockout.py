import pytest
from fastapi import HTTPException
from types import SimpleNamespace

from app.routers import auth


@pytest.mark.asyncio
async def test_change_password_failed_attempt_uses_normalized_email(monkeypatch):
    calls = []

    monkeypatch.setattr(auth, "verify_password", lambda plain, hashed: False)
    monkeypatch.setattr(auth, "decrypt_field", lambda encrypted: "User@Example.Com")
    monkeypatch.setattr(auth, "record_failed_login", lambda identifier: calls.append(identifier) or 1)

    current_user = SimpleNamespace(
        id="user-123",
        email_encrypted="enc-email",
        password_hash="hash",
    )

    body = SimpleNamespace(current_password="wrong-pass", new_password="Newpass1!")

    with pytest.raises(HTTPException) as exc:
        await auth.change_password(
            body=body,
            request=None,
            current_user=current_user,
            db=None,
        )

    assert exc.value.status_code == 401
    assert calls == ["user@example.com"]
