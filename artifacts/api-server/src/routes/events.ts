import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { eventsTable, tokensTable, priceHistoryTable } from "@workspace/db";
import { eq, desc, and, isNull, lt } from "drizzle-orm";

const router = Router();

// GET /api/events — all DaddyX events sorted by date
router.get("/", async (req: Request, res: Response) => {
  try {
    const events = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.daddyxEnabled, true))
      .orderBy(desc(eventsTable.eventDate));

    const enriched = await Promise.all(events.map(async (event) => {
      const tokens = await db
        .select()
        .from(tokensTable)
        .where(eq(tokensTable.eventId, event.id))
        .orderBy(desc(tokensTable.currentPrice));

      const soldCount = tokens.length;
      const tokensRemaining = event.tokenCount - soldCount;
      const nextTokenPriceSol = soldCount === 0
        ? event.initialPriceSol
        : Math.max(...tokens.map(t => t.currentPrice)) * event.stepFactorBps / 10000;

      const currentPriceLamports = Math.round(nextTokenPriceSol * 1_000_000_000);
      return { ...event, tokensRemaining, nextTokenPriceSol, currentPriceLamports };
    }));

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to list events");
    res.status(500).json({ error: "internal_error", message: "Failed to list events" });
  }
});

// POST /api/events/create
router.post("/create", async (req: Request, res: Response) => {
  try {
    const {
      eventConfigPda, name, venueName, eventDate, organizerWallet,
      revenueShareBps, initialPriceSol, stepFactorBps, payoutFactorBps,
      tokenCount, daddyxEnabled, description, imageUrl, endDate
    } = req.body;

    const [event] = await db.insert(eventsTable).values({
      eventConfigPda,
      name,
      venueName,
      eventDate: new Date(eventDate),
      endDate: endDate ? new Date(endDate) : null,
      organizerWallet,
      revenueShareBps: revenueShareBps ?? 2000,
      initialPriceSol: initialPriceSol ?? 0.05,
      stepFactorBps: stepFactorBps ?? 15000,
      payoutFactorBps: payoutFactorBps ?? 12000,
      tokenCount: tokenCount ?? 100,
      daddyxEnabled: daddyxEnabled ?? true,
      description,
      imageUrl,
    }).returning();

    const result = { ...event, tokensRemaining: event.tokenCount, nextTokenPriceSol: event.initialPriceSol };
    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to create event");
    res.status(500).json({ error: "internal_error", message: "Failed to create event" });
  }
});

// GET /api/events/:id — full event detail
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, id))
      .limit(1);

    if (!event) {
      return res.status(404).json({ error: "not_found", message: "Event not found" });
    }

    const tokens = await db
      .select()
      .from(tokensTable)
      .where(eq(tokensTable.eventId, id))
      .orderBy(tokensTable.tokenId);

    const history = await db
      .select()
      .from(priceHistoryTable)
      .where(eq(priceHistoryTable.eventId, id))
      .orderBy(priceHistoryTable.round);

    // Build price history points
    const priceHistory = history.map(h => ({
      round: h.round,
      price: h.price,
      wallet: h.wallet,
      timestamp: h.timestamp.toISOString(),
    }));

    // Simulate 20-point price curve
    const simulation = buildSimulation(event.initialPriceSol, event.stepFactorBps, event.payoutFactorBps, event.platformFeeBps ?? 300);

    const soldCount = tokens.length;
    const tokensRemaining = event.tokenCount - soldCount;
    const nextTokenPriceSol = soldCount === 0
      ? event.initialPriceSol
      : tokens.reduce((max, t) => Math.max(max, t.currentPrice), 0) * event.stepFactorBps / 10000;
    const currentPriceLamports = Math.round(nextTokenPriceSol * 1_000_000_000);

    res.json({
      event: { ...event, tokensRemaining, nextTokenPriceSol, currentPriceLamports },
      tokens,
      priceHistory,
      simulation,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get event");
    res.status(500).json({ error: "internal_error", message: "Failed to get event" });
  }
});

