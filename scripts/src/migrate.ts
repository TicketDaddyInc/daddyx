/**
 * migrate.ts — creates all DaddyX tables on Nile (or any Postgres) using raw
 * CREATE TABLE IF NOT EXISTS, bypassing drizzle-kit push which emits
 * DROP CASCADE (unsupported on Nile).
 *
 * Run:  pnpm migrate
 */
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const client = new Client({ connectionString: process.env.DATABASE_URL });

const DDL = `
CREATE TABLE IF NOT EXISTS creators (
  id                 TEXT PRIMARY KEY,
  wallet             TEXT UNIQUE NOT NULL,
  name               TEXT NOT NULL,
  organization       TEXT,
  country            TEXT NOT NULL,
  city               TEXT,
  website            TEXT,
  email              TEXT NOT NULL,
  past_events        TEXT,
  expected_use       TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',
  applied_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at        TIMESTAMPTZ,
  event_count        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id                   TEXT PRIMARY KEY,
  event_config_pda     TEXT UNIQUE,
  name                 TEXT NOT NULL,
  venue_name           TEXT NOT NULL,
  event_date           TIMESTAMPTZ NOT NULL,
  end_date             TIMESTAMPTZ,
  organizer_wallet     TEXT NOT NULL,
  revenue_share_bps    INTEGER NOT NULL DEFAULT 2000,
  initial_price_sol    REAL NOT NULL DEFAULT 0.05,
  step_factor_bps      INTEGER NOT NULL DEFAULT 15000,
  payout_factor_bps    INTEGER NOT NULL DEFAULT 12000,
  token_count          INTEGER NOT NULL DEFAULT 100,
  cancelled            BOOLEAN NOT NULL DEFAULT FALSE,
  revenue_reported     BOOLEAN NOT NULL DEFAULT FALSE,
  settled_revenue      REAL,
  daddyx_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  description          TEXT,
  image_url            TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tokens (
  id               TEXT PRIMARY KEY,
  event_id         TEXT NOT NULL REFERENCES events(id),
  token_id         INTEGER NOT NULL,
  current_owner    TEXT NOT NULL,
  current_price    REAL NOT NULL,
  entry_price      REAL NOT NULL,
  revenue_claimed  BOOLEAN NOT NULL DEFAULT FALSE,
  tx_signature     TEXT,
  purchased_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_history (
  id        SERIAL PRIMARY KEY,
  event_id  TEXT NOT NULL REFERENCES events(id),
  token_id  INTEGER NOT NULL,
  wallet    TEXT NOT NULL,
  price     REAL NOT NULL,
  round     INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id                    TEXT PRIMARY KEY,
  creator_id            TEXT NOT NULL REFERENCES creators(id),
  event_id              TEXT,
  name                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active',
  capital_raised_sol    TEXT NOT NULL DEFAULT '0',
  token_count           INTEGER NOT NULL DEFAULT 0,
  campaign_details_uri  TEXT,
  milestone_1_released  TEXT NOT NULL DEFAULT 'false',
  milestone_2_released  TEXT NOT NULL DEFAULT 'false',
  milestone_3_released  TEXT NOT NULL DEFAULT 'false',
  milestone_1_requested TEXT NOT NULL DEFAULT 'false',
  milestone_2_requested TEXT NOT NULL DEFAULT 'false',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function main() {
  await client.connect();
  console.log("🔧 Running migrations…");
  await client.query(DDL);
  await client.end();
  console.log("✅ All tables created (IF NOT EXISTS).");
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
