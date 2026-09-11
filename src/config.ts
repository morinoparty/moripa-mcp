export interface McServer {
  baseUrl: string;
  token: string;
}

/** Worker bindings (vars + secrets). All optional so `wrangler dev` works bare. */
export interface MoripaEnv {
  SERVERS?: string;
  DEFAULT_SERVER?: string;
  MINEAUTH_BASE_URL?: string;
  MINEAUTH_SERVICE_TOKEN?: string;
  /** Optional full override: {"survival":{"baseUrl":"...","token?":"..."}} */
  MC_SERVERS_JSON?: string;
  BEARER_TOKEN?: string;
}

export const DEFAULT_BASE_URL = "https://api.morino.party";

function cleanBase(v: string): string {
  return v.replace(/\/+$/, "");
}

/**
 * Resolve servers.
 * Default: <MINEAUTH_BASE_URL>/<name> for each name in SERVERS,
 * all sharing the single MINEAUTH_SERVICE_TOKEN
 * (moripa's MineAuth instances share the signing key).
 * MC_SERVERS_JSON optionally overrides/adds entries (token falls back to shared).
 */
export function loadServers(env: MoripaEnv): Record<string, McServer> {
  const base = cleanBase(env.MINEAUTH_BASE_URL || DEFAULT_BASE_URL);
  const sharedToken = env.MINEAUTH_SERVICE_TOKEN || "";
  const names = (env.SERVERS || "main")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const out: Record<string, McServer> = {};
  for (const n of names) {
    out[n] = { baseUrl: `${base}/${n}`, token: sharedToken };
  }

  if (env.MC_SERVERS_JSON) {
    try {
      const parsed = JSON.parse(env.MC_SERVERS_JSON) as Record<string, Partial<McServer>>;
      for (const [name, v] of Object.entries(parsed)) {
        if (!v || typeof v.baseUrl !== "string") continue;
        out[name] = {
          baseUrl: cleanBase(v.baseUrl),
          token: typeof v.token === "string" && v.token ? v.token : sharedToken,
        };
      }
    } catch {
      // ignore malformed override, keep list-based servers
    }
  }
  return out;
}

export function serverNames(servers: Record<string, McServer>): string[] {
  return Object.keys(servers);
}

export function defaultServerName(servers: Record<string, McServer>): string {
  if (servers["main"]) return "main";
  return serverNames(servers)[0] ?? "main";
}

export function getServer(servers: Record<string, McServer>, name?: string): McServer {
  const key = name || defaultServerName(servers);
  const s = servers[key];
  if (!s) {
    throw new Error(`unknown server "${key}". available: ${serverNames(servers).join(", ") || "(none)"}`);
  }
  if (!s.token) {
    throw new Error(`server "${key}" has no service token (set MINEAUTH_SERVICE_TOKEN)`);
  }
  return s;
}
