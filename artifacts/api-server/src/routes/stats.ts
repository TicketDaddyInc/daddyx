import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { eventsTable, tokensTable, priceHistoryTable } from "@workspace/db";
import { eq, count, sum, desc } from "drizzle-orm";

const router = Router();

// GET /api/stats/summary
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const allEvents = await db.select().from(eventsTable);
    const totalEvents = allEvents.length;
    const daddyxEvents = allEvents.filter(e => e.daddyxEnabled).length;

    const allTokens = await db.select().from(tokensTable);
    const totalTokensSold = allTokens.length;
    const totalCapitalRaisedSol = allTokens.reduce((sum, t) => sum + t.currentPrice, 0);

    const uniqueHolders = new Set(allTokens.map(t => t.currentOwner)).size;

    // Recent purchases from price history
    const recentHistory = await db
      .select()
      .from(priceHistoryTable)
      .orderBy(desc(priceHistoryTable.timestamp))
      .limit(10);

    const recentPurchases = await Promise.all(recentHistory.map(async h => {
      const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, h.eventId)).limit(1);
      return {
        eventName: event?.name ?? "Unknown",
        tokenId: h.tokenId,
        wallet: h.wallet,
        priceSol: h.price,
        timestamp: h.timestamp.toISOString(),
      };
    }));

    res.json({
      totalEvents,
      daddyxEvents,
      totalTokensSold,
      totalCapitalRaisedSol,
      totalHolders: uniqueHolders,
      recentPurchases,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get stats");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
