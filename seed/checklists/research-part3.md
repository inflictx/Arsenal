# Ресёрч: инфраструктура / пост-эксплуатация (batch 3)

---

## 1. Linux Privilege Escalation

**Когда применимо.** После первичного шелла (часто `www-data`/сервисный юзер после RCE) с целью добраться до `root`. HTB/CTF и авторизованный доступ к хосту.

**Логика поиска вектора (от дешёвого к дорогому):**
1. Автоэнум (LinPEAS `-a` + `pspy` для динамики) даёт 80% зацепок — приоритет по подсветке.
2. Сначала «человеческие» мисконфиги: `sudo -l`, SUID/capabilities, cron, writable-файлы, переиспользование паролей/ключей — надёжнее эксплойтов ядра и не роняют хост.
3. Ядро/CVE — в последнюю очередь: точное сопоставление версии (`uname -r`, `/etc/os-release`) важнее «похоже подходит» (бэкпорты!).

**Gotchas.**
- LinPEAS из `/dev/shm` (часто `noexec` на `/tmp`).
- GTFOBins: различать секции **SUID** vs **Sudo** vs **Capabilities** — payload разный; для SUID-шелла нужен `-p` (`bash -p`), иначе euid сбросится.
- LD_PRELOAD работает только при `env_keep+=LD_PRELOAD` в `sudo -l`.
- PwnKit (CVE-2021-4034) почти всегда даёт root, если `pkexec` есть и не пропатчен — «последний шанс».
- DirtyPipe требует ядра 5.8–5.16.x; иначе паника.
- Docker/lxd-группа = фактически root, но нужен доступный сокет.

**Источники.** GTFOBins; HackTricks — Linux Privilege Escalation; PEASS-ng; `linux-exploit-suggester`; Exploit-DB.

---

## 2. Windows Privilege Escalation

