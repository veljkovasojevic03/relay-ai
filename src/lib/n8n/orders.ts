import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "@/lib/log";

import { normalizeOrderNumber, ORDER_NUMBER, type OrderStatusResult } from "./contract";

/**
 * Looks up a demo order (spec §4.7). Returns `{found: false}` unless BOTH the number and the
 * email match, and the same answer for "no such order" and "wrong email", so the endpoint
 * can't be used to discover which order numbers exist.
 * Used by `/api/demo/orders/lookup` (n8n) and by the simulated dispatcher.
 */
export async function lookupDemoOrder(
  db: SupabaseClient,
  orderNumber: string,
  email: string,
): Promise<OrderStatusResult> {
  const number = normalizeOrderNumber(orderNumber);
  const address = email.trim().toLowerCase();
  if (!ORDER_NUMBER.test(number) || !address) return { found: false };

  const { data, error } = await db
    .from("demo_orders")
    .select("email, status, eta, items")
    .eq("order_number", number)
    .maybeSingle();
  if (error) {
    log.error("demo_orders.lookup_failed", { code: error.code });
    throw new Error("order lookup failed");
  }
  if (!data || String(data.email).toLowerCase() !== address) return { found: false };
  return {
    found: true,
    status: data.status,
    eta: data.eta,
    items: Array.isArray(data.items) ? data.items.map(String) : [],
  };
}
