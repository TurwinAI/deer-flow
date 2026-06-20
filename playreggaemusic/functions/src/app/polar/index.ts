/**
 * Polar.sh integration (Merchant of Record). Checkout creation, webhook
 * handling, and personal-license download entitlement land in B06 — built in
 * TEST MODE only; no live keys in-repo (manifest §9, approval gate).
 */
export interface OrderMirror {
  orderId: string;
  productId: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "refunded";
  createdAt: string;
}

export * from "./client";
export * from "./checkout";
export * from "./webhook";
export * from "./entitlement";
