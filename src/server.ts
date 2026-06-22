import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { InMemoryPaymentRepository, InMemorySavedPMRepository, InMemoryPayoutRepository } from './repository.js';
import { PgPaymentRepository, PgSavedPMRepository, PgPayoutRepository } from './db/pg-repository.js';
import { db } from './db/client.js';
import { FakeGatewayProvider, FakeOrderCallback, HttpOrderCallback } from './ports.js';
import { PaymentService, SavedPaymentMethodService, PayoutService } from './service.js';
import { registerPaymentRoutes, registerSavedPMRoutes, registerUPIRoutes, registerPayoutRoutes } from './routes.js';

async function start() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  const usePostgres = Boolean(process.env['DATABASE_URL']);

  const paymentRepo = usePostgres ? new PgPaymentRepository(db) : new InMemoryPaymentRepository();
  const savedPMRepo = usePostgres ? new PgSavedPMRepository(db) : new InMemorySavedPMRepository();
  const payoutRepo  = usePostgres ? new PgPayoutRepository(db)  : new InMemoryPayoutRepository();

  const gateway       = new FakeGatewayProvider();
  const orderCallback = process.env['ORDER_SVC_URL']
    ? new HttpOrderCallback(process.env['ORDER_SVC_URL'])
    : new FakeOrderCallback();

  registerPaymentRoutes(app, new PaymentService(paymentRepo, gateway, orderCallback));
  registerSavedPMRoutes(app, new SavedPaymentMethodService(savedPMRepo));
  registerPayoutRoutes(app,  new PayoutService(payoutRepo));
  registerUPIRoutes(app);

  app.get('/health', async () => ({ status: 'ok', service: 'payment-svc' }));

  const PORT = 3005;
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`payment-svc storage: ${usePostgres ? 'PostgreSQL' : 'in-memory'}`);
  console.log(`payment-svc running on http://localhost:${PORT}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
