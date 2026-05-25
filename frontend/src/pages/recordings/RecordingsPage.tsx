import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Filter, ChevronLeft, ChevronRight, Play, Clock, HardDrive } from "lucide-react";
import { listRecordings, VideoSegment } from "../../api/endpoints";
import { format } from "date-fns";
import clsx from "clsx";

function fmtDuration(sec?: number) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
               : `${m}:${String(s).padStart(2, "0")}`;
}

function fmtSize(bytes?: number) {
  if (!bytes) return "—";
  if (bytes > 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} ГБ`;
  return `${(bytes / 1_000_000).toFixed(0)} МБ`;
}

const STATUS_COLOR: Record<string, string> = {
  ready: "text-green-600 bg-green-50",
  processing: "text-blue-600 bg-blue-50",
  uploaded: "text-yellow-600 bg-yellow-50",
  error: "text-red-600 bg-red-50",
};

export function RecordingsPage() {
  const navigate = useNavigate();
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [dateFrom, setDateFrom] = useState("");

  const pageSize = 20;

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, size: pageSize };
      if (employeeId) params.employee_id = Number(employeeId);
      if (dateFrom) params.date_from = dateFrom;
      const { data } = await listRecordings(params);
      setSegments(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, employeeId, dateFrom]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Записи экрана</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} сегментов</p>
        </div>
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 flex gap-3 flex-wrap">
          <input
            className="input max-w-[180px]"
            placeholder="ID сотрудника"
            value={employeeId}
            onChange={(e) => { setEmployeeId(e.target.value); setPage(1); }}
          />
          <input
            type="date"
            className="input max-w-[160px]"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
          {loading ? (
            <p className="col-span-full text-center text-gray-400 py-8">Загрузка...</p>
          ) : segments.length === 0 ? (
            <p className="col-span-full text-center text-gray-400 py-8">Записи не найдены</p>
          ) : (
            segments.map((seg) => (
              <div
                key={seg.id}
                className="card overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/recordings/${seg.id}`)}
              >
                <div className="relative aspect-video bg-gray-900 flex items-center justify-center">
                  {seg.thumbnail_url ? (
                    <img src={seg.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-gray-600 text-xs">Нет превью</div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors group">
                    <Play size={32} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                    {fmtDuration(seg.duration_sec)}
                  </div>
                </div>

                <div className="p-3">
                  <p className="text-xs font-medium text-gray-700">
                    {format(new Date(seg.started_at), "dd.MM.yyyy HH:mm")}
                  </p>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <HardDrive size={11} />
                        {fmtSize(seg.file_size_bytes)}
                      </span>
                      {seg.resolution && <span>{seg.resolution}</span>}
                    </div>
                    <span className={clsx("text-xs px-1.5 py-0.5 rounded-full font-medium", STATUS_COLOR[seg.status] ?? "text-gray-600 bg-gray-50")}>
                      {seg.status}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">Страница {page} из {totalPages}</span>
            <div className="flex gap-2">
              <button className="btn-secondary py-1" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
                <ChevronLeft size={16} />
              </button>
              <button className="btn-secondary py-1" onClick={() => setPage((p) => p + 1)} disabled={page === totalPages}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
