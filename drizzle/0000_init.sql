CREATE TABLE "participants" (
	"id" text PRIMARY KEY NOT NULL,
	"visitor_id" text NOT NULL,
	"room_id" uuid NOT NULL,
	"username" text NOT NULL,
	"preferred_language" text DEFAULT 'en' NOT NULL,
	"email" text,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_room_name" text NOT NULL,
	"daily_room_url" text NOT NULL,
	"created_by_fingerprint" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "rooms_daily_room_name_unique" UNIQUE("daily_room_name")
);
--> statement-breakpoint
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"participant_id" text NOT NULL,
	"speaker_name" text,
	"original_text" text NOT NULL,
	"original_language" text NOT NULL,
	"translated_texts" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcripts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;