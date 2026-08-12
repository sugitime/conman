/**
 * Canonical DEF CON department list for bootstrap / sample data.
 * Flags are sensible defaults and can be changed in the app.
 */
export type DefconDeptSeed = {
  name: string;
  color: string;
  description?: string;
  /** Can fulfill item orders (stock / merch / supply) */
  isOrderingDept: boolean;
  /** Appears in helpdesk assignment dropdown */
  helpdeskQueueAccess: boolean;
};

const palette = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
  "#06b6d4",
  "#a855f7",
  "#84cc16",
  "#e11d48",
  "#2563eb",
];

function c(i: number) {
  return palette[i % palette.length];
}

/** Departments that typically run helpdesk / ticket queues */
const HELPDESK = new Set([
  "KEVOPS",
  "SOC",
  "Hotline",
  "Dispatch",
  "NOC",
  "NFO",
  "Press",
  "Human Registration",
  "Inhuman Registration",
  "Vendor",
  "Speaker Ops",
  "Quartermaster",
]);

/** Departments that typically fulfill supply / merch orders */
const ORDERING = new Set(["Quartermaster", "Merch", "Vendor", "Sales and Sponsorships"]);

const NAMES = [
  "KEVOPS",
  "Design and Defacement",
  "Social Media",
  "Photo",
  "Finance",
  "Vendor",
  "Merch",
  "Human Registration",
  "Quartermaster",
  "Sales and Sponsorships",
  "Parties",
  "Exhibitors",
  "Content and Coordination",
  "Hacker Tracker",
  "Inhuman Registration",
  "Arts & Entertainment",
  "SOC",
  "Hotline",
  "Contests",
  "Black Badge Board",
  "Demo Labs",
  "Villages",
  "Policy Village",
  "DC NextGen",
  "HDA",
  "Communities",
  "Dispatch",
  "NFO",
  "Press",
  "Speaker Ops",
  "CFP",
  "Workshops",
  "NOC",
  "DCTV",
  "Creator Stage Ops",
  "Training",
  "DEF CON Groups",
] as const;

export const DEFCON_DEPARTMENTS: DefconDeptSeed[] = NAMES.map((name, i) => ({
  name,
  color: c(i),
  description: `DEF CON — ${name}`,
  isOrderingDept: ORDERING.has(name),
  helpdeskQueueAccess: HELPDESK.has(name),
}));
