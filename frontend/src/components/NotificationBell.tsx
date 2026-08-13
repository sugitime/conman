import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";

type NotificationItem = {
  id: string;
  title: string;
  body?: string | null;
  href?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [count, setCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, unread] = await Promise.all([
        api<NotificationItem[]>("/notifications?limit=30"),
        api<{ count: number }>("/notifications/unread-count"),
      ]);
      setItems(list);
      setCount(unread.count);
    } catch {
      /* ignore when logged out */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function markAll() {
    await api("/notifications/read-all", { method: "POST" });
    await refresh();
  }

  async function openItem(n: NotificationItem) {
    if (!n.readAt) {
      await api(`/notifications/${n.id}/read`, { method: "POST" });
    }
    setOpen(false);
    await refresh();
    if (n.href) navigate(n.href);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          void refresh();
        }}
        className="relative rounded-lg p-2 text-slate-300 hover:bg-white/5 hover:text-white"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:bottom-auto sm:left-full sm:top-0 sm:mb-0 sm:ml-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-semibold text-slate-800">
              Notifications
            </span>
            {count > 0 ? (
              <button
                type="button"
                className="text-xs text-indigo-600 hover:underline"
                onClick={() => void markAll()}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!items.length ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">
                You&apos;re all caught up.
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void openItem(n)}
                  className={cn(
                    "block w-full border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50",
                    !n.readAt && "bg-indigo-50/60",
                  )}
                >
                  <div className="text-sm font-medium text-slate-900">
                    {n.title}
                  </div>
                  {n.body ? (
                    <div className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                      {n.body}
                    </div>
                  ) : null}
                  <div className="mt-1 text-[11px] text-slate-400">
                    {formatDate(n.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-100 p-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full !text-xs"
              onClick={() => {
                setOpen(false);
                navigate("/profile#notifications");
              }}
            >
              Notification settings
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
