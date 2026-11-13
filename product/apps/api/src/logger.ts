export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Keys whose values never reach a log line. */
const REDACTED = /authorization|cookie|secret|token|password|api[-_]?key/i;

function clean(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACTED.test(key)) out[key] = "[redacted]";
    else if (value instanceof Error) out[key] = { name: value.name, message: value.message };
    else out[key] = value;
  }
  return out;
}

/** One JSON object per line on stdout, which is what a PaaS log viewer expects. */
export function createLogger(
  level: LogLevel = "info",
  base: LogFields = {},
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger {
  const emit = (at: LogLevel, message: string, fields: LogFields = {}) => {
    if (ORDER[at] < ORDER[level]) return;
    write(
      JSON.stringify({
        time: new Date().toISOString(),
        level: at,
        message,
        ...clean({ ...base, ...fields }),
      }),
    );
  };
  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child: (fields) => createLogger(level, { ...base, ...fields }, write),
  };
}

export const silentLogger: Logger = createLogger("error", {}, () => undefined);
