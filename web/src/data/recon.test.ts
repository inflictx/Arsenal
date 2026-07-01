import { describe, it, expect } from 'vitest';
import {
  cleanDomain, buildCdxParams, buildCdxUrl, CDX_DEFAULTS, CDX_RECIPES,
  toPunycode, decodeIdna, homographVariants, analyzeDomain, emailHomographs,
  dorkSearchUrl, DORK_PRESETS, GITHUB_DORKS, SHODAN_DORKS,
} from './recon';

describe('cleanDomain', () => {
  it('strips scheme, path and lowercases', () => {
    expect(cleanDomain('https://www.Example.com/path?x=1#y')).toBe('www.example.com');
    expect(cleanDomain('  TARGET.COM. ')).toBe('target.com');
  });
});

describe('CDX builder', () => {
  it('builds core params with the full-field-anchored extension filter', () => {
    const p = buildCdxParams({ ...CDX_DEFAULTS, domain: 'target.com', statusOk: true, exts: ['env', '.git'] });
    expect(p).toContainEqual(['url', 'target.com']);
    expect(p).toContainEqual(['matchType', 'domain']);
    expect(p).toContainEqual(['collapse', 'urlkey']);
    expect(p).toContainEqual(['filter', 'statuscode:200']);
    expect(p).toContainEqual(['filter', 'original:.*\\.(env|git)(\\?.*)?$']);
  });
  it('url-encodes into a CDX URL', () => {
    const u = buildCdxUrl({ ...CDX_DEFAULTS, domain: 'target.com' });
    expect(u).toContain('https://web.archive.org/cdx/search/cdx?');
    expect(u).toContain('url=target.com');
  });
  it('recipes render to non-empty commands; domain-scoped ones substitute the domain', () => {
    for (const r of CDX_RECIPES) expect(r.cmd('acme.io').length).toBeGreaterThan(10);
    for (const id of ['harvest', 'subs', 'juicy', 'params', 'gf', 'raw', 'robots']) {
      expect(CDX_RECIPES.find((r) => r.id === id)!.cmd('acme.io')).toContain('acme');
    }
    expect(CDX_RECIPES.find((r) => r.id === 'subs')!.cmd('acme.io')).toContain('*.acme.io/*');
  });
});

describe('Punycode / IDN homograph (domain)', () => {
  const uni = 'pаypal.com'; // Cyrillic а (U+0430)
  it('encodes unicode -> xn-- and decodes back (round-trip)', () => {
    const puny = toPunycode(uni);
    expect(puny.startsWith('xn--')).toBe(true);
    expect(decodeIdna(puny)).toBe(uni);
  });
  it('generates variants with punycode', () => {
    const vs = homographVariants('paypal.com', new Set(['cyrillic']));
    expect(vs.length).toBeGreaterThan(0);
    for (const v of vs) { expect(v.unicode).not.toBe('paypal.com'); expect(v.punycode).toContain('xn--'); }
  });
  it('analyzer flags the confusable + the letter it mimics', () => {
    const a = analyzeDomain(toPunycode(uni));
    expect(a.unicode).toBe(uni);
    expect(a.hasUnicode).toBe(true);
    expect(a.chars.find((c) => !c.ascii)?.mimics).toBe('a');
  });
});

describe('Email 0-click ATO homographs', () => {
  const vs = emailHomographs('victim@gmail.com', new Set(['cyrillic']));
  it('produces both domain-part and local-part vectors', () => {
    expect(vs.some((v) => v.part === 'domain')).toBe(true);
    expect(vs.some((v) => v.part === 'local')).toBe(true);
  });
  it('domain-part is punycode-encoded on the wire, local-part stays raw', () => {
    const dom = vs.find((v) => v.part === 'domain')!;
    expect(dom.wire.startsWith('victim@')).toBe(true);
    expect(dom.wire).toContain('xn--');
    const loc = vs.find((v) => v.part === 'local')!;
    expect(loc.wire).toBe(loc.unicode); // local part is not IDNA-encoded
    expect(loc.unicode.endsWith('@gmail.com')).toBe(true);
  });
  it('rejects a non-email', () => { expect(emailHomographs('notanemail', new Set(['cyrillic']))).toEqual([]); });
});

describe('Dork builder', () => {
  it('encodes engine search URLs incl. github + shodan', () => {
    expect(dorkSearchUrl('google', 'site:x.com test')).toBe('https://www.google.com/search?q=site%3Ax.com%20test');
    expect(dorkSearchUrl('github', '"x.com" password')).toBe('https://github.com/search?type=code&q=' + encodeURIComponent('"x.com" password'));
    expect(dorkSearchUrl('shodan', 'ssl:"x.com"')).toContain('shodan.io/search?query=');
  });
  it('has 20 google categories that substitute the domain', () => {
    expect(DORK_PRESETS.length).toBeGreaterThanOrEqual(20);
    for (const p of DORK_PRESETS) expect(p.dorks('acme.com').join(' ')).toContain('acme.com');
  });
  it('github + shodan dorks carry their placeholders', () => {
    expect(GITHUB_DORKS.some((d) => d.includes('{D}'))).toBe(true);
    expect(SHODAN_DORKS.some((d) => d.includes('ssl.cert.subject.CN'))).toBe(true);
  });
});
