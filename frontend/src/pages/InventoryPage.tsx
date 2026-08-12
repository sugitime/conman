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

type Item = {
  id: string;
  name: string;
  assetCode: string;
  status: string;
  category?: string;
  location?: string;
  serialNumber?: string;
  checkedOutTo?: { id: string; name: string };
  checkedOutAt?: string;
  expectedReturnAt?: string;
  department?: { name: string };
};

/** Minimal QR as SVG using Google Chart API alternative — local matrix via API code text */
function QrBlock({ value }: { value: string }) {
  // Use a free QR image endpoint; printable
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(value)}`;
  return (
    <div className="inline-flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-2">
      <img src={src} alt={`QR ${value}`} width={120} height={120} />
      <code className="text-[10px] font-medium text-slate-600">{value}</code>
    </div>
  );
}

export function InventoryPage() {
  const { isConManager } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [dashboard, setDashboard] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [scan, setScan] = useState("");
  const [mode, setMode] = useState<"out" | "in">("out");
  const [bulk, setBulk] = useState("");
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    category: "",
    serialNumber: "",
    location: "",
  });
  const [msg, setMsg] = useState("");

  async function reload() {
    const [list, dash] = await Promise.all([
      api<Item[]>("/inventory"),
      api<Item[]>("/inventory/dashboard"),
    ]);
    setItems(list);
    setDashboard(dash);
  }

  useEffect(() => {
    void reload().catch((e) => setError(e.message));
    if (isConManager) {
      void api<{ id: string; name: string }[]>("/users")
        .then(setUsers)
        .catch(() => undefined);
    }
  }, [isConManager]);

  async function createItem(e: FormEvent) {
    e.preventDefault();
    await api("/inventory", { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", category: "", serialNumber: "", location: "" });
    setMsg("Item created");
    await reload();
  }

  async function doScan(e: FormEvent) {
    e.preventDefault();
    const codes = scan
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!codes.length) return;
    const path = mode === "out" ? "/inventory/checkout" : "/inventory/checkin";
    const res = await api<{ code: string; ok: boolean; error?: string }[]>(path, {
      method: "POST",
      body: JSON.stringify({
        codes,
        userId: mode === "out" ? userId || undefined : undefined,
        notes: bulk || undefined,
      }),
    });
    const failed = res.filter((r) => !r.ok);
    setMsg(
      failed.length
        ? `Done with errors: ${failed.map((f) => `${f.code}: ${f.error}`).join("; ")}`
        : `Successfully processed ${res.length} item(s)`,
    );
    setScan("");
    await reload();
  }

  const available = useMemo(
    () => items.filter((i) => i.status === "AVAILABLE").length,
    [items],
  );

  return (
    <div>
      <PageHeader
        title="Inventory / Assets"
        subtitle="QR check-out, check-in, and real-time status"
        actions={
          <div className="flex gap-2 text-sm text-slate-600">
            <Badge tone="green">{available} available</Badge>
            <Badge tone="amber">{dashboard.length} out</Badge>
          </div>
        }
      />
      {error ? <Alert>{error}</Alert> : null}
      {msg ? <Alert tone="ok">{msg}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Scan check-out / check-in" className="lg:col-span-2">
          <form className="space-y-3" onSubmit={doScan}>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "out" ? "primary" : "secondary"}
                onClick={() => setMode("out")}
              >
                Check out
              </Button>
              <Button
                type="button"
                variant={mode === "in" ? "primary" : "secondary"}
                onClick={() => setMode("in")}
              >
                Check in
              </Button>
            </div>
            <div>
              <Label>Scan or type asset code(s) — comma/space for bulk</Label>
              <Input
                autoFocus
                placeholder="INV-RAD-001"
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                Phone camera QR apps or USB barcode scanners paste into this field.
              </p>
            </div>
            {mode === "out" ? (
              <div>
                <Label>Check out to user (optional id)</Label>
                {users.length ? (
                  <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                    <option value="">Select user…</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    placeholder="User ID"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                  />
                )}
              </div>
            ) : null}
            <div>
              <Label>Notes</Label>
              <Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={2} />
            </div>
            <Button type="submit">{mode === "out" ? "Check out" : "Check in"}</Button>
          </form>
        </Card>

        <Card title="Add asset">
          <form className="space-y-3" onSubmit={createItem}>
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div>
              <Label>Serial</Label>
              <Input
                value={form.serialNumber}
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
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

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Currently checked out">
          {!dashboard.length ? <Empty>Nothing checked out.</Empty> : null}
          <ul className="space-y-3">
            {dashboard.map((i) => (
              <li key={i.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                <div className="font-medium">{i.name}</div>
                <div className="text-xs text-slate-500">
                  {i.checkedOutTo?.name || "Unknown"} · since {formatDate(i.checkedOutAt)}
                </div>
                <code className="text-[11px]">{i.assetCode}</code>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="All items + printable QR">
          {!items.length ? <Empty>No inventory yet.</Empty> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((i) => (
              <div key={i.id} className="rounded-xl border border-slate-100 p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-slate-500">
                      {i.category || "Uncategorized"} · {i.location || "—"}
                    </div>
                  </div>
                  <Badge
                    tone={
                      i.status === "AVAILABLE"
                        ? "green"
                        : i.status === "CHECKED_OUT"
                          ? "amber"
                          : "rose"
                    }
                  >
                    {i.status}
                  </Badge>
                </div>
                <QrBlock value={i.assetCode} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function InventoryScanPage() {
  // Mobile-optimized scan UI
  return (
    <div className="mx-auto max-w-md">
      <InventoryPage />
    </div>
  );
}
