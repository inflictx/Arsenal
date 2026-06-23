# WEB — дополнительно (recon, OOB, smuggling)

Тулзы, дополняющие основной веб-арсенал: сбор поддоменов, быстрый порт-скан в пайплайне ProjectDiscovery, фингерпринт технологий/WAF, краулинг, OOB-взаимодействия и нишевые классы (smuggling, CRLF, GraphQL).

## subfinder (ProjectDiscovery) — пассивный сбор поддоменов
**Назначение:** быстрый passive-enum поддоменов по десяткам источников (без шума по цели).
**Установка:** `go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest`.
- `-d domain` — цель; `-dL list.txt` — список доменов; `-all` — все источники (медленнее, полнее); `-recursive` — рекурсивно; `-o file`/`-oJ` — вывод; `-silent` — только результат (для пайпов); `-rl` — rate; `-nW` — только живые (по DNS); `-cs` — provider-config с API-ключами (`~/.config/subfinder/provider-config.yaml`).
- Пайплайн: `subfinder → dnsx (резолв) → httpx (живые HTTP) → nuclei`.
```bash
subfinder -d target.htb -all -silent -o subs.txt
subfinder -d target.htb -silent | dnsx -silent | httpx -silent -title -td
```
**Tip:** для HTB домены обычно локальные (`*.htb`) — пассивные источники не помогут, добавь `gobuster dns`/`ffuf` по словарю.

## amass — enum поддоменов (OWASP)
**Назначение:** глубокий сбор поверхности атаки (passive + active + bruteforce + перебор по графу).
**Установка:** `sudo apt install amass` / `go install github.com/owasp-amass/amass/v4/...@master`.
- `amass enum -d domain` — основной режим; `-passive` (без активных запросов) / `-active` (резолв, cert grab); `-brute` (+ `-w wordlist`); `-d domain`; `-df domains.txt`; `-o out.txt`; `-json`; `-ip`/`-src` (показать IP/источник); `-config config.ini` (API-ключи). `amass intel -d domain` — OSINT по организации (ASN/whois).
```bash
amass enum -passive -d target.htb -o amass.txt
amass enum -active -brute -d target.htb -w subdomains-top1million-5000.txt
```

## naabu (ProjectDiscovery) — быстрый порт-скан (SYN/CONNECT)
**Назначение:** молниеносный поиск открытых портов как первый шаг пайплайна (затем nmap точечно по найденным).
**Установка:** `go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest` (для SYN нужен root/libpcap).
- `-host`/`-list`; `-p 80,443` / `-p -` (все 65535) / `-top-ports 100|1000`; `-s s|c` (SYN/CONNECT); `-rate N` (pps); `-c` concurrency; `-nmap-cli 'nmap -sV -sC'` (прогнать nmap по найденным портам); `-silent`; `-o`; `-Pn` (skip host-discovery); `-ec` (exclude-cdn).
```bash
naabu -host 10.10.10.10 -p - -rate 5000 -silent
naabu -host 10.10.10.10 -top-ports 1000 -nmap-cli 'nmap -sV -sC'
```

## dnsx (ProjectDiscovery) — DNS-резолвер/тулкит
**Назначение:** массовый резолв, фильтрация живых, DNS-запросы и брут поддоменов через `FUZZ`.
**Установка:** `go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest`.
- `-l hosts.txt` / stdin; `-a`/`-aaaa`/`-cname`/`-mx`/`-ns`/`-txt`/`-ptr` (типы записей); `-resp`/`-resp-only` (показать ответ); `-silent`; `-d domain -w words.txt` (или `FUZZ` в `-d`) — DNS-брут; `-r resolvers.txt`; `-rl` rate; `-wd domain` (wildcard-фильтр).
```bash
subfinder -d target.htb -silent | dnsx -silent -a -resp
dnsx -d 'FUZZ.target.htb' -w subdomains.txt -silent
```

## nikto — сканер веб-сервера
**Назначение:** быстрый чек типовых мисконфигов, опасных файлов, устаревших серверов (шумный, но даёт зацепки).
**Установка:** `sudo apt install nikto`.
- `-h host`/URL; `-p 80,443`; `-ssl` (форсить TLS); `-Tuning 1..9,x` (категории проверок: `1` интересные файлы, `2` misconfig, `4` инъекции, `9` SQLi); `-Plugins`; `-useragent`; `-output file -Format htm|csv|xml`; `-Display V` (verbose); `-ask no`.
```bash
nikto -h http://t -Tuning 123b -output nikto.txt
nikto -h 10.10.10.10 -p 80,443,8080
```

## whatweb — фингерпринт технологий
**Назначение:** определить CMS, фреймворки, версии, заголовки, JS-библиотеки.
**Установка:** `sudo apt install whatweb`.
- `whatweb URL`; `-a 1|3|4` (уровень агрессии: 1 пассивно, 3 активно, 4 «тяжело»); `-v` (подробно); `--log-json file`; `-i hosts.txt` (список); `-U` user-agent; `--no-errors`.
```bash
whatweb -a 3 -v http://t
whatweb -i live.txt --log-json ww.json
```

## wafw00f — детект WAF
**Назначение:** понять, есть ли WAF и какой (влияет на выбор tamper/обхода для sqlmap/ffuf/nuclei).
**Установка:** `pipx install wafw00f`.
- `wafw00f URL`; `-a` (проверять все WAF, не останавливаться на первом); `-l` (список поддерживаемых WAF); `-i targets.txt`; `-o out`; `-p proxy`.
```bash
wafw00f http://t -a
```

