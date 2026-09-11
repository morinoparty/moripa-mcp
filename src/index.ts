import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { loadServers, serverNames, type MoripaEnv } from "./config.js";
import { registerTools } from "./tools.js";

const app = new Hono<{ Bindings: MoripaEnv }>();

app.get("/health", (c) => {
  const servers = loadServers(c.env);
  return c.json({
    ok: true,
    servers: serverNames(servers),
    ts: new Date().toISOString(),
  });
});

app.get("/", (c) =>
  c.json({
    name: "moripa-mcp",
    mcpEndpoint: "/mcp (POST, Streamable HTTP, stateless, Bearer auth)",
    health: "/health",
  }),
);

app.all("/mcp", async (c) => {
  // Hermes -> MCP auth
  const expected = c.env.BEARER_TOKEN;
  if (!expected) {
    return c.json({ error: "server misconfigured (BEARER_TOKEN not set)" }, 500);
  }
  const got = c.req.header("Authorization") ?? "";
  if (got !== `Bearer ${expected}`) {
    return c.json({ error: "unauthorized" }, 401);
  }

  // Stateless: fresh server + transport per request.
  // Multi-server routing is a TOOL argument (`server`), not the path,
  // so one MCP connection covers main/res/lobby/...
  let servers;
  try {
    servers = loadServers(c.env);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
  const mcp = new McpServer({ name: "moripa-mcp", version: "0.1.0" });
  registerTools(mcp, servers);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  // NOTE: do NOT close here — handleRequest returns a streaming Response
  // that the server still needs to write into. Stateless mode holds no
  // session state, so request-scoped objects are GC'd after responding.
  return transport.handleRequest(c.req.raw);
});

export default app;
