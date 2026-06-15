// Ports isolate payment gateway and order-svc callbacks.
// Swap implementations in server.ts — zero changes to service.ts.

// ── PAYMENT GATEWAY PORT ──────────────────────────────────────────────────────

export interface PaymentGatewayPort {
  createOrder(orderId: string, amount: number): Promise<{ gatewayOrderId: string }>;
  verifyWebhookSignature(payload: string, signature: string): boolean;
}

export class FakeGatewayProvider implements PaymentGatewayPort {
  async createOrder(orderId: string, _amount: number): Promise<{ gatewayOrderId: string }> {
    console.log(`[GATEWAY] createOrder for ${orderId}`);
    return { gatewayOrderId: `fake-gw-${orderId}` };
  }

  verifyWebhookSignature(_payload: string, _signature: string): boolean {
    return true; // Fake always trusts the webhook
  }
}

// Real: swap for RazorpayGatewayProvider using Razorpay SDK
// export class RazorpayGatewayProvider implements PaymentGatewayPort { ... }

// ── ORDER-SVC CALLBACK PORT ───────────────────────────────────────────────────

export interface OrderCallbackPort {
  notifyPaymentResult(orderId: string, success: boolean, paymentId?: string, reason?: string): Promise<void>;
}

export class FakeOrderCallback implements OrderCallbackPort {
  async notifyPaymentResult(orderId: string, success: boolean, paymentId?: string): Promise<void> {
    console.log(`[ORDER-CALLBACK] ${orderId} → success=${success} paymentId=${paymentId ?? 'n/a'}`);
  }
}

// Real: POST /v1/orders/:id/payment-callback on order-svc
export class HttpOrderCallback implements OrderCallbackPort {
  constructor(private baseUrl: string) {}

  async notifyPaymentResult(orderId: string, success: boolean, paymentId?: string, reason?: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/v1/orders/${orderId}/payment-callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success, paymentId, reason }),
      });
    } catch {
      console.error(`[ORDER-CALLBACK] Failed to notify order-svc for ${orderId}`);
    }
  }
}
