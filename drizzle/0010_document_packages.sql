CREATE TABLE "document_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"side" text NOT NULL,
	"executor_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_comment" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_packages_side_check" CHECK ("document_packages"."side" IN ('client', 'executor')),
	CONSTRAINT "document_packages_status_check" CHECK ("document_packages"."status" IN ('pending', 'accepted', 'returned')),
	CONSTRAINT "document_packages_executor_check" CHECK ("document_packages"."side" = 'executor' OR "document_packages"."executor_name" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "signed_acts" ADD COLUMN "package_id" uuid;--> statement-breakpoint
ALTER TABLE "document_packages" ADD CONSTRAINT "document_packages_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_document_packages_identity" ON "document_packages" USING btree ("invoice_id","side",lower(coalesce("executor_name", '')));--> statement-breakpoint
CREATE INDEX "idx_document_packages_status" ON "document_packages" USING btree ("status");--> statement-breakpoint
ALTER TABLE "signed_acts" ADD CONSTRAINT "signed_acts_package_id_document_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."document_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_signed_acts_package" ON "signed_acts" USING btree ("package_id");--> statement-breakpoint
-- Assistant uploads since the package rule (22.10.2026, the same DATE() boundary as the
-- bonus query) become pending packages, one per invoice and side: executor names were
-- not collected yet.
INSERT INTO "document_packages" ("invoice_id", "side", "created_at")
SELECT sa."invoice_id", CASE sa."act_type" WHEN 'company' THEN 'client' ELSE 'executor' END, MIN(sa."created_at")
FROM "signed_acts" sa
JOIN "access_tokens" t ON t."id" = sa."uploaded_by"
WHERE t."role" = 'assistant' AND DATE(sa."created_at") >= DATE '2026-10-22'
GROUP BY 1, 2;--> statement-breakpoint
UPDATE "signed_acts" sa SET "package_id" = p."id"
FROM "document_packages" p, "access_tokens" t
WHERE p."invoice_id" = sa."invoice_id"
  AND p."side" = CASE sa."act_type" WHEN 'company' THEN 'client' ELSE 'executor' END
  AND t."id" = sa."uploaded_by" AND t."role" = 'assistant'
  AND DATE(sa."created_at") >= DATE '2026-10-22';
