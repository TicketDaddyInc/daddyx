# DaddyX — Fan-Powered Event Finance on Solana

**Tagline:** Back the event. Earn from the night.

Built for the **Colosseum Frontier Hackathon**, due May 11, 2026.

## What It Does

DaddyX is a bonding-curve token protocol on Solana. Fans finance live events by purchasing DaddyX tokens. Each purchase raises the price by step factor S — the previous holder earns payout factor P. After the event, an oracle reports gross revenue on-chain and token holders claim a configurable share from escrow.

The constraint **S > P** is enforced at the Anchor program level, making circular exploit attacks mathematically unprofitable.

## Architecture

```
workspace/
├── programs/daddyx/src/lib.rs    — Anchor Rust smart program (13 instructions)
├── tests/daddyx.ts               — Full TypeScript anchor tests
├── Anchor.toml                   — Anchor config (devnet)
├── Cargo.toml                    — Workspace Cargo config
├── artifacts/
│   ├── daddyx/                   — React+Vite frontend (port 25495, path /)
│   └── api-server/               — Express API backend (port 8080, path /api)
├── lib/
│   ├── db/                       — Drizzle ORM + PostgreSQL schema
│   ├── api-spec/                 — OpenAPI spec + Orval codegen config
│   ├── api-client-react/         — Generated React Query hooks
│   └── api-zod/                  — Generated Zod validation schemas
└── scripts/deploy.ts             — Devnet deploy helper
```

## Solana Program

**Program ID:** `DaDXYk1rJqH9b8M3uqg2VhFB5K7N4cLwPe6RsToQvMZ`  
**Network:** Devnet

### Instructions

| Instruction | Description |
|---|---|
| `initialize_platform` | Bootstrap PlatformConfig with admin and fee BPS |
| `apply_as_creator` | Create CreatorProfile in Pending state |
| `approve_creator` | Admin approves a creator |
| `suspend_creator` | Admin suspends a creator |
| `initialize_event` | Create EventConfig PDA — validates S > P |
| `purchase_token` | Buy token, pay escrow, pay previous holder |
| `raise_price` | Owner pre-pays to increase token's floor price |
| `report_revenue` | Oracle-signed gross revenue report |
| `claim_revenue` | Token holder claims pro-rata revenue share |
| `cancel_event` | Organiser cancels; tokens become refundable |
| `claim_refund` | Holder claims full refund from cancelled event |
| `request_milestone_release` | Campaign creator requests milestone payout |
| `approve_milestone_release` | Admin approves milestone release |

## Frontend Pages

| Path | Description |
|---|---|
| `/` | Landing page with hero, stats, featured events |
| `/daddyx` | How It Works — full protocol walkthrough |
| `/events` | Events listing with search/filter |
| `/events/:id` | Event detail with price chart, holders, purchase |
| `/dashboard` | Fan portfolio dashboard with ROI tracking |
| `/organizer` | Organizer portal with capital raised stats |
| `/creator/apply` | Creator application form |
| `/creator/status` | Check application status by wallet |
| `/admin` | Admin panel — approve creators, oracle queue |
| `/whitepaper` | Full technical whitepaper |
| `/pitch` | 8-slide pitch deck |

## API Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/events` | List all DaddyX events |
| POST | `/api/events/create` | Create new event |
| GET | `/api/events/:id` | Event detail + tokens + history |
| POST | `/api/events/:id/purchase` | Record token purchase |
| POST | `/api/events/:id/report-revenue` | Report event revenue |
| GET | `/api/events/:id/simulation` | Price simulation (20 rounds) |
| GET | `/api/events/:id/holders` | Token holders with ROI |
| POST | `/api/creator/apply` | Submit creator application |
| GET | `/api/creator/status` | Check creator status by wallet |
| GET | `/api/admin/creators/pending` | List pending applications |
| POST | `/api/admin/creators/approve` | Approve a creator |
| GET | `/api/admin/oracle/pending` | Events awaiting settlement |
| POST | `/api/campaigns/create` | Create funding campaign |
| POST | `/api/campaigns/:id/milestone/request` | Request milestone release |
| POST | `/api/admin/campaigns/:id/milestone/approve` | Approve milestone |
| GET | `/api/stats/summary` | Platform-wide statistics |
| GET | `/api/wallet/:wallet/portfolio` | Fan token portfolio |
| GET | `/api/organizer/:wallet/events` | Organizer's events |

## Database Schema

### events
- id, event_config_pda, name, venue_name, event_date, end_date
- organizer_wallet, revenue_share_bps, initial_price_sol
- step_factor_bps, payout_factor_bps, token_count
- cancelled, revenue_reported, settled_revenue
- daddyx_enabled, description, image_url

### tokens
- id, event_id, token_id, current_owner
- current_price, entry_price, revenue_claimed, tx_signature

### price_history
- event_id, token_id, wallet, price, round, timestamp

### creators
- id, wallet, name, organization, country, city
- email, website, status (pending/approved/suspended)
- past_events, expected_use, approved_at

### campaigns
- id, creator_id, event_id, name, token_count
- campaign_details_uri, status, capital_raised_sol
- milestone1_released, milestone2_released, milestone3_released
- milestone1_requested, milestone2_requested

## Demo Data

Three DaddyX events seeded:

1. **Kigali Jazz Festival** — 50 tokens, 0.05 SOL initial, S=1.5×, P=1.2×, 20% rev share (6 tokens sold)
2. **Uganda Netball League Finals** — 100 tokens, 0.02 SOL initial, S=2.0×, P=1.2×, 15% rev share (4 tokens sold)
3. **Doha Electronic Night** — 200 tokens, 0.1 SOL initial, S=1.5×, P=1.2×, 25% rev share (3 tokens sold)
4. **Kampala Comedy Night** — standard (no DaddyX)

## Key Design Decisions

- **S > P constraint**: Enforced at Anchor program genesis. Prevents circular buying exploits.
- **Escrow PDA**: All SOL flows through program-controlled escrow — no custodial risk.
- **Oracle pattern**: Each event nominates a trusted oracle key for post-event revenue reporting.
- **Drizzle ORM**: Type-safe PostgreSQL with drizzle-kit push migrations.
- **Orval codegen**: OpenAPI → React Query hooks + Zod schemas, single-file mode.
- **Dark theme**: #E63946 red, #0A0A0A background, #1A1A1A surface, Inter font.

## Running Locally

```bash
# DB push
pnpm --filter @workspace/db run push

# Codegen
pnpm --filter @workspace/api-spec run codegen

# Anchor build (requires Solana + Anchor toolchain)
anchor build && anchor test
```

## Branding

- Primary: `#E63946` (DaddyX Red)
- Background: `#0A0A0A`
- Surface: `#1A1A1A`
- Text: White
- Font: Inter (Google Fonts)
- Tagline: "Back the event. Earn from the night."
