import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronLeft, Plus, Video } from "lucide-react";
import {
  getEmployee, getDailyStats, Employee, DailyStat,
  createAgent, getAgentsForEmployee,
  getAppUsage, getHourlyHeatmap,
} from "../../api/endpoints";
import { AgentStatusBadge } from "../../components/AgentStatusBadge";
import { ActivityChart } from "../../components/charts/ActivityChart";
import { AppUsageChart } from "../../components/charts/AppUsageChart";
import { HeatmapChart } from "../../components/charts/HeatmapChart";
import { format } from "date-fns";

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

type Tab = "overview" | "heatmap" | "apps";

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const empId = Number(id);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [appUsage, setAppUsage] = useState<any[]>([]);
  const [heatmap, setHeatmap] = useState<{ days: string[]; data: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    Promise.all([
      getEmployee(empId),
      getDailyStats(empId),
      getAgentsForEmployee(empId),
      getAppUsage(empId),
      getHourlyHeatmap(empId, 14),
    ]).then(([emp, stat, ag, usage, heat]) => {
      setEmployee(emp.data);
      setStats(stat.data);
      setAgents(ag.data);
      setAppUsage(usage.data);
      setHeatmap(heat.data);
    }).finally(() => setLoading(false));
  }, [empId]);

  const handleCreateAgent = async () => {
    const { data } = await createAgent(empId);
    setNewToken(data.agent_token);
    const ag = await getAgentsForEmployee(empId);
    setAgents(ag.data);
  };

  if (loading) return <div className="p-6 text-gray-400">Загрузка...</div>;
  if (!employee) return <div className="p-6 text-red-500">Сотрудник не найден</div>;

  const todayStat = stats[0];

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Обзор" },
    { id: "heatmap", label: "Тепловая карта" },
    { id: "apps", label: "Приложения" },
  ];

  return (
    <div className="p-6 max-w-5xl">
      <Link to="/employees" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ChevronLeft size={16} />
        К списку
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{employee.full_name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            @{employee.username} · {employee.position ?? "Оператор"} · {employee.team?.name ?? "Без команды"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/recordings?employee_id=${empId}`} className="btn-secondary text-sm py-1.5">
            <Video size={14} /> Записи
          </Link>
          <AgentStatusBadge status={employee.agent_status?.status} />
        </div>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-sm text-gray-500 mb-1">Активно сегодня</p>
          <p className="text-2xl font-semibold text-gray-900">{todayStat ? fmtTime(todayStat.active_time_sec) : "—"}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500 mb-1">Idle сегодня</p>
          <p className="text-2xl font-semibold text-gray-900">{todayStat ? fmtTime(todayStat.idle_time_sec) : "—"}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500 mb-1">Начало сессии</p>
          <p className="text-2xl font-semibold text-gray-900">
            {todayStat?.session_start ? format(new Date(todayStat.session_start), "HH:mm") : "—"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-gray-100 p-1 rounded-lg mb-5 w-fit">
        {tabs.map(({ id: tid, label }) => (
          <button
            key={tid}
            onClick={() => setTab(tid)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === tid ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          {stats.length > 0 && (
            <div className="card p-4 mb-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Активность за 14 дней</h2>
              <ActivityChart stats={stats.slice(0, 14).reverse()} />
            </div>
          )}

          {/* Agents */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Агенты</h2>
              <button className="btn-secondary py-1 text-xs" onClick={handleCreateAgent}>
                <Plus size={13} /> Новый токен
              </button>
            </div>
            {newToken && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3 text-sm">
                <p className="font-medium text-yellow-800 mb-1">Токен (сохраните):</p>
                <code className="text-yellow-900 break-all">{newToken}</code>
              </div>
            )}
            {agents.length === 0 ? (
              <p className="text-sm text-gray-400">Нет агентов.</p>
            ) : (
              <div className="space-y-2">
                {agents.map((ag: any) => (
                  <div key={ag.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="font-medium text-gray-700">{ag.hostname ?? "—"}</span>
                      <span className="text-gray-400 ml-2 text-xs">{ag.agent_version ?? ""}</span>
                    </div>
                    <AgentStatusBadge status={ag.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === "heatmap" && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Тепловая карта активности по часам (14 дней)</h2>
          <HeatmapChart data={heatmap?.data ?? []} />
        </div>
      )}

      {tab === "apps" && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Использование приложений</h2>
          <AppUsageChart data={appUsage} />
        </div>
      )}
    </div>
  );
}
