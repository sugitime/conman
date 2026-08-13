import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Alert,
  Badge,
  Button,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type EntityKind = "todo" | "helpdesk" | "load_task";

type Message = {
  id: string;
  body: string;
  isInternal?: boolean;
  createdAt: string;
  author?: { id: string; name: string };
};

type Activity = {
  id: string;
  action: string;
  summary: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
  actor?: { id: string; name: string } | null;
};

type Person = { id: string; name: string };
type Dept = { id: string; name: string; color?: string };

type DetailPayload = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  messages?: Message[];
  activity?: Activity[];
  // todo
  priority?: string;
  dueAt?: string | null;
  assigneeId?: string | null;
  departmentId?: string | null;
  assignee?: Person | null;
  createdBy?: Person | null;
  department?: Dept | null;
  // helpdesk
  severity?: string;
  isIncident?: boolean;
  // load
  phase?: string;
  location?: string | null;
  startsAt?: string;
  endsAt?: string;
};

const KIND_META: Record<
  EntityKind,
  {
    getPath: (id: string) => string;
    patchPath: (id: string) => string;
    commentPath: (id: string) => string;
    label: string;
  }
> = {
  todo: {
    getPath: (id) => `/todos/${id}`,
    patchPath: (id) => `/todos/${id}`,
    commentPath: (id) => `/todos/${id}/comments`,
    label: "Todo",
  },
  helpdesk: {
    getPath: (id) => `/helpdesk/${id}`,
    patchPath: (id) => `/helpdesk/${id}`,
    commentPath: (id) => `/helpdesk/${id}/comments`,
    label: "Helpdesk ticket",
  },
  load_task: {
    getPath: (id) => `/load-schedule/${id}`,
    patchPath: (id) => `/load-schedule/${id}`,
    commentPath: (id) => `/load-schedule/${id}/comments`,
    label: "Load schedule task",
  },
};

function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FieldChange({
  name,
  from,
  to,
}: {
  name: string;
  from: unknown;
  to: unknown;
}) {
  return (
    <div className="text-xs text-slate-500">
      <span className="font-medium text-slate-600">{name}</span>:{" "}
      <span className="line-through opacity-70">{String(from ?? "—")}</span>
      {" → "}
      <span className="text-slate-800">{String(to ?? "—")}</span>
    </div>
  );
}

