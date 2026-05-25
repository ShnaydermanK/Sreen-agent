import { useMemo } from "react";
import clsx from "clsx";

export interface TimelineEvent {
  event_type: string;
  ts: string;
  offset_sec: number;
  offset_pct: number;
  app_name?: string;
  app_category?: string;
  duration_sec?: number;
}

const EVENT_STYLE: Record<string, { color: string; label: string }> = {
  app_focus:      { color: "bg-blue-400",   label: "Активность" },
  idle_start:     { color: "bg-yellow-400", label: "Idle" },
  idle_end:       { color: "bg-blue-400",   label: "Активен" },
  screen_lock:    { color: "bg-gray-500",   label: "Блокировка" },
  screen_unlock:  { color: "bg-blue-400",   label: "Разблокировка" },
  call_start:     { color: "bg-green-500",  label: "Звонок" },
  call_end:       { color: "bg-green-300",  label: "Конец звонка" },
  session_start:  { color: "bg-purple-500", label: "Начало сессии" },
  session_end:    { color: "bg-purple-300", label: "Конец сессии" },
};

interface Props {
  events: TimelineEvent[];
  durationSec: number;
  currentTimeSec: number;
  onSeek: (sec: number) => void;
}

export function EventsTimeline({ events, durationSec, currentTimeSec, onSeek }: Props) {
  const progressPct = durationSec > 0 ? (currentTimeSec / durationSec) * 100 : 0;

  // Build colored segments between events
  const segments = useMemo(() => {
    const segs: { start: number; end: number; type: string }[] = [];
    let currentType = "active";
    let currentStart = 0;

    for (const ev of events) {
      const pct = Math.min(100, Math.max(0, ev.offset_pct));
      if (ev.event_type === "idle_start" && currentType !== "idle") {
        segs.push({ start: currentStart, end: pct, type: currentType });
        currentType = "idle";
        currentStart = pct;
      } else if (ev.event_type === "idle_end" && currentType === "idle") {
        segs.push({ start: currentStart, end: pct, type: "idle" });
        currentType = "active";
        currentStart = pct;
      } else if (ev.event_type === "screen_lock") {
        segs.push({ start: currentStart, end: pct, type: currentType });
        currentType = "locked";
        currentStart = pct;
      } else if (ev.event_type === "screen_unlock") {
        segs.push({ start: currentStart, end: pct, type: "locked" });
        currentType = "active";
        currentStart = pct;
      } else if (ev.event_type === "call_start") {
        segs.push({ start: currentStart, end: pct, type: currentType });
        currentType = "call";
        currentStart = pct;
      } else if (ev.event_type === "call_end") {
        segs.push({ start: currentStart, end: pct, type: "call" });
        currentType = "active";
        currentStart = pct;
      }
    }
    segs.push({ start: currentStart, end: 100, type: currentType });
    return segs;
  }, [events]);

  const SEG_COLORS: Record<string, string> = {
    active: "bg-blue-400/40",
    idle:   "bg-yellow-300/50",
    locked: "bg-gray-400/50",
    call:   "bg-green-400/50",
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(pct * durationSec);
  };

  // Marker events (not idle/call boundaries)
  const markerEvents = events.filter((e) =>
    ["app_focus", "call_start", "screen_lock"].includes(e.event_type)
  );

  return (
    <div className="space-y-1.5">
      {/* Colored segment bar */}
      <div
        className="relative h-4 bg-gray-200 rounded-full cursor-pointer overflow-hidden"
        onClick={handleClick}
        title="Нажмите для перехода"
      >
        {segments.map((seg, i) => (
          <div
            key={i}
            className={clsx("absolute top-0 h-full transition-all", SEG_COLORS[seg.type] || "bg-gray-300")}
            style={{ left: `${seg.start}%`, width: `${seg.end - seg.start}%` }}
          />
        ))}

        {/* Event markers */}
        {markerEvents.map((ev, i) => (
          <div
            key={i}
            className={clsx(
              "absolute top-0 w-0.5 h-full",
              ev.event_type === "call_start" ? "bg-green-600" :
              ev.event_type === "screen_lock" ? "bg-gray-600" :
              "bg-blue-500/50"
            )}
            style={{ left: `${ev.offset_pct}%` }}
            title={`${ev.event_type}: ${ev.app_name || ""} @ ${Math.round(ev.offset_sec)}s`}
          />
        ))}

        {/* Playhead */}
        <div
          className="absolute top-0 w-1 h-full bg-red-500 rounded-full shadow"
          style={{ left: `${progressPct}%`, transform: "translateX(-50%)" }}
        />
      </div>

      {/* Legend */}
      <div className="flex gap-3 flex-wrap">
        {[
          { color: "bg-blue-400/60", label: "Активность" },
          { color: "bg-yellow-300/70", label: "Idle" },
          { color: "bg-green-400/60", label: "Звонок" },
          { color: "bg-gray-400/60", label: "Блокировка" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={clsx("w-3 h-2 rounded-sm inline-block", color)} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
