import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Hono } from "hono";
import { loadServers, serverNames } from "./config.js";
import { registerTools } from "./tools.js";

const app = new Hono();

app.get("/health", (c) =>
  c.json({ ok: true, servers: serverNames(loadServers()), ts: new Date().toISOString() }),
);

app.get("/", (c) =>
  c.json({
    name: "moripa-mcp",
    mcpEndpoint: "/mcp (POST, Streamable HTTP, stateless)",
    health: "/health",
    hint: "Set MC_SERVERS_JSON or MC_SERVER_URL/MC_SERVER_TOKEN",
  }),
);

function createMcp(): McpServer {
  const mcp = new McpServer({ name: "moripa-mcp", version: "0.1.0" });
  registerTools(mcp);
  return mcp;
}

const port = Number(process.env.PORT ?? 3000);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/mcp") {
    // Stateless Streamable HTTP: fresh server+transport per request.
    // Multi-server routing is a TOOL argument (`server`), not the path —
    // so one MCP connection covers lobby/survival/... (see README).
    const mcp = createMcp();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => void mcp.close().catch(() => {}));
    try {
      await mcp.connect(transport);
      let parsed: unknown;
      if (req.method !== "GET" && req.method !== "DELETE") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString("utf8");
        parsed = raw ? JSON.parse(raw) : undefined;
      }
      await transport.handleRequest(req, res, parsed);
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
      }
      await mcp.close().catch(() => {});
    }
    return;
  }

  // Everything else -> Hono
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
  });
  const response = await app.fetch(request);
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
});

server.listen(port, () => {
  console.log(
    `moripa-mcp listening on http://localhost:${port} (servers: ${serverNames(loadServers()).join(", ") || "(none)"})`,
  );
});
