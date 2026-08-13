const API_BASE = import.meta.env.VITE_API_URL || "";

export type ApiError = { message: string; status: number };

const CONFERENCE_KEY = "conman_conference_id";

function getToken() {
  return localStorage.getItem("conman_token");
}

export function getConferenceId() {
  return localStorage.getItem(CONFERENCE_KEY);
}

export function setConferenceId(id: string | null) {
  if (id) localStorage.setItem(CONFERENCE_KEY, id);
  else localStorage.removeItem(CONFERENCE_KEY);
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const conId = getConferenceId();
  if (conId) headers.set("X-Conference-Id", conId);

  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message || body.error || message;
      if (Array.isArray(message)) message = message.join(", ");
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      localStorage.removeItem("conman_token");
      if (!path.startsWith("/auth/login")) {
        window.location.href = "/login";
      }
    }
    throw { message, status: res.status } as ApiError;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
