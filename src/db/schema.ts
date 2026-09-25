import { relations, sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

import { USAGE_SERVICES, type UsageService } from "../lib/usage-pricing";

// RLS is enabled on every table with no policies: the app talks to the
// database only from the server (as the table owner), so Supabase's public
// Data API (anon key) cannot read or write these tables.

// Who may use the app. Accounts are created in the Supabase dashboard
// (Authentication → Users); an account only gets in once it has a row here.
export const TEAM_ROLES = ["admin", "member"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const teamMembers = pgTable(
  "team_members",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: text("role").$type<TeamRole>().notNull().default("member"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    check("team_members_role_check", sql`${table.role} in ('admin', 'member')`),
  ],
).enableRLS();

// App-wide settings edited in the admin panel (e.g. the translation provider)
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: uuid("updated_by").references(() => authUsers.id, {
    onDelete: "set null",
  }),
}).enableRLS();

// How guests get into a room: straight in with the invite link ("open"), or
// only after someone from the team lets them in ("approval", the default)
export const ENTRY_MODES = ["open", "approval"] as const;
export type EntryMode = (typeof ENTRY_MODES)[number];

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    dailyRoomName: text("daily_room_name").notNull(),
    dailyRoomUrl: text("daily_room_url").notNull(),
    createdByFingerprint: text("created_by_fingerprint"), // legacy (phase 1 rooms)
    createdBy: uuid("created_by").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    // Secret part of the guest link (/{room}?convite=...). Guests can only
    // join with it, and only until the room expires.
    inviteToken: text("invite_token"),
    entryMode: text("entry_mode")
      .$type<EntryMode>()
      .notNull()
      .default("approval"),
    // Locked rooms take no new guests (the invite link stops working);
    // whoever is already in the call stays
    lockedAt: timestamp("locked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    unique("rooms_daily_room_name_unique").on(table.dailyRoomName),
    index("rooms_created_by_idx").on(table.createdBy),
    check(
      "rooms_entry_mode_check",
      sql`${table.entryMode} in ('open', 'approval')`,
    ),
  ],
).enableRLS();

// Guests asking to get into a room in "approval" mode (waiting room)
export const JOIN_REQUEST_STATUSES = ["pending", "approved", "denied"] as const;
export type JoinRequestStatus = (typeof JOIN_REQUEST_STATUSES)[number];

export const joinRequests = pgTable(
  "join_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    visitorId: text("visitor_id").notNull(),
    username: text("username").notNull(),
    preferredLanguage: text("preferred_language").notNull(),
    status: text("status")
      .$type<JoinRequestStatus>()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // The guest's page asks every few seconds; stale requests are hidden
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at"),
    decidedBy: uuid("decided_by").references(() => authUsers.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("join_requests_room_id_status_idx").on(table.roomId, table.status),
    check(
      "join_requests_status_check",
      sql`${table.status} in ('pending', 'approved', 'denied')`,
    ),
  ],
).enableRLS();

export const participants = pgTable(
  "participants",
  {
    id: text("id").primaryKey(), // visitorId + roomId
    visitorId: text("visitor_id").notNull(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    preferredLanguage: text("preferred_language").notNull().default("en"),
    email: text("email"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    leftAt: timestamp("left_at"),
  },
  (table) => [index("participants_room_id_idx").on(table.roomId)],
).enableRLS();

export const transcripts = pgTable(
  "transcripts",
  {
    id: text("id").primaryKey(), // nanoid(12)
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    participantId: text("participant_id").notNull(),
    speakerName: text("speaker_name"),
    originalText: text("original_text").notNull(),
    originalLanguage: text("original_language").notNull(),
    translatedTexts: jsonb("translated_texts").$type<Record<string, string>>(),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  (table) => [
    index("transcripts_room_id_timestamp_idx").on(
      table.roomId,
      table.timestamp,
    ),
  ],
).enableRLS();

// What each meeting used of the paid services, to estimate its cost.
// Rows outlive the room (room_id is cleared, the name stays) so the
// monthly totals do not change when a room is deleted.
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id").references(() => rooms.id, {
      onDelete: "set null",
    }),
    roomName: text("room_name").notNull(),
    service: text("service").$type<UsageService>().notNull(),
    // Seconds, tokens or calls, depending on the service
    quantity: doublePrecision("quantity").notNull(),
    // Estimated cost in US dollars at the time; null = no price on file
    costUsd: doublePrecision("cost_usd"),
    visitorId: text("visitor_id"),
    // e.g. model and input/output tokens
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("usage_events_room_id_idx").on(table.roomId),
    index("usage_events_created_at_idx").on(table.createdAt),
    check(
      "usage_events_service_check",
      sql.raw(
        `service in (${USAGE_SERVICES.map((s) => `'${s}'`).join(", ")})`,
      ),
    ),
  ],
).enableRLS();

// Relations
export const roomsRelations = relations(rooms, ({ many }) => ({
  participants: many(participants),
  transcripts: many(transcripts),
}));

export const participantsRelations = relations(participants, ({ one }) => ({
  room: one(rooms, {
    fields: [participants.roomId],
    references: [rooms.id],
  }),
}));

export const transcriptsRelations = relations(transcripts, ({ one }) => ({
  room: one(rooms, {
    fields: [transcripts.roomId],
    references: [rooms.id],
  }),
}));

// Types
export type TeamMember = typeof teamMembers.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type JoinRequest = typeof joinRequests.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
export type UsageEvent = typeof usageEvents.$inferSelect;
