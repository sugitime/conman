/** Canonical permission keys used by policies and role defaults */
export const PERMISSIONS = [
  // System
  "settings.manage",
  "users.manage",
  "policies.manage",
  "features.manage",
  "departments.manage",
  "orgchart.manage",
  "master_calendar.manage",
  "helpdesk.master",
  "comms.broadcast",
  "todos.any",

  // Department-scoped (checked with department context where relevant)
  "department.manage",
  "department.invite",
  "helpdesk.create",
  "helpdesk.work",
  "calendar.manage",
  "calendar.overlay_request",
  "todos.manage",
  "comms.manage",
  "documents.manage",
  "surveys.manage",
  "handover.manage",
  "shifts.manage",
  "inventory.manage",
  "orders.request",
  "orders.fulfill",
  "budget.manage",
  "lostfound.manage",
  "media.manage",
  "bible.manage",
  "badges.manage",
  "radio.manage",
  "oncall.manage",
  "rooms.manage",
  "runofshow.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const GLOBAL_FEATURES = [
  "org_chart",
  "badge_system",
  "shift_scheduling",
  "communications_hub",
  "asset_inventory",
  "radio_channels",
  "on_call_roster",
  "room_booking",
  "budget_tracking",
  "lost_and_found",
  "media_gallery",
  "con_bible",
  "helpdesk",
  "calendar",
  "todos",
  "documents",
  "surveys",
  "handover_notes",
  "item_orders",
  "run_of_show",
] as const;

export type GlobalFeature = (typeof GLOBAL_FEATURES)[number];

export const DEPARTMENT_FEATURES = [
  "helpdesk",
  "calendar",
  "todos",
  "communications",
  "documents",
  "surveys",
  "handover_notes",
  "shifts",
  "inventory",
  "run_of_show",
  "budget",
  "item_orders",
] as const;

export type DepartmentFeature = (typeof DEPARTMENT_FEATURES)[number];

export const DEFAULT_GLOBAL_FEATURES: Record<GlobalFeature, boolean> = {
  org_chart: true,
  badge_system: true,
  shift_scheduling: true,
  communications_hub: true,
  asset_inventory: true,
  radio_channels: true,
  on_call_roster: true,
  room_booking: true,
  budget_tracking: true,
  lost_and_found: true,
  media_gallery: true,
  con_bible: true,
  helpdesk: true,
  calendar: true,
  todos: true,
  documents: true,
  surveys: true,
  handover_notes: true,
  item_orders: true,
  run_of_show: true,
};

export const DEFAULT_DEPARTMENT_FEATURES: Record<DepartmentFeature, boolean> = {
  helpdesk: true,
  calendar: true,
  todos: true,
  communications: true,
  documents: true,
  surveys: true,
  handover_notes: true,
  shifts: true,
  inventory: true,
  run_of_show: true,
  budget: true,
  item_orders: true,
};

/** Baseline permissions by system role (policies add more) */
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  CON_MANAGER: [...PERMISSIONS],
  DEPARTMENT_LEAD: [
    "department.manage",
    "department.invite",
    "helpdesk.create",
    "helpdesk.work",
    "calendar.manage",
    "calendar.overlay_request",
    "todos.manage",
    "comms.manage",
    "documents.manage",
    "surveys.manage",
    "handover.manage",
    "shifts.manage",
    "inventory.manage",
    "orders.request",
    "orders.fulfill",
    "budget.manage",
    "runofshow.manage",
  ],
  VOLUNTEER: [
    "helpdesk.create",
    "calendar.overlay_request",
    "documents.manage",
  ],
  GUEST: ["documents.manage"],
};

export function featureToPermissionGate(feature: GlobalFeature): string {
  return `feature:${feature}`;
}
