ALTER TABLE "partners" ADD COLUMN "leverage_role" text DEFAULT 'external' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_invoice_calculations_invoice" ON "invoice_calculations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_expenses_invoice" ON "invoice_expenses" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_partner_payments_partner" ON "partner_payments" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_partner_payments_invoice" ON "partner_payments" USING btree ("invoice_id");