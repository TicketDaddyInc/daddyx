# DaddyX — Fan-Powered Event Finance on Solana

> **Back the event. Earn from the night.**

Built for the **Colosseum Frontier Hackathon**, May 2026.

## What It Does

DaddyX is a bonding-curve token protocol on Solana. Fans finance live events by purchasing DaddyX tokens. Each purchase raises the price by step factor **S** — the previous holder earns payout factor **P**. After the event, an oracle reports gross revenue on-chain and token holders claim a configurable share from escrow.

The constraint **S > P** is enforced at the Anchor program level, making circular exploit attacks mathematically unprofitable.

## Architecture

```
├── programs/daddyx/src/lib.rs    — Anchor Rust smart program (13 instructions)
├── tests/daddyx.ts               — TypeScript Anchor tests
├── Anchor.toml                   — Anchor config (devnet)
├── artifacts/
│   ├── daddyx/                   — React + Vite frontend
│   └── api-server/               — Express API backend
└── lib/
    ├── db/                       — Drizzle ORM + PostgreSQL schema
    ├── api-spec/                 — OpenAPI spec + Orval codegen config
    ├── api-client-react/         — Generated React Query hooks
    └── api-zod/                  — Generated Zod validation schemas
```

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 22.x (see `.tool-versions`) |
| pnpm | 10+ |
| Rust + Anchor | `anchor-cli 0.30` |
| Solana CLI | 1.18+ |
| PostgreSQL | 14+ (for API server) |

## Local Development

```bash
# 1. Install dependencies (pnpm only — npm/yarn blocked by preinstall guard)
pnpm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Run DB migrations
pnpm --filter @workspace/db run push

# 4. Regenerate API client (after changing openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# 5. Start the frontend dev server  →  http://localhost:5173
pnpm dev

# 6. Start the API server           →  http://localhost:3001
pnpm dev:api
```

The Vite dev server automatically proxies `/api/*` to the API server (port 3001 by default), so the frontend and backend work together without CORS configuration.

## Environment Variables

Copy `.env.example` to `.env` and set the values. The frontend and API server both pick up `.env` automatically.

| Variable | Where used | Default | Required |
|---|---|---|---|
| `PORT` | Frontend (Vite) | `5173` | No |
| `BASE_PATH` | Frontend (Vite) | `/` | No |
| `API_PORT` | Frontend proxy target | `3001` | No |
| `DATABASE_URL` | API server + `@workspace/db` | — | **Yes** |
| `LOG_LEVEL` | API server | `info` | No |

## Solana Program

**Program ID:** `DaDXYk1rJqH9b8M3uqg2VhFB5K7N4cLwPe6RsToQvMZ`  
**Network:** Devnet

```bash
anchor build
anchor test
```

### Instructions

| Instruction | Description |
|---|---|
| `initialize_platform` | Bootstrap PlatformConfig with admin and fee BPS |
| `apply_as_creator` | Create CreatorProfile in Pending state |
| `approve_creator` | Admin approves a creator |
| `suspend_creator` | Admin suspends a creator |
| `initialize_event` | Create EventConfig PDA — validates S > P |
| `purchase_token` | Buy token, pay escrow, pay previous holder |
| `raise_price` | Owner pre-pays to increase token floor price |
| `report_revenue` | Oracle-signed gross revenue report |
| `claim_revenue` | Token holder claims pro-rata revenue share |
| `cancel_event` | Organiser cancels; tokens become refundable |
| `claim_refund` | Holder claims full refund from cancelled event |
| `request_milestone_release` | Campaign creator requests milestone payout |
| `approve_milestone_release` | Admin approves milestone release |

## Frontend Pages

| Path | Description |
|---|---|
| `/` | Landing page — hero, stats, featured events |
| `/events` | Event listing with search/filter |
| `/events/:id` | Event detail — price chart, holders, purchase |
| `/dashboard` | Fan portfolio with ROI tracking |
| `/organizer` | Organizer portal — capital raised stats |
| `/creator/apply` | Creator application form |
| `/creator/status` | Check application status by wallet |
| `/admin` | Admin panel — approve creators, oracle queue |
| `/whitepaper` | Full technical whitepaper |
| `/pitch` | 8-slide pitch deck |

## Branding

| Token | Value |
|---|---|
| Primary | `#E63946` (DaddyX Red) |
| Background | `#0A0A0A` |
| Surface | `#1A1A1A` |
| Font | Inter (Google Fonts) |
