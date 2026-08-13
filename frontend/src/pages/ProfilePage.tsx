import { FormEvent, useEffect, useMemo, useState } from "react";
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

type ChannelPrefs = { inApp: boolean; email: boolean };
type NotificationPrefs = {
  channels: ChannelPrefs;
  events: Record<string, ChannelPrefs>;
};
type CatalogEvent = { key: string; label: string; group: string };

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
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [catalog, setCatalog] = useState<CatalogEvent[]>([]);
  const [prefsMsg, setPrefsMsg] = useState("");
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
      api<NotificationPrefs>("/notifications/prefs"),
      api<{ events: CatalogEvent[] }>("/notifications/catalog"),
    ])
      .then(([p, r, pr, cat]) => {
        setProfile(p);
        setRoommates(r);
        setPrefs(pr);
        setCatalog(cat.events || []);
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

  const eventsByGroup = useMemo(() => {
    const map = new Map<string, CatalogEvent[]>();
    for (const e of catalog) {
      const list = map.get(e.group) || [];
      list.push(e);
      map.set(e.group, list);
    }
    return Array.from(map.entries());
  }, [catalog]);

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

  async function savePrefs() {
    if (!prefs) return;
    setPrefsMsg("");
    try {
      const next = await api<NotificationPrefs>("/notifications/prefs", {
        method: "PATCH",
        body: JSON.stringify(prefs),
      });
      setPrefs(next);
      setPrefsMsg("Notification preferences saved");
    } catch (err) {
      setError((err as { message?: string }).message || "Failed to save prefs");
    }
  }

  function setChannel(key: "inApp" | "email", value: boolean) {
    if (!prefs) return;
    setPrefs({
      ...prefs,
      channels: { ...prefs.channels, [key]: value },
    });
  }

  function setEventChannel(
    eventKey: string,
    channel: "inApp" | "email",
    value: boolean,
  ) {
    if (!prefs) return;
    const current = prefs.events[eventKey] || { inApp: true, email: false };
    setPrefs({
      ...prefs,
      events: {
        ...prefs.events,
        [eventKey]: { ...current, [channel]: value },
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="My profile"
        subtitle="Hotel, roommate, emergency contacts, dietary notes, and notifications"
      />
      {error ? <Alert>{error}</Alert> : null}
      {msg ? <Alert tone="ok">{msg}</Alert> : null}
      {prefsMsg ? <Alert tone="ok">{prefsMsg}</Alert> : null}
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

      <div id="notifications" className="mt-8 scroll-mt-8">
        <PageHeader
          title="Notification settings"
          subtitle="Choose what you want to hear about and how (in-app and/or email)"
        />
        {prefs ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Channels">
              <div className="space-y-3 text-sm">
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-medium text-slate-800">In-app</span>
                    <span className="block text-xs text-slate-500">
                      Bell icon notifications while you use ConMan
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={prefs.channels.inApp}
                    onChange={(e) => setChannel("inApp", e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-medium text-slate-800">Email</span>
                    <span className="block text-xs text-slate-500">
                      Sent when SMTP is configured for the conference
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={prefs.channels.email}
                    onChange={(e) => setChannel("email", e.target.checked)}
                  />
                </label>
                <p className="text-xs text-slate-500">
                  Master channel switches apply first; then each event below.
                </p>
              </div>
            </Card>

            <Card title="Events" className="lg:col-span-2">
              <div className="space-y-5">
                {eventsByGroup.map(([group, events]) => (
                  <div key={group}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {group}
                    </h3>
                    <div className="overflow-hidden rounded-xl border border-slate-100">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">Notify me when…</th>
                            <th className="w-20 px-2 py-2 text-center font-medium">
                              In-app
                            </th>
                            <th className="w-20 px-2 py-2 text-center font-medium">
                              Email
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {events.map((ev) => {
                            const ep = prefs.events[ev.key] || {
                              inApp: true,
                              email: false,
                            };
                            return (
                              <tr
                                key={ev.key}
                                className="border-t border-slate-50"
                              >
                                <td className="px-3 py-2 text-slate-800">
                                  {ev.label}
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={ep.inApp}
                                    disabled={!prefs.channels.inApp}
                                    onChange={(e) =>
                                      setEventChannel(
                                        ev.key,
                                        "inApp",
                                        e.target.checked,
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={ep.email}
                                    disabled={!prefs.channels.email}
                                    onChange={(e) =>
                                      setEventChannel(
                                        ev.key,
                                        "email",
                                        e.target.checked,
                                      )
                                    }
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                <Button type="button" onClick={() => void savePrefs()}>
                  Save notification settings
                </Button>
              </div>
            </Card>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Loading preferences…</p>
        )}
      </div>
    </div>
  );
}
