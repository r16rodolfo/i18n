CREATE TABLE "join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"visitor_id" text NOT NULL,
	"username" text NOT NULL,
	"preferred_language" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"decided_by" uuid,
	CONSTRAINT "join_requests_status_check" CHECK ("join_requests"."status" in ('pending', 'approved', 'denied'))
);
--> statement-breakpoint
ALTER TABLE "join_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "entry_mode" text DEFAULT 'approval' NOT NULL;--> statement-breakpoint
-- Rooms that already exist keep working as before (guests go straight in)
UPDATE "rooms" SET "entry_mode" = 'open';--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "locked_at" timestamp;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "join_requests_room_id_status_idx" ON "join_requests" USING btree ("room_id","status");--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_entry_mode_check" CHECK ("rooms"."entry_mode" in ('open', 'approval'));