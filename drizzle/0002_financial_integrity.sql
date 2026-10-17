CREATE TABLE "command_receipts" (
	"key" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_number_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"body" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_invoice_calculations_invoice";--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_outbox_pending" ON "notification_outbox" USING btree ("delivered_at","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_invoice_transfers_from" ON "invoice_transfers" USING btree ("from_invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_transfers_to" ON "invoice_transfers" USING btree ("to_invoice_id");--> statement-breakpoint
-- Preserve all historical invoices, including paid duplicates. Only the earliest
-- invoice claims the generation identity; dates/statuses/amounts remain unchanged.
ALTER TABLE "invoices" ADD COLUMN "recurring_occurrence_key" text;
--> statement-breakpoint
WITH ranked AS (
  SELECT id, recurring_invoice_id::text || ':' || issue_date::text AS occurrence_key,
    row_number() OVER (PARTITION BY recurring_invoice_id, issue_date ORDER BY created_at, id) AS occurrence_rank
  FROM invoices WHERE recurring_invoice_id IS NOT NULL AND issue_date IS NOT NULL
)
UPDATE invoices i SET recurring_occurrence_key = ranked.occurrence_key
FROM ranked WHERE i.id = ranked.id AND ranked.occurrence_rank = 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invoices_recurring_occurrence" ON "invoices" USING btree ("recurring_occurrence_key");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_invoice_calculations_invoice" ON "invoice_calculations" USING btree ("invoice_id");
--> statement-breakpoint
INSERT INTO invoice_number_counters (year, last_number)
SELECT split_part(invoice_number, '-', 2)::integer, MAX(split_part(invoice_number, '-', 3)::integer)
FROM invoices WHERE invoice_number ~ '^INV-[0-9]{4}-[0-9]{1,9}$'
GROUP BY split_part(invoice_number, '-', 2)::integer;
