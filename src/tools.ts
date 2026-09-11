import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getServer, loadServers, serverNames } from "./config.js";
import { mineauth, mineauthRequest } from "./mineauth.js";

const serverDesc =
  "Target Minecraft server name (key of MC_SERVERS_JSON, e.g. lobby / survival). Use list_servers if unsure.";

function serversHint(): string {
  const names = serverNames(loadServers());
  return names.length > 0 ? `Available: ${names.join(", ")}` : "No servers configured (set MC_SERVERS_JSON)";
}

function text(obj: unknown): string {
  return typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

export function registerTools(mcp: McpServer): void {
  mcp.tool("list_servers", "List configured Minecraft servers", {}, async () => {
    const servers = loadServers();
    return {
      content: [{ type: "text", text: text({ servers: serverNames(servers) }) }],
    };
  });

  mcp.tool(
    "list_plugins",
    "List installed plugins on a Minecraft server (MineAuth: GET /api/v1/commons/server/plugins). Needs Service Token.",
    { server: z.string().describe(serverDesc) },
    async ({ server }) => {
      const s = getServer(loadServers(), server);
      const data = await mineauth.listPlugins(s);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  mcp.tool(
    "list_integrations",
    "List MineAuth addon integrations (namespaces like vault / griefprevention / tickets).",
    { server: z.string().describe(serverDesc) },
    async ({ server }) => {
      const s = getServer(loadServers(), server);
      const data = await mineauth.listIntegrations(s);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  mcp.tool(
    "get_online_players",
    "List currently online players (MineAuth: GET /api/v1/commons/server/players).",
    { server: z.string().describe(serverDesc) },
    async ({ server }) => {
      const s = getServer(loadServers(), server);
      const data = await mineauth.onlinePlayers(s);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  mcp.tool(
    "get_tickets",
    "Get PureTickets tickets for a player (all statuses).",
    {
      server: z.string().describe(serverDesc),
      player: z.string().describe("Player name, UUID, or 'me' (service token can query anyone)"),
    },
    async ({ server, player }) => {
      const s = getServer(loadServers(), server);
      const data = await mineauth.tickets(s, player);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  mcp.tool(
    "get_ticket_detail",
    "Get a single ticket with interaction history.",
    {
      server: z.string().describe(serverDesc),
      player: z.string().describe("Ticket owner"),
      id: z.number().describe("Ticket ID"),
    },
    async ({ server, player, id }) => {
      const s = getServer(loadServers(), server);
      const data = await mineauth.ticketDetail(s, player, id);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  mcp.tool(
    "get_claims",
    "Get GriefPrevention claims for a player.",
    {
      server: z.string().describe(serverDesc),
      player: z.string().describe("Player name or UUID"),
    },
    async ({ server, player }) => {
      const s = getServer(loadServers(), server);
      const data = await mineauth.claims(s, player);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  mcp.tool(
    "get_balance",
    "Get Vault economy balance for a player.",
    {
      server: z.string().describe(serverDesc),
      player: z.string().describe("Player name or UUID"),
    },
    async ({ server, player }) => {
      const s = getServer(loadServers(), server);
      const data = await mineauth.balance(s, player);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  mcp.tool(
    "ticket_context",
    "Aggregate context for ticket triage: ticket detail + player's claims + balance + online players. " +
      "NOTE: nearby-claims-by-location and last-login need new MineAuth addons (see README); " +
      "this tool returns player-scoped data today and marks the gaps explicitly.",
    {
      server: z.string().describe(serverDesc),
      player: z.string().describe("Ticket owner"),
      ticketId: z.number().optional().describe("If set, include that ticket's detail"),
    },
    async ({ server, player, ticketId }) => {
      const s = getServer(loadServers(), server);
      const [tickets, claims, balance, online] = await Promise.all([
        mineauth.tickets(s, player).catch((e: Error) => ({ _error: e.message })),
        mineauth.claims(s, player).catch((e: Error) => ({ _error: e.message })),
        mineauth.balance(s, player).catch((e: Error) => ({ _error: e.message })),
        mineauth.onlinePlayers(s).catch((e: Error) => ({ _error: e.message })),
      ]);
      const detail =
        ticketId !== undefined
          ? await mineauth.ticketDetail(s, player, ticketId).catch((e: Error) => ({ _error: e.message }))
          : null;
      return {
        content: [
          {
            type: "text",
            text: text({
              server,
              player,
              ticketId: ticketId ?? null,
              ticketDetail: detail,
              tickets,
              claims,
              balance,
              onlinePlayers: online,
              gaps: {
                nearbyClaimsByLocation: "TODO: needs MineAuth addon (claims search by world/x/y/z/radius)",
                lastLogin: "TODO: needs MineAuth addon (offline-player lastPlayed / playtime)",
                townInfo: "TODO: needs MineAuth addon for the town plugin in use",
              },
              hint: serversHint(),
            }),
          },
        ],
      };
    },
  );

  mcp.tool(
    "mineauth_request",
    "Generic passthrough to MineAuth (for new addon endpoints like town info without redeploying the MCP). " +
      "Path must start with /api/. Example: /api/v1/plugins/vault/balance/Notch",
    {
      server: z.string().describe(serverDesc),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
      path: z.string().describe("MineAuth path starting with /api/"),
      body: z.record(z.unknown()).optional().describe("JSON body for POST/PUT/PATCH"),
    },
    async ({ server, method, path, body }) => {
      if (!path.startsWith("/api/")) throw new Error("path must start with /api/");
      const s = getServer(loadServers(), server);
      const data = await mineauthRequest(s, path, { method, body });
      return { content: [{ type: "text", text: text(data) }] };
    },
  );
}
