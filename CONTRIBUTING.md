# Contributing to ARS3NAL

Thanks for wanting to help — contributions are very welcome! ⭐

ARS3NAL is a local, offline-first pentest/bug-bounty arsenal. The most valuable
contributions are **content** (more payloads, commands, checklists) and small,
focused fixes.

## Ways to contribute

- **Add / improve content** — new payload entries, command-builder tools, GTFOBins
  notes, wordlist references, checklist items. Content lives under `seed/`:
  - Payloads: `seed/curated/<slug>.json`
  - Command builders: `seed/commands-structured/*.json` (clickable flags)
  - Checklists: `seed/checklists/*.md`
  After editing, run `npm run seed` to rebuild the DB.
- **Report a bug or request a feature** — open an issue with steps to reproduce
  (or what you'd like and why). Screenshots/GIFs help a lot.
- **Fix something** — small PRs are easiest to review.

## Dev setup

```bash
npm install
npm run seed      # build data/arsenal.db from seed/ sources
npm run dev       # Vite (5173) + Fastify (7331) with live reload
npm test          # vitest
```

- Stack: Fastify + better-sqlite3 (FTS5) backend, Vite + vanilla TypeScript frontend (no framework).
- The static GitHub Pages build: `npm run pages` (client-only, data in IndexedDB).

## Conventions

- Payloads / commands / code stay **technical and verbatim**.
- Human-facing text (titles, tips, section names) is in **Russian** to match the UI.
- Keep entries real and copy-ready — accuracy over volume; when unsure, leave it out.
- Bundled third-party content keeps its attribution (see `THIRD_PARTY.md`).

## Licensing

By contributing you agree your contribution is licensed under the project's
**GPL-3.0** license. Don't submit content you don't have the right to share.

## Conduct

Be respectful. ARS3NAL is for **authorized** security testing and education only —
see [`DISCLAIMER.md`](DISCLAIMER.md).
