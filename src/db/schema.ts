import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    unique("rooms_daily_room_name_unique").on(table.dailyRoomName),
    index("rooms_created_by_idx").on(table.createdBy),
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
export type NewTranscript = typeof transcripts.$inferInsert;
