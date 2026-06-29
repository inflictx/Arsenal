# Web/API Security: исследовательский справочник (2025-2026)

> Парный документ к `operational.md`. Здесь — «зачем и откуда»: impact, актуальные техники 2025-2026, свежие CVE, ссылки на первоисточники. Чек-листы «иду и отмечаю» — в `operational.md`.
> Пояснения на русском; payloads, команды, имена инструментов, заголовки и параметры — техническими как есть.

## TL;DR
- **Самый высокий ROI в 2025-2026 — API-логика и desync, а не классический reflected XSS.** Крупнейшие выплаты: HTTP Request Smuggling ($5K-$30K+; суммарные выплаты по исследованию «HTTP/1.1 Must Die» >$350K), Account Takeover ($1K-$20K), облачный SSRF ($1K-$15K), цепочки BOLA/IDOR + Mass Assignment в API.
- **«Старые» классы возродились на новом инструментарии:** single-packet attack сделал race conditions массово эксплуатируемыми; PHP filter chains и cnext превращают любой LFI в RCE; GadgetBuilder (NordSec 2025) вернул 17 цепочек ysoserial на Java 16+; algorithm-confusion в JWT даёт кластер свежих CVE.
- **Защитные механизмы обходятся системно:** DOMPurify (mXSS), SameSite cookies (окно Lax+POST 120 с, client-side redirect-гаджеты), WAF (JSON-based SQLi, Ghost Bits Unicode), IMDSv2 (DNS rebinding / TOCTOU).

---

## 1. Methodology and Resources (методология, не отдельная уязвимость)

Практический вывод сообщества: большинство выплат выше $5K приходит на API (BOLA/IDOR, broken auth, mass assignment, excessive data exposure), а не на reflected XSS в контактных формах — API напрямую раскрывают бизнес-логику, имеют слабую авторизацию и скрытые/shadow-эндпоинты.

**Авторитетные источники для базы знаний:** PayloadsAllTheThings (`github.com/swisskyrepo/PayloadsAllTheThings`), PortSwigger Web Security Academy + PortSwigger Research, HackTricks (`book.hacktricks.xyz`), OWASP (WSTG, Cheat Sheets, ASVS, API Security Top 10 2023), раскрытые отчёты HackerOne/Bugcrowd.

**Ориентир рыночных выплат (2025-2026, сводные данные сообщества):** IDOR/BOLA $500-$5K, SSRF $1K-$15K, Account Takeover $1K-$20K, HTTP Request Smuggling $5K-$30K, SSTI $2K-$10K, SAML/SSO $2K-$20K.

---

## 2. SQL Injection

SQLi почти 20 лет держится в OWASP Top (№1 или №3) и продолжает приводить к крупным брешам.

**CVE-2025-1094** (PostgreSQL, обнаружена principal researcher Stephen Fewer из Rapid7, CVSS 8.1; PostgreSQL пропатчил 13 февраля 2025 — версии 17.3/16.7/15.11/14.16/13.19) использовалась в атаке на BeyondTrust Remote Support: пострадали 17 SaaS-инстансов и Министерство финансов США через украденный API-ключ (атрибуция — китайская группа Silk Typhoon). По словам Fewer, успешный эксплойт CVE-2024-12356 обязан был включать эксплуатацию CVE-2025-1094 для достижения RCE — то есть SQLi была обязательным звеном цепочки.

**Ключевая техника обхода WAF — JSON-based SQLi** (Claroty Team82, Noam Moshe, Black Hat Europe 2022), через JSON-оператор `'@<`. Crux: крупные WAF-вендоры годами не поддерживали JSON-синтаксис, хотя движки БД поддерживали его десятилетие. Подтверждена против Palo Alto Networks, AWS, Cloudflare, F5 и Imperva (все пять выпустили патчи); поддержка добавлена в sqlmap. В 2025-2026 актуальны blind/time-based варианты, обход ORM и адаптивные tamper-скрипты под конкретное поведение WAF.

---

## 3. Cross-Site Scripting (XSS)

Передний край 2025-2026 — клиентские техники, невидимые для WAF, инспектирующего HTTP-трафик (DOM-based payload существует только в JS-контексте браузера).

