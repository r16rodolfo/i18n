CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid,
	"room_name" text NOT NULL,
	"service" text NOT NULL,
	"quantity" double precision NOT NULL,
	"cost_usd" double precision,
	"visitor_id" text,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_service_check" CHECK (service in ('video', 'stt_soniox', 'stt_elevenlabs', 'palabra', 'translation_openai', 'assistant_openai', 'web_search'))
);
--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_events_room_id_idx" ON "usage_events" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "usage_events_created_at_idx" ON "usage_events" USING btree ("created_at");