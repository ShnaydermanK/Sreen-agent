import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { DailyStat } from "../../api/endpoints";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

function toHours(sec: number) {
  return +(sec / 3600).toFixed(1);
}

export function ActivityChart({ stats }: { stats: DailyStat[] }) {
  const data = stats.map((s) => ({
    date: format(parseISO(s.date), "dd.MM", { locale: ru }),
    "Активно": toHours(s.active_time_sec),
    "Idle": toHours(s.idle_time_sec),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} unit="ч" />
        <Tooltip formatter={(v: number) => `${v}ч`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Активно" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Idle" fill="#e5e7eb" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
