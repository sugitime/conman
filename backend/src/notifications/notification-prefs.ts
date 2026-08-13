/** Event keys users can opt into */
export const NOTIFICATION_EVENTS = [
  {
    key: "todo.assigned",
    label: "Todo assigned to me",
    group: "Todos",
  },
  {
    key: "todo.updated",
    label: "Todo I follow was updated",
    group: "Todos",
  },
  {
    key: "todo.comment",
    label: "New message on my todo",
    group: "Todos",
  },
  {
    key: "ticket.assigned",
    label: "Helpdesk ticket assigned to me",
    group: "Helpdesk",
  },
  {
    key: "ticket.updated",
    label: "Ticket I follow was updated",
    group: "Helpdesk",
  },
  {
    key: "ticket.comment",
    label: "New message on my ticket",
    group: "Helpdesk",
  },
  {
    key: "ticket.severity",
    label: "Ticket severity raised",
    group: "Helpdesk",
  },
  {
    key: "load_task.assigned",
    label: "Load schedule task assigned to me",
    group: "Load schedule",
  },
  {
    key: "load_task.updated",
    label: "Load task I follow was updated",
    group: "Load schedule",
  },
  {
    key: "load_task.comment",
    label: "New message on my load task",
    group: "Load schedule",
  },
  {
    key: "load_task.status",
    label: "Load task status changed",
    group: "Load schedule",
  },
] as const;

export type NotificationEventKey =
  (typeof NOTIFICATION_EVENTS)[number]["key"];

export type ChannelPrefs = {
  inApp: boolean;
  email: boolean;
};

export type NotificationPrefs = {
  channels: ChannelPrefs;
  events: Partial<Record<NotificationEventKey, ChannelPrefs>>;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  channels: { inApp: true, email: false },
  events: {
    "todo.assigned": { inApp: true, email: false },
    "todo.updated": { inApp: true, email: false },
    "todo.comment": { inApp: true, email: false },
    "ticket.assigned": { inApp: true, email: true },
    "ticket.updated": { inApp: true, email: false },
    "ticket.comment": { inApp: true, email: false },
    "ticket.severity": { inApp: true, email: true },
    "load_task.assigned": { inApp: true, email: false },
    "load_task.updated": { inApp: true, email: false },
    "load_task.comment": { inApp: true, email: false },
    "load_task.status": { inApp: true, email: false },
  },
};

export function mergePrefs(raw: unknown): NotificationPrefs {
  const r = (raw || {}) as Partial<NotificationPrefs>;
  const events = { ...DEFAULT_NOTIFICATION_PREFS.events };
  if (r.events) {
    for (const [k, v] of Object.entries(r.events)) {
      if (v && typeof v === "object") {
        events[k as NotificationEventKey] = {
          inApp: (v as ChannelPrefs).inApp !== false,
          email: !!(v as ChannelPrefs).email,
        };
      }
    }
  }
  return {
    channels: {
      inApp: r.channels?.inApp !== false,
      email: !!r.channels?.email,
    },
    events,
  };
}

export function resolveChannels(
  prefs: NotificationPrefs,
  eventKey: NotificationEventKey,
): { inApp: boolean; email: boolean } {
  const event = prefs.events[eventKey] || { inApp: true, email: false };
  return {
    inApp: prefs.channels.inApp !== false && event.inApp !== false,
    email: !!prefs.channels.email && !!event.email,
  };
}
