import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Phase = "LOAD_IN" | "LOAD_OUT";
type Status = "PLANNED" | "IN_PROGRESS" | "DONE" | "BLOCKED" | "CANCELLED";

type LoadTask = {
  id: string;
  departmentId: string;
  phase: Phase;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  status: Status;
  department: { id: string; name: string; color: string };
  createdBy?: { id: string; name: string };
  assignee?: { id: string; name: string } | null;
};

type GanttPayload = {
  phase: Phase | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  taskCount: number;
  rows: {
    departmentId: string;
    departmentName: string;
    color: string;
    tasks: LoadTask[];
  }[];
  tasks: LoadTask[];
};

type Dept = { id: string; name: string; color: string };

const STATUS_TONE: Record<Status, "slate" | "sky" | "green" | "amber" | "rose"> =
  {
    PLANNED: "slate",
    IN_PROGRESS: "sky",
    DONE: "green",
    BLOCKED: "amber",
    CANCELLED: "rose",
  };

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultWindow(phase: Phase) {
  const start = new Date();
  if (phase === "LOAD_IN") {
    start.setDate(start.getDate() + 2);
    start.setHours(8, 0, 0, 0);
  } else {
    start.setDate(start.getDate() + 5);
    start.setHours(18, 0, 0, 0);
  }
  const end = new Date(start.getTime() + 2 * 3600_000);
  return { startsAt: toLocalInput(start.toISOString()), endsAt: toLocalInput(end.toISOString()) };
}