- **Mutation XSS (mXSS) против DOMPurify.** PortSwigger продемонстрировал обход через `<math><mtext><table><mglyph><style><!--</style><img title="-->...">` (запутывание HTML-парсера через комментарии/namespace). Связанный идентификатор — **CVE-2025-26791** (DOMPurify mXSS bypass).
- **DOM clobbering.** **CVE-2025-1647** — XSS в Bootstrap 3 (Tooltip/Popover, `data-html="true"`) через обход `sanitizeHtml` посредством DOM clobbering (исправлено в NES for Bootstrap v3.4.7; Bootstrap 3 EOL). PortSwigger показал и CSP-bypass через clobbering (`codeBasePath` → `script.src`).
- Google Bug Hunters (май 2025) описал, как экранирование `<`/`>` в атрибутах при сериализации DOM защищает от mXSS — полезно для понимания корневой причины.

---

## 4. Server-Side Request Forgery (SSRF)

IMDSv2 требует PUT-запрос для токена и кастомный заголовок, что блокирует большинство «простых» SSRF — но обходы остаются:

- **DNS rebinding / TOCTOU.** В Craft CMS DNS-резолвинг для валидации выполнялся отдельно от самого HTTP-запроса; **CVE-2025-68437** (GHSA-x27p-wfqw-hfcc) и последующий bypass (GHSA-gp2f-7wcm-5fhx) позволяли обойти защиту metadata для всех заблокированных IP.
- **Рендеры контента как вектор.** **CVE-2025-51591** — SSRF в pandoc через `<iframe src="http://169.254.169.254/...">` при HTML→PDF без `--sandbox`/`raw_html`. В разборе Wiz атака была нейтрализована именно enforcement IMDSv2 (stateless GET от iframe отклонялся), но при IMDSv1 это привело бы к компрометации.
- **Реальная кампания.** F5 Labs зафиксировал в марте 2025 четырёхдневную волну эксплуатации EC2 IMDS через SSRF (стартовые IP `193.41.206.x`, один ASN).
- По Wiz Cloud Data Security Report 2025, 35% облачных окружений имеют compute-ассеты, одновременно раскрывающие чувствительные данные и несущие критичные/высокие уязвимости — SSRF в такой «токсичной комбинации» превращается в полноценную брешь (ср. Capital One, 2019).

**Облачные эндпоинты (справочно):** AWS `http://169.254.169.254/latest/meta-data/iam/security-credentials/`; GCP `http://metadata.google.internal/computeMetadata/v1/` (`Metadata-Flavor: Google`); Azure `http://169.254.169.254/metadata/instance` (`Metadata: true`); EKS Pod Identity `http://169.254.170.23/...`.

---

## 5. Server-Side Template Injection (SSTI)

Свежие исследования:

- **YesWeHack / Brumens, «Limitations are just an illusion – advanced server-side template exploitation with RCE everywhere» (24 марта 2025)** — RCE без кавычек и внешних плагинов, только за счёт нативных функций движков (`chr` в Jinja2; модификаторы в Smarty; `array_map`+`implode`+`chr` в Blade Laravel). Снимает проблему авто-экранирования/HTML-escape.
- **Vladislav Korchagin, «Successful Errors: New Code Injection and SSTI Techniques» (3 января 2026)** — error-based и boolean-based техники для blind-детекта и blind-эксфильтрации, когда вывод не рендерится, но ошибки видны.
- Полиглот-детект и идентификация движка через **Hackmanit Template Injection Table** (44 движка) — самый эффективный первый шаг; текст ошибки часто выдаёт движок и версию.

---

## 6. Insecure Direct Object References (IDOR / BOLA)

№1 в OWASP API Security Top 10 (как BOLA). Концептуально прост, но крайне распространён даже в зрелых приложениях; типовая выплата $500-$5K, высокий риск дубликатов (простой баг находят несколько хантеров за вечер) — поэтому ценность в **chaining** (IDOR + mass assignment → ATO: установить `"password"` на чужой профиль; IDOR на billing-эндпоинте).

IOC для защиты — последовательный перебор ID одним источником. Распространённые ошибки хантеров: тестировать только свои данные (нельзя доказать IDOR без второго аккаунта) и останавливаться на 403 (часть из них клиентские — повторять без отдельных заголовков).

---

