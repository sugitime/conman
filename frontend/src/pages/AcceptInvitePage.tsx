import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Alert, Button, Card, Input, Label, PageHeader } from "@/components/ui";

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.get("token") || "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{ accessToken: string }>("/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify({ token, name, password }),
      });
      localStorage.setItem("conman_token", res.accessToken);
      navigate("/");
      window.location.reload();
    } catch (err) {
      setError((err as { message?: string }).message || "Invite failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-8">
      <PageHeader
        title="Accept invite"
        subtitle="Create your ConMan account from an invitation link."
      />
      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? <Alert>{error}</Alert> : null}
          <div>
            <Label>Invite token</Label>
            <Input value={token} onChange={(e) => setToken(e.target.value)} required />
          </div>
          <div>
            <Label>Your name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <Button disabled={loading}>{loading ? "Creating…" : "Create account"}</Button>
        </form>
      </Card>
    </div>
  );
}
