import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { LoginPage } from "./pages/LoginPage";
import { EmployeesPage } from "./pages/employees/EmployeesPage";
import { EmployeeDetailPage } from "./pages/employees/EmployeeDetailPage";
import { RecordingsPage } from "./pages/recordings/RecordingsPage";
import { RecordingPlayerPage } from "./pages/recordings/RecordingPlayerPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { AlertsPage } from "./pages/alerts/AlertsPage";
import { ReportsPage } from "./pages/reports/ReportsPage";
import { PoliciesPage } from "./pages/policies/PoliciesPage";
import { UsersPage } from "./pages/users/UsersPage";
import { TeamAnalyticsPage } from "./pages/team/TeamAnalyticsPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("access_token");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="employees/:id" element={<EmployeeDetailPage />} />
          <Route path="recordings" element={<RecordingsPage />} />
          <Route path="recordings/:id" element={<RecordingPlayerPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="policies" element={<PoliciesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="team-analytics" element={<TeamAnalyticsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
