CREATE TABLE "invoice_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"provider_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_link_url" text;--> statement-breakpoint
CREATE INDEX "invoice_emails_user_sent_idx" ON "invoice_emails" USING btree ("user_id","sent_at");