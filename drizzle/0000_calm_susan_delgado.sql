CREATE TYPE "public"."act_type" AS ENUM('executor', 'company');--> statement-breakpoint
CREATE TYPE "public"."assistant_action_type" AS ENUM('create_invoice', 'update_invoice', 'delete_invoice', 'create_expense', 'update_expense', 'delete_expense', 'create_client', 'update_client', 'delete_client', 'create_partner', 'update_partner', 'delete_partner', 'upload_act', 'delete_act', 'create_recurring_invoice', 'update_recurring_invoice', 'delete_recurring_invoice', 'transfer_funds', 'transfer_funds_delete', 'other');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."invoice_scheme" AS ENUM('partner_10', 'partner_15', 'agency_30', 'agency_40', 'commission_based', 'agency');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."period_unit" AS ENUM('month', 'day', 'hour');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('one_time', 'periodic');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('assistant', 'partner', 'admin', 'client', 'accountant');--> statement-breakpoint
CREATE TABLE "access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"code_enc" text,
	"role" "user_role" NOT NULL,
	"partner_id" uuid,
	"client_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "access_tokens_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "assistant_action_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_token_id" uuid,
	"action_type" "assistant_action_type" NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"description" text NOT NULL,
	"details" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_bonus_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"payment_date" date NOT NULL,
	"notes" text,
	"paid_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"telegram" text,
	"contact_person" text,
	"partner_id" uuid,
	"tg_chat_id" text,
	"tg_bot_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_calculations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"client_bill" numeric(15, 2) NOT NULL,
	"commission_rate" numeric(5, 2),
	"commission_amount" numeric(15, 2),
	"amount_to_admin" numeric(15, 2),
	"agency_margin" numeric(15, 2),
	"partner_share_from_margin" numeric(15, 2),
	"admin_share_from_margin" numeric(15, 2),
	"client_base_after_margin" numeric(15, 2),
	"client_spent" numeric(15, 2) DEFAULT '0',
	"client_remaining" numeric(15, 2),
	"executor_expenses_total" numeric(15, 2) DEFAULT '0',
	"partner_transfer_due" numeric(15, 2),
	"net_profit_admin" numeric(15, 2),
	"admin_share_50" numeric(15, 2),
	"cat_share_50" numeric(15, 2),
	"assistant_bonus_acts" numeric(15, 2) DEFAULT '0',
	"assistant_bonus_paid" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"paid_by_admin" boolean DEFAULT false NOT NULL,
	"date" date DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"expense_id" uuid,
	"author_role" "user_role" NOT NULL,
	"author_token_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_read_at" timestamp with time zone,
	"staff_read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_invoice_id" uuid NOT NULL,
	"to_invoice_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"client_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"scheme" "invoice_scheme" NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"client_bill" numeric(15, 2),
	"commission_amount" numeric(15, 2),
	"partner_commission_rate" numeric(5, 2),
	"description" text,
	"client_title" text,
	"issue_date" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_date" date,
	"actual_payment_date" date,
	"notes" text,
	"hide_from_assistant" boolean DEFAULT false NOT NULL,
	"recurring_invoice_id" uuid,
	"planned_expenses" numeric(15, 2),
	"closing_document_url" text,
	"service_type" "service_type" DEFAULT 'one_time' NOT NULL,
	"period_unit" "period_unit" DEFAULT 'month' NOT NULL,
	"price_per_period" numeric(15, 2),
	"total_periods" integer,
	"periods_used" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "login_rate_limits" (
	"code" text PRIMARY KEY NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt" bigint NOT NULL,
	"locked_until" bigint
);
--> statement-breakpoint
CREATE TABLE "monthly_financial_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" numeric(4, 0) NOT NULL,
	"month" numeric(2, 0) NOT NULL,
	"sales_target" numeric(15, 2) DEFAULT '0',
	"profit_target" numeric(15, 2) DEFAULT '0',
	"receipts_target" numeric(15, 2) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"invoice_id" uuid,
	"amount" numeric(15, 2) NOT NULL,
	"payment_date" date NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"telegram" text,
	"commission_rate" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"scheme" "invoice_scheme" NOT NULL,
	"partner_commission_rate" numeric(5, 2),
	"amount" numeric(15, 2) NOT NULL,
	"default_expenses" numeric(15, 2) DEFAULT '0',
	"description" text,
	"frequency" "frequency" DEFAULT 'monthly' NOT NULL,
	"day_of_month" numeric(2, 0) DEFAULT '1' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"next_invoice_date" date NOT NULL,
	"notes" text,
	"hide_from_assistant" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signed_acts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"act_type" "act_type" NOT NULL,
	"file_name" text NOT NULL,
	"file_data" text,
	"mime_type" text,
	"is_link" boolean DEFAULT false NOT NULL,
	"url" text,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"access_token_id" uuid NOT NULL,
	"csrf_token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false,
	CONSTRAINT "user_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_action_logs" ADD CONSTRAINT "assistant_action_logs_access_token_id_access_tokens_id_fk" FOREIGN KEY ("access_token_id") REFERENCES "public"."access_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_partners" ADD CONSTRAINT "client_partners_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_partners" ADD CONSTRAINT "client_partners_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_calculations" ADD CONSTRAINT "invoice_calculations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_expenses" ADD CONSTRAINT "invoice_expenses_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_messages" ADD CONSTRAINT "invoice_messages_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_messages" ADD CONSTRAINT "invoice_messages_expense_id_invoice_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."invoice_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_messages" ADD CONSTRAINT "invoice_messages_author_token_id_access_tokens_id_fk" FOREIGN KEY ("author_token_id") REFERENCES "public"."access_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_transfers" ADD CONSTRAINT "invoice_transfers_from_invoice_id_invoices_id_fk" FOREIGN KEY ("from_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_transfers" ADD CONSTRAINT "invoice_transfers_to_invoice_id_invoices_id_fk" FOREIGN KEY ("to_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_payments" ADD CONSTRAINT "partner_payments_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_payments" ADD CONSTRAINT "partner_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signed_acts" ADD CONSTRAINT "signed_acts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_access_token_id_access_tokens_id_fk" FOREIGN KEY ("access_token_id") REFERENCES "public"."access_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assistant_action_logs_token" ON "assistant_action_logs" USING btree ("access_token_id");--> statement-breakpoint
