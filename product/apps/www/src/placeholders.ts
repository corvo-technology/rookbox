/**
 * Owner placeholders, shown on the page exactly as written and deliberately not translated, so
 * they are easy to spot and fill. Replace them with real plans and numbers before launch.
 */
export const PLANS = [
  {
    name: "[PLAN 1 NAME]",
    price: "[PRICE]",
    features: ["[MACHINES INCLUDED]", "[SNAPSHOT LIMIT]", "[IDLE SUSPEND POLICY]"],
    cta: "[CTA]",
    highlight: false,
  },
  {
    name: "[PLAN 2 NAME]",
    price: "[PRICE]",
    features: ["[MACHINES INCLUDED]", "[RUNNING LIMIT]", "[USAGE RATE per vCPU-hour, GiB-hour]"],
    cta: "[CTA]",
    highlight: true,
  },
  {
    name: "[PLAN 3 NAME]",
    price: "[PRICE]",
    features: ["[MACHINES INCLUDED]", "[SUPPORT LEVEL]", "[SECURITY OPTIONS]"],
    cta: "[CTA]",
    highlight: false,
    contact: true,
  },
] as const;

export const FREE_CREDIT_OFFER = "[FREE CREDIT OFFER, if any]";
export const FLEET_ENDPOINT = "[ENDPOINT TO BE DEFINED]";
export const LEGAL_LINE = "[LEGAL ENTITY] [YEAR]";
