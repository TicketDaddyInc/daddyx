import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { creatorsTable, campaignsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// POST /api/creator/apply
router.post("/apply", async (req: Request, res: Response) => {
  try {
    const { wallet, name, organization, country, city, website, email, pastEvents, expectedUse } = req.body;

    const existing = await db.select().from(creatorsTable).where(eq(creatorsTable.wallet, wallet)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "already_applied", message: "Wallet already has an application" });
    }

    const [creator] = await db.insert(creatorsTable).values({
      wallet, name, organization, country, city, website, email, pastEvents, expectedUse,
      status: "pending",
    }).returning();

    res.status(201).json(creator);
  } catch (err) {
    req.log.error({ err }, "Failed to apply as creator");
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/creator/status?wallet=
router.get("/status", async (req: Request, res: Response) => {
  try {
    const wallet = req.query.wallet as string;
    if (!wallet) return res.status(400).json({ error: "wallet required" });

    const [creator] = await db.select().from(creatorsTable).where(eq(creatorsTable.wallet, wallet)).limit(1);
    if (!creator) return res.status(404).json({ error: "not_found", message: "No application found for this wallet" });

    res.json(creator);
  } catch (err) {
    req.log.error({ err }, "Failed to get creator status");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
