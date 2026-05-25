import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Video, Activity, TrendingUp, Bell, Monitor, RefreshCw } from "lucide-react";
import {
  listEmployees, listRecordings, alertsSummary, Employee,
} from "../../api/endpoints";
import { AgentStatusBadge } from "../../components/AgentStatusBadge";
import { useAgentWS, AgentStatusEvent, ActivityUpdateEvent } from "../../hooks/useAgentWS";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import clsx from "clsx";

const API = "/api";

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

const CATEGORY_COLORS: Record<string, string> = {
  crm: "text-blue-600 bg-blue-50",
  browser: "text-green-600 bg-green-50",
  office: "text-amber-600 bg-amber-50",
  telephony: "text-purple-600 bg-purple-50",
  messenger: "text-pink-600 bg-pink-50",
  other: "text-gray-500 bg-gray-50",
};

export function DashboardPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState({ total: 0, online: 0, recording: 0, recordings: 0 });
  const [alertCount, setAlertCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [liveScreenshots, setLiveScreenshots] = useState<Record<string, string>>({});
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);

  // Live state updated by WebSocket
  const [liveData, setLiveData] = useState<Record<number, {
    status?: string;
    hostname?: string | null;
    current_app?: string | null;
    current_app_category?: string | null;
    is_idle?: boolean | null;
    last_seen?: string;
  }>>({});

  useEffect(() => {
    Promise.all([
      listEmployees({ size: 100 }),
      listRecordings({ size: 1 }),
      alertsSummary(),
    ]).then(([empRes, recRes, alertRes]) => {
      const emps = empRes.data.items;
      setEmployees(emps);
      const online = emps.filter((e) => ["online", "recording"].includes(e.agent_status?.status ?? "")).length;
      const recording = emps.filter((e) => e.agent_status?.status === "recording").length;
      setStats({ total: empRes.data.total, online, recording, recordings: recRes.data.total });
      setAlertCount(alertRes.data.reduce((s, a) => s + a.count, 0));
    }).finally(() => setLoading(false));

    // Load live screenshots
    loadScreenshots();
    const ssInterval = setInterval(loadScreenshots, 60_000);
    return () => clearInterval(ssInterval);
  }, []);

  const loadScreenshots = async () => {
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API}/admin/live/screenshots`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setLiveScreenshots(await res.json());
    } catch {}
  };

  const handleAgentStatus = useCallback((data: AgentStatusEvent) => {
    setLiveData((prev) => ({
      ...prev,
      [data.employee_id]: {
        ...prev[data.employee_id],
        status: data.status,
        hostname: data.hostname,
        last_seen: data.last_seen_at,
      },
    }));
    setStats((prev) => ({ ...prev }));
  }, []);

  const handleActivityUpdate = useCallback((data: ActivityUpdateEvent) => {
    setLiveData((prev) => ({
      ...prev,
      [data.employee_id]: {
        ...prev[data.employee_id],
        current_app: data.current_app,
        current_app_category: data.current_app_category,
        is_idle: data.is_idle,
      },
    }));
  }, []);

  useAgentWS({ onAgentStatus: handleAgentStatus, onActivityUpdate: handleActivityUpdate });

  const getStatus = (emp: Employee) => liveData[emp.id]?.status ?? emp.agent_status?.status;
  const getApp = (emp: Employee) => liveData[emp.id]?.current_app;
  const getCategory = (emp: Employee) => liveData[emp.id]?.current_app_category ?? "other";
  const isIdle = (emp: Employee) => liveData[emp.id]?.is_idle === true;

  const onlineCount = employees.filter((e) => ["online", "recording"].includes(getStatus(e) ?? "")).length;
  const recordingCount = employees.filter((e) => getStatus(e) === "recording").length;

  const cards = [
    { icon: Users, label: "Сотрудников", value: stats.total, color: "text-blue-600 bg-blue-50", to: "/employees" },
    { icon: Activity, label: "Онлайн сейчас", value: onlineCount, color: "text-green-600 bg-green-50", to: "/employees" },
    { icon: TrendingUp, label: "Идёт запись", value: recordingCount, color: "text-purple-600 bg-purple-50", to: "/recordings" },
    { icon: Video, label: "Всего записей", value: stats.recordings, color: "text-orange-600 bg-orange-50", to: "/recordings" },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Дашборд</h1>
          <p className="text-sm text-gray-500 mt-0.5">{format(new Date(), "d MMMM yyyy", { locale: ru })}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Live
          </span>
          {alertCount > 0 && (
            <button
              onClick={() => navigate("/alerts")}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium hover:bg-red-100"
            >
              <Bell size={15} />
              {alertCount} алерт{alertCount > 1 ? "а" : ""}
            </button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map(({ icon: Icon, label, value, color, to }) => (
          <button key={label} className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow text-left w-full" onClick={() => navigate(to)}>
            <div className={`p-2.5 rounded-lg ${color}`}><Icon size={20} /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{loading ? "—" : value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Live table — P4 spec */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Команда — реальное время</h2>
          <button onClick={loadScreenshots} className="text-gray-400 hover:text-gray-600 transition-colors" title="Обновить скриншоты">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Сотрудник</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Статус</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Текущее приложение</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 hidden lg:table-cell">Хост</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 hidden xl:table-cell">Скриншот</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Загрузка...</td></tr>
              ) : employees.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Нет сотрудников</td></tr>
              ) : (
                employees.map((emp) => {
                  const status = getStatus(emp);
                  const app = getApp(emp);
                  const cat = getCategory(emp);
                  const idle = isIdle(emp);
                  const ssUrl = liveScreenshots[String(emp.id)];
                  const isOnline = ["online", "recording"].includes(status ?? "");

                  return (
                    <tr
                      key={emp.id}
                      className={clsx(
                        "border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors",
                        idle && "bg-yellow-50/30",
                      )}
                      onClick={() => navigate(`/employees/${emp.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{emp.full_name}</div>
                        <div className="text-xs text-gray-400">{emp.team?.name ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <AgentStatusBadge status={idle && isOnline ? "paused" : status} />
                        {idle && isOnline && (
                          <span className="ml-1.5 text-xs text-yellow-600">idle</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {app ? (
                          <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium", CATEGORY_COLORS[cat])}>
                            {app}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                        {liveData[emp.id]?.hostname ?? emp.agent_status?.hostname ?? "—"}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        {ssUrl ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedScreenshot(ssUrl); }}
                            className="relative group"
                          >
                            <img
                              src={`${ssUrl}?t=${Date.now()}`}
                              alt="live"
                              className="w-20 h-12 object-cover rounded border border-gray-200 hover:border-blue-300 transition-colors"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded transition-colors flex items-center justify-center">
                              <Monitor size={14} className="text-white opacity-0 group-hover:opacity-100" />
                            </div>
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Screenshot lightbox */}
      {expandedScreenshot && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setExpandedScreenshot(null)}
        >
          <img
            src={expandedScreenshot}
            alt="screenshot"
            className="max-w-4xl max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
