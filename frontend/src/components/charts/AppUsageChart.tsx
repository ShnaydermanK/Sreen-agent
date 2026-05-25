import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const CATEGORY_COLORS: Record<string, string> = {
  crm:       "#3b82f6",
  browser:   "#10b981",
  office:    "#f59e0b",
  telephony: "#8b5cf6",
  messenger: "#ec4899",
  other:     "#9ca3af",
};

interface AppEntry {
  app_name: string;
  app_category: string;
  total_sec: number;
}

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

export function AppUsageChart({ data }: { data: AppEntry[] }) {
  if (!data.length) return <p className="text-sm text-gray-400">Нет данных</p>;

  // Aggregate by category for the pie
  const byCategory: Record<string, number> = {};
  for (const d of data) {
    const cat = d.app_category || "other";
    byCategory[cat] = (byCategory[cat] || 0) + d.total_sec;
  }
  const pieData = Object.entries(byCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const top = data.slice(0, 10);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Pie chart */}
      <div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={80} paddingAngle={2}>
              {pieData.map((entry) => (
                <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || "#9ca3af"} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => fmtTime(v)} />
            <Legend formatter={(v) => v} wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Top apps table */}
      <div className="space-y-1.5">
        <p className="text-xs text-gray-500 font-medium mb-2">Топ приложений</p>
        {top.map((app, i) => {
          const total = data.reduce((s, d) => s + d.total_sec, 0);
          const pct = total ? Math.round((app.total_sec / total) * 100) : 0;
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: CATEGORY_COLORS[app.app_category] || "#9ca3af" }}
              />
              <span className="flex-1 text-gray-700 truncate">{app.app_name || "—"}</span>
              <span className="text-gray-400 text-xs">{pct}%</span>
              <span className="text-gray-600 text-xs w-14 text-right">{fmtTime(app.total_sec)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
