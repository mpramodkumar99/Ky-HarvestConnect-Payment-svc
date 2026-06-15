import type { FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import type { PaymentService } from './service.js';
import { initiatePaymentSchema, webhookSchema, refundSchema } from './schemas.js';
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
