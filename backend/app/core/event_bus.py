from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass
class DomainEvent:
    event_type: str
    payload: dict[str, Any]
    created_at: str


class InMemoryEventBus:
    """Small async pub/sub bus used for SSE fan-out."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[DomainEvent]] = set()
        self._lock = asyncio.Lock()

    async def publish(self, event_type: str, payload: dict[str, Any]) -> None:
        event = DomainEvent(
            event_type=event_type,
            payload=payload,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        async with self._lock:
            subscribers = list(self._subscribers)
        for queue in subscribers:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Drop oldest-like behavior by ignoring overloaded subscriber.
                continue

    async def subscribe(self) -> asyncio.Queue[DomainEvent]:
        queue: asyncio.Queue[DomainEvent] = asyncio.Queue(maxsize=200)
        async with self._lock:
            self._subscribers.add(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[DomainEvent]) -> None:
        async with self._lock:
            self._subscribers.discard(queue)


def to_sse_frame(event: DomainEvent) -> str:
    body = {
        "type": event.event_type,
        "payload": event.payload,
        "created_at": event.created_at,
    }
    return f"event: {event.event_type}\\ndata: {json.dumps(body)}\\n\\n"


event_bus = InMemoryEventBus()
