import Fastify from 'fastify';
import cors from '@fastify/cors';
import { InMemoryPaymentRepository } from './repository.js';
import { FakeGatewayProvider, FakeOrderCallback, HttpOrderCallback } from './ports.js';
import { PaymentService } from './service.js';
import { registerPaymentRoutes } from './routes.js';

async function start() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  // ── Dependency wiring ─────────────────────────────────────────────────────
  // To adopt real implementations: change ONLY the lines below.
  const paymentRepo   = new InMemoryPaymentRepository();         // → PostgresPaymentRepository
  const gateway       = new FakeGatewayProvider();               // → RazorpayGatewayProvider
  const orderCallback = process.env['ORDER_SVC_URL']
    ? new HttpOrderCallback(process.env['ORDER_SVC_URL'])        // → live order-svc
    : new FakeOrderCallback();                                   // → dev console log

  const service = new PaymentService(paymentRepo, gateway, orderCallback);
  registerPaymentRoutes(app, service);

  app.get('/health', async () => ({ status: 'ok', service: 'payment-svc' }));

  const PORT = 3005;
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`payment-svc running on http://localhost:${PORT}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
