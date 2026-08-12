/**
 * Populate ConMan with realistic demo data via the HTTP API.
 *
 * Usage:
 *   npx tsx scripts/seed-sample-via-api.ts
 *
 * Env:
 *   API_URL   default https://conman-api.onrender.com
 *   EMAIL     default admin@conman.local
 *   PASSWORD  default changeme123
 */

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
  console.log(`Seeding sample data on ${API} as ${EMAIL}...`);
  const login = await api<{ accessToken: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const token = login.accessToken;

  // ── Departments ──────────────────────────────────────────────
  let departments = await api<
    { id: string; name: string; helpdeskQueueAccess?: boolean; isOrderingDept?: boolean }[]
  >("/departments", { token });

  const wantedDepts = [
    {
      name: "Security",
      color: "#ef4444",
      description: "Venue security and access control",
      helpdeskQueueAccess: true,
      isOrderingDept: false,
    },
    {
      name: "Medical",
      color: "#ec4899",
      description: "First aid and medical response",
      helpdeskQueueAccess: true,
      isOrderingDept: false,
    },
    {
      name: "Programming",
      color: "#14b8a6",
      description: "Panels, guests, and stage schedule",
      helpdeskQueueAccess: true,
      isOrderingDept: false,
    },
  ];

  for (const d of wantedDepts) {
    if (!departments.find((x) => x.name === d.name)) {
      await api("/departments", {
        method: "POST",
        token,
        body: JSON.stringify(d),
      });
      console.log(`  + department ${d.name}`);
    }
  }
  departments = await api("/departments", { token });
  const byName = (n: string) => departments.find((d) => d.name === n)!;
  const ops = byName("Operations");
  const logistics = byName("Logistics");
  const tech = byName("Tech / AV");
  const inventory = byName("Inventory") || logistics;
  const guestRel = byName("Guest Relations");
  const security = byName("Security");
  const medical = byName("Medical");
  const programming = byName("Programming");

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
    const created = await api<UserRow>("/users", {
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

  const leadSec = await ensureUser({
    email: "security.lead@conman.local",
    name: "Sam Rivera",
    role: "DEPARTMENT_LEAD",
  });
  const leadTech = await ensureUser({
    email: "tech.lead@conman.local",
    name: "Alex Chen",
    role: "DEPARTMENT_LEAD",
  });
  const leadProg = await ensureUser({
    email: "programming.lead@conman.local",
    name: "Jordan Blake",
    role: "DEPARTMENT_LEAD",
  });
  const vol1 = await ensureUser({
    email: "maya.vol@conman.local",
    name: "Maya Ortiz",
    role: "VOLUNTEER",
  });
  const vol2 = await ensureUser({
    email: "chris.vol@conman.local",
    name: "Chris Patel",
    role: "VOLUNTEER",
  });
  const vol3 = await ensureUser({
    email: "riley.vol@conman.local",
    name: "Riley Kim",
    role: "VOLUNTEER",
  });
  const vol4 = await ensureUser({
    email: "taylor.vol@conman.local",
    name: "Taylor Brooks",
    role: "VOLUNTEER",
  });
  const guest = await ensureUser({
    email: "creator@conman.local",
    name: "Casey Creator",
    role: "GUEST",
  });

  const admin = users.find((u) => u.email === EMAIL)!;
  const leadLog = users.find((u) => u.email === "lead@conman.local");
  const volDefault = users.find((u) => u.email === "volunteer@conman.local");

  // Memberships
  const addMember = async (
    deptId: string,
    userId: string,
    isLead = false,
  ) => {
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

  if (security) await addMember(security.id, leadSec.id, true);
  if (security) await addMember(security.id, vol1.id);
  if (security) await addMember(security.id, vol2.id);
  if (tech) await addMember(tech.id, leadTech.id, true);
  if (tech) await addMember(tech.id, vol3.id);
  if (programming) await addMember(programming.id, leadProg.id, true);
  if (programming) await addMember(programming.id, vol4.id);
  if (ops) await addMember(ops.id, admin.id, true);
  if (logistics && leadLog) await addMember(logistics.id, leadLog.id, true);
  if (logistics && volDefault) await addMember(logistics.id, volDefault.id);
  if (guestRel) await addMember(guestRel.id, guest.id);
  if (medical) await addMember(medical.id, vol1.id);
  console.log("  ✓ department memberships");

  // ── Profiles (hotel / roommate) ──────────────────────────────
  const checkIn = daysFromNow(2, 15).slice(0, 10);
  const checkOut = daysFromNow(5, 11).slice(0, 10);
  try {
    await api("/profile/" + vol1.id, {
      method: "PATCH",
      token,
      body: JSON.stringify({
        phone: "+1-555-0101",
        pronouns: "she/her",
        shirtSize: "M",
        hotelCheckIn: checkIn,
        hotelCheckOut: checkOut,
        roommateId: vol2.id,
        emergencyName: "Ana Ortiz",
        emergencyPhone: "+1-555-0199",
        dietaryNotes: "Vegetarian",
      }),
    });
    await api("/profile/" + vol3.id, {
      method: "PATCH",
      token,
      body: JSON.stringify({
        phone: "+1-555-0103",
        shirtSize: "L",
        hotelCheckIn: checkIn,
        hotelCheckOut: daysFromNow(4, 11).slice(0, 10),
        emergencyName: "Pat Kim",
        emergencyPhone: "+1-555-0188",
        dietaryNotes: "Nut allergy",
      }),
    });
    console.log("  ✓ volunteer profiles / hotel");
  } catch (e) {
    console.warn("  ~ profiles:", (e as Error).message);
  }

  // ── Master calendar ──────────────────────────────────────────
  const day0 = new Date(daysFromNow(3, 9));
  const events = [
    {
      title: "Con doors open",
      startsAt: hoursFrom(day0, 0),
      endsAt: hoursFrom(day0, 1),
      isMaster: true,
      location: "Main lobby",
      color: "#4f46e5",
    },
    {
      title: "Opening ceremonies",
      startsAt: hoursFrom(day0, 1),
      endsAt: hoursFrom(day0, 2.5),
      isMaster: true,
      location: "Main stage",
      color: "#4f46e5",
    },
    {
      title: "All-hands Ops standup",
      startsAt: hoursFrom(day0, -1),
      endsAt: hoursFrom(day0, -0.5),
      isMaster: true,
      location: "Ops office",
      color: "#6366f1",
    },
    {
      title: "AV load-in",
      startsAt: daysFromNow(2, 8),
      endsAt: daysFromNow(2, 14),
      departmentId: tech?.id,
      location: "Ballroom A",
    },
    {
      title: "Security briefing",
      startsAt: daysFromNow(2, 16),
      endsAt: daysFromNow(2, 17),
      departmentId: security?.id,
      location: "Security office",
    },
    {
      title: "Guest of Honor dinner",
      startsAt: daysFromNow(3, 18),
      endsAt: daysFromNow(3, 20),
      departmentId: guestRel?.id,
      location: "Green Room",
    },
    {
      title: "Main stage panel block",
      startsAt: daysFromNow(3, 11),
      endsAt: daysFromNow(3, 16),
      departmentId: programming?.id,
      location: "Main stage",
    },
    {
      title: "Load-out complete",
      startsAt: daysFromNow(5, 18),
      endsAt: daysFromNow(5, 20),
      isMaster: true,
      location: "Loading dock",
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
      title: "Print staff badges batch 1",
      priority: "HIGH",
      departmentId: ops?.id,
      assigneeId: vol3.id,
      dueAt: daysFromNow(1, 17),
    },
    {
      title: "Confirm radio inventory count",
      priority: "MEDIUM",
      departmentId: inventory?.id,
      assigneeId: leadLog?.id || admin.id,
      dueAt: daysFromNow(1, 12),
    },
    {
      title: "Post door maps at entrances",
      priority: "URGENT",
      departmentId: security?.id,
      assigneeId: vol1.id,
      dueAt: daysFromNow(2, 8),
    },
    {
      title: "Test livestream uplink",
      priority: "HIGH",
      departmentId: tech?.id,
      assigneeId: leadTech.id,
      dueAt: daysFromNow(2, 15),
    },
    {
      title: "Finalize panelist green-room schedule",
      priority: "MEDIUM",
      departmentId: programming?.id,
      assigneeId: leadProg.id,
      dueAt: daysFromNow(2, 18),
    },
    {
      title: "Order more gaffer tape",
      priority: "LOW",
      departmentId: logistics?.id,
      assigneeId: volDefault?.id || vol2.id,
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
      subject: "Welcome to ConStaff 2026 ops!",
      body: "Thanks for volunteering. Please complete your profile (hotel + emergency contacts) and check your department channel.\n\n— Con Management",
      priority: "NORMAL",
      isPinned: true,
      requiresAck: false,
    },
    {
      subject: "CRITICAL: Fire drill route change",
      body: "East stairwell is closed for repairs. Use West exits for drills. Acknowledge when read.",
      priority: "CRITICAL",
      requiresAck: true,
      departmentId: security?.id,
    },
    {
      subject: "Logistics: morning warehouse hours",
      body: "Warehouse open 07:00–11:00 only on load-in day. Bring asset codes for check-out.",
      priority: "NORMAL",
      departmentId: logistics?.id,
    },
    {
      subject: "Tech: channel assignments",
      body: "Radios: Ch1 Ops, Ch2 Security, Ch3 Medical, Ch4 Tech. Return all radios at end of shift.",
      priority: "NORMAL",
      departmentId: tech?.id,
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
  const q = (name: string) => queues.find((x) => x.name === name)?.id || queues[0]?.id;
  const tickets = [
    {
      title: "Main stage mic feedback",
      description: "Wireless A has feedback on house left. Need spare or re-scan.",
      severity: "HIGH",
      departmentId: q("Tech / AV"),
      isIncident: false,
    },
    {
      title: "Lost credential at Door 3",
      description: "Volunteer badge left at metal detector. Holding at security desk.",
      severity: "MEDIUM",
      departmentId: q("Security"),
    },
    {
      title: "INCIDENT: Attendee fall near escalator",
      description: "Non-staff visitor slip; medical on scene. Ops tracking.",
      severity: "CRITICAL",
      departmentId: q("Medical") || q("Operations"),
      isIncident: true,
    },
    {
      title: "Need more zip ties for pipe & drape",
      description: "Programming needs 2 packs before 10:00 panel turn.",
      severity: "LOW",
      departmentId: q("Logistics"),
    },
    {
      title: "Green room fridge not cooling",
      description: "Guest Relations — drinks warm. Facilities?",
      severity: "MEDIUM",
      departmentId: q("Operations"),
    },
  ];
  for (const t of tickets) {
    if (!t.departmentId) continue;
    try {
      await api("/helpdesk", { method: "POST", token, body: JSON.stringify(t) });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ helpdesk tickets");

  // ── Inventory ────────────────────────────────────────────────
  const assets = [
    { name: "Radio HT-10", category: "Radios", serialNumber: "RAD-010", location: "Ops cage", departmentId: inventory?.id },
    { name: "Radio HT-11", category: "Radios", serialNumber: "RAD-011", location: "Ops cage", departmentId: inventory?.id },
    { name: "Radio HT-12", category: "Radios", serialNumber: "RAD-012", location: "Security office", departmentId: security?.id },
    { name: "Laptop Loaner 3", category: "Laptops", serialNumber: "LT-103", location: "Tech room", departmentId: tech?.id },
    { name: "Laptop Loaner 4", category: "Laptops", serialNumber: "LT-104", location: "Tech room", departmentId: tech?.id },
    { name: "Master keys set B", category: "Keys", serialNumber: "KEY-B", location: "Security", departmentId: security?.id },
    { name: "Badge printer #2", category: "Equipment", serialNumber: "PRT-02", location: "Registration", departmentId: ops?.id },
    { name: "First-aid kit Rolling-1", category: "Medical", serialNumber: "MED-R1", location: "Medical post", departmentId: medical?.id },
    { name: "Gaffer tape case", category: "Consumables", serialNumber: "SUP-GT1", location: "Warehouse", departmentId: logistics?.id, quantity: 24, lowStockThreshold: 5 },
    { name: "Extension cord 50ft #7", category: "Power", serialNumber: "PWR-07", location: "Ballroom A", departmentId: tech?.id },
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
  // Check one out
  if (createdAssets[0]) {
    try {
      await api("/inventory/checkout", {
        method: "POST",
        token,
        body: JSON.stringify({
          codes: [createdAssets[0].assetCode],
          userId: vol1.id,
          notes: "Door 1 shift",
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
          userId: leadTech.id,
          notes: "Streaming station",
          expectedReturnAt: daysFromNow(1, 20),
        }),
      });
    } catch {
      /* ignore */
    }
  }
  console.log(`  ✓ inventory (${createdAssets.length} items)`);

  // ── Orders ───────────────────────────────────────────────────
  const ordering = await api<{ id: string; name: string }[]>(
    "/departments/ordering",
    { token },
  );
  const toDept = ordering[0]?.id || logistics?.id;
  for (const o of [
    {
      title: "AA batteries (pack of 24)",
      quantity: 4,
      description: "For wireless mics",
      toDeptId: toDept,
      fromDeptId: tech?.id,
    },
    {
      title: "Laminated door signs",
      quantity: 12,
      description: "Staff only / no cameras",
      toDeptId: toDept,
      fromDeptId: security?.id,
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
      title: "Door 1 — morning",
      departmentId: security?.id,
      startsAt: daysFromNow(3, 8),
      endsAt: daysFromNow(3, 12),
      location: "Door 1",
      slots: 3,
    },
    {
      title: "Door 1 — afternoon",
      departmentId: security?.id,
      startsAt: daysFromNow(3, 12),
      endsAt: daysFromNow(3, 18),
      location: "Door 1",
      slots: 3,
    },
    {
      title: "Main stage A1",
      departmentId: tech?.id,
      startsAt: daysFromNow(3, 9),
      endsAt: daysFromNow(3, 14),
      location: "Main stage FOH",
      slots: 2,
    },
    {
      title: "Ops desk coverage",
      departmentId: ops?.id,
      startsAt: daysFromNow(3, 8),
      endsAt: daysFromNow(3, 20),
      location: "Ops office",
      slots: 2,
    },
    {
      title: "Panel wrangler — block A",
      departmentId: programming?.id,
      startsAt: daysFromNow(3, 10),
      endsAt: daysFromNow(3, 13),
      location: "Hall B",
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
      // assign someone
      const assignee =
        s.departmentId === security?.id
          ? vol1.id
          : s.departmentId === tech?.id
            ? vol3.id
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
      departmentId: ops?.id,
      title: "Night → morning handoff",
      shiftLabel: "Night crew",
      body: "Badge printer jam cleared. Two open tickets on main stage. Master keys with Sam.",
    },
    {
      departmentId: security?.id,
      title: "Door coverage notes",
      shiftLabel: "AM",
      body: "Door 3 metal detector flaky — use wand. VIP list updated in Con Bible.",
    },
    {
      departmentId: tech?.id,
      title: "FOH notes",
      shiftLabel: "Load-in",
      body: "FOH laptop password in vault. Spare SM58 in flight case B.",
    },
  ]) {
    if (!h.departmentId) continue;
    try {
      await api("/handovers", { method: "POST", token, body: JSON.stringify(h) });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ handovers");

  // ── Budget ───────────────────────────────────────────────────
  for (const b of [
    { label: "Radio batteries bulk order", amount: 186.5, category: "Supplies", departmentId: logistics?.id },
    { label: "Emergency cable purchase", amount: 92.0, category: "Tech", departmentId: tech?.id },
    { label: "Staff pizza night", amount: 240.0, category: "Hospitality", departmentId: ops?.id },
    { label: "Print shop — door signs", amount: 65.25, category: "Print", departmentId: ops?.id },
  ]) {
    try {
      await api("/budget", { method: "POST", token, body: JSON.stringify(b) });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ budget line items");

  // ── Org chart ────────────────────────────────────────────────
  try {
    const root = await api<{ id: string }>("/org-chart", {
      method: "POST",
      token,
      body: JSON.stringify({ title: "Con Chair", userId: admin.id, sortOrder: 0 }),
    });
    for (const n of [
      { title: "Head of Operations", userId: admin.id, departmentId: ops?.id, parentId: root.id, sortOrder: 1 },
      { title: "Security Lead", userId: leadSec.id, departmentId: security?.id, parentId: root.id, sortOrder: 2 },
      { title: "Tech Lead", userId: leadTech.id, departmentId: tech?.id, parentId: root.id, sortOrder: 3 },
      { title: "Programming Lead", userId: leadProg.id, departmentId: programming?.id, parentId: root.id, sortOrder: 4 },
    ]) {
      await api("/org-chart", { method: "POST", token, body: JSON.stringify(n) });
    }
    console.log("  ✓ org chart");
  } catch (e) {
    console.warn("  ~ org chart:", (e as Error).message);
  }

  // ── Badges ───────────────────────────────────────────────────
  try {
    let badges = await api<{ id: string; name: string }[]>("/badges", { token });
    const ensureBadge = async (name: string, color: string, accessLevel: string) => {
      let b = badges.find((x) => x.name === name);
      if (!b) {
        b = await api("/badges", {
          method: "POST",
          token,
          body: JSON.stringify({ name, color, accessLevel }),
        });
        badges = await api("/badges", { token });
        b = badges.find((x) => x.name === name)!;
      }
      return b;
    };
    const staff = await ensureBadge("Staff", "#4f46e5", "All areas");
    const volBadge = await ensureBadge("Volunteer", "#0ea5e9", "Backstage");
    for (const uid of [vol1.id, vol2.id, vol3.id, vol4.id]) {
      try {
        await api(`/badges/${volBadge.id}/assign`, {
          method: "POST",
          token,
          body: JSON.stringify({ userId: uid }),
        });
      } catch {
        /* ignore */
      }
    }
    try {
      await api(`/badges/${staff.id}/assign`, {
        method: "POST",
        token,
        body: JSON.stringify({ userId: leadSec.id }),
      });
    } catch {
      /* ignore */
    }
    console.log("  ✓ badges");
  } catch (e) {
    console.warn("  ~ badges:", (e as Error).message);
  }

  // ── Radio ────────────────────────────────────────────────────
  for (const ch of [
    { name: "Ops", frequency: "Ch 1", description: "Command net", departmentId: ops?.id },
    { name: "Security", frequency: "Ch 2", departmentId: security?.id },
    { name: "Medical", frequency: "Ch 3", departmentId: medical?.id },
    { name: "Tech", frequency: "Ch 4", departmentId: tech?.id },
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
          callSign: ch.name === "Ops" ? "Ops-1" : undefined,
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
      departmentId: ops?.id,
      startsAt: daysFromNow(0, 8),
      endsAt: daysFromNow(0, 20),
      notes: "Primary Ops on-call",
    },
    {
      userId: leadSec.id,
      departmentId: security?.id,
      startsAt: daysFromNow(0, 8),
      endsAt: daysFromNow(1, 8),
      notes: "Security overnight",
    },
    {
      userId: leadTech.id,
      departmentId: tech?.id,
      startsAt: daysFromNow(3, 7),
      endsAt: daysFromNow(3, 23),
      notes: "Show day tech lead",
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
    const rooms = await api<{ id: string; name: string }[]>("/rooms", { token });
    const ensureRoom = async (name: string, capacity: number, location: string) => {
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
    const green = await ensureRoom("Panel Room A", 80, "Level 2");
    const brief = await ensureRoom("Briefing Room", 16, "Level 1");
    await api("/rooms/bookings", {
      method: "POST",
      token,
      body: JSON.stringify({
        roomId: green.id,
        title: "Guest of Honor green time",
        startsAt: daysFromNow(3, 14),
        endsAt: daysFromNow(3, 16),
        notes: "Water + quiet",
      }),
    });
    await api("/rooms/bookings", {
      method: "POST",
      token,
      body: JSON.stringify({
        roomId: brief.id,
        title: "Dept leads midday sync",
        startsAt: daysFromNow(3, 12),
        endsAt: daysFromNow(3, 12.75),
      }),
    });
    console.log("  ✓ rooms / bookings");
  } catch (e) {
    console.warn("  ~ rooms:", (e as Error).message);
  }

  // ── Run of show ──────────────────────────────────────────────
  for (const r of [
    {
      title: "Doors",
      startsAt: daysFromNow(3, 9),
      endsAt: daysFromNow(3, 9.25),
      location: "Lobby",
      departmentId: ops?.id,
      description: "House lights up, music bed",
    },
    {
      title: "Opening ceremonies",
      startsAt: daysFromNow(3, 10),
      endsAt: daysFromNow(3, 11),
      location: "Main stage",
      departmentId: programming?.id,
      description: "GoH intro; no flash photography",
    },
    {
      title: "Panel turn / reset",
      startsAt: daysFromNow(3, 11),
      endsAt: daysFromNow(3, 11.25),
      location: "Main stage",
      departmentId: tech?.id,
    },
    {
      title: "Evening concert load",
      startsAt: daysFromNow(3, 17),
      endsAt: daysFromNow(3, 18),
      location: "Main stage",
      departmentId: tech?.id,
    },
  ]) {
    try {
      await api("/run-of-show", { method: "POST", token, body: JSON.stringify(r) });
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
        title: "Mid-con pulse check",
        description: "Quick staff feedback (sample)",
        questions: [
          { id: "q1", type: "scale", label: "How is your shift going? (1-5)", required: true },
          { id: "q2", type: "textarea", label: "Any blockers?", required: false },
          {
            id: "q3",
            type: "single",
            label: "Department",
            required: true,
            options: ["Ops", "Security", "Tech", "Other"],
          },
        ],
      }),
    });
    await api(`/surveys/${survey.id}/responses`, {
      method: "POST",
      token,
      body: JSON.stringify({
        answers: { q1: "4", q2: "Need more radios at Door 2", q3: "Security" },
      }),
    });
    console.log("  ✓ surveys");
  } catch (e) {
    console.warn("  ~ surveys:", (e as Error).message);
  }

  // ── Vendors ──────────────────────────────────────────────────
  for (const v of [
    {
      name: "BrightLights AV Rentals",
      contactName: "Dana Lee",
      contactEmail: "dana@brightlights.example",
      booth: "Loading dock B",
      notes: "Delivers Friday 6am",
    },
    {
      name: "City Catering Co.",
      contactName: "Morgan Ellis",
      contactEmail: "events@citycatering.example",
      notes: "Staff meals Saturday",
    },
    {
      name: "PrintRight Signs",
      contactPhone: "+1-555-0144",
      booth: "N/A",
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
        name: "Saturday staff lunch",
        mealDate: daysFromNow(3, 12),
        notes: "Pick up at Ops",
        departmentId: ops?.id,
      }),
    });
    await api(`/meals/${meal.id}/select`, {
      method: "POST",
      token,
      body: JSON.stringify({ choice: "Vegetarian wrap", dietaryNote: "No onions" }),
    });
    console.log("  ✓ meals");
  } catch (e) {
    console.warn("  ~ meals:", (e as Error).message);
  }

  // ── Lost & found ─────────────────────────────────────────────
  for (const item of [
    {
      title: "Black umbrella",
      location: "Hall B",
      description: "Found near panel room",
      status: "FOUND",
    },
    {
      title: "iPhone case (no phone)",
      location: "Door 1",
      status: "FOUND",
    },
    {
      title: "Staff lanyard — blank",
      location: "Escalator landing",
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
      tags: ["map", "venue"],
      departmentId: ops?.id,
    },
    {
      title: "Stage plot — main",
      externalUrl: "https://example.com/stage/main.pdf",
      tags: ["tech", "stage"],
      departmentId: tech?.id,
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
      body: "Venue security: ext 2911\nMedical on-site: Ch 3 / ext 2912\nCon Manager cell: see Ops whiteboard",
      sortOrder: 2,
    },
    {
      title: "Radio etiquette",
      slug: "radio-etiquette",
      category: "Comms",
      body: "Clear speech, no names of minors, use call signs, release PTT fully.",
      sortOrder: 3,
    },
    {
      title: "VIP list handling",
      slug: "vip-handling",
      category: "Security",
      body: "VIP list is confidential. Verify photo ID. Escort via back hall only.",
      sortOrder: 4,
    },
  ]) {
    try {
      await api("/bible", { method: "POST", token, body: JSON.stringify(p) });
    } catch {
      /* ignore */
    }
  }
  console.log("  ✓ con bible pages");

  // ── Conference name ──────────────────────────────────────────
  try {
    await api("/settings", {
      method: "PUT",
      token,
      body: JSON.stringify({
        conferenceName: "ConStaff Demo Convention 2026",
        hotelSoloNightLimit: 3,
        hotelRoommateNightLimit: 5,
      }),
    });
    console.log("  ✓ conference settings");
  } catch {
    /* ignore */
  }

  console.log("\nSample data load complete.");
  console.log("Open https://conman-web.onrender.com and explore.");
  console.log("Extra logins (password changeme123):");
  console.log("  security.lead@conman.local");
  console.log("  tech.lead@conman.local");
  console.log("  maya.vol@conman.local");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