## 7. Cross-Site Request Forgery (CSRF)

Современные обходы SameSite (PortSwigger Web Security Academy):

- **Базис Lax:** браузер шлёт cookie в cross-site запросе только если это `GET` И top-level navigation. С 2021 Chrome применяет Lax-by-default при отсутствии явного атрибута.
- **Top-level GET bypass:** если сервер не различает GET/POST — `<script>document.location='https://site/account/transfer?recipient=hacker&amount=1000000'</script>`.
- **Окно 120 секунд (Lax+POST mitigation):** чтобы не ломать SSO, Chrome не применяет ограничения первые 120 секунд для top-level POST. Точность: окно действует **только** для cookies без явного `SameSite` (Chrome default) и **не** применяется к cookies с явным `SameSite=Lax`. Это временная мера Chrome, которая может быть убрана.
- **Cookie-refresh gadget:** выдать жертве новый session cookie (например через OAuth/SSO) прямо перед атакой, чтобы попасть в окно; popup-обход `window.onclick=()=>window.open('https://site/login/sso')`.
- **Sibling/sub-domain + отдельная уязвимость:** SameSite keyed на eTLD+1, поэтому XSS на любом sibling-субдомене компрометирует site-based защиту целиком (cross-origin может быть same-site, но не наоборот); сюда же CSWSH.
- **Client-side redirect gadget:** обходит даже `SameSite=Strict` — для браузера клиентские редиректы вообще не редиректы, запрос считается same-site и несёт все cookies. С server-side redirect это **не** работает.
- **Method override:** Symfony `_method=POST` в форме `method="GET"` (на проводе GET → условие Lax выполнено, фреймворк роутит как POST): `GET /my-account/change-email?email=...&_method=POST`.

---

## 8. Command Injection

CWE-78 присутствует в CWE Top 25 каждый год 2019-2025; в редакции 2025 добавлен сопутствующий **CWE-88 (Argument Injection)**. Большинство подтверждённо эксплуатируемых записей CISA KEV для CWE-78 — unauthenticated remote: **CVE-2024-3400** (PAN-OS), **CVE-2023-28771** (Zyxel), **CVE-2014-6271** (Shellshock). Наибольшая концентрация — сетевые устройства (firewalls, VPN, switches) и IoT/embedded.

Поучительный кейс некорректной санитизации — **CVE-2023-29084** (ManageEngine ADManagerPlus): escaping не обрабатывал CRLF, и payload `[any]\r\ncalc.exe` в пароле давал инъекцию — иллюстрация, почему блек-лист/escaping ненадёжны. Blind-детект: time-delays (`sleep 10`) или DNS-callback на сервер атакующего (OAST).

---

## 9. File Inclusion (LFI/RFI) и Directory Traversal

- **PHP filter chains (Synacktiv)** — превращают любой arbitrary file read в RCE без `allow_url_include` через цепочку `convert.iconv.*`/`base64`. Инструмент **Lightyear** строит альтернативные base64-наборы и чейнит «прыжки», позволяя выгружать большие файлы через GET-параметры без PHP-warnings.
- **cnext-exploits (cfreal)** — эксплуатация переполнения буфера в glibc `iconv` через PHP filter chain (`convert.iconv.UTF-8.ISO-2022-CN-EXT`) → RCE без writable-путей и log poisoning.
- **Ghost Bits (2025)** — обход WAF-блокировки traversal для Java-стека (Spring **CVE-2025-41242**, Jetty `%2>` hex-folding) подменой ASCII на Unicode-омоглифы (`.`→U+962E, `/`→U+962F).
- **Zip Slip / Tar Slip** — **CVE-2024-57726** (SimpleHelp): загруженные admin-ом ZIP с `../`-записями пишут вне корня извлечения; внесена в CISA KEV в январе 2025. **CVE-2024-13059** (AnythingLLM via multer) — Node-пример path-traversal.
- `phar://` deserialization (Sam Thomas, BH USA 2018) актуальна в 2024-2026: любой FS-вызов (`file_exists`, `getimagesize`) на `phar://`-URL триггерит unserialize метаданных → RCE через gadget chain (в т.ч. polyglot phar-в-JPG).

---

## 10. XXE Injection

