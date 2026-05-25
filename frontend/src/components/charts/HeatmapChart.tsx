import clsx from "clsx";

interface Props {
  data: { date: string; hours: number[] }[];
}

const MAX_OPACITY_MINUTES = 60;

export function HeatmapChart({ data }: Props) {
  if (!data.length) return <p className="text-sm text-gray-400">Нет данных</p>;

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Hour labels */}
        <div className="flex ml-16 mb-1">
          {hours.filter((h) => h % 2 === 0).map((h) => (
            <div key={h} className="flex-1 text-center text-xs text-gray-400">{h}:00</div>
          ))}
        </div>

        {/* Rows */}
        {data.map(({ date, hours: hourData }) => (
          <div key={date} className="flex items-center mb-1">
            <div className="w-16 text-xs text-gray-500 shrink-0 pr-2 text-right">
              {date.slice(5)}
            </div>
            <div className="flex flex-1 gap-0.5">
              {hourData.map((minutes, hour) => {
                const opacity = Math.min(minutes / MAX_OPACITY_MINUTES, 1);
                const alpha = Math.round(opacity * 255).toString(16).padStart(2, "0");
                return (
                  <div
                    key={hour}
                    className="flex-1 h-5 rounded-sm transition-all"
                    style={{ backgroundColor: `#3b82f6${alpha}` }}
                    title={`${date} ${hour}:00 — ${minutes} мин активности`}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-2 mt-2 ml-16">
          <span className="text-xs text-gray-400">0</span>
          <div className="flex gap-0.5">
            {[0, 15, 30, 45, 60].map((v) => {
              const op = Math.min(v / MAX_OPACITY_MINUTES, 1);
              const alpha = Math.round(op * 255).toString(16).padStart(2, "0");
              return <div key={v} className="w-5 h-3 rounded-sm" style={{ backgroundColor: `#3b82f6${alpha}` }} />;
            })}
          </div>
          <span className="text-xs text-gray-400">60+ мин</span>
        </div>
      </div>
    </div>
  );
}
