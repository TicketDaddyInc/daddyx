import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { creatorsTable, campaignsTable, eventsTable } from "@workspace/db";
import { eq, and, lt, sql } from "drizzle-orm";

const router = Router();

// GET /api/admin/creators/pending
router.get("/creators/pending", async (req: Request, res: Response) => {
  try {
    const pending = await db
      .select()
      .from(creatorsTable)
      .where(eq(creatorsTable.status, "pending"));
    res.json(pending);
  } catch (err) {
    req.log.error({ err }, "Failed to list pending creators");
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/admin/creators/approve
router.post("/creators/approve", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.body;
    const [creator] = await db
      .update(creatorsTable)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(creatorsTable.wallet, wallet))
      .returning();

    if (!creator) return res.status(404).json({ error: "not_found" });
    res.json(creator);
  } catch (err) {
    req.log.error({ err }, "Failed to approve creator");
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/admin/creators/reject
router.post("/creators/reject", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.body;
    const [creator] = await db
      .update(creatorsTable)
      .set({ status: "suspended" })
      .where(eq(creatorsTable.wallet, wallet))
      .returning();

    if (!creator) return res.status(404).json({ error: "not_found" });
    res.json(creator);
  } catch (err) {
    req.log.error({ err }, "Failed to reject creator");
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/admin/oracle/pending — events past end_date without revenue reported
router.get("/oracle/pending", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const events = await db
      .select()
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.revenueReported, false),
          eq(eventsTable.cancelled, false),
          eq(eventsTable.daddyxEnabled, true),
          lt(eventsTable.eventDate, now)
        )
      );
    res.json(events.map(e => ({ ...e, tokensRemaining: e.tokenCount, nextTokenPriceSol: e.initialPriceSol })));
  } catch (err) {
    req.log.error({ err }, "Failed to get oracle pending");
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/admin/campaigns/:id/milestone/approve
router.post("/campaigns/:id/milestone/approve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { milestoneIndex } = req.body;

    const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id)).limit(1);
    if (!campaign) return res.status(404).json({ error: "not_found" });

    const update: Record<string, string> = {};
    if (milestoneIndex === 0) update.milestone1Released = "true";
    else if (milestoneIndex === 1) update.milestone2Released = "true";
    else if (milestoneIndex === 2) update.milestone3Released = "true";

    const [updated] = await db.update(campaignsTable).set(update).where(eq(campaignsTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to approve milestone");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