Современный XXE «живёт» в SSO-, document-conversion- и feed-парсинге, где XML-парсер вызывается косвенно (резюме-парсеры, e-signature-рендеры, headless-рендеры, RSS — ср. «From RSS to XXE» на Hootsuite).

Рабочие подходы 2025: SVG-`xlink:href` fetch там, где general-entity expansion отключён (`<image xlink:href="file:///etc/passwd">`); JSON→XML pivot на эндпоинтах с авто-определением content-type; error-based эксфильтрация при заблокированных OOB-соединениях через смешение internal/external DTD. Blind XXE можно использовать и как SSRF для внутренней разведки. SAML: DOCTYPE до подписанных элементов (подпись покрывает не весь документ).

---

## 11. Insecure Deserialization

`ysoserial` не обновлялся с 2021, что снижало покрытие на новых JDK. **GadgetBuilder** (Kreyssig, Houy, Zhang, Riom & Bartel, «GadgetBuilder: An Overhaul of the Greatest Java Deserialization Exploitation Tool», NordSec 2025, Tartu, 12-13 ноября 2025) объединяет 31 главную цепочку Ysoserial с 29 из других источников, доводя эффективное число цепочек до 303, и возвращает к жизни 17 цепочек на Java 16+ (разбивая построение на три фрагмента) — расширяя поверхность против deserialization-фильтров.

Свежие CVE: **CVE-2025-24813** (Apache Tomcat), **CVE-2025-40551** (SolarWinds Web Help Desk). Практика: `TemplatesImpl.getOutputProperties()` и outbound JNDI — классические sink'и; на Java 17 цепочки иногда работают, если в wrapper-скрипте уже есть `--add-opens`; `CommonsCollections6` надёжен (пропатчен в commons-collections 3.2.2), `C3P0`/`CommonsBeanutils1` — частые находки. Для blind-подтверждения универсален `URLDNS` (работает на любой версии Java).

---

## 12. JSON Web Token (JWT)

Algorithm confusion существует с 2015 (`none`-bypass), но новые CVE появляются ежегодно, потому что «удобные» API библиотек (`jwt.verify(token, key)` без указания алгоритма) по умолчанию доверяют header токена. Кластер 2025-2026:

- **CVE-2025-4692** — algorithm confusion на облачной платформе (несанкционированное создание токенов).
- **CVE-2026-34950** (fast-jwt, CVSS 9.1) — «incomplete fix» прежней проблемы: regex-проверка публичного ключа использовала якорь `^`, и **leading whitespace** (пробел/таб/newline) ломал распознавание RSA-ключа, заново открывая algorithm confusion (как CVE-2023-48223). Реальные триггеры: PostgreSQL/MySQL text-колонки с ведущим newline, YAML multiline, copy-paste.
- **CVE-2026-22817 / CVE-2026-27804 / CVE-2026-23552** — кластер Q1 2026 (в т.ч. усиленный вариант `none`).

Современные версии крупных библиотек дефолтно безопасны или требуют явного алгоритма — критичен аудит дерева зависимостей.

---

## 13. OAuth Misconfiguration

- **Pre-account takeover** — самый частый паттерн (P2 на Bugcrowd): атакующий регистрирует аккаунт на email жертвы (без верификации), а при OAuth-входе жертвы системы «сливаются» без проверки владения email → атакующий сохраняет доступ, может сменить primary email/включить 2FA.
- **Identity injection / mutable email:** «Login with Microsoft/Facebook» по полю `email` (user-controlled, в отличие от immutable `sub`/Object ID) — атакующий создаёт свою AD-организацию/аккаунт без email и подставляет чужой email.
- **Authorization-code swap:** если эндпоинт code→token не проверяет issuing client/redirect/nonce, украденный code из любого приложения апгрейдится до first-party токена.
- **CVE-2025-6514** (mcp-remote ≤0.1.15, затрагивает Claude Desktop/Cursor/Windsurf): вредоносный MCP-сервер возвращает атакующий `authorization_endpoint` (например `file:/c:/windows/system32/calc.exe`) в discovery → клиент передаёт его в системный URL-handler → RCE.
- Мобильный OAuth: custom URI scheme может быть перехвачен вредоносным приложением.

Базовый справочник — Doyensec «Common OAuth Vulnerabilities» (30 января 2025) с готовым чеклистом.

