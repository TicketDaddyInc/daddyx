import { pgTable, text, real, integer, boolean, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const eventsTable = pgTable("events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventConfigPda: text("event_config_pda").unique(),
  name: text("name").notNull(),
  venueName: text("venue_name").notNull(),
  eventDate: timestamp("event_date").notNull(),
  endDate: timestamp("end_date"),
  organizerWallet: text("organizer_wallet").notNull(),
  revenueShareBps: integer("revenue_share_bps").notNull().default(2000),
  initialPriceSol: real("initial_price_sol").notNull().default(0.05),
  stepFactorBps: integer("step_factor_bps").notNull().default(15000),
  payoutFactorBps: integer("payout_factor_bps").notNull().default(12000),
  tokenCount: integer("token_count").notNull().default(100),
  cancelled: boolean("cancelled").notNull().default(false),
  revenueReported: boolean("revenue_reported").notNull().default(false),
  settledRevenue: real("settled_revenue"),
  daddyxEnabled: boolean("daddyx_enabled").notNull().default(true),
  description: text("description"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tokensTable = pgTable("tokens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id").notNull().references(() => eventsTable.id),
  tokenId: integer("token_id").notNull(),
  currentOwner: text("current_owner").notNull(),
  currentPrice: real("current_price").notNull(),
  entryPrice: real("entry_price").notNull(),
  revenueClaimed: boolean("revenue_claimed").notNull().default(false),
  txSignature: text("tx_signature"),
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
});

export const priceHistoryTable = pgTable("price_history", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => eventsTable.id),
  tokenId: integer("token_id").notNull(),
  wallet: text("wallet").notNull(),
  price: real("price").notNull(),
  round: integer("round").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, createdAt: true });
export const insertTokenSchema = createInsertSchema(tokensTable).omit({ id: true, purchasedAt: true });

export type Event = typeof eventsTable.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Token = typeof tokensTable.$inferSelect;
export type InsertToken = z.infer<typeof insertTokenSchema>;
export type PriceHistory = typeof priceHistoryTable.$inferSelect;
