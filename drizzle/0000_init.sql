CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"method" text NOT NULL,
	"status" text NOT NULL,
	"gateway_order_id" text,
	"gateway_payment_id" text,
	"failure_reason" text,
	"refund_id" text,
	"refunded_at" text,
	"initiated_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "saved_payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"upi_id" text,
	"upi_app" text,
	"card_token" text,
	"card_last4" text,
	"card_network" text,
	"card_type" text,
	"card_expiry_month" text,
	"card_expiry_year" text,
	"card_holder_name" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