---

## 14. Account Takeover (ATO)

ATO — топ по выплатам ($1K-$20K) и почти всегда результат **цепочки**: pre-ATO через OAuth; IDOR + mass assignment (установить `"password"`/`"email"` на чужой профиль); JWT forge; утечка reset-токена через Referer/`Host`-header poisoning; password-reset poisoning. При репортинге критично показать полный PoC с захватом аккаунта другого пользователя, а не теоретическую возможность.

---

## 15. Business Logic Errors

Логические баги системно пропускаются code review и автосканерами, т.к. требуют понимания контекста. Типичные импакты: покупка дорогого товара за бесценок (race в checkout), бесконечные купоны, накрутка голосов, обход лимитов. Микросервисы, serverless и распределённые очереди делают взаимодействия с общим состоянием более хрупкими — плодородная почва в 2025-2026.

---

## 16. Race Condition

**Single-packet attack** (James Kettle, «Smashing the state machine», Black Hat USA 2023 / DEF CON 31): 20-30 HTTP/2-запросов завершаются одним TCP-пакетом, устраняя network jitter. Бенчмарк PortSwigger: медианный разброс ~1 мс (σ 0.3 мс) против ~4 мс (σ 3 мс) у traditional last-byte sync — улучшение точности в 4-10×.

**GMO Flatt Security (2025)** — «first sequence sync» обходит лимит ~1500 байт (и далее 65 535 байт TCP) через IP-фрагментацию и задержку первого фрагмента, что позволяет синхронизировать тысячи запросов (например для обхода rate-limit на числовой OTP). Концепция **sub-states** выводит атаки далеко за пределы limit-overrun (multi-step workflow flaws). Пример — **CVE-2023-6109**.

---

## 17. CORS Misconfiguration

Уязвимость почти всегда — следствие misconfiguration. Высокоимпактный сценарий: сервер динамически отражает `Origin` + `Access-Control-Allow-Credentials: true` → любой сайт читает данные залогиненного пользователя (PII, CSRF-токены). `null`-origin вайтлистится «для локальной разработки», но эксплуатируется через sandboxed iframe (`Origin: null`). Регулярки-проверки часто содержат неэкранированную `.` или проверяют только prefix/suffix.

Памятка PortSwigger CORS cheat sheet включает семейства payload'ов: domain allow-list bypass, fake-relative absolute URLs, loopback/IP-нормализации. Важно: CORS ≠ защита от CSRF; wildcard `*` на аутентифицированном API — полный обход same-origin policy.

---

## 18. Open Redirect

Сам по себе часто low-severity, но ценен в **цепочках**: client-side open redirect — гаджет для обхода `SameSite=Strict` CSRF (request трактуется как same-site standalone); кража OAuth `code`/токена через подмену `redirect_uri`; усиление SSRF (редирект с разрешённого хоста на `169.254.169.254`); фишинг с доверенного домена. DOM-based open redirection (источник `location`/`location.hash` → сток `location.href`) — частый паттерн в современных SPA.

---

## 19. Request Smuggling (HTTP Desync)

**«HTTP/1.1 Must Die: The Desync Endgame» (James Kettle, PortSwigger, Black Hat USA / DEF CON 33, август 2025).** Корневая проблема: HTTP/1.1 имеет четыре способа задать длину сообщения — `CL`, `TE`, `0` (implicit-zero), `H2` — взаимодействие которых создаёт неоднозначность границ запросов. Новое:

- **0.CL desync** — ранее считался неэксплуатируемым: фронт игнорирует `Content-Length`, бэк учитывает, обычно → deadlock; Kettle ломает deadlock через **early-response gadget** (зарезервированные имена IIS `/con`, `/nul`).
- **Double-desync** — многошаговая конвертация 0.CL → CL.0 для отравления запроса жертвы.
- **Expect-based desync** («Expect complexity bomb») — через `Expect: 100-continue` (vanilla и обфусцированный `Expect: y 100-continue`); сабварианты 0.CL/CL.0 × vanilla/obfuscated; также bypass удаления response-заголовков и memory disclosure.
- **Parser-discrepancy detection (V-H / H-V)** — классификация Visible-Hidden / Hidden-Visible Host-заголовка; ядро детекции в **HTTP Request Smuggler v3.0**. Цитата автора: open-source-тулкит для систематической детекции parser discrepancies в связке с техниками дал >$200,000 выплат за две недели. Подозрительные ответы помечаются как «Mystery 400» («probably all exploitable»).

