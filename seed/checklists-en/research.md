# Web/API Security: research reference (2025-2026)

> Companion document to `operational.md`. This is the "why and where from": impact, current 2025-2026 techniques, recent CVEs, links to primary sources. The "go and check off" checklists are in `operational.md`.
> Explanations in English; payloads, commands, tool names, headers and parameters are kept technical as-is.

## TL;DR
- **The highest ROI in 2025-2026 is API logic and desync, not classic reflected XSS.** Largest payouts: HTTP Request Smuggling ($5K-$30K+; the "HTTP/1.1 Must Die" research drew >$350K in total payouts), Account Takeover ($1K-$20K), cloud SSRF ($1K-$15K), BOLA/IDOR + Mass Assignment chains in APIs.
- **"Old" classes have been revived with new tooling:** the single-packet attack made race conditions massively exploitable; PHP filter chains and cnext turn any LFI into RCE; GadgetBuilder (NordSec 2025) brought back 17 ysoserial chains on Java 16+; algorithm confusion in JWT yields a cluster of fresh CVEs.
- **Defensive mechanisms are bypassed systematically:** DOMPurify (mXSS), SameSite cookies (Lax+POST 120 s window, client-side redirect gadgets), WAF (JSON-based SQLi, Ghost Bits Unicode), IMDSv2 (DNS rebinding / TOCTOU).

---

## 1. Methodology and Resources (methodology, not a separate vulnerability)

The community's practical takeaway: most payouts above $5K come from APIs (BOLA/IDOR, broken auth, mass assignment, excessive data exposure), not from reflected XSS in contact forms - APIs directly expose business logic, have weak authorization and hidden/shadow endpoints.

**Authoritative sources for the knowledge base:** PayloadsAllTheThings (`github.com/swisskyrepo/PayloadsAllTheThings`), PortSwigger Web Security Academy + PortSwigger Research, HackTricks (`book.hacktricks.xyz`), OWASP (WSTG, Cheat Sheets, ASVS, API Security Top 10 2023), disclosed HackerOne/Bugcrowd reports.

**Market payout benchmark (2025-2026, aggregated community data):** IDOR/BOLA $500-$5K, SSRF $1K-$15K, Account Takeover $1K-$20K, HTTP Request Smuggling $5K-$30K, SSTI $2K-$10K, SAML/SSO $2K-$20K.

---

## 2. SQL Injection

