from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.core.event_bus import event_bus, to_sse_frame
from app.dependencies.auth import get_current_user
from app.models.models import User


router = APIRouter(prefix="/events", tags=["events"])


@router.get("/stream")
async def stream_events(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    queue = await event_bus.subscribe()

    async def event_generator():
        try:
            yield "retry: 3000\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=20)
                    if current_user.role == "worker":
                        worker_id = str(event.payload.get("worker_id", ""))
                        if worker_id and worker_id != current_user.id:
                            continue
                    yield to_sse_frame(event)
                except asyncio.TimeoutError:
                    # Keep connection alive so proxies do not close SSE stream.
                    now = datetime.now(timezone.utc).isoformat()
                    yield f"event: heartbeat\ndata: {{\"ts\": \"{now}\"}}\n\n"
        finally:
            await event_bus.unsubscribe(queue)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)