// POST /api/events/:id/purchase
router.post("/:id/purchase", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tokenId, buyerWallet, priceSol, txSignature } = req.body;

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id)).limit(1);
    if (!event) return res.status(404).json({ error: "not_found" });

    const existing = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.eventId, id), eq(tokensTable.tokenId, tokenId)))
      .limit(1);

    let token;
    if (existing.length > 0) {
      [token] = await db
        .update(tokensTable)
        .set({ currentOwner: buyerWallet, currentPrice: priceSol, entryPrice: priceSol, txSignature })
        .where(and(eq(tokensTable.eventId, id), eq(tokensTable.tokenId, tokenId)))
        .returning();
    } else {
      [token] = await db.insert(tokensTable).values({
        eventId: id,
        tokenId,
        currentOwner: buyerWallet,
        currentPrice: priceSol,
        entryPrice: priceSol,
        txSignature,
      }).returning();
    }

    // Record price history
    const round = existing.length + 1;
    await db.insert(priceHistoryTable).values({
      eventId: id,
      tokenId,
      wallet: buyerWallet,
      price: priceSol,
      round,
    });

    res.json(token);
  } catch (err) {
    req.log.error({ err }, "Failed to record purchase");
    res.status(500).json({ error: "internal_error", message: "Failed to record purchase" });
  }
});

// POST /api/events/:id/report-revenue
router.post("/:id/report-revenue", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { revenue } = req.body;

    const [event] = await db
      .update(eventsTable)
      .set({ revenueReported: true, settledRevenue: revenue })
      .where(eq(eventsTable.id, id))
      .returning();

    if (!event) return res.status(404).json({ error: "not_found" });

    const tokensForEvent = await db.select().from(tokensTable).where(eq(tokensTable.eventId, id));
    const soldCount = tokensForEvent.length;
    const nextTokenPriceSol = soldCount === 0 ? event.initialPriceSol : soldCount * event.stepFactorBps / 10000;
    res.json({ ...event, tokensRemaining: event.tokenCount - soldCount, nextTokenPriceSol });
  } catch (err) {
    req.log.error({ err }, "Failed to report revenue");
    res.status(500).json({ error: "internal_error", message: "Failed to report revenue" });
  }
});

// GET /api/events/:id/simulation
router.get("/:id/simulation", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id)).limit(1);
    if (!event) return res.status(404).json({ error: "not_found" });

    const sim = buildSimulation(event.initialPriceSol, event.stepFactorBps, event.payoutFactorBps);
    res.json(sim);
  } catch (err) {
    req.log.error({ err }, "Failed to get simulation");
    res.status(500).json({ error: "internal_error", message: "Failed to get simulation" });
  }
});

// GET /api/events/:id/holders
router.get("/:id/holders", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id)).limit(1);
    if (!event) return res.status(404).json({ error: "not_found" });

    const tokens = await db.select().from(tokensTable).where(eq(tokensTable.eventId, id));
    const currentMaxPrice = tokens.reduce((max, t) => Math.max(max, t.currentPrice), 0);
    const nextPrice = currentMaxPrice * event.stepFactorBps / 10000;

    const holders = tokens.map(t => ({
      tokenId: t.tokenId,
      wallet: t.currentOwner,
      entryPrice: t.entryPrice,
      currentPrice: t.currentPrice,
      unrealisedRoiPct: ((nextPrice - t.currentPrice) / t.currentPrice) * 100,
    }));

    res.json(holders);
  } catch (err) {
    req.log.error({ err }, "Failed to get holders");
    res.status(500).json({ error: "internal_error", message: "Failed to get holders" });
  }
});

function buildSimulation(
  initialPrice: number,
  stepFactorBps: number,
  payoutFactorBps: number,
  platformFeeBps = 300,
  rounds = 20
) {
  const points = [];
  let price = initialPrice;
  let orgCumulative = 0;

  for (let i = 0; i < rounds; i++) {
    const buyerPays = price * stepFactorBps / 10000;
    const sellerGets = price * payoutFactorBps / 10000;
    const platformFee = buyerPays * platformFeeBps / 10000;
    const orgGets = buyerPays - sellerGets - platformFee;
    orgCumulative += orgGets;
    const investorROI = (payoutFactorBps / 10000 - 1) * 100;

    points.push({
      n: i + 1,
      price: buyerPays,
      organizerCumulative: orgCumulative,
      investorROI,
    });

    price = buyerPays;
  }
  return points;
}

// Add platformFeeBps to the event type for simulation
declare module "@workspace/db" {
  interface Event {
    platformFeeBps?: number;
  }
}

export default router;
