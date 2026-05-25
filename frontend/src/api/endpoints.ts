import { api } from "./client";

export interface Employee {
  id: number;
  username: string;
  full_name: string;
  email?: string;
  position?: string;
  team_id?: number;
  is_active: boolean;
  created_at: string;
  team?: { id: number; name: string };
  agent_status?: {
    status: string;
    hostname?: string;
    last_seen_at?: string;
    agent_version?: string;
  };
}

export interface VideoSegment {
  id: number;
  employee_id: number;
  started_at: string;
  ended_at?: string;
  duration_sec?: number;
  monitor_index: number;
  resolution?: string;
  fps?: number;
  codec?: string;
  file_size_bytes?: number;
  status: string;
  thumbnail_url?: string;
  hls_url?: string;
  download_url?: string;
  created_at: string;
}

export interface DailyStat {
  date: string;
  employee_id: number;
  active_time_sec: number;
  idle_time_sec: number;
  locked_time_sec: number;
  session_start?: string;
  session_end?: string;
  app_usage?: Record<string, number>;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface Team {
  id: number;
  name: string;
  description?: string;
}

// Auth
export const login = (email: string, password: string) =>
  api.post<{ access_token: string }>("/admin/auth/login", { email, password });

// Employees
export const listEmployees = (params?: Record<string, unknown>) =>
  api.get<PagedResult<Employee>>("/admin/employees", { params });

export const getEmployee = (id: number) =>
  api.get<Employee>(`/admin/employees/${id}`);

export const createEmployee = (data: Partial<Employee>) =>
  api.post<Employee>("/admin/employees", data);

export const updateEmployee = (id: number, data: Partial<Employee>) =>
  api.patch<Employee>(`/admin/employees/${id}`, data);

// Teams
export const listTeams = () => api.get<Team[]>("/admin/teams");

// Recordings
export const listRecordings = (params?: Record<string, unknown>) =>
  api.get<PagedResult<VideoSegment>>("/admin/recordings", { params });

export const getRecording = (id: number) =>
  api.get<VideoSegment>(`/admin/recordings/${id}`);

// Stats
export const getDailyStats = (employeeId: number, params?: Record<string, unknown>) =>
  api.get<DailyStat[]>(`/admin/stats/daily/${employeeId}`, { params });

// Agents
export const createAgent = (employeeId: number) =>
  api.post("/admin/agents", { employee_id: employeeId });

export const getAgentsForEmployee = (employeeId: number) =>
  api.get(`/admin/agents/by-employee/${employeeId}`);

// Alerts
export interface Alert {
  id: number;
  employee_id: number;
  type: string;
  severity: string;
  message?: string;
  payload?: Record<string, unknown>;
  is_resolved: boolean;
  created_at: string;
  resolved_at?: string;
}
export const listAlerts = (params?: Record<string, unknown>) =>
  api.get<{ items: Alert[]; total: number }>("/admin/alerts", { params });

export const alertsSummary = () =>
  api.get<{ type: string; severity: string; count: number }[]>("/admin/alerts/summary");

export const resolveAlert = (id: number) =>
  api.post<Alert>(`/admin/alerts/${id}/resolve`);

// Reports
export const reportDailyActivity = (params: Record<string, unknown>) =>
  api.get("/admin/reports/daily-activity", { params });

export const reportAppUsage = (params: Record<string, unknown>) =>
  api.get("/admin/reports/app-usage", { params });

export const reportIdleTime = (params: Record<string, unknown>) =>
  api.get("/admin/reports/idle-time", { params });

// Stats extras
export const getAppUsage = (employeeId: number, params?: Record<string, unknown>) =>
  api.get<{ app_name: string; app_category: string; total_sec: number }[]>(
    `/admin/stats/app-usage/${employeeId}`, { params }
  );

export const getHourlyHeatmap = (employeeId: number, days = 14) =>
  api.get<{ days: string[]; data: { date: string; hours: number[] }[] }>(
    `/admin/stats/hourly-heatmap/${employeeId}`, { params: { days } }
  );

export const getTeamSummary = (params?: Record<string, unknown>) =>
  api.get<{ employee_id: number; full_name: string; active_time_sec: number; idle_time_sec: number }[]>(
    "/admin/stats/team-summary", { params }
  );

// Policies
export interface Policy {
  id: number;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  is_default: boolean;
}
export const listPolicies = () => api.get<Policy[]>("/admin/policies");
export const createPolicy = (data: Partial<Policy>) => api.post<Policy>("/admin/policies", data);
export const updatePolicy = (id: number, data: Partial<Policy>) => api.patch<Policy>(`/admin/policies/${id}`, data);
export const deletePolicy = (id: number) => api.delete(`/admin/policies/${id}`);
