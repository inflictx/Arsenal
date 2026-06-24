import type { CuratedCategory } from './types';
import { bruteForceRateLimit } from './brute-force-rate-limit';
import { bruteForceRateLimitEn } from './brute-force-rate-limit.en';

// Curated categories, added one at a time as each is reviewed by hand.
export const CURATED: CuratedCategory[] = [
  bruteForceRateLimit,
];

// English versions (same order/categories) for the en locale.
export const CURATED_EN: CuratedCategory[] = [
  bruteForceRateLimitEn,
];
