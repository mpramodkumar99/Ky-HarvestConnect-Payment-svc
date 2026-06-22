import type { FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import type { PaymentService, SavedPaymentMethodService, PayoutService } from './service.js';
import { initiatePaymentSchema, webhookSchema, refundSchema, addSavedPMSchema, validateVPASchema, requestPayoutSchema } from './schemas.js';
import { AppError } from './errors.js';

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof AppError) {
    return reply.status(err.statusCode).send({
      success: false,
      error: { type: err.name, title: err.message, status: err.statusCode },
    });
  }
  if (err instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: { type: 'validation_error', title: 'Validation error', status: 400, detail: err.flatten().fieldErrors },
    });
  }
  console.error(err);
  return reply.status(500).send({ success: false, error: { type: 'internal_error', title: 'Internal server error', status: 500 } });
}

export function registerPaymentRoutes(app: FastifyInstance, service: PaymentService) {

  // POST /v1/payments  — initiate (called by order-svc or app directly)
  app.post('/v1/payments', async (request, reply) => {
    try {
      const body    = initiatePaymentSchema.parse(request.body);
      const payment = await service.initiatePayment(body.orderId, body.buyerId, body.amount, body.method);
      return reply.status(201).send({ success: true, data: payment });
    } catch (err) { return handleError(err, reply); }
  });

  // GET /v1/payments/:id
  app.get('/v1/payments/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const payment = await service.getPayment(id);
      return reply.send({ success: true, data: payment });
    } catch (err) { return handleError(err, reply); }
  });

  // GET /v1/payments?orderId=
  app.get('/v1/payments', async (request, reply) => {
    try {
      const { orderId } = request.query as { orderId?: string };
      if (!orderId) {
        return reply.status(400).send({
          success: false, error: { type: 'BadRequestError', title: 'orderId query param required', status: 400 },
        });
      }
      const payment = await service.getPaymentByOrder(orderId);
      return reply.send({ success: true, data: payment });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /v1/payments/webhook  — called by Razorpay/Stripe; signature verified in port
  app.post('/v1/payments/webhook', async (request, reply) => {
    try {
      const body    = webhookSchema.parse(request.body);
      const payment = await service.handleWebhook(
        body.gatewayOrderId, body.gatewayPaymentId, body.success, body.failureReason,
      );
      return reply.send({ success: true, data: payment });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /v1/payments/:id/refund
  app.post('/v1/payments/:id/refund', async (request, reply) => {
    try {
      const { id }  = request.params as { id: string };
      const body    = refundSchema.parse(request.body);
      const payment = await service.refundPayment(id, body.reason);
      return reply.send({ success: true, data: payment });
    } catch (err) { return handleError(err, reply); }
  });
}

// ── UPI VPA validation ────────────────────────────────────────────────────────

// All known live UPI handles across banks and payment apps (NPCI registered)
const KNOWN_UPI_HANDLES = new Set([
  // GPay (Google Pay)
  'okaxis','okhdfcbank','okicici','oksbi',
  // PhonePe
  'ybl','ibl','axl','ppi',
  // Paytm
  'paytm','ptaxis','pthdfc','ptsbi','ptyes',
  // BHIM / SBI
  'upi','sbi','sbipay',
  // Amazon Pay
  'apl',
  // WhatsApp Pay
  'waaxis','wahdfcbank','waicici','wasbi',
  // Banks — Axis
  'axisbank','axis',
  // Banks — HDFC
  'hdfcbank','hdfc',
  // Banks — ICICI
  'icici','icicibank',
  // Banks — Kotak
  'kotak','kmbl',
  // Banks — Yes Bank
  'yesbank','yesbankltd',
  // Banks — IndusInd
  'indus','induslnd',
  // Banks — IDFC
  'idfcbank','idfc',
  // Banks — Punjab National Bank
  'pnb',
  // Banks — Bank of Baroda
  'barodampay','bob','barb',
  // Banks — Canara Bank
  'cnrb',
  // Banks — Union Bank
  'unionbankofindia','uboi',
  // Banks — Indian Bank
  'indianbank',
  // Banks — Bank of India
  'boi',
  // Banks — Central Bank
  'centralbank',
  // Banks — UCO Bank
  'uco',
  // Banks — IDBI
  'idbi',
  // Banks — Federal Bank
  'federal','fbl',
  // Banks — South Indian Bank
  'sib',
  // Banks — Karnataka Bank
  'kbl',
  // Banks — DCB Bank
  'dcb',
  // Banks — RBL Bank
  'rbl',
  // Banks — Bandhan Bank
  'bandhan',
  // Banks — City Union Bank
  'cub',
  // NSDL Payments Bank
  'nsdl',
  // Airtel Payments Bank
  'airtel','airtelpaymentsbank',
  // Jio Payments Bank
  'jio','jiomoney',
  // FreeCharge
  'fc',
  // MobiKwik
  'ikwik',
  // FINO Payments Bank
  'fino','finopayments',
  // India Post Payments Bank
  'postbank',
  // Slice
  'slice',
  // Fi Money
  'fi',
  // Jupiter
  'jupiter',
  // Navi
  'navi',
]);

function validateVPAHandle(vpa: string): { valid: boolean; reason?: string } {
  const lower  = vpa.toLowerCase().trim();
  const parts  = lower.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'UPI ID must be in format name@handle' };
  }
  const [username, handle] = parts as [string, string];
  if (username.length < 3) {
    return { valid: false, reason: 'UPI ID username is too short' };
  }
  if (!KNOWN_UPI_HANDLES.has(handle)) {
    return { valid: false, reason: `'@${handle}' is not a recognised bank or payment app` };
  }
  return { valid: true };
}

export function registerUPIRoutes(app: FastifyInstance) {
  const keyId     = process.env['RAZORPAY_KEY_ID'];
  const keySecret = process.env['RAZORPAY_KEY_SECRET'];
  // Only use Razorpay live keys — test keys cannot validate real UPI IDs
  const isLiveKey = keyId?.startsWith('rzp_live_') ?? false;
  const token     = isLiveKey && keyId && keySecret
    ? Buffer.from(`${keyId}:${keySecret}`).toString('base64')
    : null;

  app.post('/v1/upi/validate', async (request, reply) => {
    try {
      const { vpa } = validateVPASchema.parse(request.body);

      // Step 1: local handle validation (free, instant)
      const localCheck = validateVPAHandle(vpa);
      if (!localCheck.valid) {
        return reply.status(422).send({
          success: false,
          error: { type: 'InvalidVPA', title: localCheck.reason ?? 'Invalid UPI ID', status: 422 },
        });
      }

      // Step 2: live Razorpay VPA lookup (only when live keys are configured)
      if (token) {
        const rzpRes = await fetch('https://api.razorpay.com/v1/payments/validate/vpa', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${token}` },
          body:    JSON.stringify({ vpa }),
        });
        const data = await rzpRes.json() as {
          success?: boolean; customer_name?: string; vpa?: string;
        };
        if (!rzpRes.ok || !data.success) {
          return reply.status(422).send({
            success: false,
            error: { type: 'InvalidVPA', title: 'UPI ID not found or inactive', status: 422 },
          });
        }
        return reply.send({ success: true, data: { valid: true, name: data.customer_name ?? null, vpa: data.vpa } });
      }

      // No live key — handle validated OK, return without a name
      return reply.send({ success: true, data: { valid: true, name: null, vpa } });
    } catch (err) { return handleError(err, reply); }
  });
}

// ── Saved payment method routes ───────────────────────────────────────────────

// ── Payout routes ─────────────────────────────────────────────────────────────

export function registerPayoutRoutes(app: FastifyInstance, service: PayoutService) {

  // GET /v1/payouts?sellerId=
  app.get('/v1/payouts', async (request, reply) => {
    try {
      const { sellerId } = request.query as { sellerId?: string };
      if (!sellerId) return reply.status(400).send({ success: false, error: { type: 'BadRequestError', title: 'sellerId required', status: 400 } });
      const payouts = await service.list(sellerId);
      return reply.send({ success: true, data: payouts });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /v1/payouts
  app.post('/v1/payouts', async (request, reply) => {
    try {
      const body   = requestPayoutSchema.parse(request.body);
      const payout = await service.request(body);
      return reply.status(201).send({ success: true, data: payout });
    } catch (err) { return handleError(err, reply); }
  });
}

export function registerSavedPMRoutes(app: FastifyInstance, service: SavedPaymentMethodService) {

  // GET /v1/users/:userId/payment-methods
  app.get('/v1/users/:userId/payment-methods', async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const methods = await service.list(userId);
      return reply.send({ success: true, data: methods, meta: { total: methods.length } });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /v1/users/:userId/payment-methods
  // Body: { type: 'upi', upiId: '...' } | { type: 'card', cardLast4: '...', ... }
  app.post('/v1/users/:userId/payment-methods', async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const body = addSavedPMSchema.parse(request.body);

      let result;
      if (body.type === 'upi') {
        result = await service.addUPI(userId, body.upiId, body.upiApp);
      } else {
        result = await service.addCard(userId, {
          cardToken:       body.cardToken,
          cardLast4:       body.cardLast4,
          cardNetwork:     body.cardNetwork,
          cardType:        body.cardType,
          cardExpiryMonth: body.cardExpiryMonth,
          cardExpiryYear:  body.cardExpiryYear,
          cardHolderName:  body.cardHolderName,
        });
      }
      return reply.status(201).send({ success: true, data: result });
    } catch (err) { return handleError(err, reply); }
  });

  // PATCH /v1/users/:userId/payment-methods/:id/default
  app.patch('/v1/users/:userId/payment-methods/:id/default', async (request, reply) => {
    try {
      const { userId, id } = request.params as { userId: string; id: string };
      const result = await service.setDefault(userId, id);
      return reply.send({ success: true, data: result });
    } catch (err) { return handleError(err, reply); }
  });

  // DELETE /v1/users/:userId/payment-methods/:id
  app.delete('/v1/users/:userId/payment-methods/:id', async (request, reply) => {
    try {
      const { userId, id } = request.params as { userId: string; id: string };
      await service.remove(userId, id);
      return reply.status(204).send();
    } catch (err) { return handleError(err, reply); }
  });
}
