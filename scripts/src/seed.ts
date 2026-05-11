/**
 * Seed script — clears and repopulates the DaddyX database with realistic demo
 * data. Run with:
 *   pnpm seed
 * from the repo root, or:
 *   pnpm --filter @workspace/scripts run seed
 */
import "dotenv/config";
import { db, eventsTable, tokensTable, priceHistoryTable, creatorsTable, campaignsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

// ─── Unsplash photo IDs ───────────────────────────────────────────────────────
const IMG = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=800&auto=format&fit=crop&q=80`;

const IMAGES = {
  jazzKigali:      IMG("1493225457124-a3eb161ffa5f"), // jazz musician
  netballUganda:   IMG("1546519638-68e109498ffc"),    // sports arena crowd
  electronicDoha:  IMG("1470225620780-dba8ba36b745"), // DJ / electronic music
  comedyKampala:   IMG("1527224538127-2104bb71c51b"), // comedy microphone
  afrobeatsLagos:  IMG("1597484661973-ee6cd0b6482c"), // afrobeats dance
  techNairobi:     IMG("1532619187608-e5375cab36aa"), // after-party / nightlife
  jazzCapeTown:    IMG("1415201364774-f6f0bb35f28f"), // cape town jazz
  dubaiConcert:    IMG("1514525253161-7a46d19cd819"), // concert arena lights
};

// ─── Organiser / oracle wallets (demo, not real keypairs) ────────────────────
const WALLETS = {
  org1: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  org2: "8sRCQg3aWvNeQXMCqxN63j1FnJUMaWS7FqYmkUr4gBsP",
  org3: "9tLDRe4bXwOpYVNDsyO74k2GoKVPbWU6GrZNjSh5hCtQ",
  org4: "AuPEHf5cYxRqZWOEtzP85l3HpLQcXVW7HsAOkTi6iDuR",
  org5: "BvQFIg6dZySrAXPFuyQ96m4IqMRdYWX8ItBPlUj7jEvS",
  fan1: "CwRGJh7eAzTsBYQGvzR07n5JrNSeZXY9JuCQmVk8kFwT",
  fan2: "DxSHKi8fBaUtCZRHwzS18o6KsOTfAYZ0KvDRnWl9lGxU",
  fan3: "EySILj9gCbVuDASOxaT29p7LtPUgBZA1LwESoXm0mHyV",
  fan4: "FzTJMk0hDcWvEBTPybU30q8MuQVhCAB2MxFTpYn1nIzW",
  fan5: "GaUKNl1iEdXwFCUQzcV41r9NvRWhDBC3NyGUqZo2oJaX",
  oracle: "HbVLOm2jFeYxGDVRzdW52s0OwSXiECD4OzHVrAp3pKbY",
};

async function main() {
  console.log("🌱 Seeding DaddyX database…\n");

  // ── 1. Clear existing data ─────────────────────────────────────────────────
  console.log("  Clearing existing rows…");
  await db.execute(sql`DELETE FROM price_history`);
  await db.execute(sql`DELETE FROM tokens`);
  await db.execute(sql`DELETE FROM campaigns`);
  await db.execute(sql`DELETE FROM events`);
  await db.execute(sql`DELETE FROM creators`);
  console.log("  ✓ Cleared\n");

  // ── 2. Creators ────────────────────────────────────────────────────────────
  console.log("  Inserting creators…");
  const [c1, c2, c3, c4, c5] = await db
    .insert(creatorsTable)
    .values([
      {
        wallet: WALLETS.org1,
        name: "Amara Nwosu",
        organization: "Kigali Arts Collective",
        country: "Rwanda",
        city: "Kigali",
        email: "amara@kigaliarts.rw",
        website: "https://kigaliarts.rw",
        pastEvents: "Rwanda Jazz Festival 2024, Pan-African Music Summit 2023",
        expectedUse: "Ticket sales and artist funding for Kigali Jazz Festival 2026",
        status: "approved",
        approvedAt: new Date("2026-01-15"),
        eventCount: 2,
      },
      {
        wallet: WALLETS.org2,
        name: "David Okello",
        organization: "Uganda Sports Events Ltd",
        country: "Uganda",
        city: "Kampala",
        email: "david@ugandasports.co.ug",
        website: "https://ugandasports.co.ug",
        pastEvents: "Uganda Athletics Nationals 2025, Kampala Marathon 2024",
        expectedUse: "Fund prize money and venue for Uganda Netball League Finals",
        status: "approved",
        approvedAt: new Date("2026-02-01"),
        eventCount: 3,
      },
      {
        wallet: WALLETS.org3,
        name: "Fatima Al-Rashid",
        organization: "Doha Nights Entertainment",
        country: "Qatar",
        city: "Doha",
        email: "fatima@dohanights.qa",
        website: "https://dohanights.qa",
        pastEvents: "Qatar Electronic Music Festival 2025",
        expectedUse: "Artist fees and production for Doha Electronic Night",
        status: "approved",
        approvedAt: new Date("2026-01-20"),
        eventCount: 1,
      },
      {
        wallet: WALLETS.org4,
        name: "Chukwuemeka Obi",
        organization: "Lagos Vibes Productions",
        country: "Nigeria",
        city: "Lagos",
        email: "emeka@lagosvibes.ng",
        website: "https://lagosvibes.ng",
        pastEvents: "Afrobeats Nite Lagos 2024, Nigerian Music Awards 2023",
        expectedUse: "Venue deposit and international artist booking for Lagos Afrobeats Festival",
        status: "approved",
        approvedAt: new Date("2026-03-01"),
        eventCount: 4,
      },
      {
        wallet: WALLETS.org5,
        name: "Zara Osei",
        organization: "Comedy Central Africa",
        country: "Uganda",
        city: "Kampala",
        email: "zara@comedyafrica.ug",
        pastEvents: "Laugh Out Loud Kampala 2025",
        expectedUse: "Comedian fees and venue for Kampala Comedy Night",
        status: "pending",
        eventCount: 0,
      },
    ])
    .returning();

  console.log(`  ✓ ${5} creators\n`);

  // ── 3. Events ──────────────────────────────────────────────────────────────
  console.log("  Inserting events…");
  const events = await db
    .insert(eventsTable)
    .values([
      // ---- DaddyX-enabled events -------------------------------------------
      {
        eventConfigPda: "DxPDA1KigaliJazz2026aaaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Kigali Jazz Festival 2026",
        venueName: "Kigali Convention Centre, Rwanda",
        eventDate: new Date("2026-08-15T19:00:00Z"),
        endDate: new Date("2026-08-15T23:59:00Z"),
        organizerWallet: WALLETS.org1,
        revenueShareBps: 2000,      // 20%
        initialPriceSol: 0.05,
        stepFactorBps: 15000,       // S = 1.5×
        payoutFactorBps: 12000,     // P = 1.2×
        tokenCount: 50,
        daddyxEnabled: true,
        description:
          "The premier jazz festival in East Africa. Featuring Grammy-nominated artists, local jazz legends, and rising stars from across the continent. Five stages, 30 acts, one unforgettable night.",
        imageUrl: IMAGES.jazzKigali,
      },
      {
        eventConfigPda: "DxPDA2UgandaNetball2026bbbbbbbbbbbbbbbbbbbbbb",
        name: "Uganda Netball League Finals 2026",
        venueName: "Lugogo Indoor Stadium, Kampala",
        eventDate: new Date("2026-09-05T15:00:00Z"),
        endDate: new Date("2026-09-05T21:00:00Z"),
        organizerWallet: WALLETS.org2,
        revenueShareBps: 1500,      // 15%
        initialPriceSol: 0.02,
        stepFactorBps: 20000,       // S = 2.0×
        payoutFactorBps: 12000,     // P = 1.2×
        tokenCount: 100,
        daddyxEnabled: true,
        description:
          "The most electrifying night in Ugandan sports. The top two netball clubs battle for the national championship in front of a sold-out crowd. Broadcast live to 14 countries.",
        imageUrl: IMAGES.netballUganda,
      },
      {
        eventConfigPda: "DxPDA3DohaElectronic2026cccccccccccccccccccccc",
        name: "Doha Electronic Night",
        venueName: "Katara Cultural Village Amphitheatre, Doha",
        eventDate: new Date("2026-10-10T22:00:00Z"),
        endDate: new Date("2026-10-11T06:00:00Z"),
        organizerWallet: WALLETS.org3,
        revenueShareBps: 2500,      // 25%
        initialPriceSol: 0.1,
        stepFactorBps: 15000,       // S = 1.5×
        payoutFactorBps: 12000,     // P = 1.2×
        tokenCount: 200,
        daddyxEnabled: true,
        description:
          "Eight hours of world-class electronic music under the stars. Headlined by three internationally renowned DJs with a state-of-the-art light and sound installation.",
        imageUrl: IMAGES.electronicDoha,
      },
      {
        eventConfigPda: "DxPDA4LagosAfrobeats2026dddddddddddddddddddddd",
        name: "Lagos Afrobeats Festival 2026",
        venueName: "Eko Atlantic City Open Stage, Lagos",
        eventDate: new Date("2026-11-21T18:00:00Z"),
        endDate: new Date("2026-11-22T02:00:00Z"),
        organizerWallet: WALLETS.org4,
        revenueShareBps: 3000,      // 30%
        initialPriceSol: 0.08,
        stepFactorBps: 17500,       // S = 1.75×
        payoutFactorBps: 13000,     // P = 1.3×
        tokenCount: 300,
        daddyxEnabled: true,
        description:
          "The biggest Afrobeats event of the year. Featuring the top-charting artists from Nigeria, Ghana, and the UK. Over 5,000 fans expected on the waterfront stage.",
        imageUrl: IMAGES.afrobeatsLagos,
      },
      {
        eventConfigPda: "DxPDA5CapeTownJazz2026eeeeeeeeeeeeeeeeeeeeee",
        name: "Cape Town International Jazz Festival",
        venueName: "Cape Town International Convention Centre",
        eventDate: new Date("2026-07-04T17:00:00Z"),
        endDate: new Date("2026-07-05T00:00:00Z"),
        organizerWallet: WALLETS.org1,
        revenueShareBps: 2000,
        initialPriceSol: 0.12,
        stepFactorBps: 16000,
        payoutFactorBps: 12500,
        tokenCount: 150,
        daddyxEnabled: true,
        description:
          "Africa's largest jazz festival returns with an all-star lineup spanning jazz, blues, soul and R&B. Two nights, six stages, 40+ acts from 20 countries.",
        imageUrl: IMAGES.jazzCapeTown,
      },
      {
        eventConfigPda: "DxPDA6DubaiConcert2026ffffffffffffffffffffff",
        name: "Dubai Music Week — Closing Night",
        venueName: "Coca-Cola Arena, Dubai",
        eventDate: new Date("2026-12-19T20:00:00Z"),
        endDate: new Date("2026-12-20T01:00:00Z"),
        organizerWallet: WALLETS.org3,
        revenueShareBps: 2000,
        initialPriceSol: 0.15,
        stepFactorBps: 15000,
        payoutFactorBps: 12000,
        tokenCount: 400,
        daddyxEnabled: true,
        description:
          "The grand finale of Dubai Music Week. An international concert spectacle featuring pop, hip-hop, and global chart-toppers in one of the world's most iconic arenas.",
        imageUrl: IMAGES.dubaiConcert,
      },
      // ---- Non-DaddyX event (standard ticketing) ---------------------------
      {
        name: "Kampala Comedy Night",
        venueName: "National Theatre, Kampala",
        eventDate: new Date("2026-06-14T20:00:00Z"),
        endDate: new Date("2026-06-14T23:00:00Z"),
        organizerWallet: WALLETS.org5,
        revenueShareBps: 0,
        initialPriceSol: 0.01,
        stepFactorBps: 10000,
        payoutFactorBps: 9000,
        tokenCount: 80,
        daddyxEnabled: false,
        description:
          "Uganda's hottest comedy showcase. Stand-up, sketch, and improv from the country's funniest performers. Guaranteed tears of laughter.",
        imageUrl: IMAGES.comedyKampala,
      },
      {
        name: "Nairobi Tech Summit After Party",
        venueName: "Alchemist Bar, Nairobi",
        eventDate: new Date("2026-06-28T21:00:00Z"),
        endDate: new Date("2026-06-29T03:00:00Z"),
        organizerWallet: WALLETS.org4,
        revenueShareBps: 0,
        initialPriceSol: 0.03,
        stepFactorBps: 10000,
        payoutFactorBps: 9000,
        tokenCount: 60,
        daddyxEnabled: false,
        description:
          "Celebrate the close of Nairobi Tech Summit with Africa's best startup founders, VCs and builders. Live DJ, networking, and exclusive product demos.",
        imageUrl: IMAGES.techNairobi,
      },
    ])
    .returning();

  console.log(`  ✓ ${events.length} events\n`);

  // ── 4. Tokens + price history (for DaddyX-enabled events) ─────────────────
  console.log("  Inserting tokens and price history…");

  const fans = [WALLETS.fan1, WALLETS.fan2, WALLETS.fan3, WALLETS.fan4, WALLETS.fan5];

  type TokenRow = typeof tokensTable.$inferInsert;
  type PriceRow = typeof priceHistoryTable.$inferInsert;

  const allTokens: TokenRow[] = [];
  const allPriceHistory: PriceRow[] = [];

  // Helper: simulate bonding-curve token purchases
  function simulatePurchases(
    eventId: string,
    initialPrice: number,
    stepFactorBps: number,
    payoutFactorBps: number,
    count: number,
  ) {
    const step = stepFactorBps / 10000;   // e.g. 1.5
    const payout = payoutFactorBps / 10000; // e.g. 1.2
    let price = initialPrice;

    for (let i = 0; i < count; i++) {
      const buyer = fans[i % fans.length];
      const entryPrice = price;
      allTokens.push({
        eventId,
        tokenId: i + 1,
        currentOwner: buyer,
        currentPrice: parseFloat(price.toFixed(6)),
        entryPrice: parseFloat(entryPrice.toFixed(6)),
        revenueClaimed: false,
        txSignature: `sig${eventId.slice(-6)}${i}`.padEnd(88, "x"),
        purchasedAt: new Date(Date.now() - (count - i) * 3_600_000),
      });
      allPriceHistory.push({
        eventId,
        tokenId: i + 1,
        wallet: buyer,
        price: parseFloat(entryPrice.toFixed(6)),
        round: i + 1,
        timestamp: new Date(Date.now() - (count - i) * 3_600_000),
      });
      // Previous holder payout already factored in; next price = price × step
      price = price * step;
      // Clamp to avoid float drift
      if (price > 1_000) price = 1_000;
    }
  }

  // Kigali Jazz — 6 tokens sold
  simulatePurchases(events[0].id, 0.05, 15000, 12000, 6);
  // Uganda Netball — 4 tokens sold
  simulatePurchases(events[1].id, 0.02, 20000, 12000, 4);
  // Doha Electronic — 3 tokens sold
  simulatePurchases(events[2].id, 0.1, 15000, 12000, 3);
  // Lagos Afrobeats — 8 tokens sold
  simulatePurchases(events[3].id, 0.08, 17500, 13000, 8);
  // Cape Town Jazz — 5 tokens sold
  simulatePurchases(events[4].id, 0.12, 16000, 12500, 5);
  // Dubai Concert — 2 tokens sold
  simulatePurchases(events[5].id, 0.15, 15000, 12000, 2);

  if (allTokens.length) await db.insert(tokensTable).values(allTokens);
  if (allPriceHistory.length) await db.insert(priceHistoryTable).values(allPriceHistory);

  console.log(`  ✓ ${allTokens.length} tokens, ${allPriceHistory.length} price history rows\n`);

  // ── 5. Campaigns (for approved creators) ──────────────────────────────────
  console.log("  Inserting campaigns…");
  await db.insert(campaignsTable).values([
    {
      creatorId: c1.id,
      eventId: events[0].id,
      name: "Kigali Jazz 2026 — Artist Funding Round",
      status: "active",
      capitalRaisedSol: "0.3",
      tokenCount: 6,
      milestone1Released: "true",
      milestone2Released: "false",
      milestone3Released: "false",
      milestone1Requested: "true",
      milestone2Requested: "false",
    },
    {
      creatorId: c2.id,
      eventId: events[1].id,
      name: "Uganda Netball Finals — Prize Pool Campaign",
      status: "active",
      capitalRaisedSol: "0.08",
      tokenCount: 4,
      milestone1Released: "false",
      milestone2Released: "false",
      milestone3Released: "false",
      milestone1Requested: "false",
      milestone2Requested: "false",
    },
    {
      creatorId: c4.id,
      eventId: events[3].id,
      name: "Lagos Afrobeats 2026 — Production Capital",
      status: "active",
      capitalRaisedSol: "2.14",
      tokenCount: 8,
      milestone1Released: "true",
      milestone2Released: "true",
      milestone3Released: "false",
      milestone1Requested: "true",
      milestone2Requested: "true",
    },
  ]);
  console.log("  ✓ 3 campaigns\n");

  console.log("✅ Seed complete!\n");
  console.log(`   Events   : ${events.length}`);
  console.log(`   Creators : 5`);
  console.log(`   Tokens   : ${allTokens.length}`);
  console.log(`   History  : ${allPriceHistory.length}`);
  console.log(`   Campaigns: 3`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
