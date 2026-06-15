import { randomUUID } from 'node:crypto';
import type { Payment } from './types.js';

export interface PaymentRepository {
  create(data: Omit<Payment, 'id'>): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  findByOrderId(orderId: string): Promise<Payment | null>;
  findByGatewayOrderId(gatewayOrderId: string): Promise<Payment | null>;
  update(id: string, patch: Partial<Payment>): Promise<Payment | null>;
}

export class InMemoryPaymentRepository implements PaymentRepository {
  private store = new Map<string, Payment>();

  constructor() { this.seed(); }

  async create(data: Omit<Payment, 'id'>): Promise<Payment> {
    const payment: Payment = { ...data, id: randomUUID() };
    this.store.set(payment.id, payment);
    return payment;
  }

  async findById(id: string): Promise<Payment | null> {
    return this.store.get(id) ?? null;
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    for (const p of this.store.values()) {
      if (p.orderId === orderId) return p;
    }
    return null;
  }

  async findByGatewayOrderId(gatewayOrderId: string): Promise<Payment | null> {
    for (const p of this.store.values()) {
      if (p.gatewayOrderId === gatewayOrderId) return p;
    }
    return null;
  }

  async update(id: string, patch: Partial<Payment>): Promise<Payment | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: Payment = { ...existing, ...patch, id };
    this.store.set(id, updated);
    return updated;
  }

  private seed() {
    const now = new Date().toISOString();
    const payments: Payment[] = [
      {
        id: 'pay-001', orderId: 'order-001', buyerId: 'user-b001',
        amount: 54500, currency: 'INR', method: 'upi',
        status: 'success', gatewayPaymentId: 'pay-mock-001',
        initiatedAt: '2026-06-09T10:00:00.000Z', completedAt: '2026-06-09T10:01:00.000Z',
      },
      {
        id: 'pay-002', orderId: 'order-002', buyerId: 'user-b001',
        amount: 353900, currency: 'INR', method: 'card',
        status: 'success', gatewayPaymentId: 'pay-mock-002',
        initiatedAt: '2026-06-12T08:00:00.000Z', completedAt: '2026-06-12T08:01:00.000Z',
      },
      {
        id: 'pay-003', orderId: 'order-003', buyerId: 'user-b001',
        amount: 48000, currency: 'INR', method: 'cod',
        status: 'success',
        initiatedAt: now, completedAt: now,
      },
    ];
    for (const p of payments) this.store.set(p.id, p);
  }
}
