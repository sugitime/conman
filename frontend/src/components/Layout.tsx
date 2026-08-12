import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  Headphones,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Network,
  Package,
  Radio,
  Settings,
  Shield,
  Users,
  BookOpen,
  BadgeCheck,
  PhoneCall,
  DoorOpen,
  Wallet,
  Search,
  Image,
  ListTodo,
  ScrollText,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  feature?: string;
  conManagerOnly?: boolean;
};

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { to: "/departments", label: "Departments", icon: <Building2 size={18} /> },
  { to: "/helpdesk", label: "Helpdesk", icon: <Headphones size={18} />, feature: "helpdesk" },
  { to: "/calendar", label: "Calendar", icon: <CalendarDays size={18} />, feature: "calendar" },
  { to: "/todos", label: "Todos", icon: <ListTodo size={18} />, feature: "todos" },
  { to: "/communications", label: "Communications", icon: <MessageSquare size={18} />, feature: "communications_hub" },
  { to: "/documents", label: "Documents", icon: <FileText size={18} />, feature: "documents" },
  { to: "/surveys", label: "Surveys", icon: <ClipboardList size={18} />, feature: "surveys" },
  { to: "/shifts", label: "Shifts", icon: <ScrollText size={18} />, feature: "shift_scheduling" },
  { to: "/inventory", label: "Inventory", icon: <Package size={18} />, feature: "asset_inventory" },
  { to: "/inventory/scan", label: "Scan assets", icon: <Package size={18} />, feature: "asset_inventory" },
  { to: "/orders", label: "Orders", icon: <Package size={18} />, feature: "item_orders" },
  { to: "/budget", label: "Budget", icon: <Wallet size={18} />, feature: "budget_tracking" },
  { to: "/handovers", label: "Handovers", icon: <ScrollText size={18} />, feature: "handover_notes" },
  { to: "/org-chart", label: "Org Chart", icon: <Network size={18} />, feature: "org_chart" },
  { to: "/badges", label: "Badges", icon: <BadgeCheck size={18} />, feature: "badge_system" },
  { to: "/radio", label: "Radio", icon: <Radio size={18} />, feature: "radio_channels" },
  { to: "/on-call", label: "On-Call", icon: <PhoneCall size={18} />, feature: "on_call_roster" },
  { to: "/rooms", label: "Rooms", icon: <DoorOpen size={18} />, feature: "room_booking" },
  { to: "/vendors", label: "Vendors", icon: <Building2 size={18} />, feature: "vendors" },
  { to: "/meals", label: "Meals", icon: <ClipboardList size={18} />, feature: "meals" },
  { to: "/lost-found", label: "Lost & Found", icon: <Search size={18} />, feature: "lost_and_found" },
  { to: "/media", label: "Media", icon: <Image size={18} />, feature: "media_gallery" },
  { to: "/bible", label: "Con Bible", icon: <BookOpen size={18} />, feature: "con_bible" },
  { to: "/run-of-show", label: "Run of Show", icon: <ScrollText size={18} />, feature: "run_of_show" },
  { to: "/staff-directory", label: "Staff lists", icon: <Users size={18} />, feature: "staff_lists" },
  { to: "/kiosk", label: "Check-in kiosk", icon: <BadgeCheck size={18} />, feature: "kiosk_checkin" },
  { to: "/profile", label: "My profile", icon: <Users size={18} /> },
  { to: "/admin/users", label: "Users", icon: <Users size={18} />, conManagerOnly: true },
  { to: "/admin/policies", label: "Access Policies", icon: <Shield size={18} />, conManagerOnly: true },
  { to: "/admin/settings", label: "Settings", icon: <Settings size={18} />, conManagerOnly: true },
  { to: "/admin/audit", label: "Audit log", icon: <Shield size={18} />, feature: "audit_log", conManagerOnly: true },
];

export function Layout() {
  const { user, settings, logout, isFeatureEnabled, isConManager } = useAuth();
  const navigate = useNavigate();

  const items = NAV.filter((item) => {
    if (item.conManagerOnly && !isConManager) return false;
    if (item.feature && !isFeatureEnabled(item.feature)) return false;
    return true;
  });

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-950 text-slate-100">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="text-xs font-semibold tracking-[0.2em] text-indigo-300 uppercase">
            ConMan
          </div>
          <div className="mt-1 truncate text-sm font-medium">
            {settings?.conferenceName || "Conference Ops"}
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                  isActive
                    ? "bg-indigo-500/20 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white",
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="truncate text-sm font-medium">{user?.name}</div>
          <div className="truncate text-xs text-slate-400">{user?.role}</div>
          <button
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-300 hover:bg-white/5"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
