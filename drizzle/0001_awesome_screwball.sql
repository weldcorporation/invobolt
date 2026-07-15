ALTER TABLE "clients" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "name_key" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_user_name_idx" ON "clients" USING btree ("user_id","name_key");