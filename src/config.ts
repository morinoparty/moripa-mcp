export interface McServer {
  baseUrl: string;
  token: string;
}

function parseServersJson(raw: string | undefined): Record<string, McServer> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, McServer>;
    const out: Record<string, McServer> = {};
    for (const [name, v] of Object.entries(parsed)) {
      if (!v || typeof v.baseUrl !== "string" || typeof v.token !== "string") continue;
      out[name] = { baseUrl: v.baseUrl.replace(/\/$/, ""), token: v.token };
    }
    return out;
  } catch {
    return {};
  }
}

/** Single-server fallback (MC_SERVER_URL + MC_SERVER_TOKEN) so local dev is easy. */
function singleServerFallback(): Record<string, McServer> {
  const baseUrl = process.env.MC_SERVER_URL;
  const token = process.env.MC_SERVER_TOKEN;
  if (baseUrl && token) {
    return { default: { baseUrl: baseUrl.replace(/\/$/, ""), token } };
  }
  return {};
}

export function loadServers(): Record<string, McServer> {
  const fromJson = parseServersJson(process.env.MC_SERVERS_JSON);
  if (Object.keys(fromJson).length > 0) return fromJson;
  return singleServerFallback();
}

export function serverNames(servers: Record<string, McServer>): string[] {
  return Object.keys(servers);
}

export function getServer(servers: Record<string, McServer>, name: string): McServer {
  const s = servers[name];
  if (!s) {
    throw new Error(`unknown server "${name}". available: ${serverNames(servers).join(", ") || "(none)"}`);
  }
  return s;
}
