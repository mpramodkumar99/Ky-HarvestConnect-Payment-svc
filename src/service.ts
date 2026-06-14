import type { PaymentRepository } from './repository.js';
import type { PaymentGatewayPort, OrderCallbackPort } from './ports.js';
import type { Payment, PaymentMethod } from './types.js';
import { NotFoundError, ConflictError, BadRequestError } from './errors.js';

export class PaymentService {
  constructor(
    private repo:          PaymentRepository,
    private gateway:       PaymentGatewayPort,
    private orderCallback: OrderCallbackPort,
  ) {}

  async initiatePayment(orderId: string, buyerId: string, amount: number, method: PaymentMethod): Promise<Payment & { gatewayOrderId?: string }> {
    const existing = await this.repo.findByOrderId(orderId);
    if (existing && existing.status === 'success') {
      throw new ConflictError(`Payment already successful for order ${orderId}`);
    }

    const now = new Date().toISOString();

    // COD: mark success immediately — no gateway step
    if (method === 'cod') {
      const payment = await this.repo.create({
        orderId, buyerId, amount, currency: 'INR', method,
        status: 'success', initiatedAt: now, completedAt: now,
      });
      // Notify order-svc asynchronously
      this.orderCallback.notifyPaymentResult(orderId, true, payment.id).catch(() => {});
      return payment;
    }

    // UPI / card / wallet: create gateway order, return gatewayOrderId for app payment sheet
    const { gatewayOrderId } = await this.gateway.createOrder(orderId, amount);
    const payment = await this.repo.create({
      orderId, buyerId, amount, currency: 'INR', method,
      status: 'initiated', gatewayOrderId, initiatedAt: now,
    });
    return { ...payment, gatewayOrderId };
  }

  async getPayment(id: string): Promise<Payment> {
    const payment = await this.repo.findById(id);
    if (!payment) throw new NotFoundError(`Payment ${id} not found`);
    return payment;
  }

  async getPaymentByOrder(orderId: string): Promise<Payment> {
    const payment = await this.repo.findByOrderId(orderId);
    if (!payment) throw new NotFoundError(`No payment found for order ${orderId}`);
    return payment;
  }

  async handleWebhook(gatewayOrderId: string, gatewayPaymentId: string, success: boolean, failureReason?: string): Promise<Payment> {
    const payment = await this.repo.findByGatewayOrderId(gatewayOrderId);
    if (!payment) throw new NotFoundError(`No payment found for gateway order ${gatewayOrderId}`);
    if (payment.status !== 'initiated') {
      throw new BadRequestError(`Payment ${payment.id} already in status ${payment.status}`);
    }

    const now = new Date().toISOString();
    const updated = await this.repo.update(payment.id, {
      status:            success ? 'success' : 'failed',
      gatewayPaymentId:  success ? gatewayPaymentId : undefined,
      failureReason:     success ? undefined : failureReason,
      completedAt:       now,
    });
    if (!updated) throw new NotFoundError(`Payment ${payment.id} not found`);

    // Notify order-svc of the result
    this.orderCallback.notifyPaymentResult(
      payment.orderId, success, success ? updated.id : undefined, failureReason,
    ).catch(() => {});

    return updated;
  }

  async refundPayment(id: string, reason: string): Promise<Payment> {
    const payment = await this.repo.findById(id);
    if (!payment) throw new NotFoundError(`Payment ${id} not found`);
    if (payment.status !== 'success') {
      throw new BadRequestError(`Cannot refund payment in status ${payment.status}`);
    }

    const refundId = `refund-${Date.now()}`;
    const now      = new Date().toISOString();
    console.log(`[GATEWAY] Initiating refund ${refundId} for payment ${id}: ${reason}`);

    const updated = await this.repo.update(id, {
      status: 'refunded', refundId, refundedAt: now,
    });
    if (!updated) throw new NotFoundError(`Payment ${id} not found`);

    // Notify order-svc that the refund is done
    this.orderCallback.notifyPaymentResult(payment.orderId, false, undefined, `Refunded: ${reason}`).catch(() => {});

    return updated;
  }
}
