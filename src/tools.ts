import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defaultServerName, getServer, serverNames, type McServer } from "./config.js";

const serverDesc =
  "Target Minecraft server (main / res / lobby ...). Omit for the default (main). Use list_servers if unsure.";

function text(obj: unknown): string {
  return typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

export function registerTools(mcp: McpServer, servers: Record<string, McServer>): void {
  const hint = `Available: ${serverNames(servers).join(", ") || "(none)"}. Default: ${defaultServerName(servers)}.`;

  mcp.tool("list_servers", "List configured Minecraft servers", {}, async () => {
    return {
      content: [
        {
          type: "text",
          text: text({ servers: serverNames(servers), default: defaultServerName(servers) }),
        },
      ],
    };
  });

  const serverArg = { server: z.string().optional().describe(serverDesc) };
  const playerArg = {
    player: z.string().describe("Player name, UUID, or 'me' (service token can query anyone)"),
  };

  mcp.tool(
    "list_plugins",
    "List installed plugins on a Minecraft server (MineAuth: GET /api/v1/commons/server/plugins). Needs Service Token.",
    serverArg,
    async ({ server }) => {
      const s = getServer(servers, server);
      const { mineauth } = await import("./mineauth.js");
      const data = await mineauth.listPlugins(s);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  mcp.tool(
    "list_integrations",
    "List MineAuth addon integrations (namespaces like vault / griefprevention / tickets).",
    serverArg,
    async ({ server }) => {
      const s = getServer(servers, server);
      const { mineauth } = await import("./mineauth.js");
      const data = await mineauth.listIntegrations(s);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  mcp.tool(
    "get_online_players",
    "List currently online players (MineAuth: GET /api/v1/commons/server/players).",
    serverArg,
    async ({ server }) => {
      const s = getServer(servers, server);
      const { mineauth } = await import("./mineauth.js");
      const data = await mineauth.onlinePlayers(s);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  mcp.tool(
    "get_tickets",
    "Get PureTickets tickets for a player (all statuses).",
    { ...serverArg, ...playerArg },
    async ({ server, player }) => {
      const s = getServer(servers, server);
      const { mineauth } = await import("./mineauth.js");
      const data = await mineauth.tickets(s, player);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  mcp.tool(
    "get_ticket_detail",
    "Get a single ticket with interaction history.",
    {
      ...serverArg,
      ...playerArg,
      id: z.number().describe("Ticket ID"),
    },
    async ({ server, player, id }) => {
      const s = getServer(servers, server);
      const { mineauth } = await import("./mineauth.js");
      const data = await mineauth.ticketDetail(s, player, id);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  mcp.tool(
    "get_claims",
    "Get GriefPrevention claims for a player.",
    { ...serverArg, ...playerArg },
    async ({ server, player }) => {
      const s = getServer(servers, server);
      const { mineauth } = await import("./mineauth.js");
      const data = await mineauth.claims(s, player);
      return { content: [{ type: "text", text: text(data) }] };
    },
  );

  mcp.tool(
    "get_balance",
    "Get Vault economy balance for a player.",
    { ...serverArg, ...playerArg },
    async ({ server, player }) => {
      const s = getServer(servers, server);
      const { mineauth } = await import("./mineauth.js");
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
      ...serverArg,
      ...playerArg,
      ticketId: z.number().optional().describe("If set, include that ticket's detail"),
    },
    async ({ server, player, ticketId }) => {
      const s = getServer(servers, server);
      const { mineauth } = await import("./mineauth.js");
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
              server: server || defaultServerName(servers),
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
              hint,
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
      ...serverArg,
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
      path: z.string().describe("MineAuth path starting with /api/"),
      body: z.record(z.unknown()).optional().describe("JSON body for POST/PUT/PATCH"),
    },
    async ({ server, method, path, body }) => {
      if (!path.startsWith("/api/")) throw new Error("path must start with /api/");
      const s = getServer(servers, server);
      const { mineauthRequest } = await import("./mineauth.js");
      const data = await mineauthRequest(s, path, { method, body });
      return { content: [{ type: "text", text: text(data) }] };
    },
  );
}
