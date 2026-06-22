import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const payments = pgTable('payments', {
  id:               text('id').primaryKey(),
  orderId:          text('order_id').notNull(),
  buyerId:          text('buyer_id').notNull(),
  amount:           integer('amount').notNull(),
  currency:         text('currency').notNull().default('INR'),
  method:           text('method').notNull(),
  status:           text('status').notNull(),
  gatewayOrderId:   text('gateway_order_id'),
  gatewayPaymentId: text('gateway_payment_id'),
  failureReason:    text('failure_reason'),
  refundId:         text('refund_id'),
  refundedAt:       text('refunded_at'),
  initiatedAt:      text('initiated_at').notNull(),
  completedAt:      text('completed_at'),
});

export const savedPaymentMethods = pgTable('saved_payment_methods', {
  id:              text('id').primaryKey(),
  userId:          text('user_id').notNull(),
  type:            text('type').notNull(),

  upiId:           text('upi_id'),
  upiApp:          text('upi_app'),

  cardToken:       text('card_token'),
  cardLast4:       text('card_last4'),
  cardNetwork:     text('card_network'),
  cardType:        text('card_type'),
  cardExpiryMonth: text('card_expiry_month'),
  cardExpiryYear:  text('card_expiry_year'),
  cardHolderName:  text('card_holder_name'),

  isDefault:       boolean('is_default').notNull().default(false),
  createdAt:       text('created_at').notNull(),
  updatedAt:       text('updated_at').notNull(),
});

export const payouts = pgTable('payouts', {
  id:            text('id').primaryKey(),
  sellerId:      text('seller_id').notNull(),
  amount:        integer('amount').notNull(),
  status:        text('status').notNull().default('pending'),
  bankAccountId: text('bank_account_id'),
  notes:         text('notes'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