function GanttChart({ data }: { data: GanttPayload }) {
  const tasks = data.tasks || [];
  const range = useMemo(() => {
    if (!tasks.length) {
      const now = Date.now();
      return { start: now, end: now + 24 * 3600_000, ms: 24 * 3600_000 };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const t of tasks) {
      min = Math.min(min, new Date(t.startsAt).getTime());
      max = Math.max(max, new Date(t.endsAt).getTime());
    }
    // pad 1 hour each side
    min -= 3600_000;
    max += 3600_000;
    return { start: min, end: max, ms: Math.max(max - min, 3600_000) };
  }, [tasks]);

  const ticks = useMemo(() => {
    const count = 6;
    const out: { left: number; label: string }[] = [];
    for (let i = 0; i <= count; i++) {
      const t = range.start + (range.ms * i) / count;
      out.push({
        left: (i / count) * 100,
        label: new Date(t).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
      });
    }
    return out;
  }, [range]);

  if (!data.rows?.length) {
    return <Empty>No load-in / load-out tasks yet. Departments can add tasks below or on their schedule page.</Empty>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="min-w-[720px]">
        {/* Timeline header */}
        <div className="grid grid-cols-[200px_1fr] border-b border-slate-100 bg-slate-50">
          <div className="px-3 py-2 text-xs font-semibold text-slate-500">
            Department
          </div>
          <div className="relative h-10 border-l border-slate-100">
            {ticks.map((tick, i) => (
              <div
                key={i}
                className="absolute top-0 h-full border-l border-slate-200/80"
                style={{ left: `${tick.left}%` }}
              >
                <div className="translate-x-1 pt-1 text-[10px] whitespace-nowrap text-slate-500">
                  {tick.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {data.rows.map((row) => (
          <div
            key={row.departmentId}
            className="grid grid-cols-[200px_1fr] border-b border-slate-50 last:border-0"
          >
            <div className="flex items-center gap-2 px-3 py-3">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: row.color }}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">
                  {row.departmentName}
                </div>
                <div className="text-[11px] text-slate-500">
                  {row.tasks.length} task{row.tasks.length === 1 ? "" : "s"}
                </div>
              </div>
            </div>
            <div className="relative min-h-[56px] border-l border-slate-100 py-2">
              {ticks.map((tick, i) => (
                <div
                  key={i}
                  className="absolute inset-y-0 border-l border-slate-100"
                  style={{ left: `${tick.left}%` }}
                />
              ))}
              {row.tasks.map((t) => {
                const s = new Date(t.startsAt).getTime();
                const e = new Date(t.endsAt).getTime();
                const left = ((s - range.start) / range.ms) * 100;
                const width = Math.max(((e - s) / range.ms) * 100, 0.8);
                return (
                  <div
                    key={t.id}
                    title={`${t.title}\n${formatDate(t.startsAt)} → ${formatDate(t.endsAt)}\n${t.status}${t.location ? ` · ${t.location}` : ""}`}
                    className={cn(
                      "absolute top-2 h-8 overflow-hidden rounded-md px-2 text-[11px] font-medium leading-8 text-white shadow-sm",
                      t.phase === "LOAD_IN" ? "ring-1 ring-sky-900/10" : "ring-1 ring-orange-900/10",
                    )}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background:
                        t.status === "CANCELLED"
                          ? "#94a3b8"
                          : t.status === "BLOCKED"
                            ? "#f59e0b"
                            : t.status === "DONE"
                              ? "#10b981"
                              : row.color || "#6366f1",
                      opacity: t.status === "CANCELLED" ? 0.55 : 1,
                    }}
                  >
                    <span className="block truncate">
                      {t.phase === "LOAD_IN" ? "IN" : "OUT"} · {t.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-sky-500" /> Load-in
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-orange-500" /> Load-out
        </span>
        <span>Bar color = department (green = done, amber = blocked)</span>
      </div>
    </div>
  );
}

export function LoadSchedulePage() {
  const { isConManager, user } = useAuth();
  const [phaseFilter, setPhaseFilter] = useState<"ALL" | Phase>("ALL");
  const [deptFilter, setDeptFilter] = useState("");
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [tasks, setTasks] = useState<LoadTask[]>([]);
  const [gantt, setGantt] = useState<GanttPayload | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [formPhase, setFormPhase] = useState<Phase>("LOAD_IN");
  const defaults = defaultWindow("LOAD_IN");
  const [form, setForm] = useState({
    departmentId: "",
    title: "",
    description: "",
    location: "",
    startsAt: defaults.startsAt,
    endsAt: defaults.endsAt,
    status: "PLANNED" as Status,
  });

  const canEdit =
    isConManager ||
    user?.role === "DEPARTMENT_LEAD" ||
    (user?.departmentMembers?.length ?? 0) > 0;

  async function reload() {
    setError("");
    const qs = new URLSearchParams();
    if (phaseFilter !== "ALL") qs.set("phase", phaseFilter);
    if (deptFilter) qs.set("departmentId", deptFilter);

    const [depts, list] = await Promise.all([
      api<Dept[]>("/departments"),
      api<LoadTask[]>(`/load-schedule?${qs.toString()}`),
    ]);
    setDepartments(depts);
    setTasks(list);

    if (isConManager) {
      const gQs = new URLSearchParams();
      if (phaseFilter !== "ALL") gQs.set("phase", phaseFilter);
      const g = await api<GanttPayload>(`/load-schedule/gantt?${gQs.toString()}`);
      setGantt(g);
    }

    if (!form.departmentId && depts[0]) {
      setForm((f) => ({ ...f, departmentId: depts[0].id }));
    }
  }

  useEffect(() => {
    void reload().catch((e) => setError(e.message || "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseFilter, deptFilter, isConManager]);

  async function createTask(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    try {
      await api("/load-schedule", {
        method: "POST",
        body: JSON.stringify({
          departmentId: form.departmentId,
          phase: formPhase,
          title: form.title,
          description: form.description || undefined,
          location: form.location || undefined,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          status: form.status,
        }),
      });
      setMsg("Task added");
      setForm((f) => ({
        ...f,
        title: "",
        description: "",
        location: "",
        ...defaultWindow(formPhase),
      }));
      await reload();
    } catch (err) {
      setError((err as { message?: string }).message || "Create failed");
    }
  }

  async function updateStatus(id: string, status: Status) {
    await api(`/load-schedule/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await reload();
  }

  async function removeTask(id: string) {
    if (!confirm("Delete this load schedule task?")) return;
    await api(`/load-schedule/${id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <div>
      <PageHeader
        title="Load In / Load Out"
        subtitle="Department task timelines — Con Manager Gantt of all activities"
        actions={
          <div className="flex flex-wrap gap-2">
            <Select
              className="w-auto min-w-[140px]"
              value={phaseFilter}
              onChange={(e) =>
                setPhaseFilter(e.target.value as "ALL" | Phase)
              }
            >
              <option value="ALL">All phases</option>
              <option value="LOAD_IN">Load-in only</option>
              <option value="LOAD_OUT">Load-out only</option>
            </Select>
            <Select
              className="w-auto min-w-[160px]"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {error ? <Alert>{error}</Alert> : null}
      {msg ? <Alert tone="ok">{msg}</Alert> : null}

      {isConManager ? (
        <Card
          className="mb-6"
          title={`Master Gantt${gantt ? ` · ${gantt.taskCount} tasks` : ""}`}
        >
          {gantt ? <GanttChart data={gantt} /> : <Empty>Loading Gantt…</Empty>}
        </Card>
      ) : (
        <p className="mb-4 text-sm text-slate-500">
          Add timed load-in and load-out tasks for your department. Con Managers
          see every department on a combined Gantt chart.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Card title="Tasks">
            {!tasks.length ? (
              <Empty>No tasks match this filter.</Empty>
            ) : (
              <ul className="space-y-3">
                {tasks.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-xl border border-slate-100 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: t.department.color }}
                          />
                          <span className="font-medium text-slate-900">
                            {t.title}
                          </span>
                          <Badge
                            tone={t.phase === "LOAD_IN" ? "sky" : "amber"}
                          >
                            {t.phase === "LOAD_IN" ? "Load-in" : "Load-out"}
                          </Badge>
                          <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {t.department.name} · {formatDate(t.startsAt)} →{" "}
                          {formatDate(t.endsAt)}
                          {t.location ? ` · ${t.location}` : ""}
                        </div>
                        {t.description ? (
                          <p className="mt-2 text-sm text-slate-600">
                            {t.description}
                          </p>
                        ) : null}
                      </div>
                      {canEdit ? (
                        <div className="flex flex-wrap gap-1">
                          {(
                            [
                              "PLANNED",
                              "IN_PROGRESS",
                              "DONE",
                              "BLOCKED",
                            ] as Status[]
                          ).map((s) => (
                            <Button
                              key={s}
                              type="button"
                              variant="secondary"
                              className="!px-2 !py-1 text-xs"
                              onClick={() => void updateStatus(t.id, s)}
                            >
                              {s}
                            </Button>
                          ))}
                          <Button
                            type="button"
                            variant="danger"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => void removeTask(t.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {canEdit ? (
          <Card title="Add task">
            <form className="space-y-3" onSubmit={createTask}>
              <div>
                <Label>Phase</Label>
                <Select
                  value={formPhase}
                  onChange={(e) => {
                    const p = e.target.value as Phase;
                    setFormPhase(p);
                    setForm((f) => ({ ...f, ...defaultWindow(p) }));
                  }}
                >
                  <option value="LOAD_IN">Load-in</option>
                  <option value="LOAD_OUT">Load-out</option>
                </Select>
              </div>
              <div>
                <Label>Department</Label>
                <Select
                  value={form.departmentId}
                  onChange={(e) =>
                    setForm({ ...form, departmentId: e.target.value })
                  }
                  required
                >
                  <option value="">Select…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. NOC fiber pull"
                  required
                />
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  placeholder="Dock B / Track 1"
                />
              </div>
              <div>
                <Label>Starts</Label>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) =>
                    setForm({ ...form, startsAt: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <Label>Ends</Label>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <Button type="submit" className="w-full">
                Add to schedule
              </Button>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
