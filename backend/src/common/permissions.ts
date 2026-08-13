/** Canonical permission keys used by policies and role defaults */
export const PERMISSIONS = [
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
  "audit.view",
  "kiosk.manage",
  "vendors.manage",
  "meals.manage",
  "stafflists.print",
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
  "inventory.checkout",
  "orders.request",
  "orders.fulfill",
  "budget.manage",
  "budget.approve",
  "lostfound.manage",
  "media.manage",
  "bible.manage",
  "badges.manage",
  "radio.manage",
  "oncall.manage",
  "rooms.manage",
  "runofshow.manage",
  "load_schedule.manage",
  "load_schedule.view_all",
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
  "vendors",
  "meals",
  "kiosk_checkin",
  "staff_lists",
  "audit_log",
  "schedule_publishing",
  "load_schedule",
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
  "load_schedule",
] as const;

export type DepartmentFeature = (typeof DEPARTMENT_FEATURES)[number];

export const DEFAULT_GLOBAL_FEATURES: Record<GlobalFeature, boolean> = Object.fromEntries(
  GLOBAL_FEATURES.map((f) => [f, true]),
) as Record<GlobalFeature, boolean>;

export const DEFAULT_DEPARTMENT_FEATURES: Record<DepartmentFeature, boolean> =
  Object.fromEntries(DEPARTMENT_FEATURES.map((f) => [f, true])) as Record<
    DepartmentFeature,
    boolean
  >;

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
    "inventory.checkout",
    "orders.request",
    "orders.fulfill",
    "budget.manage",
    "runofshow.manage",
    "load_schedule.manage",
    "meals.manage",
    "stafflists.print",
  ],
  VOLUNTEER: [
    "helpdesk.create",
    "calendar.overlay_request",
    "documents.manage",
    "inventory.checkout",
    "load_schedule.manage",
  ],
  GUEST: ["documents.manage"],
};
