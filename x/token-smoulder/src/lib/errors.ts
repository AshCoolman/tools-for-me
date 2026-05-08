export type BoundaryErrorPayload = {
  endpoint: string;
  args: Record<string, unknown>;
  code: string | number;
  original: string;
};

export class BoundaryError extends Error {
  readonly endpoint: string;
  readonly args: Record<string, unknown>;
  readonly code: string | number;
  readonly original: string;

  constructor(payload: BoundaryErrorPayload) {
    super(`boundary error: ${payload.endpoint} exited ${payload.code}: ${payload.original}`);
    this.name = 'BoundaryError';
    this.endpoint = payload.endpoint;
    this.args = payload.args;
    this.code = payload.code;
    this.original = payload.original;
  }

  toJSON(): BoundaryErrorPayload & { name: string; message: string } {
    return {
      name: this.name,
      message: this.message,
      endpoint: this.endpoint,
      args: this.args,
      code: this.code,
      original: this.original,
    };
  }
}

export class MissingSectionError extends Error {
  readonly section: string;
  constructor(section: string) {
    super(`missing section: ${section}`);
    this.name = 'MissingSectionError';
    this.section = section;
  }
}

export class TimeoutError extends Error {
  readonly endpoint: string;
  readonly timeoutMs: number;
  constructor(endpoint: string, timeoutMs: number) {
    super(`timeout: ${endpoint} exceeded ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
  }
}

export function asBoundaryError(
  endpoint: string,
  args: Record<string, unknown>,
  code: string | number,
  original: unknown,
): BoundaryError {
  const message =
    original instanceof Error ? original.message : typeof original === 'string' ? original : JSON.stringify(original);
  return new BoundaryError({ endpoint, args, code, original: message });
}
