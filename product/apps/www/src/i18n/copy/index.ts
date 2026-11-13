import type { Locale } from "../locales";
import { en } from "./en";
import { es } from "./es";
import { pt } from "./pt";
import type { Copy } from "./types";

export type { Copy };

const COPY: Record<Locale, Copy> = { en, pt, es };

export function getCopy(locale: Locale): Copy {
  return COPY[locale];
}
