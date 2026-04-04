from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

settings = get_settings()

# Shared limiter instance so endpoint decorators and middleware use the same state.
limiter = Limiter(key_func=get_remote_address, default_limits=[settings.RATE_LIMIT_API])
