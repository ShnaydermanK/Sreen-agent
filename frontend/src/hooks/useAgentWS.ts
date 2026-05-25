import { useEffect, useRef, useCallback } from "react";

export type AgentStatusEvent = {
  employee_id: number;
  agent_id: number;
  status: string;
  hostname: string | null;
  last_seen_at: string;
  buffer_size_bytes?: number;
};

export type ActivityUpdateEvent = {
  employee_id: number;
  current_app: string | null;
  current_app_category: string | null;
  is_idle: boolean | null;
};

type WSMessage = { event: string; data: unknown };

interface Handlers {
  onAgentStatus?: (data: AgentStatusEvent) => void;
  onActivityUpdate?: (data: ActivityUpdateEvent) => void;
  onAlertNew?: (data: unknown) => void;
}

export function useAgentWS(handlers: Handlers | ((data: AgentStatusEvent) => void)) {
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Support both old (function) and new (object) call signatures
  const h: Handlers = typeof handlers === "function"
    ? { onAgentStatus: handlers }
    : handlers;

  const connect = useCallback(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const url = `ws://localhost:8000/ws/live?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      pingRef.current = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), 25_000);
    };

    ws.onmessage = (e) => {
      try {
        const msg: WSMessage = JSON.parse(e.data);
        if (msg.event === "agent_status" && h.onAgentStatus)
          h.onAgentStatus(msg.data as AgentStatusEvent);
        if (msg.event === "activity_update" && h.onActivityUpdate)
          h.onActivityUpdate(msg.data as ActivityUpdateEvent);
        if (msg.event === "alert_new" && h.onAlertNew)
          h.onAlertNew(msg.data);
      } catch {}
    };

    ws.onclose = () => {
      if (pingRef.current) clearInterval(pingRef.current);
      reconnectRef.current = setTimeout(connect, 5000);
    };
    ws.onerror = () => ws.close();
  }, []); // eslint-disable-line

  useEffect(() => {
    connect();
    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
