import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { AlertTriangle, TrendingUp, Users } from "lucide-react";
import { api } from "../../api/client";
import { format, subDays } from "date-fns";
import clsx from "clsx";

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

interface EmployeeStats {
  employee_id: number;
  full_name: string;
  username: string;
  avg_active_sec: number;
  avg_idle_sec: number;
  idle_pct: number;
  days: number;
  is_anomaly: boolean;
}

interface Benchmark {
  mean_active_sec: number;
  std_sec: number;
  low_sec: number;
  high_sec: number;
}

export function TeamAnalyticsPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");

  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [employees, setEmployees] = useState<EmployeeStats[]>([]);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"active" | "idle">("active");

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await api.get("/admin/stats/team-comparison", {
        params: { date_from: dateFrom, date_to: dateTo },
      });
      setEmployees(res.data.employees);
      setBenchmark(res.data.benchmark);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  const anomalyCount = employees.filter((e) => e.is_anomaly).length;

  const chartData = employees.map((e) => ({
    name: e.full_name.split(" ")[0],  // first name for brevity
    full: e.full_name,
    active: +(e.avg_active_sec / 3600).toFixed(2),
    idle: +(e.avg_idle_sec / 3600).toFixed(2),
    idle_pct: e.idle_pct,
    is_anomaly: e.is_anomaly,
    employee_id: e.employee_id,
  }));

  const benchmarkHours = benchmark ? +(benchmark.mean_active_sec / 3600).toFixed(2) : null;
  const lowHours = benchmark ? +(benchmark.low_sec / 3600).toFixed(2) : null;
  const highHours = benchmark ? +(benchmark.high_sec / 3600).toFixed(2) : null;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Командная аналитика</h1>
          <p className="text-sm text-gray-500 mt-0.5">Сравнение сотрудников, бенчмарк, аномалии</p>
        </div>
        {anomalyCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-orange-700 text-sm">
            <AlertTriangle size={14} />
            {anomalyCount} аномали{anomalyCount === 1 ? "я" : "и"}
          </div>
        )}
      </div>

      {/* Period selector */}
      <div className="card p-4 mb-5 flex items-center gap-4 flex-wrap">
        <span className="text-sm font-medium text-gray-700">Период:</span>
        <input type="date" className="input max-w-[160px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span className="text-gray-400">—</span>
        <input type="date" className="input max-w-[160px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <div className="flex gap-2 ml-auto">
          {[
            { label: "Эта неделя", days: 7 },
            { label: "Этот месяц", from: monthStart },
            { label: "30 дней", days: 30 },
          ].map(({ label, days, from }) => (
            <button key={label} className="btn-secondary py-1 text-xs" onClick={() => {
              setDateFrom(from || format(subDays(new Date(), days!), "yyyy-MM-dd"));
              setDateTo(today);
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Benchmark cards */}
      {benchmark && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">Среднее активное время</p>
            <p className="text-2xl font-bold text-gray-900">{fmtTime(benchmark.mean_active_sec)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">Нижняя граница нормы (–1σ)</p>
            <p className="text-2xl font-bold text-orange-600">{fmtTime(benchmark.low_sec)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">Верхняя граница нормы (+1σ)</p>
            <p className="text-2xl font-bold text-green-600">{fmtTime(benchmark.high_sec)}</p>
          </div>
        </div>
      )}

      {/* Tab selector */}
      <div className="flex gap-0.5 bg-gray-100 p-1 rounded-lg mb-4 w-fit">
        {[{ id: "active" as const, label: "Активное время" }, { id: "idle" as const, label: "% Idle" }].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bar chart */}
      <div className="card p-4 mb-5">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Загрузка...</div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Нет данных за период</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ left: -10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} unit={tab === "active" ? "ч" : "%"} />
              <Tooltip
                formatter={(v: number, name: string) =>
                  tab === "active" ? [`${v}ч`, "Активно"] : [`${v}%`, "Idle"]
                }
                labelFormatter={(l, payload) => payload?.[0]?.payload?.full || l}
              />
              {tab === "active" && benchmarkHours && (
                <>
                  <ReferenceLine y={benchmarkHours} stroke="#6366f1" strokeDasharray="4 2" label={{ value: "Среднее", position: "right", fontSize: 11, fill: "#6366f1" }} />
                  {lowHours && <ReferenceLine y={lowHours} stroke="#f97316" strokeDasharray="3 3" />}
                  {highHours && <ReferenceLine y={highHours} stroke="#22c55e" strokeDasharray="3 3" />}
                </>
              )}
              <Bar
                dataKey={tab === "active" ? "active" : "idle_pct"}
                radius={[4, 4, 0, 0]}
              >
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.is_anomaly
                        ? "#f97316"
                        : tab === "active"
                        ? "#3b82f6"
                        : entry.idle_pct > 40 ? "#f59e0b" : "#10b981"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Table */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Детали по сотрудникам</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">Сотрудник</th>
                <th className="text-right px-4 py-2.5 text-xs text-gray-400 font-medium">Активно (ср.)</th>
                <th className="text-right px-4 py-2.5 text-xs text-gray-400 font-medium">Idle (ср.)</th>
                <th className="text-right px-4 py-2.5 text-xs text-gray-400 font-medium">% Idle</th>
                <th className="text-right px-4 py-2.5 text-xs text-gray-400 font-medium">Дней</th>
                <th className="text-center px-4 py-2.5 text-xs text-gray-400 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.employee_id} className={clsx("border-b border-gray-50 hover:bg-gray-50", emp.is_anomaly && "bg-orange-50/30")}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{emp.full_name}</p>
                    <p className="text-xs text-gray-400">@{emp.username}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtTime(emp.avg_active_sec)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmtTime(emp.avg_idle_sec)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={clsx("font-medium", emp.idle_pct > 40 ? "text-orange-600" : "text-gray-600")}>
                      {emp.idle_pct}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{emp.days}</td>
                  <td className="px-4 py-3 text-center">
                    {emp.is_anomaly ? (
                      <span className="inline-flex items-center gap-1 text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                        <AlertTriangle size={11} />Аномалия
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <TrendingUp size={11} />Норма
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
