import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/Layout";
import { LoginPage } from "@/pages/LoginPage";
import { AcceptInvitePage } from "@/pages/AcceptInvitePage";
import { DashboardPage } from "@/pages/DashboardPage";
import {
  AuditPage,
  BadgesPage,
  BiblePage,
  BudgetPage,
  CalendarPage,
  CommunicationsPage,
  DepartmentDetailPage,
  DepartmentsPage,
  DocumentsPage,
  HandoversPage,
  HelpdeskPage,
  LostFoundPage,
  MealsPage,
  MediaPage,
  OnCallPage,
  OrdersPage,
  OrgChartPage,
  PoliciesAdminPage,
  RadioPage,
  RoomsPage,
  RunOfShowPage,
  SettingsAdminPage,
  ShiftsPage,
  StaffDirectoryPage,
  SurveysPage,
  TodosPage,
  UsersAdminPage,
  VendorsPage,
} from "@/pages/ResourcePages";
import { InventoryPage, InventoryScanPage } from "@/pages/InventoryPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { KioskPage } from "@/pages/KioskPage";
import { LoadSchedulePage } from "@/pages/LoadSchedulePage";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading ConMan…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="departments/:id" element={<DepartmentDetailPage />} />
        <Route path="helpdesk" element={<HelpdeskPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="todos" element={<TodosPage />} />
        <Route path="communications" element={<CommunicationsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="surveys" element={<SurveysPage />} />
        <Route path="shifts" element={<ShiftsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/scan" element={<InventoryScanPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="load-schedule" element={<LoadSchedulePage />} />
        <Route path="budget" element={<BudgetPage />} />
        <Route path="handovers" element={<HandoversPage />} />
        <Route path="org-chart" element={<OrgChartPage />} />
        <Route path="badges" element={<BadgesPage />} />
        <Route path="radio" element={<RadioPage />} />
        <Route path="on-call" element={<OnCallPage />} />
        <Route path="rooms" element={<RoomsPage />} />
        <Route path="vendors" element={<VendorsPage />} />
        <Route path="meals" element={<MealsPage />} />
        <Route path="lost-found" element={<LostFoundPage />} />
        <Route path="media" element={<MediaPage />} />
        <Route path="bible" element={<BiblePage />} />
        <Route path="run-of-show" element={<RunOfShowPage />} />
        <Route path="staff-directory" element={<StaffDirectoryPage />} />
        <Route path="kiosk" element={<KioskPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="admin/users" element={<UsersAdminPage />} />
        <Route path="admin/policies" element={<PoliciesAdminPage />} />
        <Route path="admin/settings" element={<SettingsAdminPage />} />
        <Route path="admin/audit" element={<AuditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
