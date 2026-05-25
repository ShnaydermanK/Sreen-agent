import clsx from "clsx";

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  online: { label: "Онлайн", dot: "bg-green-400", badge: "badge-online" },
  recording: { label: "Запись", dot: "bg-blue-400 animate-pulse", badge: "badge-recording" },
  paused: { label: "Пауза", dot: "bg-yellow-400", badge: "badge-online" },
  error: { label: "Ошибка", dot: "bg-red-400", badge: "badge-error" },
  offline: { label: "Офлайн", dot: "bg-gray-300", badge: "badge-offline" },
};

export function AgentStatusBadge({ status }: { status?: string }) {
  const cfg = STATUS_CONFIG[status ?? "offline"] ?? STATUS_CONFIG.offline;
  return (
    <span className={clsx(cfg.badge)}>
      <span className={clsx("w-1.5 h-1.5 rounded-full inline-block", cfg.dot)} />
      {cfg.label}
    </span>
  );
}
