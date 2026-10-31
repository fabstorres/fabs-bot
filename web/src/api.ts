export class Unpaired extends Error {}

async function call<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    signal,
  });
  if (res.status === 401) throw new Unpaired("This device isn't paired yet.");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => call<T>("GET", path, undefined, signal),
  post: <T>(path: string, body: unknown = {}) => call<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => call<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => call<T>("PATCH", path, body),
  del: <T>(path: string) => call<T>("DELETE", path),
  async upload(files: File[]): Promise<{ fileId: string; name: string; size: number }[]> {
    const form = new FormData();
    for (const f of files) form.append("file", f);
    const res = await fetch("/api/upload", { method: "POST", body: form, credentials: "same-origin" });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },
};

export function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const isImage = (name: string) => /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name);

export function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const diff = (now.getTime() - ts) / 86_400_000;
  if (diff < 6) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
