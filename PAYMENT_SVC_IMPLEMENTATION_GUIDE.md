# payment-svc Implementation Guide

## Overview
Manages payment initiation, webhook processing, and refunds for HarvestConnect. Runs on **port 3005**.

---

## Stack
| Item | Version |
|------|---------|
| Fastify | ^5.8.5 |
| Zod | ^4.4.3 |
| TypeScript | ^6.0.3 |

---

## Architecture

```
routes.ts  →  service.ts  →  repository.ts (InMemoryPaymentRepository)
                          →  ports.ts (PaymentGatewayPort | OrderCallbackPort)
```

---

## Key Design Decisions

### COD Fast-Path
COD orders bypass the gateway entirely. `initiatePayment` immediately creates a `success` payment record and fires the order-svc callback (`confirmed`). No webhook needed.

### Gateway Order ID
For UPI / card, the gateway port returns a `gatewayOrderId`. This is returned to the caller who then hands it to the payment SDK (Razorpay / Paytm) on the client side. The webhook completes the cycle.

### Refund Flow
`refundPayment` generates a `refundId` (`REF-${Date.now()}`), updates payment status to `refunded`, sets `refundedAt`, then calls `OrderCallbackPort.notifyRefund(orderId)` so order-svc can transition to `refunded`.

### Webhook Trust
`FakeGatewayProvider` trusts all webhooks unconditionally (good for dev). Real gateway port should verify the signature from the provider before acting.

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/payments` | Initiate payment |
| GET | `/v1/payments/:id` | Get payment by ID |
| GET | `/v1/payments?orderId=` | Get payment by order ID |
| POST | `/v1/payments/webhook` | Payment gateway webhook |
| POST | `/v1/payments/:id/refund` | Trigger refund |

---

## Seed Data

| ID | Order | Method | Status |
|----|-------|--------|--------|
| `pay-001` | `order-001` | `upi` | `success` |
| `pay-002` | `order-002` | `card` | `success` |
| `pay-003` | `order-003` | `cod` | `success` |

All amounts in **paise** (₹1 = 100 paise). Currency fixed to `INR`.

---

## Environment Variables

| Var | Default | Effect |
|-----|---------|--------|
| `ORDER_SVC_URL` | _(unset)_ | When set, switches to `HttpOrderCallback` |
| `PORT` | `3005` | Listening port |

---

## Files & Responsibilities

| File | Responsibility |
|------|----------------|
| `src/types.ts` | `PaymentStatus`, `PaymentMethod`, `Payment` |
| `src/schemas.ts` | Zod schemas: initiate, webhook, refund |
| `src/errors.ts` | `AppError` hierarchy |
| `src/ports.ts` | `PaymentGatewayPort`, `OrderCallbackPort` + Fake/Http impls |
| `src/repository.ts` | `InMemoryPaymentRepository` with seed payments |
| `src/service.ts` | `PaymentService` — COD fast-path, gateway flow, webhook, refund |
| `src/routes.ts` | Route registration + `handleError` |
| `src/server.ts` | Dependency wiring, port 3005 |

---

## Changes Required When Real Services Are Available

### DB Available
| File | Change |
|------|--------|
| `src/repository.ts` | Swap `InMemoryPaymentRepository` for Postgres implementation |
| `src/server.ts` | Inject real repository |

### Payment Gateway Available (Razorpay / Paytm)
| File | Change |
|------|--------|
| `src/ports.ts` | Add `RazorpayGatewayProvider` implementing `PaymentGatewayPort` (create order, verify webhook signature) |
| `src/server.ts` | Wire `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` env vars → real gateway |
| `src/routes.ts` | Webhook handler should receive raw body for HMAC signature verification |

### Order-svc Available
| File | Change |
|------|--------|
| `src/server.ts` | Set `ORDER_SVC_URL` env var — automatically switches to `HttpOrderCallback` |
