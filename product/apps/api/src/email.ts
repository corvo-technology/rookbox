import { randomUUID } from "node:crypto";
import type { Logger } from "./logger.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailMessage = { to: string; subject: string; html: string; text: string };

/** Sends transactional mail. `send` never throws: it says whether the provider accepted it. */
export interface EmailSender {
  readonly enabled: boolean;
  send(message: EmailMessage): Promise<boolean>;
}

export type EmailSenderOptions = {
  /** Provider API key. Without it nothing is sent: messages are only logged. */
  apiKey?: string;
  /** The From header, e.g. `Rookbox <hello@rookbox.run>`. The domain must be verified with the provider. */
  from?: string;
  /** A Resend-compatible send endpoint; Resend's own when unset. */
  endpoint?: string;
  logger: Logger;
  fetch?: typeof fetch;
  /** Waits between attempts after a 429 or 5xx. */
  retryDelaysMs?: readonly number[];
  timeoutMs?: number;
};

/**
 * Plain fetch to Resend's REST API, the same approach as the sibling product: one request, an
 * idempotency key so a retry cannot double-send, and no provider body in logs (it can echo the
 * recipient). A missing key or a failed send is logged and reported as `false`, so a signup is
 * never lost to an email problem.
 */
export function createEmailSender(options: EmailSenderOptions): EmailSender {
  const { apiKey, from, logger } = options;
  const request = options.fetch ?? fetch;
  const endpoint = options.endpoint?.trim() || RESEND_ENDPOINT;
  const delays = options.retryDelaysMs ?? [250, 1_000];
  const timeoutMs = options.timeoutMs ?? 10_000;
  const enabled = Boolean(apiKey?.trim() && from?.trim());

  return {
    enabled,
    async send(message) {
      if (!enabled) {
        logger.info("email not sent: EMAIL_PROVIDER, EMAIL_API_KEY or EMAIL_FROM is not set", {
          subject: message.subject,
        });
        return false;
      }
      const signal = AbortSignal.timeout(timeoutMs);
      const idempotencyKey = randomUUID();
      const body = JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      for (let attempt = 0; ; attempt++) {
        let retry = true;
        try {
          const response = await request(endpoint, {
            method: "POST",
            redirect: "error",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
              "idempotency-key": idempotencyKey,
            },
            body,
            signal,
          });
          if (response.ok) {
            await response.body?.cancel();
            return true;
          }
          retry = response.status === 429 || response.status >= 500;
          logger.warn("email rejected", { status: response.status, subject: message.subject });
          await response.body?.cancel();
        } catch (error) {
          logger.warn("email request failed", { error });
        }
        const delay = delays[attempt];
        if (!retry || delay === undefined || signal.aborted) return false;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    },
  };
}
