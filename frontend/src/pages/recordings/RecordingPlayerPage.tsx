import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronLeft, Download, Clock, HardDrive, Monitor, SkipForward, List } from "lucide-react";
import { getRecording, VideoSegment } from "../../api/endpoints";
import { HlsPlayer } from "../../components/player/HlsPlayer";
import { EventsTimeline, TimelineEvent } from "../../components/player/EventsTimeline";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { api } from "../../api/client";
import clsx from "clsx";

function fmtDuration(sec?: number) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}ч ${m}м ${s}с` : `${m}м ${s}с`;
}
function fmtSize(bytes?: number) {
  if (!bytes) return "—";
  if (bytes > 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} ГБ`;
  return `${(bytes / 1_000_000).toFixed(1)} МБ`;
}
function fmtSec(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  app_focus:      { label: "Приложение",    color: "text-blue-600" },
  idle_start:     { label: "Idle начало",    color: "text-yellow-600" },
  idle_end:       { label: "Idle конец",     color: "text-green-600" },
  screen_lock:    { label: "Блокировка",     color: "text-gray-600" },
  screen_unlock:  { label: "Разблокировка",  color: "text-gray-400" },
  call_start:     { label: "Звонок",         color: "text-green-700" },
  call_end:       { label: "Конец звонка",   color: "text-green-400" },
};

export function RecordingPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [segment, setSegment] = useState<VideoSegment | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [showEvents, setShowEvents] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    Promise.all([
      getRecording(Number(id)),
      api.get<TimelineEvent[]>(`/admin/recordings/${id}/events`),
    ]).then(([recRes, evRes]) => {
      setSegment(recRes.data);
      setEvents(evRes.data);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleSeek = (sec: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = sec;
      video.play();
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (video) setCurrentTime(video.currentTime);
  };

  const handlePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  };

  if (loading) return <div className="p-6 text-gray-400">Загрузка...</div>;
  if (!segment) return <div className="p-6 text-red-500">Запись не найдена</div>;

  const videoSrc = segment.hls_url || segment.download_url;
  const filteredEvents = eventFilter === "all"
    ? events
    : events.filter((e) => e.event_type === eventFilter);

  const jumpEvents = events.filter((e) =>
    ["idle_start", "call_start", "screen_lock", "app_focus"].includes(e.event_type)
  );

  return (
    <div className="p-6 max-w-5xl">
      <Link to="/recordings" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ChevronLeft size={16} />Назад к записям
      </Link>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Запись #{segment.id}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {format(new Date(segment.started_at), "dd MMMM yyyy, HH:mm", { locale: ru })}
            {segment.ended_at && ` — ${format(new Date(segment.ended_at), "HH:mm", { locale: ru })}`}
            <span className="ml-2 text-gray-400">Сотрудник #{segment.employee_id}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={clsx("btn-secondary py-1.5 text-xs", showEvents && "bg-blue-50 border-blue-200 text-blue-700")}
            onClick={() => setShowEvents(!showEvents)}
          >
            <List size={13} />
            {events.length} событий
          </button>
          {segment.download_url && (
            <a href={segment.download_url} download className="btn-secondary">
              <Download size={16} />Скачать
            </a>
          )}
        </div>
      </div>

      <div className="card overflow-hidden mb-3">
        {videoSrc ? (
          <div className="relative">
            <HlsPlayer
              src={videoSrc}
              className="w-full aspect-video bg-black"
              onTimeUpdate={handleTimeUpdate}
              videoRef={videoRef}
            />
            {/* Playback speed overlay */}
            <div className="absolute bottom-12 right-3 flex gap-1">
              {[0.5, 1, 1.5, 2, 4, 8].map((r) => (
                <button
                  key={r}
                  onClick={() => handlePlaybackRate(r)}
                  className={clsx(
                    "text-xs px-1.5 py-0.5 rounded font-mono font-medium transition-colors",
                    playbackRate === r
                      ? "bg-white text-gray-900"
                      : "bg-black/50 text-white/70 hover:bg-black/70"
                  )}
                >
                  {r}×
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="aspect-video bg-gray-900 flex items-center justify-center text-gray-400 text-sm">
            {segment.status === "processing" ? "Видео обрабатывается..." : "Видео недоступно"}
          </div>
        )}
      </div>

      {/* Events timeline */}
      {events.length > 0 && (
        <div className="card p-3 mb-3">
          <EventsTimeline
            events={events}
            durationSec={segment.duration_sec ?? 0}
            currentTimeSec={currentTime}
            onSeek={handleSeek}
          />
        </div>
      )}

      {/* Jump to events bar */}
      {jumpEvents.length > 0 && (
        <div className="card p-3 mb-3 flex items-center gap-2 overflow-x-auto">
          <SkipForward size={13} className="text-gray-400 shrink-0" />
          <span className="text-xs text-gray-500 shrink-0">Перейти:</span>
          {jumpEvents.slice(0, 12).map((ev, i) => (
            <button
              key={i}
              onClick={() => handleSeek(ev.offset_sec)}
              className="shrink-0 text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50 text-gray-600 whitespace-nowrap"
            >
              {fmtSec(ev.offset_sec)} {ev.event_type === "app_focus" ? ev.app_name?.slice(0, 15) : EVENT_TYPE_LABELS[ev.event_type]?.label}
            </button>
          ))}
        </div>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { icon: Clock, label: "Длительность", value: fmtDuration(segment.duration_sec) },
          { icon: HardDrive, label: "Размер", value: fmtSize(segment.file_size_bytes) },
          { icon: Monitor, label: "Разрешение", value: segment.resolution ?? "—" },
          { icon: Monitor, label: "Кодек", value: segment.codec?.toUpperCase() ?? "—" },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="card p-3">
            <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1"><Icon size={12} />{label}</div>
            <p className="font-semibold text-gray-900 text-sm">{value}</p>
          </div>
        ))}
      </div>

      {/* Events list panel */}
      {showEvents && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">События ({filteredEvents.length})</h3>
            <select
              className="input max-w-[180px] text-xs py-1"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
            >
              <option value="all">Все события</option>
              <option value="app_focus">Приложения</option>
              <option value="idle_start">Idle</option>
              <option value="call_start">Звонки</option>
              <option value="screen_lock">Блокировки</option>
            </select>
          </div>
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {filteredEvents.map((ev, i) => {
              const cfg = EVENT_TYPE_LABELS[ev.event_type] || { label: ev.event_type, color: "text-gray-500" };
              return (
                <button
                  key={i}
                  onClick={() => handleSeek(ev.offset_sec)}
                  className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-gray-50 text-left group"
                >
                  <span className="text-xs font-mono text-gray-400 w-10 shrink-0">{fmtSec(ev.offset_sec)}</span>
                  <span className={clsx("text-xs font-medium w-28 shrink-0", cfg.color)}>{cfg.label}</span>
                  <span className="text-xs text-gray-500 truncate flex-1">{ev.app_name || ""}</span>
                  {ev.duration_sec && <span className="text-xs text-gray-400 shrink-0">{fmtSec(ev.duration_sec)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
