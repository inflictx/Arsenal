# Third-party content & attribution

ARS3NAL bundles, derives from, or references the projects below. Each remains
the property of its respective authors under its own license. Thanks to all of
them — this tool is mostly a convenient, offline, searchable front-end over
their excellent work.

ARS3NAL's own code is licensed **GPL-3.0** (see `LICENSE`). GPL-3.0 was chosen
because the project bundles GTFOBins data, which is GPL-3.0 (copyleft).

| Source | License | What we use | Where |
|---|---|---|---|
| [GTFOBins](https://github.com/GTFOBins/GTFOBins.github.io) | **GPL-3.0** | the binary technique data (parsed into the DB); comment strings are our own RU translations (derivative) | `seed/gtfobins-src/` → DB → GTFOBins view |
| [PayloadsAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings) | MIT | curated payload/code excerpts and a few diagram images | `seed/curated/*.json`, `web/public/img/**` |
| [reverse-shell-generator](https://github.com/0dayCTF/reverse-shell-generator) (0dayCTF / Ryan Montgomery) | MIT | reverse/bind/msfvenom/listener command data, vendored verbatim | `web/src/data/rsg-data.js` |
| [CyberChef](https://github.com/gchq/CyberChef) (GCHQ / Crown Copyright) | Apache-2.0 | the full official offline build, embedded in an iframe (re-themed + UI localized to RU; operation logic untouched) | `web/public/cyberchef/` (its `LICENSE` + `*.LICENSE.txt` preserved) |
| [SecLists](https://github.com/danielmiessler/SecLists) (Daniel Miessler) | MIT | referenced by name/path only (no file content bundled) | `seed/wordlists-ref/` |
| [Open Sans](https://fonts.google.com/specimen/Open+Sans) | Apache-2.0 | UI font (subset, self-hosted) | `web/public/fonts/htf_*.woff2` |
| [Source Code Pro](https://github.com/adobe-fonts/source-code-pro) | SIL OFL-1.1 | monospace font (subset, self-hosted) | `web/public/fonts/htf_*.woff2`, see `web/public/fonts/OFL.txt` |
| [PortSwigger Burp Suite documentation](https://portswigger.net/burp/documentation) | © PortSwigger | the "Burp Docs" module is a Russian reference based on PortSwigger's documentation (screenshots not reproduced) | `seed/burp/*.json` |
| [HackTricks](https://book.hacktricks.xyz) | courtesy credit | dark colour palette inspiration only (no content) | theme tokens |

If you are a rights holder and want attribution changed or content removed,
open an issue.
