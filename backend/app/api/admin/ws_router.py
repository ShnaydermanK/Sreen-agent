from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.api.admin.deps import get_current_user
from app.core.ws import manager
from app.core.security import decode_token
from app.models.user import User

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/live")
async def live_ws(websocket: WebSocket):
    """
    WebSocket for real-time agent status updates.
    Auth: pass token as query param ?token=<jwt>
    Messages received: { "event": "agent_status" | "alert_new", "data": {...} }
    """
    token = websocket.query_params.get("token")
    payload = decode_token(token) if token else None
    if not payload:
        await websocket.close(code=4001)
        return

    user_id = int(payload.get("sub", 0))
    await manager.connect(websocket, user_id)
    try:
        # Keep connection alive; client can send pings
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text('{"event":"pong"}')
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