**Когда применимо.** Шелл от низкопривилегированного юзера или сервиса (IIS `iis apppool\`, `mssql`, `local/network service`) → `NT AUTHORITY\SYSTEM`/локальный админ.

**Логика.**
1. `whoami /priv` — главное: `SeImpersonate`/`SeAssignPrimaryToken` у сервиса ≈ SYSTEM через Potato. `SeBackup`/`SeRestore`/`SeDebug`/`SeTakeOwnership` — свои цепочки.
2. Автоэнум WinPEAS/PrivescCheck/PowerUp: unquoted paths, ACL сервисов, AlwaysInstallElevated, автозапуски, сохранённые креды.
3. Кредохантинг (cmdkey, конфиги, GPP, DPAPI, SAM/SYSTEM) — часто короче эксплойта.
4. Kernel/missing KB (wesng/Watson) — когда мисконфигов нет.

**Gotchas.**
- Выбор Potato под ОС: классический JuicyPotato мёртв на 2019+/Win10 1809+ → **PrintSpoofer** (нужен Spooler) или **GodPotato**/**JuicyPotatoNG** (2019/2022/10/11). GodPotato — самый надёжный.
- `accesschk` требует `-accepteula`.
- Unquoted path: нужно право записи в промежуточный каталог И право перезапустить сервис.
- AlwaysInstallElevated — должен быть `=1` в ОБОИХ ветках (HKLM и HKCU).
- HiveNightmare (CVE-2021-36934): нужны теневые копии (VSS) + читаемые ACL на `SAM`/`SYSTEM`.
- AV режет `winPEAS.exe`/`mimikatz` — `winPEASany`, SharpUp, in-memory, `-ep bypass`.

**Источники.** HackTricks — Windows Local Privilege Escalation; PayloadsAllTheThings; PEASS-ng (WinPEAS); itm4n (PrivescCheck/PrintSpoofer); BeichenDream/GodPotato; LOLBAS; wesng.

---

## 3. Active Directory — цепочка атак

**Логика цепочки (от анонима до Domain Admin).** Каждый шаг — это либо получение нового идентификатора (юзер/хеш/тикет/cert), либо повышение контекста над ним.

1. **Аноним → список юзеров.** RID brute по SMB (работает даже при null/guest, когда LDAP закрыт), anonymous LDAP, Kerberos user enum (`kerbrute`, только 88/tcp). Уже здесь возможен compromise: **AS-REP roast без аутентификации** для аккаунтов с `DONT_REQ_PREAUTH`.
2. **Первый креденшл → карта домена.** Сразу снять граф BloodHound (`-c All`) — он превращает «есть юзер X» в путь к DA через ACL/делегирование/членство. Параллельно Kerberoast и осмотр `description` (пароли — классика).
3. **Развилки эскалации:** ACL-путь (ForceChangePassword/GenericAll/WriteDACL — самый тихий, WriteDACL/Owner на корень = DCSync); Kerberos (Kerberoast/AS-REP, зависит от стойкости пароля); делегирование (unconstrained+coerce / constrained S4U / RBCD); **ADCS** (ESC1 одним запросом → cert от имени DA, `certipy find -vulnerable`); coercion+relay (PetitPotam/PrinterBug + ntlmrelayx → LDAP-эскалация или ESC8).
4. **Domain compromise → дамп/закрепление.** DCSync (`secretsdump -just-dc`) → krbtgt → Golden Ticket; shadow creds и скрытые DCSync-права — тихая персистентность; Silver ticket не трогает DC.
5. **Lateral.** PtH/OverPtH/PtT, evil-winrm/psexec/wmiexec; `nxc` по подсети мгновенно показывает где аккаунт — локальный админ (`Pwn3d!`).

**Ключевые развилки.**
- Null закрыт? → `guest`, затем authenticated enum после первого крека.
- LDAP/SMB signing включён? → relay не сработает (signing/CB виден прямо в баннере `nxc ldap <dc> -u u -p 'p'`; список SMB-целей без signing — `nxc smb <cidr> --gen-relay-list relay.txt`). Современные DC требуют LDAP channel binding → смещайся на SMB-relay или ADCS HTTP.
- Только AES (RC4 off)? → Kerberoast `-m 19600/19700`, медленнее.
- Lockout: перед спреем читай `--pass-pol`, один пароль на раунд, `--no-bruteforce`.
- Тикеты на Linux: рассинхрон времени с DC > 5 мин ломает Kerberos; `KRB5CCNAME`, `-k`, корректный `/etc/hosts`+DNS на DC.

**Gotchas.** `bloodhound-python` требует DNS на DC (`-ns`); заливать в **BloodHound CE**. **Certipy 5.x** сменил синтаксис (объединённые подкоманды, `certipy relay` для ESC8); ESC16 в свежих релизах. `addcomputer` требует `MachineAccountQuota > 0`. ForceChangePassword ломает рабочий аккаунт — фиксируй старый хеш. AS-REP/Kerberoast/DCSync — высоко-сигнальные события (4768/4769/4662).

**Источники.** ired.team (AD attacks); thehacker.recipes (раздел AD); Certipy wiki (ESC1-16); BloodHound CE docs; NetExec wiki; Impacket examples.

---

## 4. Cloud — AWS / Azure / GCP / Kubernetes

**Когда применимо.** Нашли облачные ключи (`AKIA`/`ASIA`, `.aws/credentials`, GCP key.json, kubeconfig), SSRF в облачном приложении (→ metadata→роль), или шелл в контейнере/поде.

**Логика.** Сначала идентификация (`aws sts get-caller-identity` — «whoami» облака, почти всегда разрешено, до этого не шуметь Pacu/ScoutSuite). Затем enum прав (`pacu iam__enum_permissions`/`iam__privesc_scan`, ScoutSuite/prowler — мисконфиги). Затем privesc по известным путям → persistence → lateral (AssumeRole, cross-account). Metadata — отдельный быстрый вектор.

**IMDSv1 vs IMDSv2 (ключевое).** IMDSv1 — простой GET, через любой SSRF. IMDSv2 требует сперва `PUT /latest/api/token` (заголовок TTL), затем GET с `X-aws-ec2-metadata-token` — через слепой GET-only SSRF сложно. `hop-limit=1` у IMDSv2 — основная защита. Azure: `/metadata/identity/oauth2/token`, заголовок `Metadata: true`, параметр `resource=`. GCP: `metadata.google.internal`, `Metadata-Flavor: Google`.

**Gotchas.** `ASIA` требует `AWS_SESSION_TOKEN` (иначе `InvalidClientTokenId`). `--no-sign-request` для анонимных бакетов. CloudTrail/GuardDuty логируют почти всё — на bug-bounty не эскалируй разрушительно. `iam:PassRole` бесполезен без второго сервиса (EC2/Lambda/Glue/CFN). K8s: всё решает `kubectl auth can-i --list`; `create pods` или `list secrets` ≈ админ кластера. Маркеры побега: `privileged`, `hostPID/hostPath`, `docker.sock`, `SYS_ADMIN`.

**Инструменты.** awscli v2/az/gcloud/kubectl; ScoutSuite, Prowler v4/5, Pacu, CloudFox; ROADtools/AzureHound; trufflehog, enumerate-iam, peirates, kube-hunter.

**Источники.** hackingthe.cloud; Pacu wiki; ScoutSuite/Prowler docs; PayloadsAllTheThings (Cloud/Kubernetes); Rhino Security Labs — «AWS IAM Privilege Escalation Methods».

---

## 5. Pivoting и туннелирование

**Когда применимо.** Захватили плацдарм с доступом во внутреннюю сеть, недостижимую напрямую. Многоуровневые сети — двойной/тройной pivot.

**Выбор инструмента.**
1. Сначала разведка подсетей (`ip a`/`ip route`/`arp -a`) — определяет маршруты.
2. **Ligolo-ng — выбор по умолчанию 2025/2026:** настоящий L3-туннель через TUN; добавил `ip route add <subnet> dev ligolo` — и любые тулы (nmap `-sS`, Impacket, браузер) работают напрямую, без proxychains и без UDP-ограничений SOCKS.
3. **Chisel** — HTTP/WS-туннель (проходит прокси/файрволы), нет прав на TUN, Windows без админа.
4. **SSH** (`-L`/`-R`/`-D`) — если есть SSH-доступ; **sshuttle** — «VPN для бедных» (нужен Python на цели).
5. **Meterpreter** (`autoroute`+`socks_proxy`+`portfwd`) — если есть MSF-сессия.

**Нюансы.** SOCKS не умеет ICMP и кривой с UDP → через proxychains `nmap -sT -Pn`; `-sS` идёт только через TUN ligolo. proxychains-ng: `dynamic_chain` для цепочек, выключи `proxy_dns` если ломает резолв (но тогда DNS внутренних имён не резолвится). Reverse vs forward: при заблокированном входящем — агент сам идёт наружу (reverse). Маршруты ligolo добавляются на АТАКУЮЩЕМ, не на цели.

**Gotchas.** Windows: ligolo ставит Wintun-драйвер. Не забыть firewall на атакующей машине (входящий 11601/8080). `sshuttle` требует root локально + Python удалённо, без UDP. Долгие reverse-туннели/TUN — аномалия для EDR; маскируй chisel под 443/TLS.

**Источники.** Ligolo-ng (nicocha30); Chisel (jpillora); sshuttle docs; OpenSSH man; proxychains-ng; HTB Academy «Pivoting, Tunneling, Port Forwarding»; PayloadsAllTheThings «Network Pivoting».

---

## 6. API Testing (OWASP API Top 10)

**Где деньги.** API почти всегда stateless → каждый эндпоинт обязан сам проверять права, а разработчики полагаются на «фронт скроет».
- **API1 BOLA/IDOR** — top-1 по выплатам: объект адресуется `id`/UUID/email, сервер проверяет только аутентификацию, не «принадлежит ли». Всегда 2 аккаунта. UUID не спасает (собираются из других ответов).
- **API5 BFLA** — обычный юзер вызывает админ-операцию или меняет метод (`GET`→`PUT`/`DELETE`). Особенно на скрытых `/admin`/`/internal`/`/actuator` и при version drift.
- **API2 Broken Auth** + **API3 (mass assignment + excessive data exposure)** — mass assignment (`"role":"admin"`) = прямая привилегия; excessive exposure сдаёт PII/секреты.

**Gotchas.**
- **Версионирование = auth drift:** старые `/v1` часто живы и менее защищены. Закрыто в `/v2` — повтори в `/v1`.
- **Метод и override:** WAF/авторизация иногда смотрят только `GET`/`POST`. Пробуй `PUT`/`PATCH`/`DELETE` и `X-HTTP-Method-Override`/`_method`.
- **UI != API:** сравнивай сырой JSON с тем, что показывает UI — лишние поля = репорт.
- **GraphQL:** introspection часто включён в проде (выгрузи схему; `clairvoyance` если выключен); BOLA поле-за-полем; batching обходит rate-limit и брутит OTP; глубокая вложенность → DoS.
- **gRPC:** `grpcurl -plaintext host:port list` (reflection), методы часто без проверок REST-гейтвея.
- **SSRF (API7):** не только `url=` — webhooks, импорт по ссылке, превью, аватарки; cloud-metadata главный таргет, blind через Collaborator.
- **Mass assignment** ищи в «обновлении профиля» (PUT/PATCH + привилегированные поля); сначала `arjun` для скрытых параметров.

**Источники.** OWASP API Security Top 10 — 2023; OWASP WSTG; PortSwigger Web Security Academy (API/GraphQL/SSRF/JWT); методологии bug-bounty (kiterunner/arjun/graphql-cop/jwt_tool).

---

## 7. Recon-пайплайн (автоматизация энумерации)

**Логика.** Recon — воронка: широкий пассивный сбор → сужение до живого/доступного → приоритизация по поверхности → автопроверка на известные баги. Каждая ступень режет шум для следующей; смысл — связать тулзы так, чтобы выход одного был входом другого (stdin/stdout, «хост в строке»). Канонический стек — ProjectDiscovery.

**Ступени.** (1) Scope-дисциплина — лишние домены = выход за рамки + шум. (2) Пассив поддоменов (`subfinder -all`, `amass -passive`, `chaos`, crt.sh) — без касания цели, ключи API критичны. (3) Резолв+живые (`dnsx`→`httpx` с `-title -tech-detect`) — технологии = известные CVE. (4) Порты (`naabu`→`nmap -sCV` только по найденным). (5) Краулинг+JS (`katana`, `gau`, `waybackurls`, `getJS`) — **JS = золото recon-а**: хардкод-ключи, скрытые эндпоинты, внутренние хосты. (6) Скриншоты (`gowitness`) — визуальный триаж. (7) `nuclei` с `-severity`/`-es info` под tech-стек. (8) Связка + cron+`anew`+`notify` — «первым заметить новый актив».

**Gotchas.** Словарь решает (см. модуль Wordlists): SecLists `raft-*`/`api/`, assetnote. Rate-limit: `-rl`/concurrency, уважай scope. `anew` — клей для diff-мониторинга (пишет только новое). `katana -jc -kf all` ловит эндпоинты из JS. Всегда `sort -u`/`anew` между ступенями. Большинство пассивных источников требуют API-ключей в конфиге.

**Эталон связки:** `subfinder -d target.com -all -silent | dnsx -silent | httpx -silent | nuclei -severity critical,high -silent`

**Источники.** ProjectDiscovery docs; OWASP Amass User Guide; SecLists; TomNomNom tools (gau/waybackurls/anew/getJS); Jason Haddix «The Bug Hunter's Methodology».
