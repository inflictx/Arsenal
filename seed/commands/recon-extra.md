# RECON — пассивная разведка и сбор URL

Пассивная разведка: собрать историю URL цели из публичных архивов, отсеять интересное и прогнать через DAST, не отправляя ни одного «шумного» запроса на сам сайт. Плюс нишевые трюки: IDN-гомоглифы для фишинга и быстрый мульти-сканер по списку URL.

## Wayback Machine CDX API — архивные URL без тулз
**Назначение:** вытащить все URL, которые архив web.archive.org видел у цели за годы: старые эндпоинты, забытые параметры, бэкап-файлы и дампы, выпавшие из текущего сайта.
**Установка:** ничего, только `curl` (CDX это открытый HTTP-API).
- `url=example.com/*` — все пути домена; `url=*.example.com/*` — включить поддомены; `url=https://example.com/admin/*` — только конкретный путь.
- `collapse=urlkey` — схлопнуть дубли; `output=text&fl=original` — вернуть только сами URL; `fl=original,statuscode` — добавить код ответа.
- `filter=original:.*\.(EXT)$` — оставить только нужные расширения; `filter=statuscode:(200|301|403)` — оставить коды; `filter=!statuscode:(404|500)` — исключить коды.
```bash
# Все архивные URL домена
curl -s 'https://web.archive.org/cdx/search/cdx?url=example.com/*&collapse=urlkey&output=text&fl=original' | sort -u
# Поддомены + только чувствительные файлы (конфиги, бэкапы, дампы, ключи)
curl -s 'https://web.archive.org/cdx/search/cdx?url=*.example.com/*&collapse=urlkey&output=text&fl=original&filter=original:.*\.(json|xml|sql|sqlite|db|bak|backup|old|zip|tar\.gz|env|git|config|yml|yaml|log|pem|key|crt)$' | sort -u
# Конкретный путь, оставить только осмысленные коды
curl -s 'https://web.archive.org/cdx/search/cdx?url=https://example.com/api/*&collapse=urlkey&output=text&fl=original&filter=statuscode:(200|301|302|403)'
```
**Tip:** найденные `.js` сразу гони на анализ секретов и эндпоинтов, а `.json/.env/.sql/.bak` проверяй на доступность сейчас (часто остаются на проде после редизайна).

## lostfuzzer (пассивный URL в nuclei DAST) — готовый пайплайн
**Назначение:** цепочка «собрать URL, оставить только с GET-параметрами, отсеять живые, прогнать DAST nuclei» одной строкой. Быстрый способ найти отражённые баги (XSS, SSRF, open redirect, SQLi) по историческим параметрам без ручного фаззинга. Идея и схема: coffinxp/LostSec (lostfuzzer).
**Установка тулз:** `gau`, `uro` (`pipx install uro`), `httpx` (ProjectDiscovery; в Kali бинарь зовётся `httpx-toolkit`), `nuclei`.
- Шаги: gau (сбор) -> `grep` URL с `?param=value` -> `uro` (схлопнуть однотипные) -> `httpx` (оставить живые, rate-limit) -> `nuclei -dast` (фаззинг параметров).
```bash
# Однострочный пайплайн по одному домену
gau example.com | grep -E '\?[^=]+=.+$' | uro | httpx -silent -rl 200 | nuclei -dast -retries 2 -silent -o nuclei_dast.txt
# По списку доменов
cat domains.txt | gau | grep -E '\?[^=]+=.+$' | uro | httpx -silent -rl 200 | nuclei -dast -silent
```
**Tip:** `nuclei -dast` гоняет fuzzing-шаблоны по `FUZZ`-точкам в параметрах; держи шаблоны свежими (`nuclei -update-templates`). Шаг шумный по цели, согласуй с правилами программы.

## IDN homograph / punycode — похожие домены для фишинга и ATO
**Назначение:** подобрать визуально неотличимые двойники домена или почты через Unicode-гомоглифы (кириллическая `а` вместо латинской `a`, греческая `ο` вместо `o`). Применяется в фишинге, обходе доменных фильтров и в account-takeover через нормализацию email (см. Payloads -> Account Takeover).
**Установка:** чистый Python 3 (`idna`/`punycode` встроены); для массовой генерации `pipx install dnstwist`.
- Любой Unicode-символ домена кодируется в ASCII-форму `xn--...` (punycode). Браузер и почтовик показывают «красивую» форму, а резолвится `xn--`.
```python
# Сгенерировать punycode-варианты гомоглифов для буквы
g = {'a': ['à','а','ɑ','ä'], 'e': ['е','é','ẹ'], 'o': ['о','ο','ö','օ'], 'i': ['і','í'], 'c': ['с','ϲ']}
for ch in g['a']:
    try: print(ch, '->', ch.encode('idna').decode())
    except Exception: print(ch, '->', 'xn--' + ch.encode('punycode').decode())
```
```bash
# Массово: сгенерить и проверить регистрацию двойников
dnstwist --registered example.com
```
**Tip:** для ATO ищи, где приложение нормализует или сравнивает email/username по Unicode, тогда двойник может схлопнуться в аккаунт жертвы. Альтернативы dnstwist: urlcrazy, ail-typo-squatting.

## loxs — мульти-сканер LFI / OR / XSS / SQLi / CRLF
**Назначение:** один интерактивный CLI-сканер на пять классов: Local File Inclusion, Open Redirect, XSS, SQLi (time-based) и CRLF. Кормишь список URL (например, отфильтрованный из gau/wayback), получаешь HTML-отчёт. Авторы: coffinxp и команда, лицензия BSD-3.
**Установка:** Python 3 + Chrome/chromedriver (для XSS-режима через Selenium).
```bash
git clone https://github.com/coffinxp/loxs.git && cd loxs
pip3 install -r requirements.txt
python3 loxs.py        # интерактивное меню: тип -> URL или файл -> payload-файл -> потоки
```
- На вход: один URL или файл с URL; свой payload-файл; критерий успеха (строка-маркер в ответе); число потоков.
- XSS-режим поднимает headless Chrome и ловит срабатывание `alert()`, поэтому нужен установленный chromedriver.
**Tip:** loxs хорош как быстрый первый проход по куче URL, но даёт false positives, подтверждай находки руками. Для серьёзного SQLi бери sqlmap/ghauri, для XSS бери dalfox (см. Commands -> WEB).
