import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// RLS is enabled on every table with no policies: the app talks to the
// database only from the server (as the table owner), so Supabase's public
// Data API (anon key) cannot read or write these tables.

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    dailyRoomName: text("daily_room_name").notNull(),
    dailyRoomUrl: text("daily_room_url").notNull(),
    createdByFingerprint: text("created_by_fingerprint").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [unique("rooms_daily_room_name_unique").on(table.dailyRoomName)],
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
export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
