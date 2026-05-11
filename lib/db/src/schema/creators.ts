import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creatorsTable = pgTable("creators", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  wallet: text("wallet").unique().notNull(),
  name: text("name").notNull(),
  organization: text("organization"),
  country: text("country").notNull(),
  city: text("city"),
  website: text("website"),
  email: text("email").notNull(),
  pastEvents: text("past_events"),
  expectedUse: text("expected_use"),
  status: text("status").notNull().default("pending"), // pending | approved | suspended
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  eventCount: integer("event_count").notNull().default(0),
});

export const campaignsTable = pgTable("campaigns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  creatorId: text("creator_id").notNull().references(() => creatorsTable.id),
  eventId: text("event_id"),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  capitalRaisedSol: text("capital_raised_sol").notNull().default("0"),
  tokenCount: integer("token_count").notNull().default(0),
  campaignDetailsUri: text("campaign_details_uri"),
  milestone1Released: text("milestone_1_released").notNull().default("false"),
  milestone2Released: text("milestone_2_released").notNull().default("false"),
  milestone3Released: text("milestone_3_released").notNull().default("false"),
  milestone1Requested: text("milestone_1_requested").notNull().default("false"),
  milestone2Requested: text("milestone_2_requested").notNull().default("false"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCreatorSchema = createInsertSchema(creatorsTable).omit({ id: true, appliedAt: true, eventCount: true });
export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true });

export type Creator = typeof creatorsTable.$inferSelect;
export type InsertCreator = z.infer<typeof insertCreatorSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
