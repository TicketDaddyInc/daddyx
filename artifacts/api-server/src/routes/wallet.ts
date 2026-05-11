import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { eventsTable, tokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/wallet/:wallet/portfolio
router.get("/:wallet/portfolio", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;

    const tokens = await db
      .select()
      .from(tokensTable)
      .where(eq(tokensTable.currentOwner, wallet));

    const portfolio = await Promise.all(tokens.map(async t => {
      const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, t.eventId)).limit(1);
      if (!event) return null;

      const allEventTokens = await db.select().from(tokensTable).where(eq(tokensTable.eventId, t.eventId));
      const maxPrice = allEventTokens.reduce((max, tok) => Math.max(max, tok.currentPrice), 0);
      const nextPrice = maxPrice * event.stepFactorBps / 10000;
      const unrealisedRoiPct = t.currentPrice > 0
        ? ((nextPrice - t.currentPrice) / t.currentPrice) * 100
        : 0;

      return {
        tokenId: t.tokenId,
        eventId: t.eventId,
        eventName: event.name,
        eventDate: event.eventDate.toISOString(),
        entryPrice: t.entryPrice,
        currentPrice: t.currentPrice,
        unrealisedRoiPct,
        revenueClaimed: t.revenueClaimed,
        settled: event.revenueReported,
        settledRevenue: event.settledRevenue,
        revenueShareBps: event.revenueShareBps,
        tokenCount: event.tokenCount,
      };
    }));

    res.json(portfolio.filter(Boolean));
  } catch (err) {
    req.log.error({ err }, "Failed to get wallet portfolio");
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/wallet/:wallet/claim/:eventId
router.post("/:wallet/claim/:eventId", async (req: Request, res: Response) => {
  try {
    const { wallet, eventId } = req.params;

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId)).limit(1);
    if (!event) return res.status(404).json({ error: "not_found" });

    const tokens = await db.select().from(tokensTable).where(eq(tokensTable.eventId, eventId));
    const owned = tokens.filter(t => t.currentOwner === wallet);
    const tokensClaimed = owned.length;
    const revenueShareSol = event.revenueReported && event.settledRevenue
      ? (event.settledRevenue * event.revenueShareBps / 10000) * (tokensClaimed / Math.max(tokens.length, 1))
      : 0;

    res.json({
      eventId,
      wallet,
      tokensClaimed,
      revenueShareSol,
      alreadyClaimed: owned.every(t => t.revenueClaimed),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to claim revenue");
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/organizer/:wallet/events (mounted at /organizer so path is /:wallet/events)
router.get("/:wallet/events", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    const events = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.organizerWallet, wallet));

    const enriched = await Promise.all(events.map(async (event) => {
      const tokens = await db.select().from(tokensTable).where(eq(tokensTable.eventId, event.id));
      const soldCount = tokens.length;
      const capitalRaised = tokens.reduce((sum, t) => sum + t.currentPrice, 0);
      const maxPrice = tokens.reduce((max, t) => Math.max(max, t.currentPrice), 0);
      const nextTokenPriceSol = soldCount === 0
        ? event.initialPriceSol
        : maxPrice * event.stepFactorBps / 10000;

      return {
        ...event,
        tokensRemaining: event.tokenCount - soldCount,
        nextTokenPriceSol,
        capitalRaisedSol: capitalRaised,
        tokensSold: soldCount,
      };
    }));

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to get organizer events");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
