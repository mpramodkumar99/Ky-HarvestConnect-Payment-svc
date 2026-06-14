export type PaymentStatus  = 'initiated' | 'success' | 'failed' | 'refunded';
export type PaymentMethod  = 'upi' | 'card' | 'cod' | 'wallet';

export interface Payment {
  id:                string;
  orderId:           string;
  buyerId:           string;
  amount:            number;           // paise
  currency:          'INR';
  method:            PaymentMethod;
  status:            PaymentStatus;
  gatewayOrderId?:   string;           // Razorpay order_id / Stripe payment_intent_id
  gatewayPaymentId?: string;           // Razorpay payment_id / Stripe charge_id
  failureReason?:    string;
  refundId?:         string;
  refundedAt?:       string;
  initiatedAt:       string;
  completedAt?:      string;
}
