CREATE TABLE "call_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid,
	"visitor_id" text NOT NULL,
	"username" text,
	"type" text NOT NULL,
	"data" jsonb,
	"happened_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_events_room_id_idx" ON "call_events" USING btree ("room_id");