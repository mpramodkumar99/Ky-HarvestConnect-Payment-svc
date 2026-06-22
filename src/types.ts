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

// ── Saved Payment Methods ─────────────────────────────────────────────────────
// Mirrors what a real gateway like Razorpay stores for a customer's vault.
// Full card numbers never enter our system — only gateway tokens + last 4 digits.

export type SavedPMType   = 'upi' | 'card';
export type UPIApp        = 'GPay' | 'PhonePe' | 'Paytm' | 'BHIM' | 'UPI';
export type CardNetwork   = 'visa' | 'mastercard' | 'rupay' | 'amex' | 'unknown';
export type CardType      = 'credit' | 'debit';

export interface SavedPaymentMethod {
  id:              string;
  userId:          string;
  type:            SavedPMType;

  // UPI fields — present when type === 'upi'
  upiId?:          string;   // e.g. "user@okaxis"
  upiApp?:         UPIApp;   // detected from handle

  // Card fields — present when type === 'card'
  // cardToken would be the Razorpay/Stripe token in production
  cardToken?:      string;
  cardLast4?:      string;
  cardNetwork?:    CardNetwork;
  cardType?:       CardType;
  cardExpiryMonth?: string;
  cardExpiryYear?:  string;
  cardHolderName?:  string;

  isDefault:       boolean;
  createdAt:       string;
  updatedAt:       string;
}

export type CreateSavedPMInput = Omit<SavedPaymentMethod, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateSavedPMInput = Pick<SavedPaymentMethod, 'isDefault'>;

// ── Payouts ───────────────────────────────────────────────────────────────────

export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'rejected';

export interface Payout {
  id:              string;
  sellerId:        string;
  amount:          number;       // paise
  status:          PayoutStatus;
  bankAccountId?:  string;
  notes?:          string;
  createdAt:       string;
  updatedAt:       string;
}

export type CreatePayoutInput = Pick<Payout, 'sellerId' | 'amount'> & {
  bankAccountId?: string;
  notes?: string;
};