## gospider — краулер (Go)
**Назначение:** быстрый паук: ссылки, формы, JS-эндпоинты, robots/sitemap, поддомены из тела.
**Установка:** `go install github.com/jaeles-project/gospider@latest`.
- `-s URL` / `-S sites.txt`; `-d N` (глубина); `-c` concurrency; `-t` threads; `--js` (парсить JS); `--sitemap`/`--robots`; `-a` (сторонние источники: Wayback/CommonCrawl/VirusTotal); `--subs` (вкл. поддомены); `-o outdir`; `--blacklist regex`; `--cookie`/`-H`.
```bash
gospider -s http://t -d 3 -c 10 --js --sitemap --robots -o crawl
```

## hakrawler — быстрый краулер из stdin
**Назначение:** минималистичный паук для пайплайнов (URL на вход → ссылки/эндпоинты на выход).
**Установка:** `go install github.com/hakluke/hakrawler@latest`.
- stdin (`echo http://t | hakrawler`); `-d N` (глубина); `-subs` (включить поддомены); `-u` (уникальные); `-insecure`; `-h "Header: v"`; `-json`.
```bash
echo http://t | hakrawler -d 2 -subs
cat live.txt | hakrawler -u | httpx -silent -mc 200
```

## paramspider — параметры из архивов
**Назначение:** вытащить URL с GET-параметрами из Wayback (кандидаты для XSS/SQLi/LFI-фаззинга).
**Установка:** `pipx install paramspider` / git.
- `-d domain`; `--subs`; `-s` (stream/stdout); `--level high`; `-p '"FUZZ"'` (плейсхолдер вместо значений — сразу под ffuf/dalfox); `-o out`.
```bash
paramspider -d target.htb -p '"FUZZ"' -o params.txt
paramspider -d target.htb --subs -s | dalfox pipe
```

## interactsh-client (ProjectDiscovery) — OOB/OAST сервер
**Назначение:** ловить out-of-band взаимодействия (DNS/HTTP/SMTP) для blind SSRF/RCE/XXE/SQLi — аналог Burp Collaborator.
**Установка:** `go install github.com/projectdiscovery/interactsh/cmd/interactsh-client@latest`.
- запуск выдаёт уникальный домен `xxxx.oast.pro` — вставляй его в payload; `-json`; `-o`; `-s server` (свой сервер); `-v` (полные взаимодействия); `-poll-interval`. Парой к `nuclei` (используется автоматически) и `sqlmap`/`dalfox -b`.
```bash
interactsh-client -v
# затем payload: curl http://<id>.oast.pro  / sqlmap ... --dns-domain
```

## graphw00f — фингерпринт GraphQL-движка
**Назначение:** определить тип GraphQL-сервера (Apollo, Hasura, graphene…) → выбрать целевые атаки (пара к InQL в Burp).
**Установка:** `pipx install graphw00f` / git.
- `-t URL` (детект движка); `-d` (detect mode); `-f` (fingerprint); `-l` (список движков); `-T file` (несколько целей); `-o out.json`; `-w` (искать GraphQL-эндпоинт по словарю путей).
```bash
graphw00f -d -f -t http://t/graphql
```

## smuggler — детект HTTP Request Smuggling
**Назначение:** проверка десинхронизации (CL.TE / TE.CL) на фронт/бэке.
**Установка:** `git clone github.com/defparam/smuggler`.
- `-u URL` (одна цель) / `-u` + stdin (список); `-m GET|POST`; `-q` тихо; `-l logdir`; `-t timeout`; `-x` (exit на первой находке); конфиги мутаций в `payloads/`.
```bash
python3 smuggler.py -u http://t/
echo http://t | python3 smuggler.py
```

## crlfuzz — поиск CRLF-инъекций
**Назначение:** инъекция `\r\n` в заголовки ответа (HTTP response splitting, set-cookie, open redirect, иногда XSS).
**Установка:** `go install github.com/dwisiswant0/crlfuzz/cmd/crlfuzz@latest`.
- `-u URL` / `-l list.txt` / stdin (`-`); `-X` метод; `-d data`; `-H` заголовки; `-c N` concurrency; `-s` (silent); `-o out`; `-p proxy`.
```bash
crlfuzz -u 'http://t/?redirect=1'
cat urls.txt | crlfuzz -s -o crlf.txt
```

## Обход 403/40X (byp4xx · nomore403 · bypass-url-parser) — авто-перебор
**Назначение:** автоматом перебрать мутации пути, HTTP-методы и заголовки, чтобы достучаться до 403/401-защищённого эндпоинта. Подробные техники и payload-листы — в разделе **Payloads → «Обход 403 / контроль доступа»**.
**Установка:** `go install github.com/devploit/nomore403@latest`; `git clone https://github.com/lobuhi/byp4xx`; `pipx install bypass-url-parser`. На стоковой Kali их нет (ffuf/dirsearch есть).
- **nomore403** (Go, всё-в-одном): `-u URL` цель; `-H "h: v"` заголовок; `-m method`; `-f folder` свои пейлоады; `-k` не проверять TLS; `--rate-limit N`; `-d` дамп ответов.
- **byp4xx** (bash): `./byp4xx.sh URL` — verbs + headers + path-mutations + Unicode в один прогон.
- **bypass-url-parser** (laluka): `-u URL` цель; `-s IP` спуф-IP; `-H "h: v"` заголовки; `-t/-T` потоки/таймаут; `-m "mid_paths,end_paths"` режимы мутаций; `-R reqfile` из файла-запроса.
- **ffuf** с готовыми листами тулкита (⌘K: `403_url_payloads.txt`, `403_header_payloads.txt`).
```bash
nomore403 -u https://target/admin
./byp4xx.sh https://target/admin
bypass-url-parser -u "https://target/admin"
ffuf -w 403_url_payloads.txt -u https://target/adminFUZZ -mc all -ac
ffuf -w 403_header_payloads.txt:FUZZ -u https://target/admin -H "FUZZ" -mc all -ac
```
