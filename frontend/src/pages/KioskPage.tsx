import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alert, Button, Card, Input, Label, PageHeader } from "@/components/ui";

export function KioskPage() {
  const [email, setEmail] = useState("");
  const [badgeCode, setBadgeCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [onSite, setOnSite] = useState<
    { id: string; user: { name: string; email: string }; checkedInAt: string }[]
  >([]);

  async function reload() {
    try {
      const s = await api<typeof onSite>("/kiosk/status");
      setOnSite(s);
    } catch {
      /* optional auth */
    }
  }

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 15000);
    return () => clearInterval(t);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const res = await api<{
        checkedOutAt?: string | null;
        user: { name: string };
      }>("/kiosk/check-in", {
        method: "POST",
        body: JSON.stringify({
          email: email || undefined,
          badgeCode: badgeCode || undefined,
          method: "kiosk",
        }),
      });
      setMessage(
        res.checkedOutAt
          ? `Checked out: ${res.user.name}`
          : `Checked in: ${res.user.name}`,
      );
      setEmail("");
      setBadgeCode("");
      await reload();
    } catch (err) {
      setError((err as { message?: string }).message || "Check-in failed");
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Staff check-in kiosk"
        subtitle="Tablet-friendly · scan badge code or enter email"
      />
      <Card>
        <form className="space-y-4" onSubmit={submit}>
          {error ? <Alert>{error}</Alert> : null}
          {message ? <Alert tone="ok">{message}</Alert> : null}
          <div>
            <Label>Email</Label>
            <Input
              className="text-lg"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <Label>Or badge / QR code</Label>
            <Input
              className="text-lg"
              value={badgeCode}
              onChange={(e) => setBadgeCode(e.target.value)}
              placeholder="Scan badge"
              autoFocus
            />
          </div>
          <Button className="w-full py-3 text-base" type="submit">
            Check in / Check out
          </Button>
        </form>
      </Card>
      <Card className="mt-4" title={`On site now (${onSite.length})`}>
        <ul className="space-y-2 text-sm">
          {onSite.map((s) => (
            <li key={s.id} className="flex justify-between border-b border-slate-50 py-2">
              <span>{s.user.name}</span>
              <span className="text-xs text-slate-500">
                {new Date(s.checkedInAt).toLocaleTimeString()}
              </span>
            </li>
          ))}
          {!onSite.length ? (
            <li className="text-slate-500">No one checked in.</li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}
