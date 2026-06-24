# WEB — дополнительно (recon, OOB, smuggling)

Tools that complement the main web arsenal: subdomain collection, fast port-scan in the ProjectDiscovery pipeline, technology/WAF fingerprinting, crawling, OOB interactions, and niche classes (smuggling, CRLF, GraphQL).

## subfinder (ProjectDiscovery) — passive subdomain collection
**Purpose:** fast passive subdomain enumeration across dozens of sources (no noise against the target).
**Install:** `go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest`.
- `-d domain` - target; `-dL list.txt` - list of domains; `-all` - all sources (slower, more complete); `-recursive` - recursively; `-o file`/`-oJ` - output; `-silent` - results only (for pipes); `-rl` - rate; `-nW` - live only (by DNS); `-cs` - provider-config with API keys (`~/.config/subfinder/provider-config.yaml`).
- Pipeline: `subfinder → dnsx (resolve) → httpx (live HTTP) → nuclei`.
```bash
subfinder -d target.htb -all -silent -o subs.txt
subfinder -d target.htb -silent | dnsx -silent | httpx -silent -title -td
```
**Tip:** for HTB the domains are usually local (`*.htb`) - passive sources will not help, add `gobuster dns`/`ffuf` with a wordlist.

## amass — subdomain enum (OWASP)
**Purpose:** deep attack-surface collection (passive + active + bruteforce + graph traversal).
**Install:** `sudo apt install amass` / `go install github.com/owasp-amass/amass/v4/...@master`.
- `amass enum -d domain` - main mode; `-passive` (no active queries) / `-active` (resolve, cert grab); `-brute` (+ `-w wordlist`); `-d domain`; `-df domains.txt`; `-o out.txt`; `-json`; `-ip`/`-src` (show IP/source); `-config config.ini` (API keys). `amass intel -d domain` - OSINT on the organization (ASN/whois).
```bash
amass enum -passive -d target.htb -o amass.txt
amass enum -active -brute -d target.htb -w subdomains-top1million-5000.txt
```

## naabu (ProjectDiscovery) — fast port-scan (SYN/CONNECT)
**Purpose:** lightning-fast discovery of open ports as the first pipeline step (then nmap targeted on what is found).
**Install:** `go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest` (SYN requires root/libpcap).
- `-host`/`-list`; `-p 80,443` / `-p -` (all 65535) / `-top-ports 100|1000`; `-s s|c` (SYN/CONNECT); `-rate N` (pps); `-c` concurrency; `-nmap-cli 'nmap -sV -sC'` (run nmap over the found ports); `-silent`; `-o`; `-Pn` (skip host-discovery); `-ec` (exclude-cdn).
```bash
naabu -host 10.10.10.10 -p - -rate 5000 -silent
naabu -host 10.10.10.10 -top-ports 1000 -nmap-cli 'nmap -sV -sC'
```

## dnsx (ProjectDiscovery) — DNS resolver/toolkit
**Purpose:** mass resolution, filtering of live hosts, DNS queries, and subdomain brute-forcing via `FUZZ`.
**Install:** `go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest`.
- `-l hosts.txt` / stdin; `-a`/`-aaaa`/`-cname`/`-mx`/`-ns`/`-txt`/`-ptr` (record types); `-resp`/`-resp-only` (show response); `-silent`; `-d domain -w words.txt` (or `FUZZ` in `-d`) - DNS brute; `-r resolvers.txt`; `-rl` rate; `-wd domain` (wildcard filter).
```bash
subfinder -d target.htb -silent | dnsx -silent -a -resp
dnsx -d 'FUZZ.target.htb' -w subdomains.txt -silent
```

## nikto — web server scanner
**Purpose:** quick check of common misconfigs, dangerous files, outdated servers (noisy, but gives leads).
**Install:** `sudo apt install nikto`.
- `-h host`/URL; `-p 80,443`; `-ssl` (force TLS); `-Tuning 1..9,x` (check categories: `1` interesting files, `2` misconfig, `4` injection, `9` SQLi); `-Plugins`; `-useragent`; `-output file -Format htm|csv|xml`; `-Display V` (verbose); `-ask no`.
```bash
nikto -h http://t -Tuning 123b -output nikto.txt
nikto -h 10.10.10.10 -p 80,443,8080
```

## whatweb — technology fingerprinting
**Purpose:** identify CMS, frameworks, versions, headers, JS libraries.
**Install:** `sudo apt install whatweb`.
- `whatweb URL`; `-a 1|3|4` (aggression level: 1 passive, 3 active, 4 "heavy"); `-v` (verbose); `--log-json file`; `-i hosts.txt` (list); `-U` user-agent; `--no-errors`.
```bash
whatweb -a 3 -v http://t
whatweb -i live.txt --log-json ww.json
```

## wafw00f — WAF detection
**Purpose:** find out whether there is a WAF and which one (affects the choice of tamper/bypass for sqlmap/ffuf/nuclei).
**Install:** `pipx install wafw00f`.
- `wafw00f URL`; `-a` (test all WAFs, do not stop at the first); `-l` (list of supported WAFs); `-i targets.txt`; `-o out`; `-p proxy`.
```bash
wafw00f http://t -a
```

