import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth, type ConferenceSummary } from "@/lib/auth";
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Label,
  PageHeader,
  Textarea,
} from "@/components/ui";

type CloneCopy = {
  settings: boolean;
  departments: boolean;
  departmentMembers: boolean;
  policies: boolean;
  rooms: boolean;
  badgeTypes: boolean;
  bible: boolean;
  radio: boolean;
  orgChart: boolean;
  vendors: boolean;
  loadSchedule: boolean;
  calendar: boolean;
  shifts: boolean;
  runOfShow: boolean;
  surveys: boolean;
  inventory: boolean;
  documents: boolean;
  dateShiftDays: number;
};

const DEFAULT_COPY: CloneCopy = {
  settings: true,
  departments: true,
  departmentMembers: false,
  policies: true,
  rooms: true,
  badgeTypes: true,
  bible: true,
  radio: true,
  orgChart: true,
  vendors: true,
  loadSchedule: true,
  calendar: false,
  shifts: false,
  runOfShow: false,
  surveys: true,
  inventory: true,
  documents: false,
  dateShiftDays: 365,
};

const COPY_LABELS: { key: keyof Omit<CloneCopy, "dateShiftDays">; label: string; hint: string }[] = [
  { key: "settings", label: "Settings & features", hint: "Hotel limits, SMTP, feature toggles" },
  { key: "departments", label: "Departments", hint: "Dept structure, colors, feature flags" },
  { key: "departmentMembers", label: "Department members", hint: "Copy staff assignments into the new con" },
  { key: "policies", label: "Access policies", hint: "Named permission bundles" },
  { key: "rooms", label: "Rooms", hint: "Room catalog (not bookings)" },
  { key: "badgeTypes", label: "Badge types", hint: "Badge definitions (not assignments)" },
  { key: "bible", label: "Con Bible pages", hint: "Ops handbook pages" },
  { key: "radio", label: "Radio channels", hint: "Channel plan" },
  { key: "orgChart", label: "Org chart", hint: "Structure (people links preserved when possible)" },
  { key: "vendors", label: "Vendors", hint: "Vendor directory" },
  { key: "loadSchedule", label: "Load In / Load Out", hint: "Timeline tasks (status reset to Planned)" },
  { key: "calendar", label: "Calendar events", hint: "Dept & master events" },
  { key: "shifts", label: "Shifts", hint: "Shift templates (no signups)" },
  { key: "runOfShow", label: "Run of show", hint: "Cue sheet items" },
  { key: "surveys", label: "Surveys / templates", hint: "Forms (no responses)" },
  { key: "inventory", label: "Inventory catalog", hint: "Assets reset to Available; new asset codes" },
  { key: "documents", label: "Documents", hint: "Metadata / external links only" },
];

