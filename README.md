# ARS3NAL — personal offline pentest / bug-bounty toolkit

A local, **offline-first** web app that replaces jumping between HackTricks,
PayloadsAllTheThings and a pile of scattered `.md` files with one fast,
searchable, editable arsenal. Runs entirely on your machine — no server-side
component you don't control, no telemetry, your data never leaves the box.

> The UI is in **Russian** (payloads, commands and code stay technical/English).

## Modules

- **Payloads** — 63 curated PayloadsAllTheThings categories (~1500 entries), with a ⌘K quick-search palette over everything.
- **Commands** — practical CTF/HTB/pentest tool reference; most tools have a click-to-build **command builder** (toggle flags → command assembles), and a Target/LHOST bar that substitutes example hosts live.
- **GTFOBins** — all 458 binaries, fully translated, with function/context filter chips.
- **Wordlists** — a curated guide to the top wordlists: canonical paths + GitHub links + "what each is for" (references only).
- **CyberChef** — the official offline CyberChef build, embedded, re-themed to match and with its UI localized to Russian.
- **Reverse Shell** — revshells.com-style generator (reverse / bind / msfvenom / listeners, encodings).
- **Burp Docs** — a Russian reference covering the Burp Suite desktop documentation.
- **Checklists** — per-vulnerability operational checklists you tick off (progress persists), plus infra/AD/cloud/priv-esc lists; inline payload cross-links.
- **Engagements** — per-target workspace (host/LHOST/scope/notes + findings tracker + Markdown report export); the active target feeds `{TARGET}`/`{LHOST}` into Commands & Reverse Shell.
- **Notes / Favorites / Backup** — your own Markdown notes, a ★ aggregator across all modules, and full JSON export/import.

## Run

Double-click **`start.bat`** (first run installs deps, seeds the DB and builds the UI),
then open <http://localhost:7331>.

Or manually:

```bash
npm install
npm run seed     # one-time: build data/arsenal.db from the bundled sources
npm run build
npm run start    # http://localhost:7331
```

Requires Node.js 18+.

## Develop

```bash
npm run dev      # Vite (5173) + Fastify (7331) with live reload
npm test         # vitest
```

## Layout

- `server/` — Fastify API + SQLite (better-sqlite3, FTS5)
- `seed/` — one-time parsers that build the DB (curated payloads, checklists, commands, Burp docs, GTFOBins, wordlist references)
- `web/` — Vite + vanilla-TypeScript SPA (no framework)
- `data/arsenal.db` — **your** data; custom entries, notes, engagements and checklist progress are never overwritten by re-seeding, and the DB is git-ignored so nothing personal is ever published.

## Privacy

Everything is local. Your notes, targets, findings and saved commands live only
in `data/arsenal.db` (git-ignored). The seed pipeline rebuilds all *reference*
content from source, so ignoring the DB loses nothing reproducible.

## Acknowledgements

ARS3NAL is mostly a fast, offline, searchable front-end over other people's
excellent work. Huge thanks to these projects and their authors:

- **[GTFOBins](https://github.com/GTFOBins/GTFOBins.github.io)** — Unix binaries abusable for shell / file ops / priv-esc *(GPL-3.0)*
- **[PayloadsAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings)** — by swisskyrepo & contributors — payloads, methodology, diagrams *(MIT)*
- **[reverse-shell-generator](https://github.com/0dayCTF/reverse-shell-generator)** — by Ryan Montgomery / 0dayCTF — reverse / bind / msfvenom / listener data *(MIT)*
- **[CyberChef](https://github.com/gchq/CyberChef)** — by GCHQ — the embedded offline "cyber swiss army knife" *(Apache-2.0)*
- **[SecLists](https://github.com/danielmiessler/SecLists)** — by Daniel Miessler — wordlist references *(MIT)*
- **[Burp Suite documentation](https://portswigger.net/burp/documentation)** — by PortSwigger — basis for the Burp reference module
- **[Open Sans](https://fonts.google.com/specimen/Open+Sans)** *(Apache-2.0)* and **[Source Code Pro](https://github.com/adobe-fonts/source-code-pro)** by Adobe *(SIL OFL-1.1)* — fonts
- **[HackTricks](https://book.hacktricks.xyz)** — dark colour-palette inspiration

Full per-source license details are in [`THIRD_PARTY.md`](THIRD_PARTY.md).

## License

ARS3NAL's own code is licensed **GPL-3.0** (see [`LICENSE`](LICENSE)) — required
because it bundles GPL-3.0 GTFOBins data.