CREATE INDEX "idx_assistant_action_logs_type" ON "assistant_action_logs" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "idx_assistant_action_logs_created" ON "assistant_action_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_bonus_payments_date" ON "assistant_bonus_payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "idx_client_partners_client" ON "client_partners" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_client_partners_partner" ON "client_partners" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_messages_invoice" ON "invoice_messages" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_messages_expense" ON "invoice_messages" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_messages_created" ON "invoice_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_invoices_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_invoices_payment_date" ON "invoices" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "idx_invoices_created_at" ON "invoices" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_invoices_partner_id" ON "invoices" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_client_id" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_recurring_id" ON "invoices" USING btree ("recurring_invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_status_payment_date" ON "invoices" USING btree ("status","payment_date");--> statement-breakpoint
CREATE INDEX "idx_monthly_plans_year_month" ON "monthly_financial_plans" USING btree ("year","month");--> statement-breakpoint
CREATE INDEX "idx_recurring_invoices_next_date" ON "recurring_invoices" USING btree ("next_invoice_date");--> statement-breakpoint
CREATE INDEX "idx_recurring_invoices_client" ON "recurring_invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_recurring_invoices_active" ON "recurring_invoices" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_signed_acts_invoice" ON "signed_acts" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_signed_acts_type" ON "signed_acts" USING btree ("act_type");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_session_id" ON "user_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_token_id" ON "user_sessions" USING btree ("access_token_id");