**Затронутые вендоры (из whitepaper):** Cloudflare — внутренний HTTP/1.1 desync, экспозиция >24,000,000 сайтов к полному захвату (патч за часы, bounty $7,000); Akamai — CL.0 через obfuscated Expect (затрагивал `auth.lastpass.com`), **CVE-2025-32094**, суммарно 74 выплаты на $221,000, Kettle получил $9,000; Netlify, T-Mobile (staging, $12,000), GitLab ($7,000), LastPass ($5,000), AWS ALB + IIS (AWS решил не патчить).

**Поддерживают upstream HTTP/2:** HAProxy, F5 Big-IP, Google Cloud, Imperva, Apache (экспериментально). **Не поддерживают:** nginx, Akamai, CloudFront, Fastly. Общая сумма выплат по исследованию — чуть более $350,000. Вывод автора: HTTP/2+ решает угрозу; для безопасного веба HTTP/1.1 должен умереть.

> Примечание по источнику: заявление Fastly об устойчивости к этим атакам — самооценка вендора (блог Fastly), а не находка Kettle.

---

## 20. GraphQL Injection

Единый эндпоинт раскрывает весь граф данных; гибкость языка создаёт поверхности, которых нет в REST. Introspection в проде «дарит» атакующему полную схему, включая admin-поля, internal mutations и legacy-типы.

**Batching-атаки** (массив запросов) и **aliases** (даже при отключённом batching) обходят per-request rate limiting — прямой путь к brute force кредов и enumeration. DoS — через depth (рекурсивная вложенность взаимоссылающихся типов), aliasing (N копий дорогого резолвера) и batching (load bombs). Field-level authorization часто реализована неполно → BOLA/IDOR в мутациях. Рассматривай каждую public-функцию как интернет-эндпоинт.

---

## 21. NoSQL Injection

MongoDB-операторы `$ne`/`$gt`/`$regex`/`$where` — основа атак. Свежие CVE в Mongoose: **CVE-2024-53900** (top-level `$where` в `populate({match})`) и его bypass **CVE-2025-23061** (`$where` вложен под операторы вроде `$or`; исправлено в 6.0.1 валидацией формы селектора). Sensepost (2025) описал **error-based NoSQL injection** и техники избавления от pre/post-условий. `$where` исполняет JavaScript на сервере — даже частичная валидация опасна, безопаснее отключить scripting. Корень — приём и обработка ввода без санитизации, особенно при декодировании в generic maps.

---

## 22. Prototype Pollution

Эксплуатация двухэтапна: (1) загрязнить прототип; (2) сработать gadget (свойство, читаемое из прототипа и попадающее в опасный сток вроде `eval`/`script.src`).

- **PortSwigger «Widespread prototype pollution gadgets»** — гаджеты в Google Analytics/Google Tag Manager, завершающиеся в `eval`-стоке (`event_callback` → `setTimeout`); успешно эксплуатировались на крупных сайтах. Google считает это ответственностью клиента, не патчит источники.
- **CVE-2024-45801** (DOMPurify ≤3.0.8) — загрязнение `Node.prototype.after` до инициализации санитайзера → stored XSS; **CVE-2023-26136/26140** (jQuery `extend()` из `location.hash`); sanitize-html <2.8.1.
- Server-side (Node) → RCE через gadget chains: **GHunter** (CVE-2023-31414) и **Dasty** (CVE-2023-31415, critical 9.9, RCE). Систематическая митигация гаджетов остаётся открытой проблемой.

---

## 23. Mass Assignment

Возникает при автобиндинге входного JSON/form прямо на backend-модель: при регистрации шлёшь `username`/`password`, но модель содержит `role`/`is_admin`/`balance`, и если разработчик не ограничил поля — лишние принимаются и пишутся в БД. Часто бесшумно (нет видимой ошибки). API3:2023 (BOPLA) в OWASP API Security Top 10.

