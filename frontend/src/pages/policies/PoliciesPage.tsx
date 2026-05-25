import { useEffect, useState } from "react";
import { Shield, Plus, Edit2, Trash2, Check } from "lucide-react";
import { listPolicies, createPolicy, updatePolicy, deletePolicy, Policy } from "../../api/endpoints";
import clsx from "clsx";

const DEFAULT_CONFIG = {
  recording: { enabled: true, mode: "continuous", fps: 5, resolution: "1280x720", codec: "h264", crf: 30, segment_duration_min: 30, record_audio: false },
  activity: { track_apps: true, track_idle: true, idle_threshold_sec: 60, screenshot_interval_min: 5 },
  privacy: { excluded_apps: [], allow_manual_pause: false, show_live_preview: true },
};

export function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const load = async () => {
    setLoading(true);
    const { data } = await listPolicies();
    setPolicies(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const { data } = await createPolicy({ name: form.name, description: form.description, config: DEFAULT_CONFIG });
    setPolicies((p) => [...p, data]);
    setCreating(false);
    setForm({ name: "", description: "" });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Удалить политику?")) return;
    await deletePolicy(id);
    setPolicies((p) => p.filter((x) => x.id !== id));
  };

  const setDefault = async (policy: Policy) => {
    await updatePolicy(policy.id, { is_default: true });
    setPolicies((p) => p.map((x) => ({ ...x, is_default: x.id === policy.id })));
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Политики записи</h1>
          <p className="text-sm text-gray-500 mt-0.5">{policies.length} политик</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> Создать
        </button>
      </div>

      {creating && (
        <div className="card p-4 mb-4 border-2 border-blue-200">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Новая политика</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Название *</label>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Стандартная политика" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Описание</label>
              <input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Для операторов первой линии" />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={handleCreate} disabled={!form.name.trim()}>Создать</button>
            <button className="btn-secondary" onClick={() => setCreating(false)}>Отмена</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="card p-8 text-center text-gray-400 text-sm">Загрузка...</div>
        ) : (
          policies.map((policy) => (
            <div key={policy.id} className={clsx("card p-4 border", policy.is_default && "border-blue-200 bg-blue-50/30")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={clsx("p-2 rounded-lg mt-0.5", policy.is_default ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500")}>
                    <Shield size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{policy.name}</h3>
                      {policy.is_default && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">По умолчанию</span>
                      )}
                    </div>
                    {policy.description && <p className="text-xs text-gray-500 mt-0.5">{policy.description}</p>}
                    <div className="flex gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                      <span>FPS: {(policy.config as any)?.recording?.fps ?? "—"}</span>
                      <span>Разрешение: {(policy.config as any)?.recording?.resolution ?? "—"}</span>
                      <span>Сегмент: {(policy.config as any)?.recording?.segment_duration_min ?? "—"} мин</span>
                      <span>Idle порог: {(policy.config as any)?.activity?.idle_threshold_sec ?? "—"}с</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {!policy.is_default && (
                    <button className="btn-secondary py-1 px-2 text-xs" onClick={() => setDefault(policy)} title="Сделать по умолчанию">
                      <Check size={13} />
                    </button>
                  )}
                  <button className="btn-secondary py-1 px-2 text-xs" onClick={() => setEditing(policy)}>
                    <Edit2 size={13} />
                  </button>
                  {!policy.is_default && (
                    <button
                      className="btn-secondary py-1 px-2 text-xs text-red-600 hover:bg-red-50 hover:border-red-200"
                      onClick={() => handleDelete(policy.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Policy editor modal */}
      {editing && <PolicyEditor policy={editing} onClose={() => setEditing(null)} onSave={async (config) => {
        const { data } = await updatePolicy(editing.id, { config });
        setPolicies((p) => p.map((x) => x.id === data.id ? data : x));
        setEditing(null);
      }} />}
    </div>
  );
}

function PolicyEditor({ policy, onClose, onSave }: {
  policy: Policy;
  onClose: () => void;
  onSave: (config: Record<string, unknown>) => Promise<void>;
}) {
  const [cfg, setCfg] = useState<any>(JSON.parse(JSON.stringify(policy.config)));
  const [saving, setSaving] = useState(false);

  const set = (path: string, value: unknown) => {
    const keys = path.split(".");
    setCfg((prev: any) => {
      const next = JSON.parse(JSON.stringify(prev));
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(cfg); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Редактировать: {policy.name}</h2>
        </div>
        <div className="p-5 space-y-5">
          {/* Recording */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Запись экрана</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "FPS", key: "recording.fps", type: "number" },
                { label: "Разрешение", key: "recording.resolution", type: "text" },
                { label: "Длина сегмента (мин)", key: "recording.segment_duration_min", type: "number" },
                { label: "Качество (CRF)", key: "recording.crf", type: "number" },
                { label: "Режим", key: "recording.mode", type: "text" },
                { label: "Расписание", key: "recording.schedule", type: "text" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input
                    type={type}
                    className="input"
                    value={key.split(".").reduce((o, k) => o?.[k], cfg) ?? ""}
                    onChange={(e) => set(key, type === "number" ? Number(e.target.value) : e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-3">
              {[
                { label: "Запись включена", key: "recording.enabled" },
                { label: "Запись аудио", key: "recording.record_audio" },
                { label: "Все мониторы", key: "recording.record_all_monitors" },
              ].map(({ label, key }) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={key.split(".").reduce((o: any, k) => o?.[k], cfg) ?? false}
                    onChange={(e) => set(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          {/* Activity */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Активность</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Idle порог (сек)", key: "activity.idle_threshold_sec", type: "number" },
                { label: "Скриншот (мин)", key: "activity.screenshot_interval_min", type: "number" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input type={type} className="input" value={key.split(".").reduce((o: any, k) => o?.[k], cfg) ?? ""} onChange={(e) => set(key, Number(e.target.value))} />
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-3">
              {[
                { label: "Отслеживать приложения", key: "activity.track_apps" },
                { label: "Определять idle", key: "activity.track_idle" },
              ].map(({ label, key }) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={key.split(".").reduce((o: any, k) => o?.[k], cfg) ?? false} onChange={(e) => set(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </section>

          {/* Privacy */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Приватность</h3>
            <div className="flex gap-4">
              {[
                { label: "Разрешить паузу вручную", key: "privacy.allow_manual_pause" },
                { label: "Показывать live-превью", key: "privacy.show_live_preview" },
              ].map(({ label, key }) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={key.split(".").reduce((o: any, k) => o?.[k], cfg) ?? false} onChange={(e) => set(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </section>
        </div>
        <div className="p-5 border-t border-gray-100 flex gap-2 justify-end">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
