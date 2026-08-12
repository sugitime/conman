/**
 * Populate ConMan with DEF CON–oriented demo data via the HTTP API.
 *
 * Usage:
 *   npx tsx scripts/seed-sample-via-api.ts
 *
 * Env:
 *   API_URL   default https://conman-api.onrender.com
 *   EMAIL     default admin@conman.local
 *   PASSWORD  default changeme123
 */

import { DEFCON_DEPARTMENTS } from "../src/common/defcon-departments";

const API = (process.env.API_URL || "https://conman-api.onrender.com").replace(
  /\/$/,
  "",
);
const EMAIL = process.env.EMAIL || "admin@conman.local";
const PASSWORD = process.env.PASSWORD || "changeme123";

async function api<T = unknown>(
  path: string,
  opts: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(opts.headers || {});
  if (!(opts.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);
  const res = await fetch(`${API}/api${path}`, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${opts.method || "GET"} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function daysFromNow(d: number, hour = 10) {
  const x = new Date();
  x.setDate(x.getDate() + d);
  x.setHours(hour, 0, 0, 0);
  return x.toISOString();
}

function hoursFrom(base: Date, h: number) {
  return new Date(base.getTime() + h * 3600_000).toISOString();
}

async function main() {
  console.log(`Seeding DEF CON sample data on ${API} as ${EMAIL}...`);
  const login = await api<{ accessToken: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const token = login.accessToken;

  // ── Conference name ──────────────────────────────────────────
  try {
    await api("/settings", {
      method: "PUT",
      token,
      body: JSON.stringify({
        conferenceName: "DEF CON",
        hotelSoloNightLimit: 3,
        hotelRoommateNightLimit: 5,
      }),
    });
    console.log("  ✓ conference = DEF CON");
  } catch (e) {
    console.warn("  ~ settings:", (e as Error).message);
  }

  // ── All DEF CON departments ──────────────────────────────────
  let departments = await api<
    {
      id: string;
      name: string;
      helpdeskQueueAccess?: boolean;
      isOrderingDept?: boolean;
    }[]
  >("/departments", { token });

  for (const d of DEFCON_DEPARTMENTS) {
    const existing = departments.find((x) => x.name === d.name);
    if (!existing) {
      await api("/departments", {
        method: "POST",
        token,
        body: JSON.stringify(d),
      });
      console.log(`  + department ${d.name}`);
    } else {
      // Keep flags in sync with canonical list
      try {
        await api(`/departments/${existing.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({
            description: d.description,
            color: d.color,
            isOrderingDept: d.isOrderingDept,
            helpdeskQueueAccess: d.helpdeskQueueAccess,
          }),
        });
      } catch {
        /* leads may not change some flags */
      }
    }
  }
  departments = await api("/departments", { token });
  const byName = (n: string) => departments.find((d) => d.name === n);

  const kevops = byName("KEVOPS");
  const qm = byName("Quartermaster");
  const dispatch = byName("Dispatch");
  const soc = byName("SOC");
  const noc = byName("NOC");
  const hotline = byName("Hotline");
  const speakerOps = byName("Speaker Ops");
  const press = byName("Press");
  const merch = byName("Merch");
  const vendor = byName("Vendor");
  const humanReg = byName("Human Registration");
  const villages = byName("Villages");
  const contests = byName("Contests");
  const dctv = byName("DCTV");
  const content = byName("Content and Coordination");
  const parties = byName("Parties");
  const workshops = byName("Workshops");
  const nfo = byName("NFO");
  const creatorStage = byName("Creator Stage Ops");
  console.log(`  ✓ ${departments.length} departments (DEF CON set)`);

  // ── Users ────────────────────────────────────────────────────
  type UserRow = { id: string; email: string; name: string; role: string };
  let users = await api<UserRow[]>("/users", { token });
  const ensureUser = async (u: {
    email: string;
    name: string;
    role: string;
    password?: string;
  }) => {
    const existing = users.find((x) => x.email === u.email);
    if (existing) return existing;
    await api<UserRow>("/users", {
      method: "POST",
      token,
      body: JSON.stringify({
        email: u.email,
        name: u.name,
        role: u.role,
        password: u.password || "changeme123",
      }),
    });
    console.log(`  + user ${u.email}`);
    users = await api("/users", { token });
    return users.find((x) => x.email === u.email)!;
  };

  const leadQm = await ensureUser({
    email: "qm.lead@conman.local",
    name: "QM Lead",
    role: "DEPARTMENT_LEAD",
  });
  const leadDispatch = await ensureUser({
    email: "dispatch.lead@conman.local",
    name: "Dispatch Lead",
    role: "DEPARTMENT_LEAD",
  });
  const leadSoc = await ensureUser({
    email: "soc.lead@conman.local",
    name: "SOC Lead",
    role: "DEPARTMENT_LEAD",
  });
  const leadNoc = await ensureUser({
    email: "noc.lead@conman.local",
    name: "NOC Lead",
    role: "DEPARTMENT_LEAD",
  });
  const leadSpeaker = await ensureUser({
    email: "speakerops.lead@conman.local",
    name: "Speaker Ops Lead",
    role: "DEPARTMENT_LEAD",
  });
  const leadPress = await ensureUser({
    email: "press.lead@conman.local",
    name: "Press Lead",
    role: "DEPARTMENT_LEAD",
  });
  const leadVillages = await ensureUser({
    email: "villages.lead@conman.local",
    name: "Villages Lead",
    role: "DEPARTMENT_LEAD",
  });

  const goon1 = await ensureUser({
    email: "goon.dispatch@conman.local",
    name: "Dispatch Goon",
    role: "VOLUNTEER",
  });
  const goon2 = await ensureUser({
    email: "goon.qm@conman.local",
    name: "QM Goon",
    role: "VOLUNTEER",
  });
  const goon3 = await ensureUser({
    email: "goon.soc@conman.local",
    name: "SOC Goon",
    role: "VOLUNTEER",
  });
  const goon4 = await ensureUser({
    email: "goon.speaker@conman.local",
    name: "Speaker Ops Goon",
    role: "VOLUNTEER",
  });
  const goon5 = await ensureUser({
    email: "goon.reg@conman.local",
    name: "Human Reg Goon",
    role: "VOLUNTEER",
  });

  const admin = users.find((u) => u.email === EMAIL)!;
  const leadLegacy = users.find((u) => u.email === "lead@conman.local");
  const volLegacy = users.find((u) => u.email === "volunteer@conman.local");

  const addMember = async (
    deptId: string | undefined,
    userId: string,
    isLead = false,
  ) => {
    if (!deptId) return;
    try {
      await api(`/departments/${deptId}/members`, {
        method: "POST",
        token,
        body: JSON.stringify({ userId, isLead }),
      });
    } catch {
      /* already member */
    }
  };

  await addMember(kevops?.id, admin.id, true);
  await addMember(qm?.id, leadQm.id, true);
  await addMember(qm?.id, goon2.id);
  await addMember(qm?.id, leadLegacy?.id || leadQm.id, true);
  await addMember(dispatch?.id, leadDispatch.id, true);
  await addMember(dispatch?.id, goon1.id);
  await addMember(dispatch?.id, volLegacy?.id || goon1.id);
  await addMember(soc?.id, leadSoc.id, true);
  await addMember(soc?.id, goon3.id);
  await addMember(noc?.id, leadNoc.id, true);
  await addMember(speakerOps?.id, leadSpeaker.id, true);
  await addMember(speakerOps?.id, goon4.id);
  await addMember(press?.id, leadPress.id, true);
  await addMember(villages?.id, leadVillages.id, true);
  await addMember(humanReg?.id, goon5.id);
  await addMember(hotline?.id, goon3.id);
  await addMember(content?.id, goon4.id);
  console.log("  ✓ department memberships");

  // ── Profiles ─────────────────────────────────────────────────
  const checkIn = daysFromNow(2, 15).slice(0, 10);
  const checkOut = daysFromNow(5, 11).slice(0, 10);
  try {
    await api("/profile/" + goon1.id, {
      method: "PATCH",
      token,
      body: JSON.stringify({
        phone: "+1-555-0101",
        pronouns: "they/them",
        shirtSize: "L",
        hotelCheckIn: checkIn,
        hotelCheckOut: checkOut,
        roommateId: goon2.id,
        emergencyName: "Emergency Contact",
        emergencyPhone: "+1-555-0199",
        dietaryNotes: "Vegetarian",
        title: "Dispatch goon",
      }),
    });
    await api("/profile/" + goon3.id, {
      method: "PATCH",
      token,
      body: JSON.stringify({
        phone: "+1-555-0103",
        shirtSize: "XL",
        hotelCheckIn: checkIn,
        hotelCheckOut: daysFromNow(4, 11).slice(0, 10),
        dietaryNotes: "Nut allergy",
        title: "SOC goon",
      }),
    });
    console.log("  ✓ goon profiles / hotel");
  } catch (e) {
    console.warn("  ~ profiles:", (e as Error).message);
  }

  // ── Master calendar (DEF CON style) ──────────────────────────
  const day0 = new Date(daysFromNow(3, 9));
  const events = [
    {
      title: "Con opens — badge lines",
      startsAt: hoursFrom(day0, 0),
      endsAt: hoursFrom(day0, 2),
      isMaster: true,
      location: "Human Registration",
      color: "#4f46e5",
    },
    {
      title: "Opening ceremonies",
      startsAt: hoursFrom(day0, 2),
      endsAt: hoursFrom(day0, 3.5),
      isMaster: true,
      location: "Track 1",
      color: "#4f46e5",
    },
    {
      title: "KEVOPS all-hands",
      startsAt: hoursFrom(day0, -1.5),
      endsAt: hoursFrom(day0, -1),
      isMaster: true,
      location: "KEVOPS",
      color: "#6366f1",
    },
    {
      title: "NOC load-in / fiber",
      startsAt: daysFromNow(2, 6),
      endsAt: daysFromNow(2, 14),
      departmentId: noc?.id,
      location: "NOC",
    },
    {
      title: "Dispatch radio check",
      startsAt: daysFromNow(2, 16),
      endsAt: daysFromNow(2, 17),
      departmentId: dispatch?.id,
      location: "Dispatch",
    },
    {
      title: "Speaker Ops briefing",
      startsAt: daysFromNow(2, 17),
      endsAt: daysFromNow(2, 18),
      departmentId: speakerOps?.id,
      location: "Speaker Ready Room",
    },
    {
      title: "Villages open",
      startsAt: daysFromNow(3, 10),
      endsAt: daysFromNow(3, 18),
      departmentId: villages?.id,
      location: "Village halls",
    },
    {
      title: "Contests floor open",
      startsAt: daysFromNow(3, 10),
      endsAt: daysFromNow(3, 20),
      departmentId: contests?.id,
      location: "Contest area",
    },
    {
      title: "Press pool window",
      startsAt: daysFromNow(3, 11),
      endsAt: daysFromNow(3, 12),
      departmentId: press?.id,
      location: "Press room",
    },
    {
      title: "Creator Stage block A",
      startsAt: daysFromNow(3, 13),
      endsAt: daysFromNow(3, 16),
      departmentId: creatorStage?.id,
      location: "Creator Stage",
    },
    {
      title: "Official parties window",
      startsAt: daysFromNow(3, 21),
      endsAt: daysFromNow(4, 2),
      departmentId: parties?.id,
      location: "Off-site / venue",
    },
    {
      title: "Tear-down complete",
      startsAt: daysFromNow(5, 16),
      endsAt: daysFromNow(5, 20),
      isMaster: true,
      location: "Loading docks",
    },
  ];
  for (const ev of events) {
    try {
      await api("/calendar", {
        method: "POST",
        token,
        body: JSON.stringify(ev),
      });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ calendar events");

  // ── Todos ────────────────────────────────────────────────────
  const todos = [
    {
      title: "Print goon badges batch 1",
      priority: "HIGH",
      departmentId: humanReg?.id || kevops?.id,
      assigneeId: goon5.id,
      dueAt: daysFromNow(1, 17),
    },
    {
      title: "Confirm radio inventory count",
      priority: "MEDIUM",
      departmentId: qm?.id,
      assigneeId: leadQm.id,
      dueAt: daysFromNow(1, 12),
    },
    {
      title: "Post Dispatch maps at posts",
      priority: "URGENT",
      departmentId: dispatch?.id,
      assigneeId: goon1.id,
      dueAt: daysFromNow(2, 8),
    },
    {
      title: "NOC uplink failover test",
      priority: "HIGH",
      departmentId: noc?.id,
      assigneeId: leadNoc.id,
      dueAt: daysFromNow(2, 15),
    },
    {
      title: "Speaker room water + clickers",
      priority: "MEDIUM",
      departmentId: speakerOps?.id,
      assigneeId: goon4.id,
      dueAt: daysFromNow(2, 18),
    },
    {
      title: "SOC camera FOV walkthrough",
      priority: "HIGH",
      departmentId: soc?.id,
      assigneeId: goon3.id,
      dueAt: daysFromNow(2, 14),
    },
    {
      title: "Merch restock black tees",
      priority: "LOW",
      departmentId: merch?.id,
      assigneeId: goon2.id,
    },
    {
      title: "Village lead radio handout list",
      priority: "MEDIUM",
      departmentId: villages?.id,
      assigneeId: leadVillages.id,
    },
  ];
  for (const t of todos) {
    try {
      await api("/todos", { method: "POST", token, body: JSON.stringify(t) });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ todos");

  // ── Communications ───────────────────────────────────────────
  const comms = [
    {
      subject: "Welcome DEF CON goons & staff",
      body: "Thanks for volunteering. Complete your profile (hotel + emergency contacts), pick up your radio from Quartermaster, and check in with Dispatch for your first shift.\n\n— KEVOPS",
      priority: "NORMAL",
      isPinned: true,
      requiresAck: false,
    },
    {
      subject: "CRITICAL: Escalator out of service (East)",
      body: "East escalator offline. Use West for public flow. Acknowledge when read. — Dispatch / KEVOPS",
      priority: "CRITICAL",
      requiresAck: true,
      departmentId: dispatch?.id,
    },
    {
      subject: "QM: radio return procedure",
      body: "All HT radios return to Quartermaster at end of shift. Missing radio = lost badge process. Asset codes on the cage whiteboard.",
      priority: "NORMAL",
      departmentId: qm?.id,
    },
    {
      subject: "NOC: channel plan reminder",
      body: "Ch1 Dispatch/KEVOPS · Ch2 SOC · Ch3 NOC · Confirm medical/hotline channel on site whiteboard.",
      priority: "NORMAL",
      departmentId: noc?.id,
    },
    {
      subject: "Speaker Ops: no flash photography on stage",
      body: "Remind Press and DCTV — no flash during talks. Questions via Speaker Ops, not stage rush.",
      priority: "NORMAL",
      departmentId: speakerOps?.id,
    },
  ];
  for (const c of comms) {
    try {
      await api("/communications", {
        method: "POST",
        token,
        body: JSON.stringify(c),
      });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ communications");

  // ── Helpdesk ─────────────────────────────────────────────────
  const queues = await api<{ id: string; name: string }[]>(
    "/departments/helpdesk-queues",
    { token },
  );
  const q = (name: string) =>
    queues.find((x) => x.name === name)?.id || queues[0]?.id;
  const tickets = [
    {
      title: "Track 1 mic RF interference",
      description: "Wireless pack A dropping on house left. Need spare from QM/NOC path.",
      severity: "HIGH",
      departmentId: q("NOC") || q("KEVOPS"),
    },
    {
      title: "Lost goon badge at badge line",
      description: "Blank lanyard held at Human Registration. Needs Dispatch verify.",
      severity: "MEDIUM",
      departmentId: q("Human Registration") || q("Dispatch"),
    },
    {
      title: "INCIDENT: Medical assist — Skybridge",
      description: "Hotline taking call; SOC camera review requested. Ops tracking.",
      severity: "CRITICAL",
      departmentId: q("Hotline") || q("SOC"),
      isIncident: true,
    },
    {
      title: "Need gaffer tape for Villages",
      description: "Village setup short on tape before 10:00 open.",
      severity: "LOW",
      departmentId: q("Quartermaster"),
    },
    {
      title: "Vendor booth power strip failed",
      description: "Hall B booth 42 — Vendor desk escalated.",
      severity: "MEDIUM",
      departmentId: q("Vendor") || q("KEVOPS"),
    },
    {
      title: "Press pool credential question",
      description: "Outlet asking for floor access beyond press room.",
      severity: "LOW",
      departmentId: q("Press"),
    },
  ];
  for (const t of tickets) {
    if (!t.departmentId) continue;
    try {
      await api("/helpdesk", {
        method: "POST",
        token,
        body: JSON.stringify(t),
      });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ helpdesk tickets");

  // ── Inventory (Quartermaster-centric) ────────────────────────
  const assets = [
    {
      name: "Radio HT-20",
      category: "Radios",
      serialNumber: "RAD-020",
      location: "QM cage",
      departmentId: qm?.id,
    },
    {
      name: "Radio HT-21",
      category: "Radios",
      serialNumber: "RAD-021",
      location: "QM cage",
      departmentId: qm?.id,
    },
    {
      name: "Radio HT-22",
      category: "Radios",
      serialNumber: "RAD-022",
      location: "Dispatch",
      departmentId: dispatch?.id,
    },
    {
      name: "Laptop Loaner NOC-3",
      category: "Laptops",
      serialNumber: "LT-N3",
      location: "NOC",
      departmentId: noc?.id,
    },
    {
      name: "Master keys set C",
      category: "Keys",
      serialNumber: "KEY-C",
      location: "KEVOPS",
      departmentId: kevops?.id,
    },
    {
      name: "Badge printer #3",
      category: "Equipment",
      serialNumber: "PRT-03",
      location: "Human Registration",
      departmentId: humanReg?.id,
    },
    {
      name: "GoPro pool cam A",
      category: "Photo",
      serialNumber: "CAM-A",
      location: "Photo desk",
      departmentId: byName("Photo")?.id,
    },
    {
      name: "First-aid kit Rolling-2",
      category: "Medical",
      serialNumber: "MED-R2",
      location: "Hotline post",
      departmentId: hotline?.id,
    },
    {
      name: "Gaffer tape case",
      category: "Consumables",
      serialNumber: "SUP-GT2",
      location: "QM warehouse",
      departmentId: qm?.id,
      quantity: 24,
      lowStockThreshold: 5,
    },
    {
      name: "Merch float bag #1",
      category: "Merch",
      serialNumber: "MERCH-F1",
      location: "Merch cage",
      departmentId: merch?.id,
    },
  ];
  const createdAssets: { id: string; assetCode: string; name: string }[] = [];
  for (const a of assets) {
    try {
      const item = await api<{ id: string; assetCode: string; name: string }>(
        "/inventory",
        { method: "POST", token, body: JSON.stringify(a) },
      );
      createdAssets.push(item);
    } catch {
      /* ignore */
    }
  }
  if (createdAssets[0]) {
    try {
      await api("/inventory/checkout", {
        method: "POST",
        token,
        body: JSON.stringify({
          codes: [createdAssets[0].assetCode],
          userId: goon1.id,
          notes: "Dispatch post A",
          expectedReturnAt: daysFromNow(0, 22),
        }),
      });
    } catch {
      /* ignore */
    }
  }
  if (createdAssets[3]) {
    try {
      await api("/inventory/checkout", {
        method: "POST",
        token,
        body: JSON.stringify({
          codes: [createdAssets[3].assetCode],
          userId: leadNoc.id,
          notes: "NOC monitoring station",
          expectedReturnAt: daysFromNow(1, 20),
        }),
      });
    } catch {
      /* ignore */
    }
  }
  console.log(`  ✓ inventory (${createdAssets.length} items)`);

  // ── Orders → Quartermaster ───────────────────────────────────
  const ordering = await api<{ id: string; name: string }[]>(
    "/departments/ordering",
    { token },
  );
  const toDept =
    ordering.find((d) => d.name === "Quartermaster")?.id ||
    ordering[0]?.id ||
    qm?.id;
  for (const o of [
    {
      title: "AA batteries (24-pack)",
      quantity: 6,
      description: "For mics / radios",
      toDeptId: toDept,
      fromDeptId: speakerOps?.id || noc?.id,
    },
    {
      title: "Laminated 'Staff Only' signs",
      quantity: 20,
      description: "Door posts",
      toDeptId: toDept,
      fromDeptId: dispatch?.id || kevops?.id,
    },
    {
      title: "Black tee restock (L/XL)",
      quantity: 50,
      description: "Merch floor",
      toDeptId: merch?.id || toDept,
      fromDeptId: merch?.id,
    },
  ]) {
    try {
      await api("/orders", { method: "POST", token, body: JSON.stringify(o) });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ item orders");

  // ── Shifts ───────────────────────────────────────────────────
  const shifts = [
    {
      title: "Dispatch desk — morning",
      departmentId: dispatch?.id,
      startsAt: daysFromNow(3, 8),
      endsAt: daysFromNow(3, 14),
      location: "Dispatch",
      slots: 3,
    },
    {
      title: "Dispatch desk — swing",
      departmentId: dispatch?.id,
      startsAt: daysFromNow(3, 14),
      endsAt: daysFromNow(3, 22),
      location: "Dispatch",
      slots: 3,
    },
    {
      title: "QM cage — radios",
      departmentId: qm?.id,
      startsAt: daysFromNow(3, 8),
      endsAt: daysFromNow(3, 16),
      location: "Quartermaster",
      slots: 2,
    },
    {
      title: "Human Registration line",
      departmentId: humanReg?.id,
      startsAt: daysFromNow(3, 8),
      endsAt: daysFromNow(3, 14),
      location: "Badge lines",
      slots: 6,
    },
    {
      title: "Speaker Ops — Track 1",
      departmentId: speakerOps?.id,
      startsAt: daysFromNow(3, 9),
      endsAt: daysFromNow(3, 17),
      location: "Track 1",
      slots: 3,
    },
    {
      title: "SOC monitoring",
      departmentId: soc?.id,
      startsAt: daysFromNow(3, 8),
      endsAt: daysFromNow(3, 20),
      location: "SOC",
      slots: 2,
    },
    {
      title: "NOC core",
      departmentId: noc?.id,
      startsAt: daysFromNow(3, 0),
      endsAt: daysFromNow(3, 12),
      location: "NOC",
      slots: 2,
    },
    {
      title: "Villages roaming",
      departmentId: villages?.id,
      startsAt: daysFromNow(3, 10),
      endsAt: daysFromNow(3, 18),
      location: "Village halls",
      slots: 4,
    },
  ];
  for (const s of shifts) {
    if (!s.departmentId) continue;
    try {
      const created = await api<{ id: string }>("/shifts", {
        method: "POST",
        token,
        body: JSON.stringify(s),
      });
      const assignee =
        s.departmentId === dispatch?.id
          ? goon1.id
          : s.departmentId === qm?.id
            ? goon2.id
            : s.departmentId === soc?.id
              ? goon3.id
              : s.departmentId === speakerOps?.id
                ? goon4.id
                : s.departmentId === humanReg?.id
                  ? goon5.id
                  : admin.id;
      try {
        await api(`/shifts/${created.id}/assign`, {
          method: "POST",
          token,
          body: JSON.stringify({ userId: assignee }),
        });
      } catch {
        /* conflict ok */
      }
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ shifts");

  // ── Handovers ────────────────────────────────────────────────
  for (const h of [
    {
      departmentId: kevops?.id,
      title: "Night → morning handoff",
      shiftLabel: "Night",
      body: "Badge printer jam cleared at Human Reg. Two open tickets on Track 1 RF. Master keys with Dispatch Lead.",
    },
    {
      departmentId: dispatch?.id,
      title: "Post coverage notes",
      shiftLabel: "AM",
      body: "Post 3 metal detector flaky — wand only. VIP list in Con Bible. Radio check complete on Ch1.",
    },
    {
      departmentId: qm?.id,
      title: "Cage notes",
      shiftLabel: "Swing",
      body: "12 radios out to Villages. Gaffer tape low — order pending. Merch float bag signed out.",
    },
    {
      departmentId: noc?.id,
      title: "NOC overnight",
      shiftLabel: "Graveyard",
      body: "Uplink stable. Spare switch in rack 2. DCTV encoder reboot at 03:12 — resolved.",
    },
  ]) {
    if (!h.departmentId) continue;
    try {
      await api("/handovers", {
        method: "POST",
        token,
        body: JSON.stringify(h),
      });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ handovers");

  // ── Budget ───────────────────────────────────────────────────
  for (const b of [
    {
      label: "Radio batteries bulk",
      amount: 186.5,
      category: "QM",
      departmentId: qm?.id,
    },
    {
      label: "Emergency fiber jumper",
      amount: 92.0,
      category: "NOC",
      departmentId: noc?.id,
    },
    {
      label: "Goon pizza night",
      amount: 420.0,
      category: "Hospitality",
      departmentId: kevops?.id,
    },
    {
      label: "Print shop — staff signs",
      amount: 65.25,
      category: "Design",
      departmentId: byName("Design and Defacement")?.id || kevops?.id,
    },
  ]) {
    try {
      await api("/budget", { method: "POST", token, body: JSON.stringify(b) });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ budget");

  // ── Org chart ────────────────────────────────────────────────
  try {
    const root = await api<{ id: string }>("/org-chart", {
      method: "POST",
      token,
      body: JSON.stringify({
        title: "DEF CON Ops",
        userId: admin.id,
        sortOrder: 0,
      }),
    });
    for (const n of [
      {
        title: "KEVOPS",
        userId: admin.id,
        departmentId: kevops?.id,
        parentId: root.id,
        sortOrder: 1,
      },
      {
        title: "Dispatch Lead",
        userId: leadDispatch.id,
        departmentId: dispatch?.id,
        parentId: root.id,
        sortOrder: 2,
      },
      {
        title: "Quartermaster Lead",
        userId: leadQm.id,
        departmentId: qm?.id,
        parentId: root.id,
        sortOrder: 3,
      },
      {
        title: "SOC Lead",
        userId: leadSoc.id,
        departmentId: soc?.id,
        parentId: root.id,
        sortOrder: 4,
      },
      {
        title: "NOC Lead",
        userId: leadNoc.id,
        departmentId: noc?.id,
        parentId: root.id,
        sortOrder: 5,
      },
      {
        title: "Speaker Ops Lead",
        userId: leadSpeaker.id,
        departmentId: speakerOps?.id,
        parentId: root.id,
        sortOrder: 6,
      },
    ]) {
      await api("/org-chart", {
        method: "POST",
        token,
        body: JSON.stringify(n),
      });
    }
    console.log("  ✓ org chart");
  } catch (e) {
    console.warn("  ~ org chart:", (e as Error).message);
  }

  // ── Badges ───────────────────────────────────────────────────
  try {
    let badges = await api<{ id: string; name: string }[]>("/badges", {
      token,
    });
    const ensureBadge = async (
      name: string,
      color: string,
      accessLevel: string,
    ) => {
      let b = badges.find((x) => x.name === name);
      if (!b) {
        await api("/badges", {
          method: "POST",
          token,
          body: JSON.stringify({ name, color, accessLevel }),
        });
        badges = await api("/badges", { token });
        b = badges.find((x) => x.name === name)!;
      }
      return b;
    };
    const goonBadge = await ensureBadge("Goon", "#0ea5e9", "Staff areas");
    const staff = await ensureBadge("Staff", "#4f46e5", "All areas");
    await ensureBadge("Black Badge", "#111827", "Contest winner");
    await ensureBadge("Press", "#f59e0b", "Press room");
    await ensureBadge("Speaker", "#10b981", "Speaker ops");
    for (const uid of [goon1.id, goon2.id, goon3.id, goon4.id, goon5.id]) {
      try {
        await api(`/badges/${goonBadge.id}/assign`, {
          method: "POST",
          token,
          body: JSON.stringify({ userId: uid }),
        });
      } catch {
        /* ignore */
      }
    }
    for (const uid of [
      leadDispatch.id,
      leadQm.id,
      leadSoc.id,
      leadNoc.id,
      leadSpeaker.id,
    ]) {
      try {
        await api(`/badges/${staff.id}/assign`, {
          method: "POST",
          token,
          body: JSON.stringify({ userId: uid }),
        });
      } catch {
        /* ignore */
      }
    }
    console.log("  ✓ badges");
  } catch (e) {
    console.warn("  ~ badges:", (e as Error).message);
  }

  // ── Radio ────────────────────────────────────────────────────
  for (const ch of [
    {
      name: "Dispatch / KEVOPS",
      frequency: "Ch 1",
      description: "Primary command net",
      departmentId: dispatch?.id || kevops?.id,
    },
    {
      name: "SOC",
      frequency: "Ch 2",
      departmentId: soc?.id,
    },
    {
      name: "NOC",
      frequency: "Ch 3",
      departmentId: noc?.id,
    },
    {
      name: "Hotline / Medical",
      frequency: "Ch 4",
      departmentId: hotline?.id,
    },
  ]) {
    try {
      const c = await api<{ id: string }>("/radio", {
        method: "POST",
        token,
        body: JSON.stringify(ch),
      });
      await api(`/radio/${c.id}/assign`, {
        method: "POST",
        token,
        body: JSON.stringify({
          userId: admin.id,
          callSign: ch.frequency === "Ch 1" ? "KEVOPS-1" : undefined,
        }),
      });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ radio channels");

  // ── On-call ──────────────────────────────────────────────────
  for (const s of [
    {
      userId: admin.id,
      departmentId: kevops?.id,
      startsAt: daysFromNow(0, 8),
      endsAt: daysFromNow(0, 20),
      notes: "Primary KEVOPS on-call",
    },
    {
      userId: leadDispatch.id,
      departmentId: dispatch?.id,
      startsAt: daysFromNow(0, 8),
      endsAt: daysFromNow(1, 8),
      notes: "Dispatch overnight",
    },
    {
      userId: leadNoc.id,
      departmentId: noc?.id,
      startsAt: daysFromNow(3, 0),
      endsAt: daysFromNow(3, 23),
      notes: "Show-day NOC",
    },
    {
      userId: leadSoc.id,
      departmentId: soc?.id,
      startsAt: daysFromNow(3, 8),
      endsAt: daysFromNow(3, 22),
      notes: "SOC floor",
    },
  ]) {
    try {
      await api("/on-call", { method: "POST", token, body: JSON.stringify(s) });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ on-call roster");

  // ── Rooms ────────────────────────────────────────────────────
  try {
    const rooms = await api<{ id: string; name: string }[]>("/rooms", {
      token,
    });
    const ensureRoom = async (
      name: string,
      capacity: number,
      location: string,
    ) => {
      let r = rooms.find((x) => x.name === name);
      if (!r) {
        r = await api("/rooms", {
          method: "POST",
          token,
          body: JSON.stringify({ name, capacity, location }),
        });
      }
      return r;
    };
    const ready = await ensureRoom("Speaker Ready Room", 40, "Speaker Ops");
    const kevopsRm = await ensureRoom("KEVOPS Office", 12, "Staff area");
    const pressRm = await ensureRoom("Press Room", 25, "Press");
    await api("/rooms/bookings", {
      method: "POST",
      token,
      body: JSON.stringify({
        roomId: ready.id,
        title: "Speaker prep — Track 1 block",
        startsAt: daysFromNow(3, 9),
        endsAt: daysFromNow(3, 12),
      }),
    });
    await api("/rooms/bookings", {
      method: "POST",
      token,
      body: JSON.stringify({
        roomId: kevopsRm.id,
        title: "Dept leads midday sync",
        startsAt: daysFromNow(3, 12),
        endsAt: daysFromNow(3, 12.75),
      }),
    });
    await api("/rooms/bookings", {
      method: "POST",
      token,
      body: JSON.stringify({
        roomId: pressRm.id,
        title: "Press pool window",
        startsAt: daysFromNow(3, 11),
        endsAt: daysFromNow(3, 12),
      }),
    });
    console.log("  ✓ rooms / bookings");
  } catch (e) {
    console.warn("  ~ rooms:", (e as Error).message);
  }

  // ── Run of show ──────────────────────────────────────────────
  for (const r of [
    {
      title: "Doors / badge lines",
      startsAt: daysFromNow(3, 8),
      endsAt: daysFromNow(3, 10),
      location: "Human Registration",
      departmentId: humanReg?.id,
      description: "Lines open; Dispatch posts staffed",
    },
    {
      title: "Opening ceremonies",
      startsAt: daysFromNow(3, 11),
      endsAt: daysFromNow(3, 12.5),
      location: "Track 1",
      departmentId: content?.id || speakerOps?.id,
      description: "No flash; Speaker Ops / DCTV / NOC coordinated",
    },
    {
      title: "Villages open",
      startsAt: daysFromNow(3, 10),
      endsAt: daysFromNow(3, 10.25),
      location: "Village halls",
      departmentId: villages?.id,
    },
    {
      title: "Contests open",
      startsAt: daysFromNow(3, 10),
      endsAt: daysFromNow(3, 10.25),
      location: "Contest floor",
      departmentId: contests?.id,
    },
    {
      title: "Workshops block A",
      startsAt: daysFromNow(3, 13),
      endsAt: daysFromNow(3, 16),
      location: "Workshop rooms",
      departmentId: workshops?.id,
    },
    {
      title: "NFO evening notes",
      startsAt: daysFromNow(3, 18),
      endsAt: daysFromNow(3, 18.5),
      location: "NFO",
      departmentId: nfo?.id,
    },
  ]) {
    try {
      await api("/run-of-show", {
        method: "POST",
        token,
        body: JSON.stringify(r),
      });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ run of show");

  // ── Surveys ──────────────────────────────────────────────────
  try {
    const survey = await api<{ id: string }>("/surveys", {
      method: "POST",
      token,
      body: JSON.stringify({
        title: "Mid-con goon pulse check",
        description: "Quick staff feedback (sample)",
        questions: [
          {
            id: "q1",
            type: "scale",
            label: "How is your shift going? (1-5)",
            required: true,
          },
          {
            id: "q2",
            type: "textarea",
            label: "Any blockers for KEVOPS/Dispatch?",
            required: false,
          },
          {
            id: "q3",
            type: "single",
            label: "Department",
            required: true,
            options: [
              "KEVOPS",
              "Dispatch",
              "Quartermaster",
              "SOC",
              "NOC",
              "Speaker Ops",
              "Other",
            ],
          },
        ],
      }),
    });
    await api(`/surveys/${survey.id}/responses`, {
      method: "POST",
      token,
      body: JSON.stringify({
        answers: {
          q1: "4",
          q2: "Need more radios at badge line",
          q3: "Dispatch",
        },
      }),
    });
    console.log("  ✓ surveys");
  } catch (e) {
    console.warn("  ~ surveys:", (e as Error).message);
  }

  // ── Vendors / exhibitors ─────────────────────────────────────
  for (const v of [
    {
      name: "Hardware Village Sponsor Co.",
      contactName: "Dana Lee",
      contactEmail: "dana@example.com",
      booth: "Village hall B",
      notes: "Coordinates with Villages + Vendor",
      departmentId: vendor?.id,
    },
    {
      name: "Badge electronics supplier",
      contactName: "Morgan Ellis",
      contactEmail: "supply@example.com",
      notes: "Quartermaster receiving dock",
      departmentId: qm?.id,
    },
    {
      name: "Swag printer",
      contactPhone: "+1-555-0144",
      booth: "Merch",
      departmentId: merch?.id,
    },
  ]) {
    try {
      await api("/vendors", { method: "POST", token, body: JSON.stringify(v) });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ vendors");

  // ── Meals ────────────────────────────────────────────────────
  try {
    const meal = await api<{ id: string }>("/meals", {
      method: "POST",
      token,
      body: JSON.stringify({
        name: "Saturday goon lunch",
        mealDate: daysFromNow(3, 12),
        notes: "Pick up near KEVOPS",
        departmentId: kevops?.id,
      }),
    });
    await api(`/meals/${meal.id}/select`, {
      method: "POST",
      token,
      body: JSON.stringify({
        choice: "Vegetarian wrap",
        dietaryNote: "No onions",
      }),
    });
    console.log("  ✓ meals");
  } catch (e) {
    console.warn("  ~ meals:", (e as Error).message);
  }

  // ── Lost & found ─────────────────────────────────────────────
  for (const item of [
    {
      title: "Black umbrella",
      location: "Contest floor",
      description: "Found near contests",
      status: "FOUND",
    },
    {
      title: "Badge holder (empty)",
      location: "Human Registration",
      status: "FOUND",
    },
    {
      title: "Radio belt clip",
      location: "Dispatch",
      status: "FOUND",
    },
  ]) {
    try {
      await api("/lost-found", {
        method: "POST",
        token,
        body: JSON.stringify(item),
      });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ lost & found");

  // ── Media ────────────────────────────────────────────────────
  for (const m of [
    {
      title: "Venue floor plan L1",
      externalUrl: "https://example.com/maps/l1.png",
      description: "Sample map link",
      tags: ["map", "venue", "KEVOPS"],
      departmentId: kevops?.id,
    },
    {
      title: "Stage plot — Track 1",
      externalUrl: "https://example.com/stage/track1.pdf",
      tags: ["speaker-ops", "dctv"],
      departmentId: speakerOps?.id || dctv?.id,
    },
  ]) {
    try {
      await api("/media", { method: "POST", token, body: JSON.stringify(m) });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ media");

  // ── Con Bible ────────────────────────────────────────────────
  for (const p of [
    {
      title: "Emergency contacts",
      slug: "emergency-contacts",
      category: "Emergency",
      body: "Dispatch / KEVOPS: Ch1\nSOC: Ch2\nNOC: Ch3\nHotline: Ch4 (confirm on-site)\nVenue security: see whiteboard",
      sortOrder: 2,
    },
    {
      title: "Radio etiquette",
      slug: "radio-etiquette",
      category: "Comms",
      body: "Clear speech, no real names of minors, use call signs, release PTT fully. Lost radio = report to QM + Dispatch.",
      sortOrder: 3,
    },
    {
      title: "Black Badge / contests notes",
      slug: "black-badge-notes",
      category: "Contests",
      body: "Black Badge Board coordinates winners. Do not invent privileges — verify with Contests leads.",
      sortOrder: 4,
    },
    {
      title: "Press handling",
      slug: "press-handling",
      category: "Press",
      body: "Press room access only with Press lead approval. No stage flash. Escort via Press routes.",
      sortOrder: 5,
    },
  ]) {
    try {
      await api("/bible", { method: "POST", token, body: JSON.stringify(p) });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ con bible pages");

  console.log("\nDEF CON sample data load complete.");
  console.log("Open https://conman-web.onrender.com");
  console.log("\nDepartments seeded (canonical list):");
  for (const d of DEFCON_DEPARTMENTS) {
    console.log(`  - ${d.name}`);
  }
  console.log("\nExtra logins (password changeme123):");
  console.log("  dispatch.lead@conman.local");
  console.log("  qm.lead@conman.local");
  console.log("  soc.lead@conman.local");
  console.log("  goon.dispatch@conman.local");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
