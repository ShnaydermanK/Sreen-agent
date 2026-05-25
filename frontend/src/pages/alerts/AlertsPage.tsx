import { useEffect, useState } from "react";
import { Bell, CheckCircle, AlertTriangle, WifiOff, Clock, Filter } from "lucide-react";
import { listAlerts, resolveAlert, Alert } from "../../api/endpoints";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import clsx from "clsx";

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bell; color: string }> = {
  long_idle:       { label: "Длительный idle",      icon: Clock,      color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  agent_offline:   { label: "Агент офлайн",          icon: WifiOff,    color: "text-red-600 bg-red-50 border-red-200" },
  recording_error: { label: "Ошибка записи",         icon: AlertTriangle, color: "text-orange-600 bg-orange-50 border-orange-200" },
  buffer_full:     { label: "Буфер переполнен",      icon: AlertTriangle, color: "text-orange-600 bg-orange-50 border-orange-200" },
  forbidden_app:   { label: "Запрещённое приложение",icon: AlertTriangle, color: "text-purple-600 bg-purple-50 border-purple-200" },
};

export function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { size: 100 };
      if (filter === "open") params.is_resolved = false;
      const { data } = await listAlerts(params);
      setAlerts(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const handleResolve = async (id: number) => {
    await resolveAlert(id);
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, is_resolved: true } : a));
  };

  const openCount = alerts.filter((a) => !a.is_resolved).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Алерты</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filter === "open" ? `${openCount} открытых` : `${total} всего`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={clsx("btn-secondary py-1.5 text-xs", filter === "open" && "bg-blue-50 border-blue-200 text-blue-700")}
            onClick={() => setFilter("open")}
          >
            Открытые
          </button>
          <button
            className={clsx("btn-secondary py-1.5 text-xs", filter === "all" && "bg-blue-50 border-blue-200 text-blue-700")}
            onClick={() => setFilter("all")}
          >
            Все
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="card p-8 text-center text-gray-400 text-sm">Загрузка...</div>
        ) : alerts.length === 0 ? (
          <div className="card p-12 text-center">
            <CheckCircle size={32} className="text-green-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">Алертов нет</p>
            <p className="text-gray-400 text-sm mt-1">Все системы работают нормально</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const cfg = TYPE_CONFIG[alert.type] ?? { label: alert.type, icon: Bell, color: "text-gray-600 bg-gray-50 border-gray-200" };
            const Icon = cfg.icon;
            return (
              <div
                key={alert.id}
                className={clsx(
                  "card p-4 flex items-start gap-3 border",
                  alert.is_resolved ? "opacity-50" : cfg.color
                )}
              >
                <div className={clsx("p-1.5 rounded-lg mt-0.5", alert.is_resolved ? "bg-gray-100" : "")}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{cfg.label}</span>
                    <span className="text-xs text-gray-500">
                      · Сотрудник #{alert.employee_id}
                    </span>
                    <span className="text-xs text-gray-400">
                      {format(new Date(alert.created_at), "d MMM, HH:mm", { locale: ru })}
                    </span>
                  </div>
                  {alert.message && (
                    <p className="text-sm text-gray-600 mt-0.5">{alert.message}</p>
                  )}
                  {alert.payload && Object.keys(alert.payload).length > 0 && (
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {Object.entries(alert.payload).map(([k, v]) => (
                        <span key={k} className="text-xs bg-white/60 rounded px-1.5 py-0.5 border">
                          {k}: {String(v).slice(0, 40)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {!alert.is_resolved && (
                  <button
                    className="btn-secondary py-1 text-xs shrink-0"
                    onClick={() => handleResolve(alert.id)}
                  >
                    <CheckCircle size={13} />
                    Закрыть
                  </button>
                )}
                {alert.is_resolved && (
                  <span className="text-xs text-gray-400 shrink-0">Закрыт</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
