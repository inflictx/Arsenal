# RECON — passive recon and URL collection

Passive reconnaissance: pull a target's historical URLs from public archives, filter the interesting ones and run them through DAST without sending a single noisy request to the site itself. Plus niche tricks: IDN homoglyphs for phishing and a quick multi-scanner over a URL list.

## Wayback Machine CDX API — archived URLs with no tooling
**Purpose:** pull every URL web.archive.org has seen for a target over the years: old endpoints, forgotten parameters, backup files and dumps that dropped off the live site.
**Install:** nothing, just `curl` (CDX is an open HTTP API).
- `url=example.com/*` for all domain paths; `url=*.example.com/*` to include subdomains; `url=https://example.com/admin/*` for one specific path.
- `collapse=urlkey` dedups; `output=text&fl=original` returns just the URLs; `fl=original,statuscode` adds the response code.
- `filter=original:.*\.(EXT)$` keeps only chosen extensions; `filter=statuscode:(200|301|403)` keeps codes; `filter=!statuscode:(404|500)` excludes codes.
```bash
# All archived URLs for a domain
curl -s 'https://web.archive.org/cdx/search/cdx?url=example.com/*&collapse=urlkey&output=text&fl=original' | sort -u
# Subdomains + only sensitive files (configs, backups, dumps, keys)
curl -s 'https://web.archive.org/cdx/search/cdx?url=*.example.com/*&collapse=urlkey&output=text&fl=original&filter=original:.*\.(json|xml|sql|sqlite|db|bak|backup|old|zip|tar\.gz|env|git|config|yml|yaml|log|pem|key|crt)$' | sort -u
# A specific path, keep only meaningful codes
curl -s 'https://web.archive.org/cdx/search/cdx?url=https://example.com/api/*&collapse=urlkey&output=text&fl=original&filter=statuscode:(200|301|302|403)'
```
**Tip:** send found `.js` straight to secret/endpoint analysis, and check `.json/.env/.sql/.bak` for current availability (they often linger on prod after a redesign).

## lostfuzzer (passive URLs into nuclei DAST) — ready pipeline
**Purpose:** the chain "collect URLs, keep only those with GET parameters, drop to live ones, run nuclei DAST" in a single line. A fast way to find reflected bugs (XSS, SSRF, open redirect, SQLi) on historical parameters without manual fuzzing. Idea and flow: coffinxp/LostSec (lostfuzzer).
**Install tools:** `gau`, `uro` (`pipx install uro`), `httpx` (ProjectDiscovery; on Kali the binary is `httpx-toolkit`), `nuclei`.
- Steps: gau (collect) -> `grep` URLs with `?param=value` -> `uro` (collapse near-duplicates) -> `httpx` (keep live, rate-limit) -> `nuclei -dast` (parameter fuzzing).
```bash
# One-line pipeline for a single domain
gau example.com | grep -E '\?[^=]+=.+$' | uro | httpx -silent -rl 200 | nuclei -dast -retries 2 -silent -o nuclei_dast.txt
# Over a list of domains
cat domains.txt | gau | grep -E '\?[^=]+=.+$' | uro | httpx -silent -rl 200 | nuclei -dast -silent
```
**Tip:** `nuclei -dast` runs fuzzing templates against `FUZZ` points in parameters; keep templates fresh (`nuclei -update-templates`). This step is noisy on the target, clear it against program rules.

## IDN homograph / punycode — look-alike domains for phishing and ATO
**Purpose:** craft visually identical twins of a domain or email via Unicode homoglyphs (Cyrillic `а` for Latin `a`, Greek `ο` for `o`). Used in phishing, domain-filter bypass and in account takeover via email normalization (see Payloads -> Account Takeover).
**Install:** plain Python 3 (`idna`/`punycode` built in); for bulk generation `pipx install dnstwist`.
- Any Unicode character in a domain encodes to an ASCII `xn--...` form (punycode). The browser and mail client show the "pretty" form, but it resolves as `xn--`.
```python
# Generate punycode variants of homoglyphs for a letter
g = {'a': ['à','а','ɑ','ä'], 'e': ['е','é','ẹ'], 'o': ['о','ο','ö','օ'], 'i': ['і','í'], 'c': ['с','ϲ']}
for ch in g['a']:
    try: print(ch, '->', ch.encode('idna').decode())
    except Exception: print(ch, '->', 'xn--' + ch.encode('punycode').decode())
```
```bash
# Bulk: generate and check twin registration
dnstwist --registered example.com
```
**Tip:** for ATO, look for where the app normalizes or compares email/username by Unicode, then a twin can collapse into the victim's account. Alternatives to dnstwist: urlcrazy, ail-typo-squatting.

## loxs — multi-scanner LFI / OR / XSS / SQLi / CRLF
**Purpose:** one interactive CLI scanner for five classes: Local File Inclusion, Open Redirect, XSS, SQLi (time-based) and CRLF. Feed it a URL list (for example the filtered output of gau/wayback) and get an HTML report. Authors: coffinxp and team, BSD-3 license.
**Install:** Python 3 + Chrome/chromedriver (for the Selenium-based XSS mode).
```bash
git clone https://github.com/coffinxp/loxs.git && cd loxs
pip3 install -r requirements.txt
python3 loxs.py        # interactive menu: type -> URL or file -> payload file -> threads
```
- Input: a single URL or a file of URLs; your own payload file; a success criterion (marker string in the response); thread count.
- The XSS mode spins up headless Chrome and catches `alert()` firing, so chromedriver must be installed.
**Tip:** loxs is good for a quick first pass over many URLs, but it produces false positives, confirm findings by hand. For serious SQLi use sqlmap/ghauri, for XSS use dalfox (see Commands -> WEB).
