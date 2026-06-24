import { describe, it, expect } from 'vitest';
import { ftsQuery } from './fts';

describe('ftsQuery', () => {
  it('turns words into ANDed prefix terms', () => {
    expect(ftsQuery('sql inj')).toBe('sql* AND inj*');
  });

  it('returns empty string for blank or symbol-only input', () => {
    expect(ftsQuery('')).toBe('');
    expect(ftsQuery('   ')).toBe('');
    expect(ftsQuery('!@#$%^&*()')).toBe('');
  });

  it('drops punctuation but keeps the alphanumeric tokens (no invalid FTS syntax)', () => {
    expect(ftsQuery('xss<script>')).toBe('xss* AND script*');
    expect(ftsQuery('a"b OR c')).toBe('a* AND b* AND or* AND c*');
  });

  it('lowercases and supports unicode letters', () => {
    expect(ftsQuery('SSRF')).toBe('ssrf*');
    expect(ftsQuery('Обход')).toBe('обход*');
  });

  it('caps at 12 tokens', () => {
    const many = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
    expect(ftsQuery(many).split(' AND ')).toHaveLength(12);
  });
});
