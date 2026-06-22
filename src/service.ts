import type { PaymentRepository, SavedPMRepository, PayoutRepository } from './repository.js';
import type { PaymentGatewayPort, OrderCallbackPort } from './ports.js';
import type { Payment, PaymentMethod, SavedPaymentMethod, Payout, CreatePayoutInput } from './types.js';
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

// ── SavedPaymentMethodService ─────────────────────────────────────────────────

function detectUPIApp(upiId: string): SavedPaymentMethod['upiApp'] {
  const handle = upiId.split('@')[1]?.toLowerCase() ?? '';
  if (['okaxis', 'okhdfcbank', 'okicici', 'oksbi'].includes(handle)) return 'GPay';
  if (['ybl', 'ibl', 'axl'].includes(handle)) return 'PhonePe';
  if (['paytm', 'ptaxis', 'pthdfc'].includes(handle)) return 'Paytm';
  if (['upi', 'sbi', 'boi', 'bom'].includes(handle)) return 'BHIM';
  return 'UPI';
}

export class SavedPaymentMethodService {
  constructor(private repo: SavedPMRepository) {}

  async list(userId: string): Promise<SavedPaymentMethod[]> {
    return this.repo.listByUser(userId);
  }

  async addUPI(userId: string, upiId: string, upiApp?: SavedPaymentMethod['upiApp']): Promise<SavedPaymentMethod> {
    const existing = await this.repo.listByUser(userId);

    // Reject duplicate UPI ID for same user
    if (existing.some((m) => m.upiId === upiId)) {
      throw new ConflictError(`UPI ID ${upiId} is already saved`);
    }

    const isFirst = existing.filter((m) => m.type === 'upi').length === 0;
    if (isFirst) await this.repo.clearDefaultForUser(userId);

    return this.repo.create({
      userId,
      type:      'upi',
      upiId,
      upiApp:    upiApp ?? detectUPIApp(upiId),
      isDefault: isFirst,
    });
  }

  async addCard(
    userId: string,
    data: {
      cardToken?: string;
      cardLast4: string;
      cardNetwork: SavedPaymentMethod['cardNetwork'];
      cardType: SavedPaymentMethod['cardType'];
      cardExpiryMonth: string;
      cardExpiryYear: string;
      cardHolderName: string;
    },
  ): Promise<SavedPaymentMethod> {
    // Reject expired cards
    const now          = new Date();
    const currentYear  = now.getFullYear() % 100;
    const currentMonth = now.getMonth() + 1;
    const expMonth     = parseInt(data.cardExpiryMonth, 10);
    const expYear      = parseInt(data.cardExpiryYear, 10);
    if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
      throw new BadRequestError('Card has expired');
    }

    const existing  = await this.repo.listByUser(userId);
    const cardCount = existing.filter((m) => m.type === 'card').length;
    if (cardCount === 0) await this.repo.clearDefaultForUser(userId);

    return this.repo.create({
      userId,
      type:      'card',
      isDefault: cardCount === 0,
      ...data,
    });
  }

  async setDefault(userId: string, id: string): Promise<SavedPaymentMethod> {
    const pm = await this.repo.findById(id);
    if (!pm) throw new NotFoundError(`Payment method ${id} not found`);
    if (pm.userId !== userId) throw new BadRequestError('Not your payment method');

    await this.repo.clearDefaultForUser(userId);
    const updated = await this.repo.setDefault(id);
    if (!updated) throw new NotFoundError(`Payment method ${id} not found`);
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    const pm = await this.repo.findById(id);
    if (!pm) throw new NotFoundError(`Payment method ${id} not found`);
    if (pm.userId !== userId) throw new BadRequestError('Not your payment method');

    await this.repo.delete(id);

    // If it was the default, promote the next one
    if (pm.isDefault) {
      const remaining = await this.repo.listByUser(userId);
      if (remaining.length > 0) {
        await this.repo.clearDefaultForUser(userId);
        await this.repo.setDefault(remaining[0]!.id);
      }
    }
  }
}

// ── PayoutService ─────────────────────────────────────────────────────────────

export class PayoutService {
  constructor(private repo: PayoutRepository) {}

  async list(sellerId: string): Promise<Payout[]> {
    return this.repo.findBySeller(sellerId);
  }

  async request(input: CreatePayoutInput): Promise<Payout> {
    return this.repo.create(input);
  }
}
