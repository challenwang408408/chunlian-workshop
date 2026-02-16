const MIN_TIMEOUT_MS = 25_000;
const MAX_TIMEOUT_MS = 40_000;
const DEFAULT_TIMEOUT_MS = 30_000;

type ApiLog = {
  requestId: string;
  durationMs: number;
  statusCode: number;
  errorType: string | null;
};

export function resolveTimeoutMs(rawValue: string | undefined): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }

  const rounded = Math.round(parsed);
  if (rounded < MIN_TIMEOUT_MS) return MIN_TIMEOUT_MS;
  if (rounded > MAX_TIMEOUT_MS) return MAX_TIMEOUT_MS;
  return rounded;
}

export async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function logApiResult(entry: ApiLog): void {
  console.info(
    JSON.stringify({
      requestId: entry.requestId,
      durationMs: entry.durationMs,
      statusCode: entry.statusCode,
      errorType: entry.errorType,
    }),
  );
}
