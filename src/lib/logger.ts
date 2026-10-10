/**
 * Structured Application Logger
 *
 * To enable advanced logging, set the environment variable:
 * advanced_logging=true
 *
 * Example in .env.local or Vercel Environment Variables:
 * advanced_logging=true
 */

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogContext {
  [key: string]: unknown;
}

export interface LogPayload {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /apikey/i,
  /api_key/i,
  /authorization/i,
  /cookie/i,
  /credential/i,
  /private_key/i,
  /auth_password/i,
];

function getSensitiveEnvValues(): string[] {
  const envVars = [
    process.env.GROQ_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_URL,
    process.env.AUTH_PASSWORD,
    process.env.AUTH_SECRET,
    process.env.NEXTAUTH_SECRET,
    process.env.UPSTASH_REDIS_REST_TOKEN,
    process.env.UPSTASH_REDIS_REST_URL,
  ];

  return envVars.filter(
    (val): val is string => typeof val === "string" && val.trim().length >= 3,
  );
}

export function redactString(val: string): string {
  let result = val;
  const envSecrets = getSensitiveEnvValues();
  for (const secret of envSecrets) {
    if (result.includes(secret)) {
      result = result.replaceAll(secret, "[REDACTED]");
    }
  }
  return result;
}

export function redact(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => redact(item, seen));
    }

    const redactedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) =>
        pattern.test(key),
      );
      if (isSensitiveKey) {
        redactedObj[key] = "[REDACTED]";
      } else {
        redactedObj[key] = redact(val, seen);
      }
    }
    return redactedObj;
  }

  return String(value);
}

export function isAdvancedLoggingEnabled(): boolean {
  return process.env.advanced_logging === "true";
}

export function generateRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function writeLog(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  requestId?: string,
) {
  const sanitizedContext = context
    ? (redact(context) as Record<string, unknown>)
    : {};
  const sanitizedMessage = redactString(message);

  const payload: LogPayload = {
    ...sanitizedContext,
    timestamp: new Date().toISOString(),
    level,
    message: sanitizedMessage,
    ...(requestId ? { requestId } : {}),
  };

  const output = JSON.stringify(payload);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    case "info":
    case "debug":
    default:
      console.log(output);
      break;
  }
}

export const logger = {
  info(
    message: string,
    context?: Record<string, unknown>,
    requestId?: string,
  ) {
    writeLog("info", message, context, requestId);
  },

  warn(
    message: string,
    context?: Record<string, unknown>,
    requestId?: string,
  ) {
    writeLog("warn", message, context, requestId);
  },

  error(
    message: string,
    context?: Record<string, unknown> | unknown,
    requestId?: string,
  ) {
    let errContext: Record<string, unknown> = {};
    if (context instanceof Error) {
      errContext = { error: redact(context) };
    } else if (context && typeof context === "object") {
      errContext = context as Record<string, unknown>;
    } else if (context !== undefined) {
      errContext = { error: String(context) };
    }
    writeLog("error", message, errContext, requestId);
  },

  advanced(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    requestId?: string,
  ) {
    if (isAdvancedLoggingEnabled()) {
      writeLog(level, message, context, requestId);
    }
  },

  isAdvancedEnabled: isAdvancedLoggingEnabled,
  generateRequestId,
};
