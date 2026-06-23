import type { CuratedCategory } from './types';
import { bruteForceRateLimit } from './brute-force-rate-limit';

// Curated categories, added one at a time as each is reviewed by hand.
export const CURATED: CuratedCategory[] = [
  bruteForceRateLimit,
];
