import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  orderId:  z.string().min(1),
  buyerId:  z.string().min(1),
  amount:   z.number().int().positive(),
  method:   z.enum(['upi', 'card', 'cod', 'wallet']),
});

export const webhookSchema = z.object({
  gatewayOrderId:   z.string().min(1),
  gatewayPaymentId: z.string().min(1),
  success:          z.boolean(),
  failureReason:    z.string().optional(),
});

export const refundSchema = z.object({
  reason: z.string().min(1),
});

// ── Saved payment method schemas ──────────────────────────────────────────────

const upiIdRegex = /^[a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+$/;

export const addUPISchema = z.object({
  type:   z.literal('upi'),
  upiId:  z.string().min(3).regex(upiIdRegex, 'Invalid UPI ID — expected format: name@handle'),
  upiApp: z.enum(['GPay', 'PhonePe', 'Paytm', 'BHIM', 'UPI']).optional(),
});

export const addCardSchema = z.object({
  type:            z.literal('card'),
  cardToken:       z.string().optional(),           // gateway token; absent in dev/mock
  cardLast4:       z.string().length(4).regex(/^\d{4}$/),
  cardNetwork:     z.enum(['visa', 'mastercard', 'rupay', 'amex', 'unknown']),
  cardType:        z.enum(['credit', 'debit']),
  cardExpiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Month must be 01–12'),
  cardExpiryYear:  z.string().length(2).regex(/^\d{2}$/),
  cardHolderName:  z.string().min(2).max(100),
});

export const addSavedPMSchema = z.discriminatedUnion('type', [addUPISchema, addCardSchema]);

export const validateVPASchema = z.object({
  vpa: z.string().min(3).regex(/^[a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+$/, 'Invalid UPI ID format'),
});

export const requestPayoutSchema = z.object({
  sellerId:      z.string().min(1),
  amount:        z.number().int().positive(),
  bankAccountId: z.string().optional(),
  notes:         z.string().max(500).optional(),
});
