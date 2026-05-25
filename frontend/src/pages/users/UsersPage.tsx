import { useEffect, useState } from "react";
import { UserCog, Plus, Shield } from "lucide-react";
import { api } from "../../api/client";
import clsx from "clsx";

interface UserEntry {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  team_id: number | null;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: "Администратор", color: "text-red-600 bg-red-50" },
  supervisor: { label: "Супервизор", color: "text-blue-600 bg-blue-50" },
  analyst: { label: "Аналитик", color: "text-purple-600 bg-purple-50" },
};

export function UsersPage() {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", password: "", role: "supervisor" });
  const [error, setError] = useState("");

  const load = async () => {
    const { data } = await api.get<UserEntry[]>("/admin/users");
    setUsers(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setError("");
    try {
      await api.post("/admin/auth/register", form);
      setCreating(false);
      setForm({ email: "", full_name: "", password: "", role: "supervisor" });
      load();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Ошибка создания");
    }
  };

  const toggleActive = async (user: UserEntry) => {
    await api.patch(`/admin/users/${user.id}`, { is_active: !user.is_active });
    load();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Пользователи системы</h1>
          <p className="text-sm text-gray-500 mt-0.5">Управление доступом и ролями</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> Добавить
        </button>
      </div>

      {creating && (
        <div className="card p-4 mb-4 border-2 border-blue-200">
          <h3 className="text-sm font-semibold mb-3">Новый пользователь</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email *</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ФИО *</label>
              <input className="input" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Пароль *</label>
              <input className="input" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Роль</label>
              <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="supervisor">Супервизор</option>
                <option value="analyst">Аналитик</option>
                <option value="admin">Администратор</option>
              </select>
            </div>
          </div>
          {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary" onClick={handleCreate}>Создать</button>
            <button className="btn-secondary" onClick={() => setCreating(false)}>Отмена</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="divide-y divide-gray-50">
          {loading ? (
            <p className="p-6 text-center text-gray-400 text-sm">Загрузка...</p>
          ) : (
            users.map((user) => {
              const rc = ROLE_LABELS[user.role] ?? { label: user.role, color: "text-gray-600 bg-gray-50" };
              return (
                <div key={user.id} className={clsx("flex items-center justify-between px-4 py-3", !user.is_active && "opacity-50")}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                      <UserCog size={15} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium", rc.color)}>
                      {rc.label}
                    </span>
                    <button
                      className={clsx("text-xs px-2 py-1 rounded border font-medium transition-colors",
                        user.is_active
                          ? "border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                          : "border-green-200 text-green-600 hover:bg-green-50"
                      )}
                      onClick={() => toggleActive(user)}
                    >
                      {user.is_active ? "Деактивировать" : "Активировать"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RBAC explanation */}
      <div className="card p-4 mt-4 bg-blue-50/50 border-blue-100">
        <div className="flex gap-3">
          <Shield size={16} className="text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Ролевая модель доступа</p>
            <ul className="space-y-0.5 text-xs text-blue-700">
              <li><strong>Администратор</strong> — полный доступ ко всем функциям</li>
              <li><strong>Супервизор</strong> — видит только сотрудников своей команды и их записи</li>
              <li><strong>Аналитик</strong> — видит статистику и отчёты всех команд, но <em>не имеет доступа к видео</em></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
