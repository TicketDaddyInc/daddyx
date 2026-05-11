import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { campaignsTable, creatorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// POST /api/campaigns/create
router.post("/create", async (req: Request, res: Response) => {
  try {
    const { creatorWallet, eventId, name, tokenCount, campaignDetailsUri } = req.body;

    const [creator] = await db.select().from(creatorsTable).where(eq(creatorsTable.wallet, creatorWallet)).limit(1);
    if (!creator) return res.status(404).json({ error: "creator_not_found" });

    const [campaign] = await db.insert(campaignsTable).values({
      creatorId: creator.id,
      eventId,
      name,
      tokenCount,
      campaignDetailsUri,
      status: "active",
      capitalRaisedSol: "0",
      milestone1Released: "false",
      milestone2Released: "false",
      milestone3Released: "false",
      milestone1Requested: "false",
      milestone2Requested: "false",
    }).returning();

    res.status(201).json(campaign);
  } catch (err) {
    req.log.error({ err }, "Failed to create campaign");
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/campaigns/:id/milestone/request
router.post("/:id/milestone/request", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { milestoneIndex } = req.body;

    const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id)).limit(1);
    if (!campaign) return res.status(404).json({ error: "not_found" });

    const update: Record<string, string> = {};
    if (milestoneIndex === 0) update.milestone1Requested = "true";
    else if (milestoneIndex === 1) update.milestone2Requested = "true";

    const [updated] = await db.update(campaignsTable).set(update).where(eq(campaignsTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to request milestone");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
