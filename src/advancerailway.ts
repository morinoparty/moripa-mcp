import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defaultServerName, getServer, serverNames, type McServer } from "./config.js";

const BASE = "/api/v1/plugins/advancerailway";
const enc = encodeURIComponent;

async function req(s: McServer, path: string, opts: { method?: string; body?: unknown } = {}) {
  const { mineauthRequest } = await import("./mineauth.js");
  return mineauthRequest(s, path, opts);
}

function text(obj: unknown): string {
  return typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

export function registerAdvanceRailwayTools(mcp: McpServer, servers: Record<string, McServer>): void {
  const serverDesc =
    "Target Minecraft server (main / res / lobby ...). Omit for the default (main). Use list_servers if unsure.";
  const serverArg = { server: z.string().optional().describe(serverDesc) };
  const hint = `Available: ${serverNames(servers).join(", ") || "(none)"}. Default: ${defaultServerName(servers)}.`;

  // --- route (most used: もりもと -> あつもり etc.) ---
  mcp.tool(
    "adv_route",
    "AdvanceRailway: 2 stations shortest route (MineAuth GET /api/v1/plugins/advancerailway/route?from=&to=). from/to accept slug or UUID. Returns totalTime (sec) + legs[] with mode RAIL/WALK, fromName/toName, timeRequired, railwaySlug, line. WALK legs are straight-line/4.317 estimates.",
    {
      ...serverArg,
      from: z.string().describe("Departure station slug or UUID (e.g. mrmt)"),
      to: z.string().describe("Arrival station slug or UUID (e.g. atmk)"),
    },
    async ({ server, from, to }) => {
      const s = getServer(servers, server);
      const data = await req(s, `${BASE}/route?from=${enc(from)}&to=${enc(to)}`);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  // --- stations ---
  mcp.tool(
    "adv_stations",
    "AdvanceRailway stations: list/get/railways/nearest/create/update/delete. " +
      "list: GET /stations?limit&offset. get: GET /stations/{id-or-slug}. railways: GET /stations/{id}/railways. " +
      "nearest: GET /nearest-station?world&x&z. create: POST /stations {slug,name,world,point:{x,y,z},color?}. " +
      "update: PATCH /stations/{id} {partial fields, unset?:[overrideSize]}. delete: DELETE /stations/{id}. " +
      hint,
    {
      ...serverArg,
      action: z.enum(["list", "get", "railways", "nearest", "create", "update", "delete"]),
      id: z.string().optional().describe("Station slug or UUID (get/railways/update/delete)"),
      limit: z.number().optional().describe("list: page size, default 100 max 500"),
      offset: z.number().optional().describe("list: skip count"),
      world: z.string().optional().describe("nearest: world name"),
      x: z.number().optional().describe("nearest: x"),
      z: z.number().optional().describe("nearest: z"),
      body: z.record(z.unknown()).optional().describe("create/update JSON body"),
    },
    async ({ server, action, id, limit, offset, world, x, z, body }) => {
      const s = getServer(servers, server);
      let path: string;
      let opts: { method?: string; body?: unknown } = {};
      switch (action) {
        case "list":
          path = `${BASE}/stations?limit=${limit ?? 100}&offset=${offset ?? 0}`;
          break;
        case "get":
          if (!id) throw new Error("id is required for get");
          path = `${BASE}/stations/${enc(id)}`;
          break;
        case "railways":
          if (!id) throw new Error("id is required for railways");
          path = `${BASE}/stations/${enc(id)}/railways`;
          break;
        case "nearest":
          if (!world || x === undefined || z === undefined)
            throw new Error("world, x, z are required for nearest");
          path = `${BASE}/nearest-station?world=${enc(world)}&x=${x}&z=${z}`;
          break;
        case "create":
          if (!body) throw new Error("body is required for create");
          path = `${BASE}/stations`;
          opts = { method: "POST", body };
          break;
        case "update":
          if (!id || !body) throw new Error("id and body are required for update");
          path = `${BASE}/stations/${enc(id)}`;
          opts = { method: "PATCH", body };
          break;
        case "delete":
          if (!id) throw new Error("id is required for delete");
          path = `${BASE}/stations/${enc(id)}`;
          opts = { method: "DELETE" };
          break;
      }
      const data = await req(s, path!, opts);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  // --- railways ---
  mcp.tool(
    "adv_railways",
    "AdvanceRailway railways: list/get/create/update/delete. " +
      "list: GET /railways?limit&offset. get: GET /railways/{id-or-slug}. " +
      "create: POST /railways {slug,world,startPoint:{x,y,z},endPoint:{x,y,z},flags (N/S/E/W),group?,lineType?,fromStation?,toStation?} (server traces real rails). " +
      "update: PATCH /railways/{id} {slug?,group?,lineType?,timeRequired?,fromStation?,toStation?,startPoint?,endPoint?,flags?,unset?:[group]} (retrace only when startPoint+endPoint+flags all set). " +
      "delete: DELETE /railways/{id}.",
    {
      ...serverArg,
      action: z.enum(["list", "get", "create", "update", "delete"]),
      id: z.string().optional().describe("Railway slug or UUID (get/update/delete)"),
      limit: z.number().optional(),
      offset: z.number().optional(),
      body: z.record(z.unknown()).optional().describe("create/update JSON body"),
    },
    async ({ server, action, id, limit, offset, body }) => {
      const s = getServer(servers, server);
      let path: string;
      let opts: { method?: string; body?: unknown } = {};
      switch (action) {
        case "list":
          path = `${BASE}/railways?limit=${limit ?? 100}&offset=${offset ?? 0}`;
          break;
        case "get":
          if (!id) throw new Error("id is required for get");
          path = `${BASE}/railways/${enc(id)}`;
          break;
        case "create":
          if (!body) throw new Error("body is required for create");
          path = `${BASE}/railways`;
          opts = { method: "POST", body };
          break;
        case "update":
          if (!id || !body) throw new Error("id and body are required for update");
          path = `${BASE}/railways/${enc(id)}`;
          opts = { method: "PATCH", body };
          break;
        case "delete":
          if (!id) throw new Error("id is required for delete");
          path = `${BASE}/railways/${enc(id)}`;
          opts = { method: "DELETE" };
          break;
      }
      const data = await req(s, path!, opts);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  // --- groups ---
  mcp.tool(
    "adv_groups",
    "AdvanceRailway groups (line names + numbering): list/get/railways/stations/set-stations/create/update/delete. " +
      "list: GET /groups?limit&offset. get: GET /groups/{id-or-slug}. railways: GET /groups/{id}/railways. " +
      "stations: GET /groups/{id}/stations (ordered + numbering). set-stations: PUT /groups/{id}/stations {stations:[slug-or-UUID...]} (full replace, order = position). " +
      "create: POST /groups {slug,name,color?,numberingPrefix?,numberingStart?}. update: PATCH /groups/{id} {partial, unset?:[numberingPrefix]}. delete: DELETE /groups/{id}.",
    {
      ...serverArg,
      action: z.enum([
        "list",
        "get",
        "railways",
        "stations",
        "set-stations",
        "create",
        "update",
        "delete",
      ]),
      id: z.string().optional().describe("Group slug or UUID"),
      limit: z.number().optional(),
      offset: z.number().optional(),
      body: z.record(z.unknown()).optional().describe("create/update/set-stations JSON body"),
    },
    async ({ server, action, id, limit, offset, body }) => {
      const s = getServer(servers, server);
      let path: string;
      let opts: { method?: string; body?: unknown } = {};
      switch (action) {
        case "list":
          path = `${BASE}/groups?limit=${limit ?? 100}&offset=${offset ?? 0}`;
          break;
        case "get":
          if (!id) throw new Error("id is required for get");
          path = `${BASE}/groups/${enc(id)}`;
          break;
        case "railways":
          if (!id) throw new Error("id is required for railways");
          path = `${BASE}/groups/${enc(id)}/railways`;
          break;
        case "stations":
          if (!id) throw new Error("id is required for stations");
          path = `${BASE}/groups/${enc(id)}/stations`;
          break;
        case "set-stations":
          if (!id || !body) throw new Error("id and body {stations:[...]} are required");
          path = `${BASE}/groups/${enc(id)}/stations`;
          opts = { method: "PUT", body };
          break;
        case "create":
          if (!body) throw new Error("body is required for create");
          path = `${BASE}/groups`;
          opts = { method: "POST", body };
          break;
        case "update":
          if (!id || !body) throw new Error("id and body are required for update");
          path = `${BASE}/groups/${enc(id)}`;
          opts = { method: "PATCH", body };
          break;
        case "delete":
          if (!id) throw new Error("id is required for delete");
          path = `${BASE}/groups/${enc(id)}`;
          opts = { method: "DELETE" };
          break;
      }
      const data = await req(s, path!, opts);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  // --- stats ---
  mcp.tool(
    "adv_stats",
    "AdvanceRailway network summary (MineAuth GET /api/v1/plugins/advancerailway/stats). Returns {stations, railways, groups} counts.",
    serverArg,
    async ({ server }) => {
      const s = getServer(servers, server);
      const data = await req(s, `${BASE}/stats`);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );
}
