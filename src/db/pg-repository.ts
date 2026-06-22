import { randomUUID } from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import type { PaymentRepository, SavedPMRepository, PayoutRepository } from '../repository.js';
import type { Payment, SavedPaymentMethod, CreateSavedPMInput, Payout, CreatePayoutInput, PayoutStatus } from '../types.js';

type Db = NodePgDatabase<typeof schema>;

function toPayment(row: typeof schema.payments.$inferSelect): Payment {
  return {
    id:               row.id,
    orderId:          row.orderId,
    buyerId:          row.buyerId,
    amount:           row.amount,
    currency:         row.currency as 'INR',
    method:           row.method as Payment['method'],
    status:           row.status as Payment['status'],
    gatewayOrderId:   row.gatewayOrderId ?? undefined,
    gatewayPaymentId: row.gatewayPaymentId ?? undefined,
    failureReason:    row.failureReason ?? undefined,
    refundId:         row.refundId ?? undefined,
    refundedAt:       row.refundedAt ?? undefined,
    initiatedAt:      row.initiatedAt,
    completedAt:      row.completedAt ?? undefined,
  };
}

export class PgPaymentRepository implements PaymentRepository {
  constructor(private db: Db) {}

  async create(data: Omit<Payment, 'id'>): Promise<Payment> {
    const [row] = await this.db.insert(schema.payments).values({
      id:               randomUUID(),
      orderId:          data.orderId,
      buyerId:          data.buyerId,
      amount:           data.amount,
      currency:         data.currency,
      method:           data.method,
      status:           data.status,
      gatewayOrderId:   data.gatewayOrderId,
      gatewayPaymentId: data.gatewayPaymentId,
      failureReason:    data.failureReason,
      refundId:         data.refundId,
      refundedAt:       data.refundedAt,
      initiatedAt:      data.initiatedAt,
      completedAt:      data.completedAt,
    }).returning();
    return toPayment(row!);
  }

  async findById(id: string): Promise<Payment | null> {
    const [row] = await this.db.select().from(schema.payments).where(eq(schema.payments.id, id));
    return row ? toPayment(row) : null;
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    const [row] = await this.db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId));
    return row ? toPayment(row) : null;
  }

  async findByGatewayOrderId(gatewayOrderId: string): Promise<Payment | null> {
    const [row] = await this.db.select().from(schema.payments).where(eq(schema.payments.gatewayOrderId, gatewayOrderId));
    return row ? toPayment(row) : null;
  }

  async update(id: string, patch: Partial<Payment>): Promise<Payment | null> {
    const { id: _id, ...updateFields } = patch;
    const [row] = await this.db.update(schema.payments)
      .set(updateFields)
      .where(eq(schema.payments.id, id))
      .returning();
    return row ? toPayment(row) : null;
  }
}

// ── PgSavedPMRepository ───────────────────────────────────────────────────────

function toSavedPM(row: typeof schema.savedPaymentMethods.$inferSelect): SavedPaymentMethod {
  return {
    id:              row.id,
    userId:          row.userId,
    type:            row.type as SavedPaymentMethod['type'],
    upiId:           row.upiId           ?? undefined,
    upiApp:          row.upiApp           as SavedPaymentMethod['upiApp'],
    cardToken:       row.cardToken        ?? undefined,
    cardLast4:       row.cardLast4        ?? undefined,
    cardNetwork:     row.cardNetwork      as SavedPaymentMethod['cardNetwork'],
    cardType:        row.cardType         as SavedPaymentMethod['cardType'],
    cardExpiryMonth: row.cardExpiryMonth  ?? undefined,
    cardExpiryYear:  row.cardExpiryYear   ?? undefined,
    cardHolderName:  row.cardHolderName   ?? undefined,
    isDefault:       row.isDefault,
    createdAt:       row.createdAt,
    updatedAt:       row.updatedAt,
  };
}

