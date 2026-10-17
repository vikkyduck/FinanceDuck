CREATE TABLE "service_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"period" integer NOT NULL,
	"closed" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "service_usage" ADD CONSTRAINT "service_usage_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_usage" ADD CONSTRAINT "service_usage_updated_by_access_tokens_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."access_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_usage_invoice_period" ON "service_usage" USING btree ("invoice_id","period");
--> statement-breakpoint
-- Preserve the number already shown to users; no invented historical closing dates.
INSERT INTO service_usage (invoice_id, period, closed, source)
SELECT i.id, n, true, 'legacy'
FROM invoices i CROSS JOIN LATERAL generate_series(1, i.periods_used) n
WHERE i.service_type = 'periodic'
ON CONFLICT (invoice_id, period) DO NOTHING;
