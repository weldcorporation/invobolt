CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"description" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"vat_rate" double precision,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
CREATE INDEX "items_user_id_idx" ON "items" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_user_price_idx" ON "items" USING btree ("user_id","stripe_price_id") WHERE "items"."stripe_price_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_user_stripe_idx" ON "clients" USING btree ("user_id","stripe_customer_id") WHERE "clients"."stripe_customer_id" is not null;