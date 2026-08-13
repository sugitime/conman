import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  CalendarDays,
  ChevronDown,
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
  Clock,
  Sparkles,
  Flag,
  Truck,
  Layers,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  feature?: string;
  conManagerOnly?: boolean;
};

type NavSection = {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  accent: string;
  items: NavItem[];
  /** Always expanded, no accordion chrome */
  pinned?: boolean;
};

const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Home & reference",
    icon: <LayoutDashboard size={16} />,
    accent: "text-slate-300",
    pinned: true,
    items: [
      { to: "/", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
      { to: "/departments", label: "Departments", icon: <Building2 size={18} /> },
      {
        to: "/bible",
        label: "Con Bible",
        icon: <BookOpen size={18} />,
        feature: "con_bible",
      },
      {
        to: "/org-chart",
        label: "Org Chart",
        icon: <Network size={18} />,
        feature: "org_chart",
      },
      { to: "/profile", label: "My profile", icon: <Users size={18} /> },
      {
        to: "/staff-directory",
        label: "Staff lists",
        icon: <Users size={18} />,
        feature: "staff_lists",
      },
    ],
  },
  {
    id: "pre-show",
    label: "Pre-show",
    description: "Plan, staff, stock & setup",
    icon: <Clock size={16} />,
    accent: "text-sky-300",
    items: [
      {
        to: "/todos",
        label: "Todos",
        icon: <ListTodo size={18} />,
        feature: "todos",
      },
      {
        to: "/orders",
        label: "Orders",
        icon: <Package size={18} />,
        feature: "item_orders",
      },
      {
        to: "/load-schedule",
        label: "Load In schedule",
        icon: <Truck size={18} />,
        feature: "load_schedule",
      },
      {
        to: "/budget",
        label: "Budget",
        icon: <Wallet size={18} />,
        feature: "budget_tracking",
      },
      {
        to: "/calendar",
        label: "Calendar",
        icon: <CalendarDays size={18} />,
        feature: "calendar",
      },
      {
        to: "/shifts",
        label: "Shifts",
        icon: <ScrollText size={18} />,
        feature: "shift_scheduling",
      },
      {
        to: "/documents",
        label: "Documents",
        icon: <FileText size={18} />,
        feature: "documents",
      },
      {
        to: "/vendors",
        label: "Vendors",
        icon: <Building2 size={18} />,
        feature: "vendors",
      },
      {
        to: "/rooms",
        label: "Rooms",
        icon: <DoorOpen size={18} />,
        feature: "room_booking",
      },
      {
        to: "/badges",
        label: "Badges",
        icon: <BadgeCheck size={18} />,
        feature: "badge_system",
      },
      {
        to: "/meals",
        label: "Meals",
        icon: <ClipboardList size={18} />,
        feature: "meals",
      },
      {
        to: "/radio",
        label: "Radio setup",
        icon: <Radio size={18} />,
        feature: "radio_channels",
      },
      {
        to: "/inventory",
        label: "Inventory setup",
        icon: <Package size={18} />,
        feature: "asset_inventory",
      },
      {
        to: "/run-of-show",
        label: "Run of Show",
        icon: <ScrollText size={18} />,
        feature: "run_of_show",
      },
      {
        to: "/communications",
        label: "Comms (prep)",
        icon: <MessageSquare size={18} />,
        feature: "communications_hub",
      },
    ],
  },
  {
    id: "during-show",
    label: "During show",
    description: "Live ops & floor response",
    icon: <Sparkles size={16} />,
    accent: "text-amber-300",
    items: [
      {
        to: "/helpdesk",
        label: "Helpdesk",
        icon: <Headphones size={18} />,
        feature: "helpdesk",
      },
      {
        to: "/handovers",
        label: "Handovers",
        icon: <ScrollText size={18} />,
        feature: "handover_notes",
      },
      {
        to: "/on-call",
        label: "On-Call",
        icon: <PhoneCall size={18} />,
        feature: "on_call_roster",
      },
      {
        to: "/inventory/scan",
        label: "Scan assets",
        icon: <Package size={18} />,
        feature: "asset_inventory",
      },
      {
        to: "/kiosk",
        label: "Check-in kiosk",
        icon: <BadgeCheck size={18} />,
        feature: "kiosk_checkin",
      },
      {
        to: "/lost-found",
        label: "Lost & Found",
        icon: <Search size={18} />,
        feature: "lost_and_found",
      },
      {
        to: "/media",
        label: "Media capture",
        icon: <Image size={18} />,
        feature: "media_gallery",
      },
      {
        to: "/communications",
        label: "Comms (live)",
        icon: <MessageSquare size={18} />,
        feature: "communications_hub",
      },
      {
        to: "/todos",
        label: "Live todos",
        icon: <ListTodo size={18} />,
        feature: "todos",
      },
      {
        to: "/calendar",
        label: "Schedule",
        icon: <CalendarDays size={18} />,
        feature: "calendar",
      },
      {
        to: "/run-of-show",
        label: "Call sheets",
        icon: <ScrollText size={18} />,
        feature: "run_of_show",
      },
      {
        to: "/load-schedule",
        label: "Load schedule",
        icon: <Truck size={18} />,
        feature: "load_schedule",
      },
    ],
  },
  {
    id: "post-show",
    label: "Post-show",
    description: "Close-out, feedback & archive",
    icon: <Flag size={16} />,
    accent: "text-emerald-300",
    items: [
      {
        to: "/surveys",
        label: "Surveys / AAR",
        icon: <ClipboardList size={18} />,
        feature: "surveys",
      },
      {
        to: "/load-schedule",
        label: "Load Out schedule",
        icon: <Truck size={18} />,
        feature: "load_schedule",
      },
      {
        to: "/budget",
        label: "Budget close-out",
        icon: <Wallet size={18} />,
        feature: "budget_tracking",
      },
      {
        to: "/inventory",
        label: "Inventory return",
        icon: <Package size={18} />,
        feature: "asset_inventory",
      },
      {
        to: "/lost-found",
        label: "Lost & Found resolve",
        icon: <Search size={18} />,
        feature: "lost_and_found",
      },
      {
        to: "/media",
        label: "Media gallery",
        icon: <Image size={18} />,
        feature: "media_gallery",
      },
      {
        to: "/documents",
        label: "Document archive",
        icon: <FileText size={18} />,
        feature: "documents",
      },
      {
        to: "/handovers",
        label: "Final handovers",
        icon: <ScrollText size={18} />,
        feature: "handover_notes",
      },
      {
        to: "/admin/audit",
        label: "Audit log",
        icon: <Shield size={18} />,
        feature: "audit_log",
        conManagerOnly: true,
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    description: "Users, access & system",
    icon: <Settings size={16} />,
    accent: "text-violet-300",
    items: [
      {
        to: "/admin/users",
        label: "Users",
        icon: <Users size={18} />,
        conManagerOnly: true,
      },
      {
        to: "/admin/policies",
        label: "Access Policies",
        icon: <Shield size={18} />,
        conManagerOnly: true,
      },
      {
        to: "/admin/settings",
        label: "Settings",
        icon: <Settings size={18} />,
        conManagerOnly: true,
      },
      {
        to: "/admin/conferences",
        label: "Conferences",
        icon: <Layers size={18} />,
      },
    ],
  },
];

function filterItem(
  item: NavItem,
  isConManager: boolean,
  isFeatureEnabled: (key: string) => boolean,
) {
  if (item.conManagerOnly && !isConManager) return false;
  if (item.feature && !isFeatureEnabled(item.feature)) return false;
  return true;
}

function itemMatchesPath(item: NavItem, pathname: string) {
  if (item.to === "/") return pathname === "/";
  return pathname === item.to || pathname.startsWith(item.to + "/");
}

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
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
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

function AccordionSection({
  section,
  items,
  open,
  onToggle,
}: {
  section: NavSection;
  items: NavItem[];
  open: boolean;
  onToggle: () => void;
}) {
  if (!items.length) return null;

  if (section.pinned) {
    return (
      <div className="mb-3">
        <div className="mb-1 px-3 text-[10px] font-semibold tracking-[0.18em] text-slate-500 uppercase">
          {section.label}
        </div>
        <div className="space-y-0.5">
          {items.map((item) => (
            <NavItemLink key={`${section.id}-${item.to}-${item.label}`} item={item} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition",
          open ? "bg-white/5" : "hover:bg-white/[0.03]",
        )}
      >
        <span className={cn("shrink-0", section.accent)}>{section.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-100">
            {section.label}
          </span>
          <span className="block truncate text-[11px] text-slate-500">
            {section.description}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-slate-500 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-0.5 space-y-0.5 border-l border-white/10 py-1 pl-2 ml-4">
            {items.map((item) => (
              <NavItemLink
                key={`${section.id}-${item.to}-${item.label}`}
                item={item}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Layout() {
  const {
    user,
    settings,
    logout,
    isFeatureEnabled,
    isConManager,
    conferences,
    activeConference,
    switchConference,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const sections = useMemo(() => {
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        filterItem(item, isConManager, isFeatureEnabled),
      ),
    })).filter((s) => s.items.length > 0);
  }, [isConManager, isFeatureEnabled]);

  const activeSectionIds = useMemo(() => {
    return sections
      .filter((s) =>
        s.items.some((item) => itemMatchesPath(item, location.pathname)),
      )
      .map((s) => s.id);
  }, [sections, location.pathname]);

  const [openIds, setOpenIds] = useState<string[]>(() => [
    "pre-show",
    "during-show",
  ]);

  // Auto-open section(s) that contain the current route
  useEffect(() => {
    if (!activeSectionIds.length) return;
    setOpenIds((prev) => {
      const next = new Set(prev);
      for (const id of activeSectionIds) next.add(id);
      return Array.from(next);
    });
  }, [activeSectionIds]);

  function toggle(id: string) {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-950 text-slate-100">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="text-xs font-semibold tracking-[0.2em] text-indigo-300 uppercase">
            ConMan
          </div>
          <div className="mt-1 truncate text-sm font-medium">
            {activeConference?.name ||
              settings?.conferenceName ||
              "Conference Ops"}
            {activeConference?.year ? (
              <span className="ml-1 text-slate-400">
                {activeConference.year}
              </span>
            ) : null}
          </div>
          {conferences.length > 0 ? (
            <label className="mt-3 block">
              <span className="sr-only">Active conference</span>
              <select
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-400"
                value={activeConference?.id || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) void switchConference(id).then(() => navigate("/"));
                }}
              >
                {conferences.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.year ? ` (${c.year})` : ""}
                    {c.isArchived ? " [archived]" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {sections.map((section) => (
            <AccordionSection
              key={section.id}
              section={section}
              items={section.items}
              open={section.pinned || openIds.includes(section.id)}
              onToggle={() => toggle(section.id)}
            />
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
