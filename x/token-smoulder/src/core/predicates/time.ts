import type { Clock } from '../../adapters/clock/interface.js';
import type { Predicate } from '../types.js';

const RE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

function toMinutes(h: number, m: number): number {
  return h * 60 + m;
}

export function timeWindow(spec: string, clock: Clock): Predicate {
  const m = RE.exec(spec);
  if (!m) {
    throw new Error(`invalid timeWindow spec: ${spec}`);
  }
  const startH = Number(m[1]);
  const startM = Number(m[2]);
  const endH = Number(m[3]);
  const endM = Number(m[4]);
  const start = toMinutes(startH, startM);
  const end = toMinutes(endH, endM);

  return async () => {
    const now = clock.now();
    const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
    const inside = start <= end ? cur >= start && cur <= end : cur >= start || cur <= end;
    if (inside) return { ok: true, reason: `timeWindow(${spec})` };
    return { ok: false, reason: `timeWindow(${spec}): outside window` };
  };
}