SQLi has held a spot in the OWASP Top (#1 or #3) for almost 20 years and continues to lead to major breaches.

**CVE-2025-1094** (PostgreSQL, discovered by principal researcher Stephen Fewer of Rapid7, CVSS 8.1; PostgreSQL patched it on February 13, 2025 - versions 17.3/16.7/15.11/14.16/13.19) was used in the attack on BeyondTrust Remote Support: 17 SaaS instances and the U.S. Department of the Treasury were affected via a stolen API key (attribution - the Chinese group Silk Typhoon). According to Fewer, a successful exploit of CVE-2024-12356 had to include exploitation of CVE-2025-1094 to achieve RCE - that is, SQLi was a mandatory link in the chain.

**The key WAF bypass technique - JSON-based SQLi** (Claroty Team82, Noam Moshe, Black Hat Europe 2022), via the JSON operator `'@<`. Crux: major WAF vendors went years without supporting JSON syntax, even though DB engines had supported it for a decade. Confirmed against Palo Alto Networks, AWS, Cloudflare, F5 and Imperva (all five released patches); support was added to sqlmap. In 2025-2026, blind/time-based variants, ORM bypass and adaptive tamper scripts tailored to specific WAF behavior are relevant.

---

## 3. Cross-Site Scripting (XSS)

The cutting edge in 2025-2026 is client-side techniques invisible to a WAF that inspects HTTP traffic (a DOM-based payload exists only in the browser's JS context).

- **Mutation XSS (mXSS) against DOMPurify.** PortSwigger demonstrated a bypass via `<math><mtext><table><mglyph><style><!--</style><img title="-->...">` (confusing the HTML parser through comments/namespaces). The associated identifier is **CVE-2025-26791** (DOMPurify mXSS bypass).
- **DOM clobbering.** **CVE-2025-1647** - XSS in Bootstrap 3 (Tooltip/Popover, `data-html="true"`) via a `sanitizeHtml` bypass through DOM clobbering (fixed in NES for Bootstrap v3.4.7; Bootstrap 3 is EOL). PortSwigger also showed a CSP bypass via clobbering (`codeBasePath` -> `script.src`).
- Google Bug Hunters (May 2025) described how escaping `<`/`>` in attributes during DOM serialization protects against mXSS - useful for understanding the root cause.

---

## 4. Server-Side Request Forgery (SSRF)

IMDSv2 requires a PUT request for the token and a custom header, which blocks most "simple" SSRF - but bypasses remain:

- **DNS rebinding / TOCTOU.** In Craft CMS, DNS resolution for validation was performed separately from the actual HTTP request; **CVE-2025-68437** (GHSA-x27p-wfqw-hfcc) and the subsequent bypass (GHSA-gp2f-7wcm-5fhx) allowed bypassing metadata protection for all blocked IPs.
- **Content renderers as a vector.** **CVE-2025-51591** - SSRF in pandoc via `<iframe src="http://169.254.169.254/...">` during HTML->PDF without `--sandbox`/`raw_html`. In Wiz's analysis, the attack was neutralized precisely by IMDSv2 enforcement (the stateless GET from the iframe was rejected), but with IMDSv1 it would have led to compromise.
- **A real campaign.** F5 Labs recorded a four-day wave of EC2 IMDS exploitation via SSRF in March 2025 (starting IPs `193.41.206.x`, a single ASN).
- Per the Wiz Cloud Data Security Report 2025, 35% of cloud environments have compute assets that simultaneously expose sensitive data and carry critical/high vulnerabilities - SSRF in such a "toxic combination" turns into a full-blown breach (cf. Capital One, 2019).

**Cloud endpoints (for reference):** AWS `http://169.254.169.254/latest/meta-data/iam/security-credentials/`; GCP `http://metadata.google.internal/computeMetadata/v1/` (`Metadata-Flavor: Google`); Azure `http://169.254.169.254/metadata/instance` (`Metadata: true`); EKS Pod Identity `http://169.254.170.23/...`.

---

## 5. Server-Side Template Injection (SSTI)

Recent research:

- **YesWeHack / Brumens, "Limitations are just an illusion - advanced server-side template exploitation with RCE everywhere" (March 24, 2025)** - RCE without quotes and external plugins, relying solely on native engine functions (`chr` in Jinja2; modifiers in Smarty; `array_map`+`implode`+`chr` in Laravel Blade). Removes the auto-escaping/HTML-escape problem.
- **Vladislav Korchagin, "Successful Errors: New Code Injection and SSTI Techniques" (January 3, 2026)** - error-based and boolean-based techniques for blind detection and blind exfiltration when output is not rendered but errors are visible.
- Polyglot detection and engine identification via the **Hackmanit Template Injection Table** (44 engines) is the most effective first step; the error text often reveals the engine and version.

---

## 6. Insecure Direct Object References (IDOR / BOLA)

#1 in the OWASP API Security Top 10 (as BOLA). Conceptually simple but extremely widespread even in mature applications; typical payout $500-$5K, high risk of duplicates (a simple bug is found by several hunters in one evening) - which is why the value is in **chaining** (IDOR + mass assignment -> ATO: set `"password"` on someone else's profile; IDOR on a billing endpoint).

The defensive IOC is sequential enumeration of IDs from one source. Common hunter mistakes: testing only your own data (you can't prove IDOR without a second account) and stopping at 403 (some of these are client-side - retry without the separate headers).

---

## 7. Cross-Site Request Forgery (CSRF)

Modern SameSite bypasses (PortSwigger Web Security Academy):

- **Lax basics:** the browser sends the cookie in a cross-site request only if it's a `GET` AND a top-level navigation. Since 2021 Chrome applies Lax-by-default when an explicit attribute is absent.
- **Top-level GET bypass:** if the server doesn't distinguish GET/POST - `<script>document.location='https://site/account/transfer?recipient=hacker&amount=1000000'</script>`.
- **120-second window (Lax+POST mitigation):** to avoid breaking SSO, Chrome doesn't apply restrictions for the first 120 seconds for a top-level POST. Precision: the window applies **only** to cookies without an explicit `SameSite` (Chrome default) and does **not** apply to cookies with an explicit `SameSite=Lax`. This is a temporary Chrome measure that may be removed.
- **Cookie-refresh gadget:** issue the victim a new session cookie (e.g. via OAuth/SSO) right before the attack to land in the window; popup bypass `window.onclick=()=>window.open('https://site/login/sso')`.
- **Sibling/sub-domain + a separate vulnerability:** SameSite is keyed on eTLD+1, so XSS on any sibling subdomain compromises the site-based protection entirely (cross-origin can be same-site, but not the reverse); CSWSH belongs here too.
- **Client-side redirect gadget:** bypasses even `SameSite=Strict` - for the browser, client-side redirects are not redirects at all, the request is considered same-site and carries all cookies. With a server-side redirect this does **not** work.
- **Method override:** Symfony `_method=POST` in a `method="GET"` form (on the wire it's GET -> the Lax condition is met, the framework routes it as POST): `GET /my-account/change-email?email=...&_method=POST`.

---

## 8. Command Injection

CWE-78 has been in the CWE Top 25 every year from 2019-2025; the 2025 edition added the companion **CWE-88 (Argument Injection)**. Most confirmed-exploitable CISA KEV entries for CWE-78 are unauthenticated remote: **CVE-2024-3400** (PAN-OS), **CVE-2023-28771** (Zyxel), **CVE-2014-6271** (Shellshock). The highest concentration is in network devices (firewalls, VPN, switches) and IoT/embedded.

An instructive case of improper sanitization is **CVE-2023-29084** (ManageEngine ADManagerPlus): escaping did not handle CRLF, and the payload `[any]\r\ncalc.exe` in a password produced injection - an illustration of why blacklist/escaping are unreliable. Blind detection: time-delays (`sleep 10`) or a DNS callback to the attacker's server (OAST).

---

## 9. File Inclusion (LFI/RFI) and Directory Traversal

- **PHP filter chains (Synacktiv)** - turn any arbitrary file read into RCE without `allow_url_include` via a chain of `convert.iconv.*`/`base64`. The tool **Lightyear** builds alternative base64 sets and chains "jumps", allowing large files to be exfiltrated through GET parameters without PHP warnings.
- **cnext-exploits (cfreal)** - exploitation of a buffer overflow in glibc `iconv` via a PHP filter chain (`convert.iconv.UTF-8.ISO-2022-CN-EXT`) -> RCE without writable paths and log poisoning.
- **Ghost Bits (2025)** - a bypass of WAF traversal blocking for the Java stack (Spring **CVE-2025-41242**, Jetty `%2>` hex-folding) by substituting ASCII with Unicode homoglyphs (`.`->U+962E, `/`->U+962F).
- **Zip Slip / Tar Slip** - **CVE-2024-57726** (SimpleHelp): admin-uploaded ZIPs with `../` entries write outside the extraction root; added to CISA KEV in January 2025. **CVE-2024-13059** (AnythingLLM via multer) - a Node path-traversal example.
- `phar://` deserialization (Sam Thomas, BH USA 2018) remains relevant in 2024-2026: any FS call (`file_exists`, `getimagesize`) on a `phar://` URL triggers unserialize of the metadata -> RCE via a gadget chain (including a polyglot phar-in-JPG).

---

## 10. XXE Injection

Modern XXE "lives" in SSO, document-conversion and feed parsing, where the XML parser is invoked indirectly (resume parsers, e-signature renderers, headless renderers, RSS - cf. "From RSS to XXE" at Hootsuite).

Working approaches in 2025: SVG `xlink:href` fetch where general-entity expansion is disabled (`<image xlink:href="file:///etc/passwd">`); JSON->XML pivot on endpoints with content-type auto-detection; error-based exfiltration when OOB connections are blocked, via mixing internal/external DTD. Blind XXE can also be used as SSRF for internal recon. SAML: DOCTYPE before the signed elements (the signature does not cover the whole document).

---

## 11. Insecure Deserialization

`ysoserial` has not been updated since 2021, which reduced coverage on new JDKs. **GadgetBuilder** (Kreyssig, Houy, Zhang, Riom & Bartel, "GadgetBuilder: An Overhaul of the Greatest Java Deserialization Exploitation Tool", NordSec 2025, Tartu, November 12-13, 2025) combines 31 of Ysoserial's main chains with 29 from other sources, bringing the effective number of chains to 303, and revives 17 chains on Java 16+ (by splitting the construction into three fragments) - expanding the surface against deserialization filters.

Recent CVEs: **CVE-2025-24813** (Apache Tomcat), **CVE-2025-40551** (SolarWinds Web Help Desk). In practice: `TemplatesImpl.getOutputProperties()` and outbound JNDI are classic sinks; on Java 17 chains sometimes work if the wrapper script already has `--add-opens`; `CommonsCollections6` is reliable (patched in commons-collections 3.2.2), `C3P0`/`CommonsBeanutils1` are frequent finds. For blind confirmation, `URLDNS` is universal (works on any Java version).

---

## 12. JSON Web Token (JWT)

Algorithm confusion has existed since 2015 (`none` bypass), but new CVEs appear annually because the "convenient" APIs of libraries (`jwt.verify(token, key)` without specifying the algorithm) trust the token header by default. The 2025-2026 cluster:

- **CVE-2025-4692** - algorithm confusion on a cloud platform (unauthorized token creation).
- **CVE-2026-34950** (fast-jwt, CVSS 9.1) - an "incomplete fix" of a prior issue: the regex check of the public key used the `^` anchor, and **leading whitespace** (space/tab/newline) broke RSA key recognition, reopening algorithm confusion (like CVE-2023-48223). Real-world triggers: PostgreSQL/MySQL text columns with a leading newline, YAML multiline, copy-paste.
- **CVE-2026-22817 / CVE-2026-27804 / CVE-2026-23552** - the Q1 2026 cluster (including a strengthened `none` variant).

Modern versions of major libraries are secure by default or require an explicit algorithm - auditing the dependency tree is critical.

---

## 13. OAuth Misconfiguration

- **Pre-account takeover** - the most common pattern (P2 on Bugcrowd): the attacker registers an account with the victim's email (without verification), and when the victim logs in via OAuth the systems "merge" without verifying email ownership -> the attacker retains access, can change the primary email/enable 2FA.
- **Identity injection / mutable email:** "Login with Microsoft/Facebook" by the `email` field (user-controlled, unlike the immutable `sub`/Object ID) - the attacker creates their own AD organization/account without an email and substitutes someone else's email.
- **Authorization-code swap:** if the code->token endpoint doesn't verify the issuing client/redirect/nonce, a stolen code from any application is upgraded to a first-party token.
- **CVE-2025-6514** (mcp-remote <=0.1.15, affects Claude Desktop/Cursor/Windsurf): a malicious MCP server returns an attacker-controlled `authorization_endpoint` (e.g. `file:/c:/windows/system32/calc.exe`) in discovery -> the client passes it to the system URL handler -> RCE.
- Mobile OAuth: a custom URI scheme can be intercepted by a malicious application.

The baseline reference is Doyensec's "Common OAuth Vulnerabilities" (January 30, 2025) with a ready-made checklist.

---

## 14. Account Takeover (ATO)

ATO is the top earner ($1K-$20K) and almost always the result of a **chain**: pre-ATO via OAuth (sec. 13); IDOR + mass assignment (set `"password"`/`"email"` on someone else's profile); JWT forge (sec. 12); reset-token leak via Referer/`Host` header poisoning; password-reset poisoning. When reporting, it is critical to show a full PoC with takeover of another user's account, not a theoretical possibility.

---

## 15. Business Logic Errors

Logic bugs are systematically missed by code review and automated scanners because they require understanding of context. Typical impacts: buying an expensive item for next to nothing (a race in checkout), infinite coupons, vote stuffing, bypassing limits. Microservices, serverless and distributed queues make interactions with shared state more fragile - fertile ground in 2025-2026.

---

## 16. Race Condition

**Single-packet attack** (James Kettle, "Smashing the state machine", Black Hat USA 2023 / DEF CON 31): 20-30 HTTP/2 requests are completed in a single TCP packet, eliminating network jitter. PortSwigger benchmark: a median spread of ~1 ms (sigma 0.3 ms) versus ~4 ms (sigma 3 ms) for traditional last-byte sync - a 4-10x improvement in precision.

**GMO Flatt Security (2025)** - "first sequence sync" bypasses the ~1500-byte limit (and further the 65,535-byte TCP limit) via IP fragmentation and delaying the first fragment, allowing thousands of requests to be synchronized (e.g. for bypassing a rate-limit on a numeric OTP). The concept of **sub-states** takes attacks far beyond limit-overrun (multi-step workflow flaws). An example is **CVE-2023-6109**.

---

## 17. CORS Misconfiguration

The vulnerability is almost always a consequence of misconfiguration. A high-impact scenario: the server dynamically reflects `Origin` + `Access-Control-Allow-Credentials: true` -> any site reads the logged-in user's data (PII, CSRF tokens). The `null` origin is whitelisted "for local development", but is exploited via a sandboxed iframe (`Origin: null`). Regex checks often contain an unescaped `.` or check only the prefix/suffix.

The PortSwigger CORS cheat sheet includes payload families: domain allow-list bypass, fake-relative absolute URLs, loopback/IP normalizations. Important: CORS is not protection against CSRF; a wildcard `*` on an authenticated API is a full bypass of the same-origin policy.

---

## 18. Open Redirect

Often low-severity on its own, but valuable in **chains**: a client-side open redirect is a gadget for bypassing `SameSite=Strict` CSRF (sec. 7, the request is treated as same-site standalone); theft of an OAuth `code`/token via `redirect_uri` substitution; SSRF amplification (a redirect from an allowed host to `169.254.169.254`); phishing from a trusted domain. DOM-based open redirection (source `location`/`location.hash` -> sink `location.href`) is a common pattern in modern SPAs.

---

## 19. Request Smuggling (HTTP Desync)

**"HTTP/1.1 Must Die: The Desync Endgame" (James Kettle, PortSwigger, Black Hat USA / DEF CON 33, August 2025).** The root problem: HTTP/1.1 has four ways to specify message length - `CL`, `TE`, `0` (implicit-zero), `H2` - whose interaction creates ambiguity in request boundaries. What's new:

- **0.CL desync** - previously considered unexploitable: the front-end ignores `Content-Length`, the back-end honors it, usually -> deadlock; Kettle breaks the deadlock via an **early-response gadget** (reserved IIS names `/con`, `/nul`).
- **Double-desync** - a multi-step conversion 0.CL -> CL.0 to poison the victim's request.
- **Expect-based desync** ("Expect complexity bomb") - via `Expect: 100-continue` (vanilla and obfuscated `Expect: y 100-continue`); subvariants 0.CL/CL.0 x vanilla/obfuscated; also a bypass of response-header stripping and memory disclosure.
- **Parser-discrepancy detection (V-H / H-V)** - classification of the Visible-Hidden / Hidden-Visible Host header; the detection core in **HTTP Request Smuggler v3.0**. The author's quote: the open-source toolkit for systematic detection of parser discrepancies, combined with the techniques, yielded >$200,000 in payouts in two weeks. Suspicious responses are flagged as "Mystery 400" ("probably all exploitable").

**Affected vendors (from the whitepaper):** Cloudflare - internal HTTP/1.1 desync, exposure of >24,000,000 sites to full takeover (patched within hours, bounty $7,000); Akamai - CL.0 via obfuscated Expect (affected `auth.lastpass.com`), **CVE-2025-32094**, 74 payouts totaling $221,000, Kettle earned $9,000; Netlify, T-Mobile (staging, $12,000), GitLab ($7,000), LastPass ($5,000), AWS ALB + IIS (AWS decided not to patch).

**Support upstream HTTP/2:** HAProxy, F5 Big-IP, Google Cloud, Imperva, Apache (experimental). **Do not support:** nginx, Akamai, CloudFront, Fastly. The total payout sum for the research is a little over $350,000. The author's conclusion: HTTP/2+ solves the threat; for a safe web, HTTP/1.1 must die.

> Note on the source: Fastly's claim of resilience to these attacks is a vendor self-assessment (Fastly blog), not a Kettle finding.

---

## 20. GraphQL Injection

A single endpoint exposes the entire data graph; the language's flexibility creates surfaces that don't exist in REST. Introspection in production "gifts" the attacker the full schema, including admin fields, internal mutations and legacy types.

**Batching attacks** (an array of queries) and **aliases** (even with batching disabled) bypass per-request rate limiting - a direct path to brute-forcing credentials and enumeration. DoS - via depth (recursive nesting of cross-referencing types), aliasing (N copies of an expensive resolver) and batching (load bombs). Field-level authorization is often implemented incompletely -> BOLA/IDOR in mutations. Treat every public function as an internet endpoint.

---

## 21. NoSQL Injection

MongoDB operators `$ne`/`$gt`/`$regex`/`$where` are the basis of attacks. Recent CVEs in Mongoose: **CVE-2024-53900** (top-level `$where` in `populate({match})`) and its bypass **CVE-2025-23061** (`$where` nested under operators like `$or`; fixed in 6.0.1 by validating the selector's shape). Sensepost (2025) described **error-based NoSQL injection** and techniques for getting rid of pre/post-conditions. `$where` executes JavaScript on the server - even partial validation is dangerous, it's safer to disable scripting. The root cause is accepting and processing input without sanitization, especially when decoding into generic maps.

---

## 22. Prototype Pollution

Exploitation is two-stage: (1) pollute the prototype; (2) trigger a gadget (a property read from the prototype that ends up in a dangerous sink like `eval`/`script.src`).

- **PortSwigger "Widespread prototype pollution gadgets"** - gadgets in Google Analytics/Google Tag Manager that terminate in an `eval` sink (`event_callback` -> `setTimeout`); successfully exploited on major sites. Google considers this the client's responsibility and does not patch the sources.
- **CVE-2024-45801** (DOMPurify <=3.0.8) - pollution of `Node.prototype.after` before the sanitizer is initialized -> stored XSS; **CVE-2023-26136/26140** (jQuery `extend()` from `location.hash`); sanitize-html <2.8.1.
- Server-side (Node) -> RCE via gadget chains: **GHunter** (CVE-2023-31414) and **Dasty** (CVE-2023-31415, critical 9.9, RCE). Systematic mitigation of gadgets remains an open problem.

---

## 23. Mass Assignment

Occurs with auto-binding of input JSON/form directly to a backend model: at registration you send `username`/`password`, but the model contains `role`/`is_admin`/`balance`, and if the developer didn't restrict the fields - the extra ones are accepted and written to the DB. Often silent (no visible error). API3:2023 (BOPLA) in the OWASP API Security Top 10.

The main value is **chaining with IDOR** for ATO (set `password`/`email` on someone else's object) or instant privilege escalation (`"role":"admin"`). When testing, first add a fake field - if the response doesn't change, there is probably a filter; then try real fields and variations.

---

## 24. Web Cache Deception / Poisoning

Martin Doyhenard / PortSwigger "Gotta cache 'em all: bending the rules of web cache exploitation" (Black Hat USA 2024): the techniques **Static Path Deception** (full confidentiality compromise) and **Cache Key Confusion** via URL parser-discrepancy, reproducible on default configs of **Nginx behind Cloudflare** and **Apache behind CloudFront**, as well as on Microsoft Azure.

The idea: if a delimiter (e.g. `$`) is treated differently by the origin and the proxy, the response to `/myAccount` is stored under the key of a "static" path and read by the attacker. For cache poisoning there is a separate class - poisoning via unkeyed inputs (headers), see PortSwigger "Practical Web Cache Poisoning" (the Param Miner tool).

---

## Caveats (important before using in reports)

- **Fresh 2026 CVEs** (CVE-2026-34950 fast-jwt, CVE-2026-22817/27804/23552, CVE-2026-0545 MLflow, CVE-2026-27127 Craft TOCTOU, etc.) are partly taken from aggregators and AI-assisted summaries (TheHackerWire, securityonline.info, dev.to). Before using, verify the details against NVD / GitHub Security Advisories - the numbering and status may have changed.
- **Fastly's claim** of resilience to Kettle's desync attacks is a vendor self-assessment, not an independently confirmed finding.
- **The 120 s window (Lax+POST)** applies only to cookies without an explicit `SameSite` (Chrome default) and is a temporary Chrome measure that may be removed/shortened.
- **Numeric payouts** (>$350K, $221K for Akamai) are cited from the primary source (PortSwigger whitepaper) and illustrate impact, not a guarantee of payouts in a specific program.
- Some payloads and techniques (PHP filter chains RCE, cnext, ysoserial/GadgetBuilder, single-packet race) are **destructive/load-heavy** - only within an authorized scope; many programs prohibit DoS and mass account creation.
- These 24 are the priority categories; the remaining ones of the 64 PayloadsAllTheThings (CRLF, SSI/ESI, XSLT, LDAP, XPath, SAML Injection, Web Sockets/CSWSH, Clickjacking, CSPT, Dependency Confusion, Prompt Injection/LLM, ReDoS, Type Juggling, Upload Insecure Files, Virtual Hosts, XS-Leaks, Zip Slip, etc.) are covered in part 2.

---

## Key sources

- **PayloadsAllTheThings** - github.com/swisskyrepo/PayloadsAllTheThings
- **PortSwigger Research - HTTP/1.1 Must Die** - portswigger.net/research/http1-must-die
- **PortSwigger - Bypassing SameSite cookie restrictions** - portswigger.net/web-security/csrf/bypassing-samesite-restrictions
- **PortSwigger - Race conditions** - portswigger.net/web-security/race-conditions
- **GMO Flatt Security - first sequence sync** - flatt.tech/research/posts/beyond-the-limit-expanding-single-packet-race-condition-with-first-sequence-sync/
- **Claroty Team82 - JSON-based SQLi / WAF bypass** - claroty.com/team82/research/js-on-security-off-abusing-json-based-sql-to-bypass-waf
- **The Register - PostgreSQL CVE-2025-1094 / Treasury** - theregister.com/2025/02/14/postgresql_bug_treasury/
- **Craft CMS SSRF bypass advisory** - github.com/craftcms/cms/security/advisories/GHSA-gp2f-7wcm-5fhx
- **F5 Labs - EC2 IMDS SSRF campaign** - f5.com/labs/articles/campaign-targets-amazon-ec2-instance-metadata-via-ssrf
- **Wiz - SSRF academy** - wiz.io/academy/application-security/server-side-request-forgery
- **GadgetBuilder (NordSec 2025)** - dl.acm.org/doi/10.1007/978-3-032-14782-0_11
- **HackTricks - NoSQL injection** - book.hacktricks.xyz/pentesting-web/nosql-injection
