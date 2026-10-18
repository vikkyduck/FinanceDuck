ALTER TABLE "partner_payments" DROP CONSTRAINT "partner_payments_invoice_id_invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "partner_payments" ADD CONSTRAINT "partner_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;