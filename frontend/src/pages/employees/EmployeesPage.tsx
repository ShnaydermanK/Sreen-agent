import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, UserPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { listEmployees, Employee } from "../../api/endpoints";
import { AgentStatusBadge } from "../../components/AgentStatusBadge";
import { format } from "date-fns";

export function EmployeesPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const pageSize = 20;

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await listEmployees({ page, size: pageSize, search: search || undefined });
      setEmployees(data.items);
      setTotal(data.total);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, search]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Сотрудники</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} сотрудников</p>
        </div>
        <button className="btn-primary">
          <UserPlus size={16} />
          Добавить
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Поиск по имени или логину..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Сотрудник</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Команда</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Должность</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Агент</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Последняя активность</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Загрузка...</td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Нет данных</td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/employees/${emp.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{emp.full_name}</div>
                      <div className="text-gray-400 text-xs">@{emp.username}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{emp.team?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.position ?? "—"}</td>
                    <td className="px-4 py-3">
                      <AgentStatusBadge status={emp.agent_status?.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {emp.agent_status?.last_seen_at
                        ? format(new Date(emp.agent_status.last_seen_at), "dd.MM.yyyy HH:mm")
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">
              Страница {page} из {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                className="btn-secondary py-1"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="btn-secondary py-1"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
