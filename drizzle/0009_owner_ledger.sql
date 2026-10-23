CREATE TABLE "owner_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" text NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"transfer_date" date NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_transfers_owner_check" CHECK ("owner_transfers"."owner" IN ('krya', 'kot')),
	CONSTRAINT "owner_transfers_kind_check" CHECK ("owner_transfers"."kind" IN ('opening', 'payout')),
	CONSTRAINT "owner_transfers_payout_positive" CHECK ("owner_transfers"."kind" <> 'payout' OR "owner_transfers"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "invoice_expenses" ADD COLUMN "paid_at" date;--> statement-breakpoint
-- Before this migration nobody recorded payment to executors: existing expenses
-- stay settled on their own date, only new unpaid ones appear in payables.
UPDATE "invoice_expenses" SET "paid_at" = "date";--> statement-breakpoint
CREATE INDEX "idx_owner_transfers_owner_date" ON "owner_transfers" USING btree ("owner","transfer_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_owner_transfers_opening" ON "owner_transfers" USING btree ("owner") WHERE "owner_transfers"."kind" = 'opening';