export class PgSavedPMRepository implements SavedPMRepository {
  constructor(private db: Db) {}

  async create(data: CreateSavedPMInput): Promise<SavedPaymentMethod> {
    const now = new Date().toISOString();
    const [row] = await this.db.insert(schema.savedPaymentMethods).values({
      id:              randomUUID(),
      userId:          data.userId,
      type:            data.type,
      upiId:           data.upiId           ?? null,
      upiApp:          data.upiApp           ?? null,
      cardToken:       data.cardToken        ?? null,
      cardLast4:       data.cardLast4        ?? null,
      cardNetwork:     data.cardNetwork      ?? null,
      cardType:        data.cardType         ?? null,
      cardExpiryMonth: data.cardExpiryMonth  ?? null,
      cardExpiryYear:  data.cardExpiryYear   ?? null,
      cardHolderName:  data.cardHolderName   ?? null,
      isDefault:       data.isDefault,
      createdAt:       now,
      updatedAt:       now,
    }).returning();
    return toSavedPM(row!);
  }

  async listByUser(userId: string): Promise<SavedPaymentMethod[]> {
    const rows = await this.db.select().from(schema.savedPaymentMethods)
      .where(eq(schema.savedPaymentMethods.userId, userId));
    return rows.map(toSavedPM);
  }

  async findById(id: string): Promise<SavedPaymentMethod | null> {
    const [row] = await this.db.select().from(schema.savedPaymentMethods)
      .where(eq(schema.savedPaymentMethods.id, id));
    return row ? toSavedPM(row) : null;
  }

  async clearDefaultForUser(userId: string): Promise<void> {
    await this.db.update(schema.savedPaymentMethods)
      .set({ isDefault: false })
      .where(and(
        eq(schema.savedPaymentMethods.userId, userId),
        eq(schema.savedPaymentMethods.isDefault, true),
      ));
  }

  async setDefault(id: string): Promise<SavedPaymentMethod | null> {
    const [row] = await this.db.update(schema.savedPaymentMethods)
      .set({ isDefault: true, updatedAt: new Date().toISOString() })
      .where(eq(schema.savedPaymentMethods.id, id))
      .returning();
    return row ? toSavedPM(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(schema.savedPaymentMethods)
      .where(eq(schema.savedPaymentMethods.id, id))
      .returning();
    return result.length > 0;
  }
}

// ── PgPayoutRepository ────────────────────────────────────────────────────────

function toPayout(row: typeof schema.payouts.$inferSelect): Payout {
  return {
    id:            row.id,
    sellerId:      row.sellerId,
    amount:        row.amount,
    status:        row.status as PayoutStatus,
    bankAccountId: row.bankAccountId ?? undefined,
    notes:         row.notes ?? undefined,
    createdAt:     row.createdAt.toISOString(),
    updatedAt:     row.updatedAt.toISOString(),
  };
}

export class PgPayoutRepository implements PayoutRepository {
  constructor(private db: Db) {}

  async create(input: CreatePayoutInput): Promise<Payout> {
    const now = new Date();
    const [row] = await this.db.insert(schema.payouts).values({
      id:            randomUUID(),
      sellerId:      input.sellerId,
      amount:        input.amount,
      status:        'pending',
      bankAccountId: input.bankAccountId ?? null,
      notes:         input.notes ?? null,
      createdAt:     now,
      updatedAt:     now,
    }).returning();
    return toPayout(row!);
  }

  async findBySeller(sellerId: string): Promise<Payout[]> {
    const rows = await this.db.select().from(schema.payouts)
      .where(eq(schema.payouts.sellerId, sellerId))
      .orderBy(desc(schema.payouts.createdAt));
    return rows.map(toPayout);
  }

  async updateStatus(id: string, status: PayoutStatus): Promise<Payout | null> {
    const [row] = await this.db.update(schema.payouts)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.payouts.id, id))
      .returning();
    return row ? toPayout(row) : null;
  }
}
