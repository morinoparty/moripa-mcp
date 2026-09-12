# moripa-mcp

moripa マイクラ鯖のための MCP サーバー。裏側は各 MC サーバーの MineAuth HTTP API を **単一の Service Token** で叩く。Hono + MCP (Streamable HTTP, stateless) on Cloudflare Workers。

公開 URL: `https://moripa-mcp.nikomaru.workers.dev` (MCP は `POST /mcp`, Bearer 認証あり)。カスタムドメインは使っていない。

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

`main` push で GitHub Actions → Workers に publish される (`.github/workflows/deploy.yml`)。

Cloudflare のデプロイトークンは repo secret ではなく **Bitwarden Secrets Manager** から取る。
`bitwarden/sm-action` が BSM の `morinoparty / shared/CLOUDFLARE_API_TOKEN` を
`CLOUDFLARE_API_TOKEN` として env に流し、`wrangler-action` がそれを使う。MoriPath / kodama と同じ形。

必要な secrets:

| secret | スコープ | 用途 |
| --- | --- | --- |
| `NIKOMARU_BITWARDEN_SECRET_MANAGER_ACCESS_TOKEN` | org | BSM からデプロイトークンを取得 |
| `CF_ACCOUNT_ID` | repo | wrangler の accountId (MoriPath と同じ名前。org の OWNER_CLOUDFLARE_ACCOUNT_ID は BSM のデプロイトークンが見えるアカウントと別なので使わない) |
| `BEARER_TOKEN` | repo | Hermes 認証用。deploy 後に Worker secret へ反映 |
| `MINEAUTH_SERVICE_TOKEN` | repo | MineAuth 用。deploy 後に Worker secret へ反映 |

```bash
gh secret set BEARER_TOKEN -R morinoparty/moripa-mcp
gh secret set MINEAUTH_SERVICE_TOKEN -R morinoparty/moripa-mcp
```

## ツール一覧

### コア

- `list_servers` — 設定済み鯖名 + デフォルト
- `list_plugins` — `GET /api/v1/commons/server/plugins` (導入 plugin 一覧)
- `list_integrations` — `GET /api/v1/plugins/availableIntegrations` (新形式 `{integrations, plugins[]}`、旧鯖は `string[]` のまま)
- `get_online_players` — `GET /api/v1/commons/server/players`
- `get_tickets` / `get_ticket_detail` — PureTickets (per-player)
- `list_all_tickets` — PureTickets 全件一覧 (`GET /tickets?status&player&cursor&limit` → `{tickets, total, nextCursor, hasMore}`、MineAuth #412 以降が必要)
- `get_claims` — GriefPrevention
- `get_balance` — Vault
- `ticket_context` — ticket 対応用まとめ取り (ticket 詳細 + claims + balance + online)。足りない分は `gaps` で明示
- `mineauth_request` — 汎用パススルー (`/api/` 始まりのみ)

### AdvanceRailway

ベースパス `/api/v1/plugins/advancerailway/`。id 系は slug / UUID どちらも可。

- `adv_route` — 2 駅間の最短経路 (`GET /route?from=&to=`)。`totalTime` (秒) + `legs[]` (`RAIL`/`WALK`、`fromName`/`toName`、`timeRequired`、`railwaySlug`、`line`)。徒歩区間は直線距離/4.317 の概算
- `adv_stations` — 駅: `list` (`GET /stations`) / `get` / `railways` (接続路線) / `nearest` (`GET /nearest-station?world&x&z`) / `create` (POST) / `update` (PATCH) / `delete`
- `adv_railways` — 路線: `list` / `get` / `create` (POST、実レールをサーバー側でトレース) / `update` (PATCH、`startPoint`+`endPoint`+`flags` 揃いでのみ引き直し) / `delete`
- `adv_groups` — グループ (路線名・ナンバリング): `list` / `get` / `railways` / `stations` (並び+ナンバリング) / `set-stations` (PUT 一括置換) / `create` / `update` / `delete`
- `adv_stats` — 件数サマリ (`GET /stats` → `{stations, railways, groups}`)

### mpm

ベースパス `/api/v1/plugins/mpm/`。読み取りは `mpm.api.read`、書き込みは `mpm.api.write` (サービストークンは `callers` 許可で到達)。

- `mpm_plugins` — 読み取り: `list` (`GET /plugins?filter=all|managed|unmanaged|outdated|locked`) / `get` / `versions` / `metadata` / `history` / `deps` (`?soft`) / `outdated` / `verify`
- `mpm_status` — `doctor` (一括診断) / `search` (`GET /search?q=&limit=`) / `repositories` (ソース一覧)
- `mpm_jobs` — 非同期ジョブ: `list` / `get` (RUNNING 中はポーリング) / `create` (`POST /jobs {type:'update_all', force?, skipIntegrity?}`)
- `mpm_plugins_write` — 書き込み: `update-all` / `update` / `version` (`{version*, force?, skipIntegrity?}`) / `add` (`version` 指定: `latest`/`sync:親`/`tag:`/固定、登録のみ・配置は `install` を続けて呼ぶ) / `install` / `uninstall` (反映に再起動) / `lock` / `unlock`。一括更新はタイムアウト回避のため `mpm_jobs` の `create` 推奨

## MineAuth 側に足りないもの (addon 開発が必要)

1. **座標→周辺 claims 検索**: `GET /api/v1/plugins/griefprevention/claims/nearby?world=&x=&y=&z=&radius=`
2. **最終ログイン / playtime**: `OfflinePlayer.getLastPlayed()` 系を返す小さな addon
3. **町の情報**: 使う town プラグインを決めてから addon 化

`mineauth_request` があるので addon が生えたら MCP 改修なしで叩ける。
