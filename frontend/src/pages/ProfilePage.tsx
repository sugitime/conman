import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";

type Profile = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  pronouns?: string;
  hotelCheckIn?: string;
  hotelCheckOut?: string;
  roommateId?: string;
  roommate?: { id: string; name: string };
  shirtSize?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  dietaryNotes?: string;
  medicalNotes?: string;
  hotelCompliant?: boolean;
  hotelWarning?: string | null;
  profileComplete?: boolean;
  badgeAssignments?: { badgeType: { name: string; color: string } }[];
};

export function ProfilePage() {
  const { refresh } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roommates, setRoommates] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    title: "",
    pronouns: "",
    hotelCheckIn: "",
    hotelCheckOut: "",
    roommateId: "",
    shirtSize: "",
    emergencyName: "",
    emergencyPhone: "",
    dietaryNotes: "",
    medicalNotes: "",
  });

  useEffect(() => {
    void Promise.all([
      api<Profile>("/profile"),
      api<{ id: string; name: string }[]>("/profile-roommates"),
    ])
      .then(([p, r]) => {
        setProfile(p);
        setRoommates(r);
        setForm({
          name: p.name || "",
          phone: p.phone || "",
          title: p.title || "",
          pronouns: p.pronouns || "",
          hotelCheckIn: p.hotelCheckIn ? p.hotelCheckIn.slice(0, 10) : "",
          hotelCheckOut: p.hotelCheckOut ? p.hotelCheckOut.slice(0, 10) : "",
          roommateId: p.roommateId || "",
          shirtSize: p.shirtSize || "",
          emergencyName: p.emergencyName || "",
          emergencyPhone: p.emergencyPhone || "",
          dietaryNotes: p.dietaryNotes || "",
          medicalNotes: p.medicalNotes || "",
        });
      })
      .catch((e) => setError(e.message));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const p = await api<Profile>("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          hotelCheckIn: form.hotelCheckIn || null,
          hotelCheckOut: form.hotelCheckOut || null,
          roommateId: form.roommateId || null,
          shirtSize: form.shirtSize || null,
        }),
      });
      setProfile(p);
      setMsg("Profile saved. Hotel dates sync with roommate when set.");
      await refresh();
    } catch (err) {
      setError((err as { message?: string }).message || "Save failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="My profile"
        subtitle="Hotel, roommate, emergency contacts, and dietary notes"
      />
      {error ? <Alert>{error}</Alert> : null}
      {msg ? <Alert tone="ok">{msg}</Alert> : null}
      {profile && !profile.hotelCompliant ? (
        <Alert>{profile.hotelWarning || "Hotel stay out of compliance"}</Alert>
      ) : null}
      {profile?.hotelCompliant ? (
        <div className="mb-4">
          <Badge tone="green">Hotel compliant</Badge>
        </div>
      ) : null}

      <form className="grid gap-4 lg:grid-cols-2" onSubmit={save}>
        <Card title="Basics">
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={profile?.email || ""} disabled />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Pronouns</Label>
              <Input
                value={form.pronouns}
                onChange={(e) => setForm({ ...form, pronouns: e.target.value })}
              />
            </div>
            <div>
              <Label>T-shirt size</Label>
              <Select
                value={form.shirtSize}
                onChange={(e) => setForm({ ...form, shirtSize: e.target.value })}
              >
                <option value="">—</option>
                {["XS", "S", "M", "L", "XL", "XXL", "XXXL"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </div>
          </div>
        </Card>

        <Card title="Hotel">
          <div className="space-y-3">
            <div>
              <Label>Check-in</Label>
              <Input
                type="date"
                value={form.hotelCheckIn}
                onChange={(e) => setForm({ ...form, hotelCheckIn: e.target.value })}
              />
            </div>
            <div>
              <Label>Check-out</Label>
              <Input
                type="date"
                value={form.hotelCheckOut}
                onChange={(e) => setForm({ ...form, hotelCheckOut: e.target.value })}
              />
            </div>
            <div>
              <Label>Roommate (same department)</Label>
              <Select
                value={form.roommateId}
                onChange={(e) => setForm({ ...form, roommateId: e.target.value })}
              >
                <option value="">None (solo)</option>
                {roommates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-500">
                Dates sync both ways. Solo vs roommate night limits are set by Con Manager.
              </p>
            </div>
          </div>
        </Card>

        <Card title="Emergency & medical (privacy-controlled)">
          <div className="space-y-3">
            <div>
              <Label>Emergency contact name</Label>
              <Input
                value={form.emergencyName}
                onChange={(e) => setForm({ ...form, emergencyName: e.target.value })}
              />
            </div>
            <div>
              <Label>Emergency phone</Label>
              <Input
                value={form.emergencyPhone}
                onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })}
              />
            </div>
            <div>
              <Label>Dietary notes</Label>
              <Textarea
                value={form.dietaryNotes}
                onChange={(e) => setForm({ ...form, dietaryNotes: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <Label>Medical notes</Label>
              <Textarea
                value={form.medicalNotes}
                onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
        </Card>

        <Card title="Badges">
          <div className="flex flex-wrap gap-2">
            {(profile?.badgeAssignments || []).map((b, i) => (
              <Badge key={i} tone="indigo">
                {b.badgeType.name}
              </Badge>
            ))}
            {!profile?.badgeAssignments?.length ? (
              <p className="text-sm text-slate-500">No badges assigned yet.</p>
            ) : null}
          </div>
          <Button className="mt-4" type="submit">
            Save profile
          </Button>
        </Card>
      </form>
    </div>
  );
}
