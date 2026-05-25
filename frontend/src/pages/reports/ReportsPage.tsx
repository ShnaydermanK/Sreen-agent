import { useState } from "react";
import { Download, BarChart2, Clock, AppWindow } from "lucide-react";
import { format, subDays } from "date-fns";

const API_BASE = "/api/admin/reports";

const REPORTS = [
  {
    id: "daily-activity",
    title: "Ежедневная активность",
    description: "Активное время, idle и блокировки за период по каждому сотруднику",
    icon: BarChart2,
    color: "text-blue-600 bg-blue-50",
  },
  {
    id: "app-usage",
    title: "Использование приложений",
    description: "Сколько времени каждый сотрудник провёл в каждом приложении",
    icon: AppWindow,
    color: "text-purple-600 bg-purple-50",
  },
  {
    id: "idle-time",
    title: "Время простоя",
    description: "Анализ idle-периодов: кто и сколько провёл в бездействии",
    icon: Clock,
    color: "text-orange-600 bg-orange-50",
  },
];

export function ReportsPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");

  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [loading, setLoading] = useState<string | null>(null);

  const token = localStorage.getItem("access_token");

  const downloadCSV = async (reportId: string) => {
    setLoading(reportId);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, format: "csv" });
      const resp = await fetch(`${API_BASE}/${reportId}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Download failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportId}_${dateFrom}_${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Ошибка при генерации отчёта");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Отчёты</h1>
        <p className="text-sm text-gray-500 mt-0.5">Экспорт данных в CSV</p>
      </div>

      {/* Period selector */}
      <div className="card p-4 mb-6 flex items-center gap-4 flex-wrap">
        <span className="text-sm font-medium text-gray-700">Период:</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="input max-w-[160px]"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-gray-400">—</span>
          <input
            type="date"
            className="input max-w-[160px]"
            value={dateTo}
            min={dateFrom}
            max={today}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="flex gap-2 ml-auto flex-wrap">
          {[
            { label: "Сегодня", days: 0 },
            { label: "Неделя", days: 7 },
            { label: "Месяц", days: 30 },
          ].map(({ label, days }) => (
            <button
              key={label}
              className="btn-secondary py-1 text-xs"
              onClick={() => { setDateFrom(format(subDays(new Date(), days), "yyyy-MM-dd")); setDateTo(today); }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {REPORTS.map(({ id, title, description, icon: Icon, color }) => (
          <div key={id} className="card p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-lg ${color} shrink-0`}>
                <Icon size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
                <p className="text-xs text-gray-500 mt-1">{description}</p>
              </div>
            </div>

            <div className="mt-auto flex gap-2">
              <button
                className="btn-secondary text-xs py-1.5 flex-1 justify-center"
                onClick={() => downloadCSV(id)}
                disabled={loading === id}
              >
                <Download size={13} />
                {loading === id ? "Генерация..." : "Скачать CSV"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