export function ConferencesPage() {
  const { isConManager, conferences, activeConference, switchConference, refresh } =
    useAuth();
  const [list, setList] = useState<ConferenceSummary[]>(conferences);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Create form
  const [createName, setCreateName] = useState("");
  const [createYear, setCreateYear] = useState(String(new Date().getFullYear()));
  const [createDesc, setCreateDesc] = useState("");

  // Clone form
  const [cloneSourceId, setCloneSourceId] = useState(activeConference?.id || "");
  const [cloneName, setCloneName] = useState("");
  const [cloneYear, setCloneYear] = useState(
    String(new Date().getFullYear() + 1),
  );
  const [copy, setCopy] = useState<CloneCopy>({ ...DEFAULT_COPY });

  useEffect(() => {
    setList(conferences);
    if (!cloneSourceId && conferences[0]) {
      setCloneSourceId(conferences[0].id);
    }
  }, [conferences, cloneSourceId]);

  const source = useMemo(
    () => list.find((c) => c.id === cloneSourceId),
    [list, cloneSourceId],
  );

  useEffect(() => {
    if (source && !cloneName) {
      setCloneName(
        source.year
          ? `${source.name.replace(/\s+\d{4}$/, "")} ${Number(source.year) + 1}`
          : `${source.name} (copy)`,
      );
      if (source.year) setCloneYear(String(source.year + 1));
    }
  }, [source, cloneName]);

  async function reload() {
    const cons = await api<ConferenceSummary[]>("/conferences");
    setList(cons);
    await refresh();
  }

  async function createCon(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const created = await api<ConferenceSummary>("/conferences", {
        method: "POST",
        body: JSON.stringify({
          name: createName,
          year: createYear ? Number(createYear) : undefined,
          description: createDesc || undefined,
        }),
      });
      setMsg(`Created ${created.name}`);
      setCreateName("");
      setCreateDesc("");
      await reload();
      await switchConference(created.id);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function cloneCon(e: FormEvent) {
    e.preventDefault();
    if (!cloneSourceId) return;
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const created = await api<ConferenceSummary>(
        `/conferences/${cloneSourceId}/clone`,
        {
          method: "POST",
          body: JSON.stringify({
            name: cloneName,
            year: cloneYear ? Number(cloneYear) : undefined,
            copy,
          }),
        },
      );
      setMsg(
        `Duplicated into “${created.name}” (${created._count?.departments ?? "?"} departments)`,
      );
      await reload();
      await switchConference(created.id);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Clone failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleCopy(key: keyof Omit<CloneCopy, "dateShiftDays">) {
    setCopy((c) => ({ ...c, [key]: !c[key] }));
  }

  function selectStructureOnly() {
    setCopy({
      ...DEFAULT_COPY,
      departmentMembers: false,
      calendar: false,
      shifts: false,
      runOfShow: false,
      loadSchedule: true,
      inventory: true,
      documents: false,
    });
  }

  function selectAll() {
    const next = { ...copy };
    for (const { key } of COPY_LABELS) next[key] = true;
    setCopy(next);
  }

  function selectNone() {
    const next = { ...copy };
    for (const { key } of COPY_LABELS) next[key] = false;
    setCopy(next);
  }

  if (!isConManager) {
    return (
      <div>
        <PageHeader
          title="Conferences"
          subtitle="Your conference memberships"
        />
        <div className="space-y-3">
          {list.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {c.name}
                    {c.year ? (
                      <span className="ml-2 text-slate-500">{c.year}</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-slate-500">{c.slug}</div>
                </div>
                {activeConference?.id === c.id ? (
                  <Badge>Active</Badge>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void switchConference(c.id)}
                  >
                    Switch
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {!list.length ? <Empty>No conferences assigned.</Empty> : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Conferences"
        subtitle="Create multiple cons and duplicate year-to-year with selective copy"
      />
      {error ? <Alert>{error}</Alert> : null}
      {msg ? <Alert tone="ok">{msg}</Alert> : null}

      <div className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Your cons
        </h2>
        {list.map((c) => (
          <Card key={c.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {c.name}
                  {c.year ? (
                    <span className="text-slate-500">{c.year}</span>
                  ) : null}
                  {c.isArchived ? <Badge>Archived</Badge> : null}
                  {activeConference?.id === c.id ? (
                    <Badge>Active</Badge>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500">
                  {c.slug}
                  {c._count
                    ? ` · ${c._count.departments} depts · ${c._count.members} members`
                    : ""}
                </div>
              </div>
              <div className="flex gap-2">
                {activeConference?.id !== c.id ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void switchConference(c.id)}
                  >
                    Switch to this con
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setCloneSourceId(c.id);
                    setCloneName(
                      c.year
                        ? `${c.name.replace(/\s+\d{4}$/, "")} ${Number(c.year) + 1}`
                        : `${c.name} (copy)`,
                    );
                    if (c.year) setCloneYear(String(c.year + 1));
                    document
                      .getElementById("clone-panel")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Duplicate…
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {!list.length ? <Empty>No conferences yet — create one below.</Empty> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Create blank conference">
          <form className="space-y-3" onSubmit={createCon}>
            <div>
              <Label>Name</Label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="DEF CON"
                required
              />
            </div>
            <div>
              <Label>Year</Label>
              <Input
                type="number"
                value={createYear}
                onChange={(e) => setCreateYear(e.target.value)}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                rows={2}
              />
            </div>
            <Button type="submit" disabled={busy}>
              Create conference
            </Button>
          </form>
        </Card>

        <Card title="Duplicate conference (year-to-year)" id="clone-panel">
          <form className="space-y-4" onSubmit={cloneCon}>
            <div>
              <Label>Source con</Label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={cloneSourceId}
                onChange={(e) => {
                  setCloneSourceId(e.target.value);
                  setCloneName("");
                }}
                required
              >
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.year ? ` (${c.year})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>New name</Label>
                <Input
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>New year</Label>
                <Input
                  type="number"
                  value={cloneYear}
                  onChange={(e) => setCloneYear(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Label>What to copy</Label>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className="text-indigo-600 hover:underline"
                    onClick={selectStructureOnly}
                  >
                    Structure defaults
                  </button>
                  <button
                    type="button"
                    className="text-indigo-600 hover:underline"
                    onClick={selectAll}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="text-indigo-600 hover:underline"
                    onClick={selectNone}
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-100 p-3">
                {COPY_LABELS.map(({ key, label, hint }) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-start gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={copy[key]}
                      onChange={() => toggleCopy(key)}
                    />
                    <span>
                      <span className="font-medium text-slate-800">{label}</span>
                      <span className="block text-xs text-slate-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label>Shift timeline dates by (days)</Label>
              <Input
                type="number"
                value={copy.dateShiftDays}
                onChange={(e) =>
                  setCopy((c) => ({
                    ...c,
                    dateShiftDays: Number(e.target.value) || 0,
                  }))
                }
              />
              <p className="mt-1 text-xs text-slate-500">
                Applied to load schedule, calendar, shifts, and run-of-show when
                those are selected. Use ~365 for the next annual con.
              </p>
            </div>

            <Button type="submit" disabled={busy || !cloneSourceId}>
              Duplicate conference
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
