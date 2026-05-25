from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._connections: dict[int, list[WebSocket]] = {}  # user_id -> sockets

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self._connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        conns = self._connections.get(user_id, [])
        if websocket in conns:
            conns.remove(websocket)

    async def broadcast(self, event: str, data: Any):
        """Send to all connected admin users."""
        msg = json.dumps({"event": event, "data": data})
        dead = []
        for user_id, sockets in self._connections.items():
            for ws in list(sockets):
                try:
                    await ws.send_text(msg)
                except Exception:
                    dead.append((user_id, ws))
        for uid, ws in dead:
            self.disconnect(ws, uid)

    async def send_to(self, user_id: int, event: str, data: Any):
        msg = json.dumps({"event": event, "data": data})
        for ws in list(self._connections.get(user_id, [])):
            try:
                await ws.send_text(msg)
            except Exception:
                self.disconnect(ws, user_id)


manager = ConnectionManager()
