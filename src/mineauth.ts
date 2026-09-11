import type { McServer } from "./config.js";

export interface MineAuthOptions {
  method?: string;
  body?: unknown;
}

/**
 * Minimal MineAuth Service Token client.
 * Every request sends `Authorization: Bearer <service token>`.
 */
export async function mineauthRequest<T>(
  server: McServer,
  path: string,
  opts: MineAuthOptions = {},
): Promise<T> {
  const url = `${server.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${server.token}`,
      "Content-Type": "application/json",
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MineAuth ${res.status} ${res.statusText} for ${path}: ${text.slice(0, 500)}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

const enc = encodeURIComponent;

export const mineauth = {
  listPlugins: (s: McServer) => mineauthRequest(s, "/api/v1/commons/server/plugins"),
  listIntegrations: (s: McServer) => mineauthRequest(s, "/api/v1/plugins/availableIntegrations"),
  onlinePlayers: (s: McServer) => mineauthRequest(s, "/api/v1/commons/server/players"),
  tickets: (s: McServer, player: string) =>
    mineauthRequest(s, `/api/v1/plugins/tickets/tickets/${enc(player)}`),
  ticketDetail: (s: McServer, player: string, id: number) =>
    mineauthRequest(s, `/api/v1/plugins/tickets/tickets/${enc(player)}/${id}`),
  ticketsAll: (
    s: McServer,
    opts: { status?: string; player?: string; cursor?: number; limit?: number } = {},
  ) => {
    const q = new URLSearchParams();
    if (opts.status) q.set("status", opts.status);
    if (opts.player) q.set("player", opts.player);
    if (opts.cursor !== undefined) q.set("cursor", String(opts.cursor));
    if (opts.limit !== undefined) q.set("limit", String(opts.limit));
    const qs = q.toString();
    return mineauthRequest(s, `/api/v1/plugins/tickets/tickets${qs ? `?${qs}` : ""}`);
  },
  claims: (s: McServer, player: string) =>
    mineauthRequest(s, `/api/v1/plugins/griefprevention/claims/${enc(player)}`),
  balance: (s: McServer, player: string) =>
    mineauthRequest(s, `/api/v1/plugins/vault/balance/${enc(player)}`),
};