Главная ценность — **chain с IDOR** для ATO (установить `password`/`email` на чужом объекте) или мгновенное privilege escalation (`"role":"admin"`). При тестировании сначала добавляй фейковое поле — если ответ не меняется, вероятно есть фильтр; затем пробуй реальные поля и вариации.

---

## 24. Web Cache Deception / Poisoning

Martin Doyhenard / PortSwigger «Gotta cache 'em all: bending the rules of web cache exploitation» (Black Hat USA 2024): техники **Static Path Deception** (полная компрометация конфиденциальности) и **Cache Key Confusion** через parser-discrepancy URL, воспроизводимые на дефолтных конфигах **Nginx за Cloudflare** и **Apache за CloudFront**, а также на Microsoft Azure.

Идея: если делимитер (например `$`) трактуется по-разному origin'ом и прокси, ответ к `/myAccount` сохраняется под ключом «статичного» пути и читается атакующим. Для cache poisoning отдельный класс — отравление через unkeyed-входы (заголовки), см. PortSwigger «Practical Web Cache Poisoning» (инструмент Param Miner).

---

## Caveats (важно перед использованием в отчётах)

- **Свежие CVE 2026 года** (CVE-2026-34950 fast-jwt, CVE-2026-22817/27804/23552, CVE-2026-0545 MLflow, CVE-2026-27127 Craft TOCTOU и др.) частично взяты из агрегаторов и AI-ассистированных сводок (TheHackerWire, securityonline.info, dev.to). Перед использованием сверяйте детали с NVD / GitHub Security Advisories — нумерация и статус могли измениться.
- **Заявление Fastly** об устойчивости к desync-атакам Kettle — самооценка вендора, не независимо подтверждённая находка.
- **Окно 120 с (Lax+POST)** применяется только к cookies без явного `SameSite` (Chrome default) и является временной мерой Chrome, которая может быть убрана/сокращена.
- **Числовые выплаты** (>$350K, $221K по Akamai) приведены по первоисточнику (PortSwigger whitepaper) и иллюстрируют импакт, а не гарантируют выплаты в конкретной программе.
- Часть payload'ов и техник (PHP filter chains RCE, cnext, ysoserial/GadgetBuilder, single-packet race) **разрушительны/нагрузочны** — только в рамках авторизованного scope; многие программы запрещают DoS и mass account creation.
- Эти 24 — приоритетные категории; оставшиеся из 64 PayloadsAllTheThings (CRLF, SSI/ESI, XSLT, LDAP, XPath, SAML Injection, Web Sockets/CSWSH, Clickjacking, CSPT, Dependency Confusion, Prompt Injection/LLM, ReDoS, Type Juggling, Upload Insecure Files, Virtual Hosts, XS-Leaks, Zip Slip и др.) разобраны в части 2.

---

## Ключевые источники

- **PayloadsAllTheThings** — github.com/swisskyrepo/PayloadsAllTheThings
- **PortSwigger Research — HTTP/1.1 Must Die** — portswigger.net/research/http1-must-die
- **PortSwigger — Bypassing SameSite cookie restrictions** — portswigger.net/web-security/csrf/bypassing-samesite-restrictions
- **PortSwigger — Race conditions** — portswigger.net/web-security/race-conditions
- **GMO Flatt Security — first sequence sync** — flatt.tech/research/posts/beyond-the-limit-expanding-single-packet-race-condition-with-first-sequence-sync/
- **Claroty Team82 — JSON-based SQLi / WAF bypass** — claroty.com/team82/research/js-on-security-off-abusing-json-based-sql-to-bypass-waf
- **The Register — PostgreSQL CVE-2025-1094 / Treasury** — theregister.com/2025/02/14/postgresql_bug_treasury/
- **Craft CMS SSRF bypass advisory** — github.com/craftcms/cms/security/advisories/GHSA-gp2f-7wcm-5fhx
- **F5 Labs — EC2 IMDS SSRF campaign** — f5.com/labs/articles/campaign-targets-amazon-ec2-instance-metadata-via-ssrf
- **Wiz — SSRF academy** — wiz.io/academy/application-security/server-side-request-forgery
- **GadgetBuilder (NordSec 2025)** — dl.acm.org/doi/10.1007/978-3-032-14782-0_11
- **HackTricks — NoSQL injection** — book.hacktricks.xyz/pentesting-web/nosql-injection
