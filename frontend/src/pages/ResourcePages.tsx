import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
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
import { EntityDetailModal } from "@/components/EntityDetailModal";
import { formatDate } from "@/lib/utils";

function useLoad<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let alive = true;
    setError("");
    void api<T>(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message || "Failed to load"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, reloadKey, ...deps]);
  return {
    data,
    error,
    reload: () => setReloadKey((k) => k + 1),
    setData,
  };
}

export function DepartmentsPage() {
  const { isConManager } = useAuth();
  const { data, error, reload } = useLoad<
    { id: string; name: string; color: string; description?: string; _count: { members: number }; isOrderingDept: boolean; helpdeskQueueAccess: boolean }[]
  >("/departments");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  async function createDept(e: FormEvent) {
    e.preventDefault();
    await api("/departments", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setName("");
    setMsg("Department created");
    reload();
  }

  return (
    <div>
      <PageHeader title="Departments" subtitle="Team structures and feature scopes" />
      {error ? <Alert>{error}</Alert> : null}
      {msg ? <Alert tone="ok">{msg}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {(data || []).map((d) => (
            <Link key={d.id} to={`/departments/${d.id}`}>
              <Card className="mb-3 transition hover:border-indigo-200">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ background: d.color }} />
                  <div className="flex-1">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-slate-500">
                      {d._count.members} members
                      {d.helpdeskQueueAccess ? " · Helpdesk queue" : ""}
                      {d.isOrderingDept ? " · Ordering dept" : ""}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          {!data?.length ? <Empty>No departments yet.</Empty> : null}
        </div>
        {isConManager ? (
          <Card title="Create department">
            <form className="space-y-3" onSubmit={createDept}>
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <Button type="submit">Create</Button>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export function DepartmentDetailPage() {
  const { id } = useParams();
  const { user, isConManager } = useAuth();
  const { data, error, reload } = useLoad<any>(`/departments/${id}`, [id]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("VOLUNTEER");
  const [inviteLink, setInviteLink] = useState("");
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (data?.features) setFeatures(data.features);
  }, [data]);

  const canManage =
    isConManager ||
    user?.departmentMembers?.some((m) => m.department.id === id && m.isLead);

  async function saveFeatures() {
    await api(`/departments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ features }),
    });
    reload();
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    const res = await api<{ inviteLink: string }>("/users/invite", {
      method: "POST",
      body: JSON.stringify({
        email: inviteEmail,
        role: inviteRole,
        departmentId: id,
      }),
    });
    setInviteLink(res.inviteLink);
    setInviteEmail("");
  }

  async function toggleDeptFlag(key: "isOrderingDept" | "helpdeskQueueAccess", value: boolean) {
    await api(`/departments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ [key]: value }),
    });
    reload();
  }

  if (!data && !error) return <div>Loading…</div>;
  if (error) return <Alert>{error}</Alert>;

  return (
    <div>
      <PageHeader
        title={data.name}
        subtitle={data.description || "Department workspace"}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Members">
          <ul className="space-y-2">
            {data.members?.map((m: any) => (
              <li key={m.id} className="flex items-center justify-between text-sm">
                <span>
                  {m.user.name}{" "}
                  <span className="text-slate-400">({m.user.email})</span>
                </span>
                {m.isLead ? <Badge tone="indigo">Lead</Badge> : null}
              </li>
            ))}
          </ul>
        </Card>
        {canManage ? (
          <Card title="Invite member">
            <form className="space-y-3" onSubmit={invite}>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  <option value="VOLUNTEER">Volunteer</option>
                  <option value="GUEST">Guest</option>
                  {isConManager ? (
                    <option value="DEPARTMENT_LEAD">Department Lead</option>
                  ) : null}
                </Select>
              </div>
              <Button type="submit">Send invite</Button>
              {inviteLink ? (
                <p className="break-all text-xs text-slate-500">
                  Invite link (also emailed if SMTP configured): {inviteLink}
                </p>
              ) : null}
            </form>
          </Card>
        ) : null}
        {canManage ? (
          <Card title="Department features">
            <div className="space-y-2">
              {Object.entries(features).map(([key, enabled]) => (
                <label key={key} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{key.replaceAll("_", " ")}</span>
                  <input
                    type="checkbox"
                    checked={!!enabled}
                    onChange={(e) =>
                      setFeatures((f) => ({ ...f, [key]: e.target.checked }))
                    }
                  />
                </label>
              ))}
              <Button onClick={saveFeatures}>Save features</Button>
            </div>
          </Card>
        ) : null}
        {isConManager ? (
          <Card title="Department flags">
            <div className="space-y-3 text-sm">
              <label className="flex items-center justify-between">
                Ordering department
                <input
                  type="checkbox"
                  checked={!!data.isOrderingDept}
                  onChange={(e) => void toggleDeptFlag("isOrderingDept", e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between">
                Helpdesk queue access
                <input
                  type="checkbox"
                  checked={!!data.helpdeskQueueAccess}
                  onChange={(e) =>
                    void toggleDeptFlag("helpdeskQueueAccess", e.target.checked)
                  }
                />
              </label>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export function HelpdeskPage() {
  const { isConManager } = useAuth();
  const [master, setMaster] = useState(false);
  const path = master ? "/helpdesk?master=1" : "/helpdesk";
  const { data, error, reload } = useLoad<any[]>(path, [master]);
  const queues = useLoad<{ id: string; name: string }[]>("/departments/helpdesk-queues");
  const depts = useLoad<{ id: string; name: string }[]>("/departments");
  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "MEDIUM",
    departmentId: "",
    isIncident: false,
  });
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("open");
    if (q) setOpenId(q);
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    await api("/helpdesk", { method: "POST", body: JSON.stringify(form) });
    setForm({ title: "", description: "", severity: "MEDIUM", departmentId: "", isIncident: false });
    reload();
  }

  return (
    <div>
      <PageHeader
        title="Helpdesk"
        subtitle="Tickets with severity and department queues — click a ticket to open details"
        actions={
          isConManager ? (
            <Button variant={master ? "primary" : "secondary"} onClick={() => setMaster((m) => !m)}>
              {master ? "Master queue" : "Show master queue"}
            </Button>
          ) : null
        }
      />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {(data || []).map((t) => (
            <Card
              key={t.id}
              className="mb-3 cursor-pointer transition hover:border-indigo-200 hover:shadow-md"
              onClick={() => setOpenId(t.id)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-indigo-700">{t.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t.department?.name} · {t.createdBy?.name} · {formatDate(t.createdAt)}
                    {t._count?.comments ? ` · ${t._count.comments} msgs` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge
                    tone={
                      t.severity === "CRITICAL" || t.severity === "HIGH"
                        ? "rose"
                        : t.severity === "MEDIUM"
                          ? "amber"
                          : "slate"
                    }
                  >
                    {t.severity}
                  </Badge>
                  <Badge tone="sky">{t.status}</Badge>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-slate-600">{t.description}</p>
              <p className="mt-2 text-xs text-indigo-600">Click to edit · messages · change log</p>
            </Card>
          ))}
          {!data?.length ? <Empty>No tickets.</Empty> : null}
        </div>
        <Card title="Open ticket">
          <form className="space-y-3" onSubmit={create}>
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Department queue</Label>
              <Select
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {(queues.data || []).map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Severity</Label>
              <Select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
              >
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isIncident}
                onChange={(e) => setForm({ ...form, isIncident: e.target.checked })}
              />
              Incident report (feeds helpdesk)
            </label>
            <Button type="submit">Submit</Button>
          </form>
        </Card>
      </div>
      <EntityDetailModal
        kind="helpdesk"
        id={openId}
        open={!!openId}
        onClose={() => setOpenId(null)}
        onSaved={reload}
        departments={depts.data || queues.data || []}
      />
    </div>
  );
}

export function TodosPage() {
  const { data, error, reload } = useLoad<any[]>("/todos");
  const depts = useLoad<{ id: string; name: string }[]>("/departments");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("open");
    if (q) setOpenId(q);
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    await api("/todos", {
      method: "POST",
      body: JSON.stringify({ title, priority }),
    });
    setTitle("");
    reload();
  }

  return (
    <div>
      <PageHeader
        title="Todos"
        subtitle="Track work across departments and people — click a todo to open details"
      />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {(data || []).map((t) => (
            <Card
              key={t.id}
              className="mb-3 cursor-pointer transition hover:border-indigo-200 hover:shadow-md"
              onClick={() => setOpenId(t.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-indigo-700">{t.title}</div>
                  <div className="text-xs text-slate-500">
                    {t.assignee?.name || "Unassigned"} · {t.department?.name || "Personal"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge>{t.priority}</Badge>
                  <Badge tone={t.status === "DONE" ? "green" : "amber"}>{t.status}</Badge>
                </div>
              </div>
              <p className="mt-2 text-xs text-indigo-600">Click to edit · messages · change log</p>
            </Card>
          ))}
          {!data?.length ? <Empty>No todos yet.</Empty> : null}
        </div>
        <Card title="New todo">
          <form className="space-y-3" onSubmit={create}>
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </div>
            <Button type="submit">Create</Button>
          </form>
        </Card>
      </div>
      <EntityDetailModal
        kind="todo"
        id={openId}
        open={!!openId}
        onClose={() => setOpenId(null)}
        onSaved={reload}
        departments={depts.data || []}
      />
    </div>
  );
}

export function CommunicationsPage() {
  const { data, error, reload } = useLoad<any[]>("/communications");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [requiresAck, setRequiresAck] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    await api("/communications", {
      method: "POST",
      body: JSON.stringify({ subject, body, priority, requiresAck }),
    });
    setSubject("");
    setBody("");
    reload();
  }

  return (
    <div>
      <PageHeader
        title="Communications hub"
        subtitle="Priority announcements · read/ack receipts · SMS-ready model"
      />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {(data || []).map((c) => (
            <Card key={c.id} className="mb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{c.subject}</div>
                <div className="flex gap-2">
                  {c.priority === "CRITICAL" ? <Badge tone="rose">CRITICAL</Badge> : null}
                  {c.requiresAck ? <Badge tone="amber">Ack required</Badge> : null}
                  {c.isPinned ? <Badge tone="indigo">Pinned</Badge> : null}
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {c.author?.name} · {formatDate(c.createdAt)}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    void api(`/communications/${c.id}/read`, {
                      method: "POST",
                      body: JSON.stringify({}),
                    }).then(reload)
                  }
                >
                  Mark read
                </Button>
                {c.requiresAck ? (
                  <Button
                    onClick={() =>
                      void api(`/communications/${c.id}/read`, {
                        method: "POST",
                        body: JSON.stringify({ acknowledge: true }),
                      }).then(reload)
                    }
                  >
                    Acknowledge
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
        <Card title="Post message">
          <form className="space-y-3" onSubmit={create}>
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="NORMAL">Normal</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requiresAck}
                onChange={(e) => setRequiresAck(e.target.checked)}
              />
              Require acknowledgement
            </label>
            <div>
              <Label>Body</Label>
              <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} required />
            </div>
            <Button type="submit">Send</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function CalendarPage() {
  const range = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const to = new Date();
    to.setDate(to.getDate() + 21);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
  const { data, error, reload } = useLoad<any[]>(
    `/calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
  );

  async function downloadIcs() {
    const res = await api<{ body: string }>("/calendar/export.ics");
    const blob = new Blob([res.body], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "conman-schedule.ics";
    a.click();
  }
  const [form, setForm] = useState({
    title: "",
    startsAt: "",
    endsAt: "",
    isMaster: false,
    location: "",
  });

  async function create(e: FormEvent) {
    e.preventDefault();
    await api("/calendar", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setForm({ title: "", startsAt: "", endsAt: "", isMaster: false, location: "" });
    reload();
  }

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Master overlay · publish / iCal export for Google Calendar"
        actions={
          <Button variant="secondary" onClick={() => void downloadIcs()}>
            Export iCal
          </Button>
        }
      />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {(data || []).map((ev) => (
            <Card key={ev.id} className="mb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{ev.title}</div>
                  <div className="text-xs text-slate-500">
                    {formatDate(ev.startsAt)} → {formatDate(ev.endsAt)}
                  </div>
                  {ev.location ? (
                    <div className="mt-1 text-xs text-slate-500">{ev.location}</div>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {ev.isMaster ? <Badge tone="indigo">Master</Badge> : null}
                  {ev.department ? <Badge tone="sky">{ev.department.name}</Badge> : null}
                </div>
              </div>
            </Card>
          ))}
          {!data?.length ? <Empty>No events in range.</Empty> : null}
        </div>
        <Card title="New event">
          <form className="space-y-3" onSubmit={create}>
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Starts</Label>
              <Input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
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
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isMaster}
                onChange={(e) => setForm({ ...form, isMaster: e.target.checked })}
              />
              Master calendar (Con Manager)
            </label>
            <Button type="submit">Create</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function DocumentsPage() {
  const { data, error, reload } = useLoad<any[]>("/documents");
  const [title, setTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.append("title", title);
    if (file) {
      fd.append("file", file);
      fd.append("source", "LOCAL");
    } else {
      fd.append("source", "EXTERNAL");
      fd.append("externalUrl", externalUrl);
    }
    await api("/documents", { method: "POST", body: fd });
    setTitle("");
    setExternalUrl("");
    setFile(null);
    reload();
  }

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Local uploads or Drive/OneDrive/Dropbox links with revision history"
      />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {(data || []).map((d) => (
            <Card key={d.id} className="mb-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{d.title}</div>
                  <div className="text-xs text-slate-500">
                    {d.source} · v{d._count?.revisions || 1} · {d.uploadedBy?.name}
                  </div>
                </div>
                {d.currentUrl ? (
                  <a
                    className="text-sm text-indigo-600 hover:underline"
                    href={d.currentUrl.startsWith("http") ? d.currentUrl : d.currentUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
        <Card title="Add document">
          <form className="space-y-3" onSubmit={create}>
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <Label>Upload file</Label>
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div>
              <Label>Or external link</Label>
              <Input
                placeholder="https://drive.google.com/..."
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
              />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function SimpleCrudPage({
  title,
  subtitle,
  path,
  fields,
  renderItem,
  buildBody,
}: {
  title: string;
  subtitle: string;
  path: string;
  fields: { key: string; label: string; type?: string; required?: boolean }[];
  renderItem: (item: any) => ReactNode;
  buildBody: (form: Record<string, string>) => unknown;
}) {
  const { data, error, reload } = useLoad<any[]>(path);
  const [form, setForm] = useState<Record<string, string>>({});

  async function create(e: FormEvent) {
    e.preventDefault();
    await api(path, { method: "POST", body: JSON.stringify(buildBody(form)) });
    setForm({});
    reload();
  }

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {(data || []).map((item) => (
            <Card key={item.id} className="mb-3">
              {renderItem(item)}
            </Card>
          ))}
          {!data?.length ? <Empty>Nothing here yet.</Empty> : null}
        </div>
        <Card title={`New ${title.slice(0, -1) || "item"}`}>
          <form className="space-y-3" onSubmit={create}>
            {fields.map((f) => (
              <div key={f.key}>
                <Label>{f.label}</Label>
                {f.type === "textarea" ? (
                  <Textarea
                    value={form[f.key] || ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    required={f.required}
                  />
                ) : (
                  <Input
                    type={f.type || "text"}
                    value={form[f.key] || ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    required={f.required}
                  />
                )}
              </div>
            ))}
            <Button type="submit">Create</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function SurveysPage() {
  const { data, error, reload } = useLoad<any[]>("/surveys");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [qLabel, setQLabel] = useState("Feedback");
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useLoad<any>(selected ? `/surveys/${selected}` : "/surveys/__none", [selected]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  return (
    <div>
      <PageHeader
        title="Surveys"
        subtitle="Google Forms-style surveys with CSV / text export"
      />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {(data || []).map((s) => (
            <Card key={s.id} className="mb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{s.title}</div>
                  <div className="text-xs text-slate-500">
                    {s._count?.responses || 0} responses
                    {s.isTemplate ? " · template" : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setSelected(s.id)}>
                    Open
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void api<{ content: string }>(`/surveys/${s.id}/export?format=csv`).then(
                        (r) => {
                          const blob = new Blob([r.content], { type: "text/csv" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = `${s.title}.csv`;
                          a.click();
                        },
                      )
                    }
                  >
                    Export CSV
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void api<{ content: string }>(`/surveys/${s.id}/export?format=text`).then(
                        (r) => {
                          const blob = new Blob([r.content], { type: "text/plain" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = `${s.title}.txt`;
                          a.click();
                        },
                      )
                    }
                  >
                    Export text
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {selected && detail.data?.questions ? (
            <Card title={`Respond: ${detail.data.title}`}>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void api(`/surveys/${selected}/responses`, {
                    method: "POST",
                    body: JSON.stringify({ answers }),
                  }).then(() => {
                    setAnswers({});
                    detail.reload();
                    reload();
                  });
                }}
              >
                {(detail.data.questions as { id: string; label: string; type: string }[]).map(
                  (q) => (
                    <div key={q.id}>
                      <Label>{q.label}</Label>
                      {q.type === "textarea" ? (
                        <Textarea
                          value={answers[q.id] || ""}
                          onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        />
                      ) : (
                        <Input
                          value={answers[q.id] || ""}
                          onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        />
                      )}
                    </div>
                  ),
                )}
                <Button type="submit">Submit response</Button>
              </form>
            </Card>
          ) : null}
        </div>
        <Card title="Create survey">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void api("/surveys", {
                method: "POST",
                body: JSON.stringify({
                  title,
                  description,
                  questions: [
                    { id: "q1", type: "textarea", label: qLabel, required: true },
                    { id: "q2", type: "text", label: "Optional follow-up", required: false },
                  ],
                }),
              }).then(() => {
                setTitle("");
                setDescription("");
                reload();
              });
            }}
          >
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <Textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Input placeholder="First question label" value={qLabel} onChange={(e) => setQLabel(e.target.value)} />
            <Button type="submit">Create</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function ShiftsPage() {
  const depts = useLoad<{ id: string; name: string }[]>("/departments");
  const { data, error, reload } = useLoad<any[]>("/shifts");
  const [form, setForm] = useState({
    title: "",
    departmentId: "",
    startsAt: "",
    endsAt: "",
    location: "",
  });
  const [signupError, setSignupError] = useState("");

  async function create(e: FormEvent) {
    e.preventDefault();
    await api("/shifts", { method: "POST", body: JSON.stringify(form) });
    reload();
  }

  return (
    <div>
      <PageHeader
        title="Shift scheduling"
        subtitle="Signup or assign · conflict detection vs other shifts and calendar"
      />
      {error ? <Alert>{error}</Alert> : null}
      {signupError ? <Alert>{signupError}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {(data || []).map((s) => (
            <Card key={s.id} className="mb-3">
              <div className="font-medium">{s.title}</div>
              <div className="text-xs text-slate-500">
                {s.department?.name} · {formatDate(s.startsAt)} → {formatDate(s.endsAt)}
              </div>
              <div className="mt-2 text-sm">
                Assigned ({s.assignments?.length || 0}/{s.slots}):{" "}
                {s.assignments?.map((a: any) => a.user.name).join(", ") || "None"}
              </div>
              <Button
                className="mt-2"
                variant="secondary"
                onClick={() =>
                  void api(`/shifts/${s.id}/signup`, { method: "POST" })
                    .then(() => {
                      setSignupError("");
                      reload();
                    })
                    .catch((e) => setSignupError(e.message))
                }
              >
                Sign up
              </Button>
            </Card>
          ))}
        </div>
        <Card title="Create shift">
          <form className="space-y-3" onSubmit={create}>
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Department</Label>
              <Select
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {(depts.data || []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Starts</Label>
              <Input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
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
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <Button type="submit">Create</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function HandoversPage() {
  const depts = useLoad<{ id: string; name: string }[]>("/departments");
  const [departmentId, setDepartmentId] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", body: "", shiftLabel: "" });

  useEffect(() => {
    if (!departmentId && depts.data?.[0]) setDepartmentId(depts.data[0].id);
  }, [depts.data, departmentId]);

  useEffect(() => {
    if (!departmentId) return;
    void api<any[]>(`/handovers?departmentId=${departmentId}`)
      .then(setNotes)
      .catch((e) => setError(e.message));
  }, [departmentId]);

  function reload() {
    if (!departmentId) return;
    void api<any[]>(`/handovers?departmentId=${departmentId}`).then(setNotes);
  }

  return (
    <div>
      <PageHeader
        title="Handover notes"
        subtitle="Shift/day transition notes for the next crew"
      />
      {error ? <Alert>{error}</Alert> : null}
      <div className="mb-4 max-w-xs">
        <Label>Department</Label>
        <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          {(depts.data || []).map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {notes.map((h) => (
            <Card key={h.id} className="mb-3">
              <div className="font-medium">{h.title}</div>
              <div className="text-xs text-slate-500">
                {h.author?.name} · {h.shiftLabel || "—"} · {formatDate(h.createdAt)}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{h.body}</p>
            </Card>
          ))}
          {!notes.length ? <Empty>No handover notes yet.</Empty> : null}
        </div>
        <Card title="New handover">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void api("/handovers", {
                method: "POST",
                body: JSON.stringify({ ...form, departmentId }),
              }).then(() => {
                setForm({ title: "", body: "", shiftLabel: "" });
                reload();
              });
            }}
          >
            <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <Input placeholder="Shift label" value={form.shiftLabel} onChange={(e) => setForm({ ...form, shiftLabel: e.target.value })} />
            <Textarea rows={5} placeholder="What the next team needs to know" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
            <Button type="submit">Post note</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function VendorsPage() {
  return (
    <SimpleCrudPage
      title="Vendors"
      subtitle="Lightweight vendor / exhibitor contacts"
      path="/vendors"
      fields={[
        { key: "name", label: "Vendor name", required: true },
        { key: "contactName", label: "Contact" },
        { key: "contactEmail", label: "Email" },
        { key: "booth", label: "Booth" },
      ]}
      buildBody={(f) => f}
      renderItem={(v) => (
        <>
          <div className="font-medium">{v.name}</div>
          <div className="text-xs text-slate-500">
            {v.contactName || "—"} · {v.booth || "No booth"} · {v.contactEmail || ""}
          </div>
        </>
      )}
    />
  );
}

export function MealsPage() {
  return (
    <SimpleCrudPage
      title="Meals"
      subtitle="Meal plans and dietary tracking"
      path="/meals"
      fields={[
        { key: "name", label: "Meal name", required: true },
        { key: "mealDate", label: "Date", type: "datetime-local", required: true },
        { key: "notes", label: "Notes", type: "textarea" },
      ]}
      buildBody={(f) => f}
      renderItem={(m) => (
        <>
          <div className="font-medium">{m.name}</div>
          <div className="text-xs text-slate-500">
            {formatDate(m.mealDate)} · {m.selections?.length || 0} selections
          </div>
        </>
      )}
    />
  );
}

export function StaffDirectoryPage() {
  const { data, error } = useLoad<any[]>("/staff-directory");
  return (
    <div>
      <PageHeader
        title="Staff & volunteer directory"
        subtitle="Printable contact sheet (privacy-controlled fields require elevated access)"
        actions={
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
        }
      />
      {error ? <Alert>{error}</Alert> : null}
      <Card>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-slate-500">
              <th className="py-2">Name</th>
              <th>Role</th>
              <th>Departments</th>
              <th>Email</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((u) => (
              <tr key={u.id} className="border-b border-slate-50">
                <td className="py-2 font-medium">{u.name}</td>
                <td>{u.role}</td>
                <td>{u.departmentMembers?.map((m: any) => m.department.name).join(", ")}</td>
                <td>{u.email}</td>
                <td>{u.phone || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function AuditPage() {
  const { data, error } = useLoad<any[]>("/audit");
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Comprehensive action history" />
      {error ? <Alert>{error}</Alert> : null}
      <div className="space-y-2">
        {(data || []).map((a) => (
          <Card key={a.id} className="!p-0">
            <div className="px-4 py-3 text-sm">
              <div className="font-medium">{a.action}</div>
              <div className="text-xs text-slate-500">
                {a.actor?.name || "System"} · {a.entityType} {a.entityId} · {formatDate(a.createdAt)}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function OrdersPage() {
  const ordering = useLoad<{ id: string; name: string }[]>("/departments/ordering");
  const { data, error, reload } = useLoad<any[]>("/orders");
  const [form, setForm] = useState({ title: "", quantity: "1", toDeptId: "", description: "" });

  async function create(e: FormEvent) {
    e.preventDefault();
    await api("/orders", {
      method: "POST",
      body: JSON.stringify({
        title: form.title,
        quantity: Number(form.quantity),
        toDeptId: form.toDeptId || undefined,
        description: form.description,
      }),
    });
    reload();
  }

  return (
    <div>
      <PageHeader title="Item orders" subtitle="Request supplies from ordering departments" />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {(data || []).map((o) => (
            <Card key={o.id} className="mb-3">
              <div className="flex justify-between">
                <div>
                  <div className="font-medium">{o.title}</div>
                  <div className="text-xs text-slate-500">
                    Qty {o.quantity} · to {o.toDept?.name || "—"} · {o.requestedBy?.name}
                  </div>
                </div>
                <Badge>{o.status}</Badge>
              </div>
              <div className="mt-2 flex gap-2">
                {["APPROVED", "FULFILLED", "DENIED"].map((s) => (
                  <Button
                    key={s}
                    variant="secondary"
                    className="!px-2 !py-1 text-xs"
                    onClick={() =>
                      void api(`/orders/${o.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: s }),
                      }).then(reload)
                    }
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </Card>
          ))}
        </div>
        <Card title="New order">
          <form className="space-y-3" onSubmit={create}>
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div>
              <Label>Ordering department</Label>
              <Select value={form.toDeptId} onChange={(e) => setForm({ ...form, toDeptId: e.target.value })}>
                <option value="">Select…</option>
                {(ordering.data || []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <Button type="submit">Submit</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function BudgetPage() {
  const { data, error, reload } = useLoad<any[]>("/budget");
  const [form, setForm] = useState({ label: "", amount: "", category: "" });
  return (
    <div>
      <PageHeader title="Budget" subtitle="Line items with approval workflow" />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {(data || []).map((b) => (
            <Card key={b.id} className="mb-3">
              <div className="flex justify-between gap-2">
                <div>
                  <div className="font-medium">{b.label}</div>
                  <div className="text-xs text-slate-500">
                    ${Number(b.amount).toFixed(2)} · {b.category || "Uncategorized"} · {b.createdBy?.name}
                  </div>
                </div>
                <Badge tone={b.status === "APPROVED" ? "green" : b.status === "REJECTED" ? "rose" : "amber"}>
                  {b.status}
                </Badge>
              </div>
              {b.status === "PENDING" ? (
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="secondary"
                    className="!px-2 !py-1 text-xs"
                    onClick={() =>
                      void api(`/budget/${b.id}/status`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: "APPROVED" }),
                      }).then(reload)
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    className="!px-2 !py-1 text-xs"
                    onClick={() =>
                      void api(`/budget/${b.id}/status`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: "REJECTED" }),
                      }).then(reload)
                    }
                  >
                    Reject
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
        <Card title="New line item">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void api("/budget", {
                method: "POST",
                body: JSON.stringify({
                  label: form.label,
                  amount: Number(form.amount),
                  category: form.category,
                }),
              }).then(() => {
                setForm({ label: "", amount: "", category: "" });
                reload();
              });
            }}
          >
            <Input placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
            <Input type="number" step="0.01" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Button type="submit">Submit for approval</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function OrgChartPage() {
  return (
    <SimpleCrudPage
      title="Org Chart"
      subtitle="Conference organizational structure"
      path="/org-chart"
      fields={[{ key: "title", label: "Title / role", required: true }]}
      buildBody={(f) => ({ title: f.title })}
      renderItem={(n) => (
        <>
          <div className="font-medium">{n.title}</div>
          <div className="text-xs text-slate-500">
            {n.user?.name || "Unassigned"} · {n.department?.name || "No dept"}
          </div>
        </>
      )}
    />
  );
}

export function BadgesPage() {
  return (
    <SimpleCrudPage
      title="Badges"
      subtitle="Badge types and staff assignments"
      path="/badges"
      fields={[
        { key: "name", label: "Badge name", required: true },
        { key: "color", label: "Color" },
      ]}
      buildBody={(f) => ({ name: f.name, color: f.color || "#0ea5e9" })}
      renderItem={(b) => (
        <>
          <div className="flex items-center gap-2 font-medium">
            <span className="h-3 w-3 rounded-full" style={{ background: b.color }} />
            {b.name}
          </div>
          <div className="text-xs text-slate-500">
            {b.assignments?.length || 0} assigned
          </div>
        </>
      )}
    />
  );
}

export function RadioPage() {
  return (
    <SimpleCrudPage
      title="Radio channels"
      subtitle="Channel plan and assignments"
      path="/radio"
      fields={[
        { key: "name", label: "Channel name", required: true },
        { key: "frequency", label: "Frequency / talkgroup" },
      ]}
      buildBody={(f) => ({ name: f.name, frequency: f.frequency })}
      renderItem={(c) => (
        <>
          <div className="font-medium">{c.name}</div>
          <div className="text-xs text-slate-500">{c.frequency || "No frequency"}</div>
        </>
      )}
    />
  );
}

export function OnCallPage() {
  const { data, error, reload } = useLoad<any[]>("/on-call");
  const users = useLoad<any[]>("/users");
  const [form, setForm] = useState({ userId: "", startsAt: "", endsAt: "", notes: "" });

  async function create(e: FormEvent) {
    e.preventDefault();
    await api("/on-call", { method: "POST", body: JSON.stringify(form) });
    reload();
  }

  return (
    <div>
      <PageHeader title="On-call roster" subtitle="Who is reachable right now" />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {(data || []).map((s) => (
            <Card key={s.id} className="mb-3">
              <div className="font-medium">{s.user?.name}</div>
              <div className="text-xs text-slate-500">
                {formatDate(s.startsAt)} → {formatDate(s.endsAt)} · {s.user?.phone || "No phone"}
              </div>
            </Card>
          ))}
        </div>
        <Card title="Add on-call slot">
          <form className="space-y-3" onSubmit={create}>
            <div>
              <Label>User</Label>
              <Select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} required>
                <option value="">Select…</option>
                {(users.data || []).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Starts</Label>
              <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required />
            </div>
            <div>
              <Label>Ends</Label>
              <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} required />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function RoomsPage() {
  const { data, error, reload } = useLoad<any[]>("/rooms");
  const [roomName, setRoomName] = useState("");
  const [booking, setBooking] = useState({ roomId: "", title: "", startsAt: "", endsAt: "" });

  return (
    <div>
      <PageHeader title="Room booking" subtitle="Meeting and green rooms" />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {(data || []).map((r) => (
            <Card key={r.id} className="mb-3">
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-slate-500">
                Cap {r.capacity || "—"} · {r.location || "No location"}
              </div>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {(r.bookings || []).map((b: any) => (
                  <li key={b.id}>
                    {b.title} · {formatDate(b.startsAt)} · <Badge>{b.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card title="Add room">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void api("/rooms", {
                  method: "POST",
                  body: JSON.stringify({ name: roomName }),
                }).then(() => {
                  setRoomName("");
                  reload();
                });
              }}
            >
              <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} required />
              <Button type="submit">Create room</Button>
            </form>
          </Card>
          <Card title="Book room">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void api("/rooms/bookings", {
                  method: "POST",
                  body: JSON.stringify(booking),
                }).then(reload);
              }}
            >
              <Select
                value={booking.roomId}
                onChange={(e) => setBooking({ ...booking, roomId: e.target.value })}
                required
              >
                <option value="">Select room…</option>
                {(data || []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
              <Input
                placeholder="Title"
                value={booking.title}
                onChange={(e) => setBooking({ ...booking, title: e.target.value })}
                required
              />
              <Input
                type="datetime-local"
                value={booking.startsAt}
                onChange={(e) => setBooking({ ...booking, startsAt: e.target.value })}
                required
              />
              <Input
                type="datetime-local"
                value={booking.endsAt}
                onChange={(e) => setBooking({ ...booking, endsAt: e.target.value })}
                required
              />
              <Button type="submit">Request booking</Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function LostFoundPage() {
  return (
    <SimpleCrudPage
      title="Lost & Found"
      subtitle="Track found and lost items on site"
      path="/lost-found"
      fields={[
        { key: "title", label: "Item", required: true },
        { key: "location", label: "Location" },
        { key: "description", label: "Description", type: "textarea" },
      ]}
      buildBody={(f) => f}
      renderItem={(i) => (
        <>
          <div className="flex justify-between">
            <div className="font-medium">{i.title}</div>
            <Badge>{i.status}</Badge>
          </div>
          <div className="text-xs text-slate-500">
            {i.location || "Unknown location"} · {i.reportedBy?.name}
          </div>
        </>
      )}
    />
  );
}

export function MediaPage() {
  const { data, error, reload } = useLoad<any[]>("/media");
  const [title, setTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");

  return (
    <div>
      <PageHeader title="Media gallery" subtitle="Photos and media for staff reference" />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2">
          {(data || []).map((m) => (
            <Card key={m.id}>
              <div className="font-medium">{m.title}</div>
              {m.url ? (
                <a className="text-sm text-indigo-600 hover:underline" href={m.url} target="_blank" rel="noreferrer">
                  Open media
                </a>
              ) : null}
            </Card>
          ))}
        </div>
        <Card title="Add media">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void api("/media", {
                method: "POST",
                body: JSON.stringify({ title, externalUrl }),
              }).then(() => {
                setTitle("");
                setExternalUrl("");
                reload();
              });
            }}
          >
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required />
            <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://..." />
            <Button type="submit">Add</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function BiblePage() {
  return (
    <SimpleCrudPage
      title="Con Bible"
      subtitle="SOPs, runbooks, and institutional knowledge"
      path="/bible"
      fields={[
        { key: "title", label: "Title", required: true },
        { key: "slug", label: "Slug", required: true },
        { key: "category", label: "Category" },
        { key: "body", label: "Body", type: "textarea", required: true },
      ]}
      buildBody={(f) => f}
      renderItem={(p) => (
        <>
          <div className="font-medium">{p.title}</div>
          <div className="text-xs text-slate-500">{p.category || "General"}</div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{p.body}</p>
        </>
      )}
    />
  );
}

export function RunOfShowPage() {
  return (
    <SimpleCrudPage
      title="Run of Show"
      subtitle="Call sheets and timed program cues"
      path="/run-of-show"
      fields={[
        { key: "title", label: "Cue / segment", required: true },
        { key: "startsAt", label: "Starts", type: "datetime-local", required: true },
        { key: "location", label: "Location" },
        { key: "description", label: "Notes", type: "textarea" },
      ]}
      buildBody={(f) => f}
      renderItem={(r) => (
        <>
          <div className="font-medium">{r.title}</div>
          <div className="text-xs text-slate-500">
            {formatDate(r.startsAt)} · {r.location || "TBD"}
          </div>
        </>
      )}
    />
  );
}

export function UsersAdminPage() {
  const { data, error, reload } = useLoad<any[]>("/users");
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    role: "VOLUNTEER",
  });

  return (
    <div>
      <PageHeader title="User management" subtitle="Accounts, roles, and access" />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {(data || []).map((u) => (
            <Card key={u.id} className="mb-3">
              <div className="flex justify-between">
                <div>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </div>
                <div className="flex gap-2">
                  <Badge tone="indigo">{u.role}</Badge>
                  <Badge tone={u.isActive ? "green" : "rose"}>
                    {u.isActive ? "Active" : "Disabled"}
                  </Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
        <Card title="Create user">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void api("/users", {
                method: "POST",
                body: JSON.stringify(form),
              }).then(() => {
                setForm({ email: "", name: "", password: "", role: "VOLUNTEER" });
                reload();
              });
            }}
          >
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <Input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {["CON_MANAGER", "DEPARTMENT_LEAD", "VOLUNTEER", "GUEST"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
            <Button type="submit">Create</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function PoliciesAdminPage() {
  const { data, error, reload } = useLoad<any[]>("/policies");
  const catalog = useLoad<string[]>("/policies/catalog");
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<string[]>([]);

  return (
    <div>
      <PageHeader
        title="Access policies"
        subtitle="Reusable permission sets assignable to many users"
      />
      {error ? <Alert>{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {(data || []).map((p) => (
            <Card key={p.id} className="mb-3">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-slate-500">
                {p.permissions?.length || 0} permissions · {p._count?.assignments || 0} users
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(p.permissions || []).slice(0, 8).map((x: string) => (
                  <Badge key={x}>{x}</Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
        <Card title="Create policy">
          <div className="space-y-3">
            <Input placeholder="Policy name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="max-h-64 space-y-1 overflow-y-auto text-sm">
              {(catalog.data || []).map((p) => (
                <label key={p} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={perms.includes(p)}
                    onChange={(e) =>
                      setPerms((cur) =>
                        e.target.checked ? [...cur, p] : cur.filter((x) => x !== p),
                      )
                    }
                  />
                  {p}
                </label>
              ))}
            </div>
            <Button
              onClick={() =>
                void api("/policies", {
                  method: "POST",
                  body: JSON.stringify({ name, permissions: perms }),
                }).then(() => {
                  setName("");
                  setPerms([]);
                  reload();
                })
              }
            >
              Save policy
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function SettingsAdminPage() {
  const { settings, refresh, isConManager } = useAuth();
  const [form, setForm] = useState({
    conferenceName: "",
    hotelSoloNightLimit: 0,
    hotelRoommateNightLimit: 0,
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPassword: "",
    smtpFrom: "",
    smtpSecure: false,
  });
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!settings) return;
    setForm({
      conferenceName: settings.conferenceName || "",
      hotelSoloNightLimit: settings.hotelSoloNightLimit || 0,
      hotelRoommateNightLimit: settings.hotelRoommateNightLimit || 0,
      smtpHost: settings.smtpHost || "",
      smtpPort: settings.smtpPort || 587,
      smtpUser: settings.smtpUser || "",
      smtpPassword: settings.smtpPassword || "",
      smtpFrom: settings.smtpFrom || "",
      smtpSecure: !!settings.smtpSecure,
    });
    setFeatures(settings.globalFeatures || {});
  }, [settings]);

  if (!isConManager) return <Alert>Con Manager access required.</Alert>;

  async function save(e: FormEvent) {
    e.preventDefault();
    await api("/settings", {
      method: "PUT",
      body: JSON.stringify({ ...form, globalFeatures: features }),
    });
    setMsg("Settings saved");
    await refresh();
  }

  return (
    <div>
      <PageHeader title="System settings" subtitle="Conference config, SMTP, and feature toggles" />
      {msg ? <Alert tone="ok">{msg}</Alert> : null}
      <form className="grid gap-4 lg:grid-cols-2" onSubmit={save}>
        <Card title="Conference">
          <div className="space-y-3">
            <div>
              <Label>Conference name</Label>
              <Input
                value={form.conferenceName}
                onChange={(e) => setForm({ ...form, conferenceName: e.target.value })}
              />
            </div>
            <div>
              <Label>Hotel solo room-night limit</Label>
              <Input
                type="number"
                value={form.hotelSoloNightLimit}
                onChange={(e) =>
                  setForm({ ...form, hotelSoloNightLimit: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Hotel roommate room-night limit</Label>
              <Input
                type="number"
                value={form.hotelRoommateNightLimit}
                onChange={(e) =>
                  setForm({
                    ...form,
                    hotelRoommateNightLimit: Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
        </Card>
        <Card title="SMTP">
          <div className="space-y-3">
            <div>
              <Label>Host</Label>
              <Input
                value={form.smtpHost}
                onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
              />
            </div>
            <div>
              <Label>Port</Label>
              <Input
                type="number"
                value={form.smtpPort}
                onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>User</Label>
              <Input
                value={form.smtpUser}
                onChange={(e) => setForm({ ...form, smtpUser: e.target.value })}
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={form.smtpPassword}
                onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })}
              />
            </div>
            <div>
              <Label>From address</Label>
              <Input
                value={form.smtpFrom}
                onChange={(e) => setForm({ ...form, smtpFrom: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.smtpSecure}
                onChange={(e) => setForm({ ...form, smtpSecure: e.target.checked })}
              />
              TLS / secure
            </label>
          </div>
        </Card>
        <Card title="Global feature toggles" className="lg:col-span-2">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(features).map(([key, enabled]) => (
              <label key={key} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span className="capitalize">{key.replaceAll("_", " ")}</span>
                <input
                  type="checkbox"
                  checked={!!enabled}
                  onChange={(e) =>
                    setFeatures((f) => ({ ...f, [key]: e.target.checked }))
                  }
                />
              </label>
            ))}
          </div>
          <Button className="mt-4" type="submit">
            Save settings
          </Button>
        </Card>
      </form>
    </div>
  );
}
