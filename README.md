# moripa-mcp

moripa マイクラ鯖のための MCP サーバー。裏側は各 MC サーバーの **MineAuth Service Token** を使って MineAuth HTTP API を叩く。Hono + MCP (Streamable HTTP, stateless)。

## マルチサーバーの分け方:ツール引数 `server` に一本化

結論: **MCP の接続先は1つ (`/mcp`)**。呼び出すツールごとに `server: "lobby" | "survival" | ...` を渡す。

- ❌ パス分け (`/mcp/lobby`, `/mcp/survival`): Hermes/Claude 側の接続設定が鯖の数だけ増える。鯖追加のたびに設定変更。
- ❌ ツール分け (`get_claims_lobby`, `get_claims_survival`): ツール数が 鯖数×機能数 で爆発する。
- ✅ 引数分け (`get_claims({server: "survival", player})`): 接続1つ、ツール固定。鯖追加は環境変数の1行。

## 設定

| env | 説明 |
| --- | --- |
| `MC_SERVERS_JSON` | `{"lobby":{"baseUrl":"http://lobby:8080","token":"..."},"survival":{...}}` |
| `MC_SERVER_URL` / `MC_SERVER_TOKEN` | 単鯖フォールバック (`default` として登録) |
| `PORT` | default 3000 |

トークンは各鯖で `/ma service create` → `/ma service token <name>` で発行 (有効期間1年、再発行で旧トークン失効)。K8s では Secret から注入すること。リポジトリにトークンを置かない。

## 起動

```bash
npm install
npm run dev   # http://localhost:3000/health, MCP は POST /mcp
npm run build && npm start
```

Docker:

```bash
docker build -t moripa-mcp .
docker run -p 3000:3000 -e MC_SERVERS_JSON='{"lobby":{"baseUrl":"...","token":"..."}}' moripa-mcp
```

## ツール一覧 (v0.1)

- `list_servers` — 設定済み鯖名
- `list_plugins` — `GET /api/v1/commons/server/plugins` (導入 plugin 一覧: 名前/version/authors — Service Token 必須)
- `list_integrations` — `GET /api/v1/plugins/availableIntegrations` (vault / griefprevention / tickets ... の namespace 一覧)
- `get_online_players` — `GET /api/v1/commons/server/players`
- `get_tickets` / `get_ticket_detail` — PureTickets (`/api/v1/plugins/tickets/...`)
- `get_claims` — GriefPrevention (`/api/v1/plugins/griefprevention/claims/{player}`)
- `get_balance` — Vault (`/api/v1/plugins/vault/balance/{player}`)
- `ticket_context` — ticket 対応用まとめ取り (ticket 詳細 + claims + balance + online)。足りない分は `gaps` で明示
- `mineauth_request` — 汎用パススルー (`/api/` 始まりのみ)。新しい addon が増えても MCP を直さず叩ける

## MineAuth 側に足りないもの (addon 開発が必要)

現状の MineAuth addon で **取れる**: ticket 一覧/詳細、player の claims、残高、online players、導入 plugin 一覧。

やりたい「ticket が切られたら周辺の土地保護 + 最終ログイン」には以下が足りない:

1. **座標→周辺 claims 検索**: `GET /api/v1/plugins/griefprevention/claims/nearby?world=&x=&y=&z=&radius=` 的な新 endpoint。GriefPrevention の `DataStore.getClaims()` 全舐め + 矩形ヒット判定。`@Authenticated(callers=[USER, SERVICE])` で。
2. **最終ログイン / playtime**: Bukkit `OfflinePlayer.getLastPlayed()` / `getFirstPlayed()` を返す小さな addon (`playerinfo` 的な namespace)。ticket_context の `gaps.lastLogin` を埋める。
3. **町の情報**: 使っている town プラグイン (Towny? AsiaCraft 系?) に応じた新 addon。まず「どの town プラグインを使うか」を決めるのが先。決まれば 1 と同じ型で作れる。
4. (任意) **ticket 位置の記録**: PureTickets の ticket message に座標が含まれているなら正規表現で抜けるが、確実にやるなら ticket 作成時に座標を別保存する addon 側の拡張。

いずれも既存 addon (`addons/griefprevention`, `addons/pure-tickets`) の Handler パターンのコピーで作れる。`mineauth_request` があるので、addon が生えたら MCP 側の改修なしで叩ける。