export function EntityDetailModal({
  kind,
  id,
  open,
  onClose,
  onSaved,
  departments,
  users,
}: {
  kind: EntityKind;
  id: string | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  departments?: Dept[];
  users?: Person[];
}) {
  const meta = KIND_META[kind];
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"details" | "messages" | "log">("details");
  const [messageBody, setMessageBody] = useState("");
  const [internalOnly, setInternalOnly] = useState(false);

  // editable form
  const [form, setForm] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const d = await api<DetailPayload>(meta.getPath(id));
      setDetail(d);
      setForm({
        title: d.title || "",
        description: d.description || "",
        status: d.status || "",
        priority: d.priority || "MEDIUM",
        severity: d.severity || "MEDIUM",
        assigneeId: d.assigneeId || d.assignee?.id || "",
        departmentId: d.departmentId || d.department?.id || "",
        dueAt: d.dueAt ? d.dueAt.slice(0, 16) : "",
        phase: d.phase || "LOAD_IN",
        location: d.location || "",
        startsAt: toLocalInput(d.startsAt),
        endsAt: toLocalInput(d.endsAt),
      });
    } catch (e) {
      setError((e as { message?: string }).message || "Failed to load");
    }
  }, [id, meta]);

  useEffect(() => {
    if (open && id) {
      setTab("details");
      setMessageBody("");
      setMsg("");
      void load();
    } else {
      setDetail(null);
    }
  }, [open, id, load]);

  async function saveDetails(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const body: Record<string, unknown> = {
        title: form.title,
        description: form.description || null,
        status: form.status,
      };
      if (kind === "todo") {
        body.priority = form.priority;
        body.assigneeId = form.assigneeId || null;
        body.departmentId = form.departmentId || null;
        body.dueAt = form.dueAt ? new Date(form.dueAt).toISOString() : null;
      }
      if (kind === "helpdesk") {
        body.severity = form.severity;
        body.assigneeId = form.assigneeId || null;
      }
      if (kind === "load_task") {
        body.phase = form.phase;
        body.location = form.location || null;
        body.assigneeId = form.assigneeId || null;
        body.departmentId = form.departmentId || undefined;
        if (form.startsAt) body.startsAt = new Date(form.startsAt).toISOString();
        if (form.endsAt) body.endsAt = new Date(form.endsAt).toISOString();
      }
      await api(meta.patchPath(id), {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setMsg("Saved");
      await load();
      onSaved?.();
    } catch (err) {
      setError((err as { message?: string }).message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!id || !messageBody.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(meta.commentPath(id), {
        method: "POST",
        body: JSON.stringify({
          body: messageBody,
          ...(kind === "helpdesk" ? { isInternal: internalOnly } : {}),
        }),
      });
      setMessageBody("");
      setInternalOnly(false);
      await load();
      setTab("messages");
      onSaved?.();
    } catch (err) {
      setError((err as { message?: string }).message || "Message failed");
    } finally {
      setBusy(false);
    }
  }

  const statusOptions =
    kind === "todo"
      ? ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]
      : kind === "helpdesk"
        ? ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]
        : ["PLANNED", "IN_PROGRESS", "DONE", "BLOCKED", "CANCELLED"];

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={detail?.title || meta.label}
      subtitle={
        detail
          ? `${meta.label} · ${detail.status}${
              detail.department?.name ? ` · ${detail.department.name}` : ""
            }`
          : meta.label
      }
    >
      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {msg ? (
        <div className="mb-3">
          <Alert tone="ok">{msg}</Alert>
        </div>
      ) : null}

      {!detail ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                ["details", "Details"],
                ["messages", `Messages (${detail.messages?.length || 0})`],
                ["log", `Change log (${detail.activity?.length || 0})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition",
                  tab === key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "details" ? (
            <form className="space-y-3" onSubmit={saveDetails}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Title</Label>
                  <Input
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value }))
                    }
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </div>
                {kind === "todo" ? (
                  <div>
                    <Label>Priority</Label>
                    <Select
                      value={form.priority}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, priority: e.target.value }))
                      }
                    >
                      {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                {kind === "helpdesk" ? (
                  <div>
                    <Label>Severity</Label>
                    <Select
                      value={form.severity}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, severity: e.target.value }))
                      }
                    >
                      {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                {kind === "load_task" ? (
                  <div>
                    <Label>Phase</Label>
                    <Select
                      value={form.phase}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, phase: e.target.value }))
                      }
                    >
                      <option value="LOAD_IN">Load-in</option>
                      <option value="LOAD_OUT">Load-out</option>
                    </Select>
                  </div>
                ) : null}
                {kind === "todo" ? (
                  <div>
                    <Label>Due</Label>
                    <Input
                      type="datetime-local"
                      value={form.dueAt}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, dueAt: e.target.value }))
                      }
                    />
                  </div>
                ) : null}
                {kind === "load_task" ? (
                  <>
                    <div>
                      <Label>Starts</Label>
                      <Input
                        type="datetime-local"
                        value={form.startsAt}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, startsAt: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Ends</Label>
                      <Input
                        type="datetime-local"
                        value={form.endsAt}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, endsAt: e.target.value }))
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Location</Label>
                      <Input
                        value={form.location}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, location: e.target.value }))
                        }
                      />
                    </div>
                  </>
                ) : null}
                {departments?.length ? (
                  <div>
                    <Label>Department</Label>
                    <Select
                      value={form.departmentId}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          departmentId: e.target.value,
                        }))
                      }
                    >
                      {kind === "todo" ? (
                        <option value="">None / personal</option>
                      ) : null}
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                {users?.length ? (
                  <div>
                    <Label>Assignee</Label>
                    <Select
                      value={form.assigneeId}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, assigneeId: e.target.value }))
                      }
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : detail.assignee ? (
                  <div>
                    <Label>Assignee</Label>
                    <p className="text-sm text-slate-700">
                      {detail.assignee.name}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                {detail.createdBy ? (
                  <span>Created by {detail.createdBy.name}</span>
                ) : null}
                {detail.isIncident ? <Badge tone="rose">Incident</Badge> : null}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Close
                </Button>
                <Button type="submit" disabled={busy}>
                  Save changes
                </Button>
              </div>
            </form>
          ) : null}

          {tab === "messages" ? (
            <div className="space-y-4">
              <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-slate-100 p-3">
                {(detail.messages || []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">
                    No messages yet. Start the conversation below.
                  </p>
                ) : (
                  (detail.messages || []).map((m) => (
                    <div
                      key={m.id}
                      className="rounded-lg bg-slate-50 px-3 py-2"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">
                          {m.author?.name || "Someone"}
                        </span>
                        <span>{formatDate(m.createdAt)}</span>
                        {m.isInternal ? (
                          <Badge tone="amber">Internal</Badge>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-slate-800">
                        {m.body}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <form className="space-y-2" onSubmit={sendMessage}>
                <Label>Add message</Label>
                <Textarea
                  rows={3}
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Write an update for the team…"
                  required
                />
                {kind === "helpdesk" ? (
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={internalOnly}
                      onChange={(e) => setInternalOnly(e.target.checked)}
                    />
                    Internal note (staff only)
                  </label>
                ) : null}
                <Button type="submit" disabled={busy || !messageBody.trim()}>
                  Post message
                </Button>
              </form>
            </div>
          ) : null}

          {tab === "log" ? (
            <div className="space-y-3">
              {(detail.activity || []).length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  No changes recorded yet.
                </p>
              ) : (
                (detail.activity || []).map((a) => (
                  <div
                    key={a.id}
                    className="rounded-xl border border-slate-100 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          a.action === "created"
                            ? "green"
                            : a.action === "commented"
                              ? "sky"
                              : a.action.includes("status")
                                ? "amber"
                                : "slate"
                        }
                      >
                        {a.action}
                      </Badge>
                      <span className="text-sm text-slate-800">{a.summary}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatDate(a.createdAt)}
                      {a.actor?.name ? ` · ${a.actor.name}` : ""}
                    </div>
                    {a.changes ? (
                      <div className="mt-2 space-y-0.5 border-t border-slate-50 pt-2">
                        {Object.entries(a.changes).map(([k, v]) => (
                          <FieldChange
                            key={k}
                            name={k}
                            from={v.from}
                            to={v.to}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}

