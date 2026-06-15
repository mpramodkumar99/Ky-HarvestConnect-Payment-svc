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
