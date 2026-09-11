import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getServer, type McServer } from "./config.js";

const BASE = "/api/v1/plugins/mpm";
const enc = encodeURIComponent;

async function req(s: McServer, path: string, opts: { method?: string; body?: unknown } = {}) {
  const { mineauthRequest } = await import("./mineauth.js");
  return mineauthRequest(s, path, opts);
}

function text(obj: unknown): string {
  return typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

export function registerMpmTools(mcp: McpServer, servers: Record<string, McServer>): void {
  const serverDesc =
    "Target Minecraft server (main / res / lobby ...). Omit for the default (main). Use list_servers if unsure.";
  const serverArg = { server: z.string().optional().describe(serverDesc) };

  // --- read: plugins ---
  mcp.tool(
    "mpm_plugins",
    "mpm plugin reads (MineAuth /api/v1/plugins/mpm/). " +
      "list: GET /plugins?filter=all|managed|unmanaged|outdated|locked. " +
      "get: GET /plugins/{name}. versions: GET /plugins/{name}/versions. " +
      "metadata: GET /plugins/{name}/metadata. history: GET /plugins/{name}/history. " +
      "deps: GET /plugins/{name}/deps?soft. outdated: GET /plugins/outdated. verify: GET /plugins/verify.",
    {
      ...serverArg,
      action: z.enum(["list", "get", "versions", "metadata", "history", "deps", "outdated", "verify"]),
      name: z.string().optional().describe("Plugin name (get/versions/metadata/history/deps)"),
      filter: z.string().optional().describe("list filter: all|managed|unmanaged|outdated|locked"),
      soft: z.boolean().optional().describe("deps: include softdepend in tree"),
    },
    async ({ server, action, name, filter, soft }) => {
      const s = getServer(servers, server);
      let path: string;
      switch (action) {
        case "list":
          path = `${BASE}/plugins${filter ? `?filter=${enc(filter)}` : ""}`;
          break;
        case "outdated":
          path = `${BASE}/plugins/outdated`;
          break;
        case "verify":
          path = `${BASE}/plugins/verify`;
          break;
        case "get":
          if (!name) throw new Error("name is required");
          path = `${BASE}/plugins/${enc(name)}`;
          break;
        case "versions":
          if (!name) throw new Error("name is required");
          path = `${BASE}/plugins/${enc(name)}/versions`;
          break;
        case "metadata":
          if (!name) throw new Error("name is required");
          path = `${BASE}/plugins/${enc(name)}/metadata`;
          break;
        case "history":
          if (!name) throw new Error("name is required");
          path = `${BASE}/plugins/${enc(name)}/history`;
          break;
        case "deps":
          if (!name) throw new Error("name is required");
          path = `${BASE}/plugins/${enc(name)}/deps${soft ? "?soft=true" : ""}`;
          break;
      }
      const data = await req(s, path!);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  // --- read: doctor / search / repositories ---
  mcp.tool(
    "mpm_status",
    "mpm health/search/repos reads. doctor: GET /doctor (missing deps, hash mismatch, outdated...). " +
      "search: GET /search?q=&limit= (Modrinth/Hangar/SpigotMC/GitHub cross-search, limit 1-50 default 10). " +
      "repositories: GET /repositories (priority-ordered sources).",
    {
      ...serverArg,
      action: z.enum(["doctor", "search", "repositories"]),
      q: z.string().optional().describe("search: keyword (required for search)"),
      limit: z.number().optional().describe("search: 1-50, default 10"),
    },
    async ({ server, action, q, limit }) => {
      const s = getServer(servers, server);
      let path: string;
      switch (action) {
        case "doctor":
          path = `${BASE}/doctor`;
          break;
        case "repositories":
          path = `${BASE}/repositories`;
          break;
        case "search":
          if (!q || !q.trim()) throw new Error("q is required for search");
          path = `${BASE}/search?q=${enc(q)}&limit=${limit ?? 10}`;
          break;
      }
      const data = await req(s, path!);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  // --- jobs ---
  mcp.tool(
    "mpm_jobs",
    "mpm async jobs (bulk update etc.). list: GET /jobs (summaries, newest first). " +
      "get: GET /jobs/{id} (poll while RUNNING; SUCCEEDED/FAILED carries results). " +
      "create: POST /jobs {type:'update_all', force?, skipIntegrity?} -> 201 + Location. 409 if same type already running.",
    {
      ...serverArg,
      action: z.enum(["list", "get", "create"]),
      id: z.string().optional().describe("Job ID (get)"),
      body: z.record(z.unknown()).optional().describe("create JSON body {type, force?, skipIntegrity?}"),
    },
    async ({ server, action, id, body }) => {
      const s = getServer(servers, server);
      if (action === "list") {
        const data = await req(s, `${BASE}/jobs`);
        return { content: [{ type: "text", text: text(data) }] };
      }
      if (action === "get") {
        if (!id) throw new Error("id is required for get");
        const data = await req(s, `${BASE}/jobs/${enc(id)}`);
        return { content: [{ type: "text", text: text(data) }] };
      }
      if (!body) throw new Error("body {type:'update_all',...} is required for create");
      const data = await req(s, `${BASE}/jobs`, { method: "POST", body });
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  // --- writes: plugin lifecycle ---
  mcp.tool(
    "mpm_plugins_write",
    "mpm plugin writes (MineAuth POST /api/v1/plugins/mpm/). " +
      "update-all: POST /plugins/update?force= (slow: minutes for many plugins; prefer jobs create update_all). " +
      "update: POST /plugins/{name}/update?force= (returns parent + synced children; skipped=true means intentional hold, not failure). " +
      "version: POST /plugins/{name}/version {version*, force?, skipIntegrity?} (sync: plugins reject with 409). " +
      "install: POST /plugins/{name}/install?force=. uninstall: POST /plugins/{name}/uninstall (needs restart). " +
      "lock/unlock: POST /plugins/{name}/lock|unlock.",
    {
      ...serverArg,
      action: z.enum(["update-all", "update", "version", "install", "uninstall", "lock", "unlock"]),
      name: z.string().optional().describe("Plugin name (all except update-all)"),
      force: z.boolean().optional().describe("update-all/update/install/version: force api-version mismatch"),
      body: z
        .record(z.unknown())
        .optional()
        .describe("version: {version*, force?, skipIntegrity?}"),
    },
    async ({ server, action, name, force, body }) => {
      const s = getServer(servers, server);
      const fq = force ? "?force=true" : "";
      switch (action) {
        case "update-all": {
          const data = await req(s, `${BASE}/plugins/update${fq}`, { method: "POST" });
          return { content: [{ type: "text", text: text(data) }] };
        }
        case "update": {
          if (!name) throw new Error("name is required");
          const data = await req(s, `${BASE}/plugins/${enc(name)}/update${fq}`, { method: "POST" });
          return { content: [{ type: "text", text: text(data) }] };
        }
        case "version": {
          if (!name || !body) throw new Error("name and body {version,...} are required");
          const data = await req(s, `${BASE}/plugins/${enc(name)}/version`, {
            method: "POST",
            body,
          });
          return { content: [{ type: "text", text: text(data) }] };
        }
        case "install": {
          if (!name) throw new Error("name is required");
          const data = await req(s, `${BASE}/plugins/${enc(name)}/install${fq}`, {
            method: "POST",
          });
          return { content: [{ type: "text", text: text(data) }] };
        }
        case "uninstall": {
          if (!name) throw new Error("name is required");
          const data = await req(s, `${BASE}/plugins/${enc(name)}/uninstall`, { method: "POST" });
          return { content: [{ type: "text", text: text(data) }] };
        }
        case "lock": {
          if (!name) throw new Error("name is required");
          const data = await req(s, `${BASE}/plugins/${enc(name)}/lock`, { method: "POST" });
          return { content: [{ type: "text", text: text(data) }] };
        }
        case "unlock": {
          if (!name) throw new Error("name is required");
          const data = await req(s, `${BASE}/plugins/${enc(name)}/unlock`, { method: "POST" });
          return { content: [{ type: "text", text: text(data) }] };
        }
      }
    },
  );
}