## gospider — crawler (Go)
**Purpose:** fast spider: links, forms, JS endpoints, robots/sitemap, subdomains from the body.
**Install:** `go install github.com/jaeles-project/gospider@latest`.
- `-s URL` / `-S sites.txt`; `-d N` (depth); `-c` concurrency; `-t` threads; `--js` (parse JS); `--sitemap`/`--robots`; `-a` (third-party sources: Wayback/CommonCrawl/VirusTotal); `--subs` (include subdomains); `-o outdir`; `--blacklist regex`; `--cookie`/`-H`.
```bash
gospider -s http://t -d 3 -c 10 --js --sitemap --robots -o crawl
```

## hakrawler — fast crawler from stdin
**Purpose:** minimalist spider for pipelines (URL in -> links/endpoints out).
**Install:** `go install github.com/hakluke/hakrawler@latest`.
- stdin (`echo http://t | hakrawler`); `-d N` (depth); `-subs` (include subdomains); `-u` (unique); `-insecure`; `-h "Header: v"`; `-json`.
```bash
echo http://t | hakrawler -d 2 -subs
cat live.txt | hakrawler -u | httpx -silent -mc 200
```

## paramspider — parameters from archives
**Purpose:** pull URLs with GET parameters from Wayback (candidates for XSS/SQLi/LFI fuzzing).
**Install:** `pipx install paramspider` / git.
- `-d domain`; `--subs`; `-s` (stream/stdout); `--level high`; `-p '"FUZZ"'` (placeholder instead of values - ready for ffuf/dalfox); `-o out`.
```bash
paramspider -d target.htb -p '"FUZZ"' -o params.txt
paramspider -d target.htb --subs -s | dalfox pipe
```

## interactsh-client (ProjectDiscovery) — OOB/OAST server
**Purpose:** catch out-of-band interactions (DNS/HTTP/SMTP) for blind SSRF/RCE/XXE/SQLi - an analog of Burp Collaborator.
**Install:** `go install github.com/projectdiscovery/interactsh/cmd/interactsh-client@latest`.
- on start it issues a unique domain `xxxx.oast.pro` - insert it into the payload; `-json`; `-o`; `-s server` (your own server); `-v` (full interactions); `-poll-interval`. Pairs with `nuclei` (used automatically) and `sqlmap`/`dalfox -b`.
```bash
interactsh-client -v
# then payload: curl http://<id>.oast.pro  / sqlmap ... --dns-domain
```

## graphw00f — GraphQL engine fingerprinting
**Purpose:** identify the type of GraphQL server (Apollo, Hasura, graphene...) -> choose targeted attacks (pairs with InQL in Burp).
**Install:** `pipx install graphw00f` / git.
- `-t URL` (detect engine); `-d` (detect mode); `-f` (fingerprint); `-l` (list of engines); `-T file` (multiple targets); `-o out.json`; `-w` (search for the GraphQL endpoint by a wordlist of paths).
```bash
graphw00f -d -f -t http://t/graphql
```

## smuggler — HTTP Request Smuggling detection
**Purpose:** check for desync (CL.TE / TE.CL) on the front/back end.
**Install:** `git clone github.com/defparam/smuggler`.
- `-u URL` (single target) / `-u` + stdin (list); `-m GET|POST`; `-q` quiet; `-l logdir`; `-t timeout`; `-x` (exit on first finding); mutation configs in `payloads/`.
```bash
python3 smuggler.py -u http://t/
echo http://t | python3 smuggler.py
```

## crlfuzz — CRLF injection search
**Purpose:** inject `\r\n` into response headers (HTTP response splitting, set-cookie, open redirect, sometimes XSS).
**Install:** `go install github.com/dwisiswant0/crlfuzz/cmd/crlfuzz@latest`.
- `-u URL` / `-l list.txt` / stdin (`-`); `-X` method; `-d data`; `-H` headers; `-c N` concurrency; `-s` (silent); `-o out`; `-p proxy`.
```bash
crlfuzz -u 'http://t/?redirect=1'
cat urls.txt | crlfuzz -s -o crlf.txt
```

## Обход 403/40X (byp4xx · nomore403 · bypass-url-parser) — auto-fuzzing
**Purpose:** automatically iterate over path mutations, HTTP methods, and headers to reach a 403/401-protected endpoint. Detailed techniques and payload lists are in the **Payloads → "Обход 403 / контроль доступа"** section.
**Install:** `go install github.com/devploit/nomore403@latest`; `git clone https://github.com/lobuhi/byp4xx`; `pipx install bypass-url-parser`. They are not on stock Kali (ffuf/dirsearch are).
- **nomore403** (Go, all-in-one): `-u URL` target; `-H "h: v"` header; `-m method`; `-f folder` custom payloads; `-k` skip TLS check; `--rate-limit N`; `-d` dump responses.
- **byp4xx** (bash): `./byp4xx.sh URL` - verbs + headers + path-mutations + Unicode in a single run.
- **bypass-url-parser** (laluka): `-u URL` target; `-s IP` spoof IP; `-H "h: v"` headers; `-t/-T` threads/timeout; `-m "mid_paths,end_paths"` mutation modes; `-R reqfile` from a request file.
- **ffuf** with the toolkit's ready-made lists (⌘K: `403_url_payloads.txt`, `403_header_payloads.txt`).
```bash
nomore403 -u https://target/admin
./byp4xx.sh https://target/admin
bypass-url-parser -u "https://target/admin"
ffuf -w 403_url_payloads.txt -u https://target/adminFUZZ -mc all -ac
ffuf -w 403_header_payloads.txt:FUZZ -u https://target/admin -H "FUZZ" -mc all -ac
```
