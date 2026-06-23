/** Hand-curated category data — authored one category at a time after reading the source. */
export interface CuratedEntry {
  /** entry type; defaults to "payload" so it shows in the Payloads browser */
  type?: string;
  subcategory?: string | null;
  title: string;
  body: string;
  language?: string | null;
  tags?: string[];
  meta?: unknown;
}

export interface CuratedCategory {
  category: string;
  source?: string;
  entries: CuratedEntry[];
}
