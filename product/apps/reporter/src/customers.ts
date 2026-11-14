/**
 * Customer apps (a product that uses the same sandbox key but is not a dashboard user) tag
 * their machines with their own metadata, not `rookbox.owner`. A rule says "a machine with this
 * metadata key belongs to this customer"; the machine is then reported with the owner
 * `customer:<id>`.
 */
export type CustomerRule = { metadataKey: string; customerId: string };

export const CUSTOMER_PREFIX = "customer:";
const CUSTOMER_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function rule(key: unknown, customer: unknown): CustomerRule {
  if (typeof key !== "string" || !key.trim() || key.trim().length > 128) {
    throw new Error("CUSTOMER_RULES: a metadata key is empty or too long");
  }
  const id = typeof customer === "string" ? customer.trim().toLowerCase() : "";
  if (!CUSTOMER_ID.test(id)) {
    throw new Error(
      "CUSTOMER_RULES: a customer id must be 1 to 64 letters, digits, '.', '_' or '-'",
    );
  }
  return { metadataKey: key.trim(), customerId: id };
}

/**
 * Reads `CUSTOMER_RULES`: either a JSON object `{"corvo":"rook"}` or a comma list
 * `corvo=rook,other=acme`. Empty means no rules. Order is kept; the first match wins.
 */
export function parseCustomerRules(raw: string | undefined): CustomerRule[] {
  const text = raw?.trim();
  if (!text) return [];
  if (text.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("CUSTOMER_RULES is not valid JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("CUSTOMER_RULES must be a JSON object of metadataKey to customerId");
    }
    return Object.entries(parsed).map(([key, customer]) => rule(key, customer));
  }
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf("=");
      if (at < 1) throw new Error("CUSTOMER_RULES entries look like metadataKey=customerId");
      return rule(part.slice(0, at), part.slice(at + 1));
    });
}

/** The owner a machine's metadata earns it from the rules, or null. */
export function customerOwnerFor(
  metadata: Record<string, unknown>,
  rules: readonly CustomerRule[],
): string | null {
  for (const r of rules) {
    if (Object.hasOwn(metadata, r.metadataKey)) return `${CUSTOMER_PREFIX}${r.customerId}`;
  }
  return null;
}
