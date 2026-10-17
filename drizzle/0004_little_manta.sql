CREATE TABLE "scheduled_jobs" (
	"key" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'idle' NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"last_error" text,
	"result" text
);
--> statement-breakpoint
CREATE INDEX "idx_login_rate_limits_expiry" ON "login_rate_limits" USING btree ("last_attempt");