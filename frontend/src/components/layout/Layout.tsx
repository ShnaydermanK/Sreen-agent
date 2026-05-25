import { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Video, LogOut, Monitor, Bell, BarChart2, Shield, UserCog, TrendingUp } from "lucide-react";
import { alertsSummary } from "../../api/endpoints";
import clsx from "clsx";

const nav = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Дашборд" },
  { to: "/employees", icon: Users, label: "Сотрудники" },
  { to: "/recordings", icon: Video, label: "Записи" },
  { to: "/alerts", icon: Bell, label: "Алерты", badge: true },
  { to: "/reports", icon: BarChart2, label: "Отчёты" },
  { to: "/policies", icon: Shield, label: "Политики" },
  { to: "/team-analytics", icon: TrendingUp, label: "Аналитика команды" },
  { to: "/users", icon: UserCog, label: "Пользователи" },
];

export function Layout() {
  const navigate = useNavigate();
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    alertsSummary()
      .then(({ data }) => setAlertCount(data.reduce((s, a) => s + a.count, 0)))
      .catch(() => {});
    const interval = setInterval(() => {
      alertsSummary()
        .then(({ data }) => setAlertCount(data.reduce((s, a) => s + a.count, 0)))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const logout = () => {
    localStorage.removeItem("access_token");
    navigate("/login");
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-200">
          <Monitor className="text-brand-600" size={20} />
          <span className="font-semibold text-gray-900 text-sm">Screen Agent</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )
              }
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              {badge && alertCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-200">
          <button
            onClick={logout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-gray-600
                       hover:bg-gray-100 hover:text-gray-900 transition-colors font-medium"
          >
            <LogOut size={16} />
            Выйти
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
