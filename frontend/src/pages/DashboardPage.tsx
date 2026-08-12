import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";

type Dash = {
  openTodos: number;
  openTickets: number;
  unreadComms: number;
  upcomingShifts: number;
  unreadNotifications: number;
};

export function DashboardPage() {
  const { user, settings, isFeatureEnabled } = useAuth();
  const [data, setData] = useState<Dash | null>(null);

  useEffect(() => {
    void api<Dash>("/dashboard").then(setData).catch(console.error);
  }, []);

  const tiles = [
    {
      label: "Open todos",
      value: data?.openTodos ?? "—",
      to: "/todos",
      feature: "todos",
    },
    {
      label: "Open tickets",
      value: data?.openTickets ?? "—",
      to: "/helpdesk",
      feature: "helpdesk",
    },
    {
      label: "Unread comms",
      value: data?.unreadComms ?? "—",
      to: "/communications",
      feature: "communications_hub",
    },
    {
      label: "Upcoming shifts",
      value: data?.upcomingShifts ?? "—",
      to: "/shifts",
      feature: "shift_scheduling",
    },
  ].filter((t) => !t.feature || isFeatureEnabled(t.feature));

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name?.split(" ")[0] || "team"}`}
        subtitle={`${settings?.conferenceName || "Conference"} operations overview`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to}>
            <Card className="transition hover:border-indigo-200 hover:shadow-md">
              <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                {t.label}
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {t.value}
              </div>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Your departments">
          <ul className="space-y-2">
            {(user?.departmentMembers || []).map((m) => (
              <li key={m.department.id}>
                <Link
                  className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50"
                  to={`/departments/${m.department.id}`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: m.department.color }}
                  />
                  <span className="text-sm font-medium">{m.department.name}</span>
                  {m.isLead ? (
                    <span className="text-xs text-indigo-600">Lead</span>
                  ) : null}
                </Link>
              </li>
            ))}
            {!user?.departmentMembers?.length ? (
              <li className="text-sm text-slate-500">No department memberships yet.</li>
            ) : null}
          </ul>
        </Card>
        <Card title="Quick tips">
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
            <li>Con Manager master calendar events overlay on everyone’s calendar.</li>
            <li>Disable unused modules under Admin → Settings → Feature toggles.</li>
            <li>Department leads can invite volunteers and guests by email.</li>
            <li>Documents support local files and Drive/OneDrive/Dropbox links with revision history.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
