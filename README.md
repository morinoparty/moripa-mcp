# moripa-mcp

moripa マイクラ鯖のための MCP サーバー。裏側は各 MC サーバーの MineAuth HTTP API を **単一の Service Token** で叩く。Hono + MCP (Streamable HTTP, stateless) on Cloudflare Workers。

公開 URL: `https://mcp.dev.morino.party` (MCP は `POST /mcp`, Bearer 認証あり)

## サーバー解決: `SERVERS` + 単一トークン

- `SERVERS=main,res,lobby` → `<MINEAUTH_BASE_URL>/main`, `.../res`, `.../lobby`
- `MINEAUTH_BASE_URL` の既定は `https://api.morino.party`。`main` がデフォルト鯖
- `MINEAUTH_SERVICE_TOKEN` 1つで全部の鯖に通る (署名鍵が共通のため)。鯖ごとに token を分けない
- 例外的に別 URL が要る鯖だけ `MC_SERVERS_JSON` で上書き可 (`{"local":{"baseUrl":"http://localhost:8080"}}`, token 省略時は共通トークン)

ツール呼び出しは `server` 引数で分ける (省略時は main)。接続は `/mcp` ひとつ。

## 認証 (2層)

| 区間 | 方法 |
| --- | --- |
| Hermes → MCP | `Authorization: Bearer <BEARER_TOKEN>` (Worker secret) |
| MCP → MineAuth | `Authorization: Bearer <MINEAUTH_SERVICE_TOKEN>` (Worker secret) |

## 開発

pnpm 使用。

```bash
pnpm install
cp .env.example .dev.vars  # 中身を埋める (commit 禁止)
pnpm run dev    # http://localhost:8787/health, MCP は POST /mcp
pnpm run check  # typecheck
```

## デプロイ

`main` push で GitHub Actions → Workers に publish される。

必要な repo/org secrets:

| secret | 用意する人 | 用途 |
| --- | --- | --- |
| `OWNER_CLOUDFLARE_ACCOUNT_ID` | owner | wrangler の accountId |
| `OWNER_CLOUDFLARE_API_TOKEN` | owner | wrangler の apiToken (Workers デプロイ権限) |
| `BEARER_TOKEN` | 運営 | Hermes 認証用。Worker secret にも自動反映 |
| `MINEAUTH_SERVICE_TOKEN` | 運営 | MineAuth 用。Worker secret にも自動反映 |

```bash
gh secret set BEARER_TOKEN -R morinoparty/moripa-mcp
gh secret set MINEAUTH_SERVICE_TOKEN -R morinoparty/moripa-mcp
```

## ツール一覧 (v0.1)

- `list_servers` — 設定済み鯖名 + デフォルト
- `list_plugins` — `GET /api/v1/commons/server/plugins` (導入 plugin 一覧)
- `list_integrations` — `GET /api/v1/plugins/availableIntegrations`
- `get_online_players` — `GET /api/v1/commons/server/players`
- `get_tickets` / `get_ticket_detail` — PureTickets
- `get_claims` — GriefPrevention
- `get_balance` — Vault
- `ticket_context` — ticket 対応用まとめ取り (ticket 詳細 + claims + balance + online)。足りない分は `gaps` で明示
- `mineauth_request` — 汎用パススルー (`/api/` 始まりのみ)

## MineAuth 側に足りないもの (addon 開発が必要)

1. **座標→周辺 claims 検索**: `GET /api/v1/plugins/griefprevention/claims/nearby?world=&x=&y=&z=&radius=`
2. **最終ログイン / playtime**: `OfflinePlayer.getLastPlayed()` 系を返す小さな addon
3. **町の情報**: 使う town プラグインを決めてから addon 化

`mineauth_request` があるので addon が生えたら MCP 改修なしで叩ける。
