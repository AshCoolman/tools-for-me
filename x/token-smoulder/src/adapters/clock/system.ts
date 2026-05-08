import type { Clock } from './interface.js';

export const systemClock: Clock = {
  now: () => new Date(),
};
