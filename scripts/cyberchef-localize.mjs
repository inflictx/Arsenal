// Localize + theme the embedded CyberChef bundle for ARS3NAL.
// Re-runnable & idempotent. After updating the bundle in web/public/cyberchef,
// run:  node scripts/cyberchef-localize.mjs
//
// What it does to web/public/cyberchef/CyberChef_v11.2.0.html:
//   1. <html lang="en" class="classic">  ->  lang="ru" class="dark"
//   2. force dark theme in the inline theme-loader (so it can't fall back to classic)
//   3. inject <link href="ars-theme.css"> after main.css (our palette/font override)
//   4. translate the static UI chrome to Russian via bounded node/attr replacements
//      (icon-font ligatures, version hashes, URLs and internal <select> values are left alone)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ccDir = join(here, "..", "web", "public", "cyberchef");
const entry = readdirSync(ccDir).find((f) => /^CyberChef_v.*\.html$/.test(f));
if (!entry) { console.error("CyberChef_v*.html not found in", ccDir); process.exit(1); }
const file = join(ccDir, entry);
let html = readFileSync(file, "utf8");

// 1. lang + force dark theme class
html = html.replace('<html lang="en" class="classic">', '<html lang="ru" class="dark">');
// 2. theme-loader: persist theme=dark when nothing is saved yet, so main.js's
//    later options-init keeps the dark base (otherwise it falls back to classic).
//    Idempotent: the original one-liner only exists in a pristine bundle.
html = html.replace(
  'document.querySelector(":root").className=(JSON.parse(localStorage.getItem("options"))||{}).theme',
  'var _o=JSON.parse(localStorage.getItem("options"))||{};if(!_o.theme){_o.theme="dark";try{localStorage.setItem("options",JSON.stringify(_o))}catch(e){}}document.querySelector(":root").className=_o.theme'
);
// 3. inject our theme override after main.css
if (!html.includes("ars-theme.css")) {
  html = html.replace(
    '<link href="assets/main.css" rel="stylesheet">',
    '<link href="assets/main.css" rel="stylesheet"><link href="ars-theme.css" rel="stylesheet">'
  );
}
// 3b. inject runtime i18n (translates JS-rendered Bake button + category names)
if (!html.includes("ars-i18n.js")) {
  html = html.replace("</body>", '<script src="ars-i18n.js"></script></body>');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Visible text nodes:  >EN<  ->  >RU<   (whitespace-tolerant, whole-node match)
const TEXT = [
  ["Operations", "Операции"],
  ["Recipe", "Рецепт"],
  ["Input", "Ввод"],
  ["Output", "Вывод"],
  ["Bake!", "Выполнить!"],
  ["Auto Bake", "Автозапуск"],
  ["Step", "Шаг"],
  ["Options", "Опции"],
  ["About / Support", "О программе / Поддержка"],
  ["Download CyberChef", "Скачать CyberChef"],
  ["JavaScript is not enabled. Good luck.", "JavaScript отключён. Удачи."],
  // Save / Load recipe modals
  ["Save recipe", "Сохранить рецепт"],
  ["Load recipe", "Загрузить рецепт"],
  ["Recipe name", "Название рецепта"],
  ["Save your recipe to local storage using this name, or copy it to load later", "Сохраните рецепт в локальное хранилище под этим именем или скопируйте его, чтобы загрузить позже"],
  ["Save", "Сохранить"],
  ["Load", "Загрузить"],
  ["Done", "Готово"],
  ["Delete", "Удалить"],
  ["Cancel", "Отмена"],
  ["Close", "Закрыть"],
  ["Ok", "ОК"],
  ["Deep link", "Прямая ссылка"],
  ["Deep link:", "Прямая ссылка:"],
  ["Chef format", "Формат Chef"],
  ["Chef format:", "Формат Chef:"],
  ["Clean JSON", "Читаемый JSON"],
  ["Clean JSON:", "Читаемый JSON:"],
  ["Compact JSON", "Компактный JSON"],
  ["Compact JSON:", "Компактный JSON:"],
  ["Local storage:", "Локальное хранилище:"],
  ["Include recipe", "Включить рецепт"],
  ["Include input", "Включить ввод"],
  ["Load your recipe from local storage by selecting its name from the drop-down", "Загрузите рецепт из локального хранилища, выбрав его имя из списка"],
  ["Load your recipe by pasting it into this box", "Загрузите рецепт, вставив его в это поле"],
  // tabs
  ["Go to tab", "Перейти к вкладке"],
  ["Find tab", "Найти вкладку"],
  ["Close all tabs", "Закрыть все вкладки"],
  ["Find Input Tab", "Найти вкладку ввода"],
  ["Find Output Tab", "Найти вкладку вывода"],
  // statuses
  ["Load Status", "Статус загрузки"],
  ["Pending", "Ожидание"],
  ["Loading", "Загрузка"],
  ["Loaded", "Загружено"],
  ["Bake Status", "Статус выполнения"],
  ["Baking", "Выполняется"],
  ["Baked", "Готово"],
  ["Stale", "Устарело"],
  ["Errored", "Ошибка"],
  ["Filter (regex)", "Фильтр (regex)"],
  ["Content filter (regex)", "Фильтр содержимого (regex)"],
  ["Content", "Содержимое"],
  ["Filename", "Имя файла"],
  ["Number of results", "Количество результатов"],
  ["Results", "Результаты"],
  ["Refresh", "Обновить"],
  // Options modal
  ["Please note that these options will persist between sessions.", "Обратите внимание: эти настройки сохраняются между сессиями."],
  ["Theme (only supported in modern browsers)", "Тема (только в современных браузерах)"],
  ["Classic", "Классическая"],
  ["Dark", "Тёмная"],
  ["Solarized Dark", "Solarized тёмная"],
  ["Solarized Light", "Solarized светлая"],
  ["Console logging level", "Уровень логирования в консоль"],
  ["Silent", "Тихо"],
  ["Error", "Ошибки"],
  ["Warn", "Предупреждения"],
  ["Info", "Инфо"],
  ["Debug", "Отладка"],
  ["Trace", "Трассировка"],
  ["Update the URL when the input or recipe changes", "Обновлять URL при изменении ввода или рецепта"],
  ["Highlight selected bytes in output and input (when possible)", "Подсвечивать выбранные байты в выводе и вводе (когда возможно)"],
  ["Word wrap the input and output", "Переносить длинные строки во вводе и выводе"],
  ["Show errors from operations (recommended)", "Показывать ошибки операций (рекомендуется)"],
  ["Operation error timeout in ms (0 for never)", "Таймаут ошибки операции в мс (0 — никогда)"],
  ["Use meta key for keybindings (Windows ⊞/Command ⌘)", "Использовать meta-клавишу для сочетаний (Windows ⊞/Command ⌘)"],
  ["Attempt to detect encoded data automagically", "Пытаться автоматически распознавать закодированные данные"],
  ["Render a preview of the input if it's detected to be an image", "Показывать превью ввода, если это изображение"],
  ["Keep the current tab in sync between the input and output", "Синхронизировать активную вкладку между вводом и выводом"],
  ["Show the number of operations in each category", "Показывать число операций в каждой категории"],
  ["Reset options to default", "Сбросить настройки по умолчанию"],
  // Favourites modal
  ["Edit Favourites", "Изменить избранное"],
  ["To add:", "Чтобы добавить:"],
  ["drag the operation over the favourites category and drop it", "перетащите операцию в категорию «Избранное»"],
  ["To reorder:", "Чтобы переупорядочить:"],
  ["drag up and down in the list below", "перетаскивайте вверх/вниз в списке ниже"],
  ["To remove:", "Чтобы удалить:"],
  ["hit the delete button or drag out of the list below", "нажмите кнопку удаления или вытащите из списка ниже"],
  ["Reset favourites to default", "Сбросить избранное по умолчанию"],
  // help popovers (F1)
  ["The Operations list contains all the operations in CyberChef arranged into categories. Some operations may be present in multiple categories. You can search for operations using the search box.", "Список операций содержит все операции CyberChef, сгруппированные по категориям. Некоторые операции встречаются в нескольких категориях. Искать операции можно через поле поиска."],
  ["To use an operation, either double click it, or drag it into the Recipe pane. You will then be able to configure its arguments (or 'Ingredients' in CyberChef terminology).", "Чтобы использовать операцию, дважды кликните по ней или перетащите в панель «Рецепт». После этого можно настроить её аргументы (в терминологии CyberChef — «ингредиенты»)."],
  ["Use the search box to find useful operations.", "Используйте поле поиска, чтобы найти нужные операции."],
  ["Both operation names and descriptions are queried using a fuzzy matching algorithm.", "Поиск идёт и по названиям операций, и по описаниям, по алгоритму нечёткого совпадения."],
  ["The Recipe pane is where your chosen Operations are configured. If you are a programmer, think of these as functions. If you are not a programmer, these are like steps in a cake recipe. The Input data will be processed based on the Operations in your Recipe.", "В панели «Рецепт» настраиваются выбранные операции. Если вы программист — считайте их функциями. Если нет — это как шаги в кулинарном рецепте. Данные из «Ввода» обрабатываются операциями вашего рецепта."],
  ["To reorder, simply drag and drop the Operations into the order your require", "Чтобы изменить порядок — просто перетаскивайте операции"],
  ["To remove an operation, either double click it, or drag it outside of the Recipe pane", "Чтобы удалить операцию — дважды кликните по ней или вытащите за пределы панели «Рецепт»"],
  ["The arguments (or 'Ingredients' in CyberChef terminology) can be configured to change how an Operation processes the data.", "Аргументы (в терминологии CyberChef — «ингредиенты») настраивают, как операция обрабатывает данные."],
  ["The Step button allows you to execute one operation at a time, rather than running the whole Recipe from beginning to end.", "Кнопка «Шаг» выполняет операции по одной, а не весь рецепт целиком."],
  ["Step allows you to inspect the data at each stage of the Recipe and understand what is being passed to the next operation.", "Это позволяет осмотреть данные на каждом этапе рецепта и понять, что передаётся в следующую операцию."],
  ["If there are multiple Inputs, the Bake button causes every Input to be baked simultaneously.", "Если вводов несколько, кнопка «Выполнить» обрабатывает их все одновременно."],
  ["This includes:", "Сюда входит:"],
  ["Adding or removing operations", "Добавление или удаление операций"],
  ["Modifying operation arguments", "Изменение аргументов операций"],
  ["Editing the Input", "Редактирование ввода"],
  ["Changing the Input character encoding", "Смена кодировки символов ввода"],
  ["If there are multiple inputs, only the currently active tab will be baked when Auto-bake triggers. You can bake all inputs manually using the Bake button.", "Если вводов несколько, при автозапуске обрабатывается только активная вкладка. Все вводы можно обработать вручную кнопкой «Выполнить»."],
  ["This pane displays the results of the Recipe after it has processed your Input.", "В этой панели показывается результат работы рецепта над вашим вводом."],
  ["Output", "Вывод"],
  ["here", "здесь"],
  ["now!", "сейчас!"],
  // FAQ / About headings + short bits
  ["FAQs", "ЧаВо"],
  ["Report a bug", "Сообщить об ошибке"],
  ["About", "О программе"],
  ["Keybindings", "Горячие клавиши"],
  ["Yes", "Да"],
  ["No", "Нет"],
  ["What", "Что"],
  ["Why", "Почему"],
  ["How", "Как"],
  ["Who", "Кто"],
  ["Aim", "Цель"],
  ["Click here", "Нажмите здесь"],
  ["for an example.", "для примера."],
  ["Raise issue on GitHub", "Создать issue на GitHub"],
  ["Download ZIP file", "Скачать ZIP-файл"],
  ["The changelog for this version can be viewed", "Список изменений этой версии можно посмотреть"],
  ["Released under the Apache Licence, Version 2.0.", "Распространяется по лицензии Apache, версия 2.0."],
  ["Released under the Apache Licence, Version 2.0", "Распространяется по лицензии Apache, версия 2.0"],
  ["CyberChef - The Cyber Swiss Army Knife", "CyberChef — кибернетический швейцарский нож"],
];

// Attribute values (title / aria-label / placeholder):  ="EN"  ->  ="RU"
const ATTR = [
  ["Edit Favourites", "Изменить избранное"],
  ["Edit favourites", "Изменить избранное"],
  ["Downloading CyberChef", "Скачивание CyberChef"],
  ["Options and Settings", "Опции и настройки"],
  ["About / Support", "О программе / Поддержка"],
  ["Operations list", "Список операций"],
  ["Search...", "Поиск..."],
  ["Searching for operations", "Поиск операций"],
  ["Recipe pane", "Панель рецепта"],
  ["Hide arguments", "Скрыть аргументы"],
  ["Hiding every Operation's argument view in a Recipe", "Скрыть отображение аргументов всех операций в рецепте"],
  ["Save recipe", "Сохранить рецепт"],
  ["Saving a recipe", "Сохранение рецепта"],
  ["Load recipe", "Загрузить рецепт"],
  ["Loading a recipe", "Загрузка рецепта"],
  ["Clear recipe", "Очистить рецепт"],
  ["Clearing a recipe", "Очистка рецепта"],
  ["Step through the recipe", "Пошаговое выполнение рецепта"],
  ["Stepping through the Recipe", "Пошаговое выполнение рецепта"],
  ["Auto-bake", "Автозапуск"],
  ["Input pane", "Панель ввода"],
  ["Add new input tab", "Добавить вкладку ввода"],
  ["Add a new input tab", "Добавить новую вкладку ввода"],
  ["Tabs", "Вкладки"],
  ["Open folder as input", "Открыть папку как ввод"],
  ["Opening a folder", "Открытие папки"],
  ["Open file as input", "Открыть файл как ввод"],
  ["Opening a file", "Открытие файла"],
  ["Clear input and output", "Очистить ввод и вывод"],
  ["Clearing the Input and Output", "Очистка ввода и вывода"],
  ["Reset pane layout", "Сбросить раскладку панелей"],
  ["Resetting the pane layout", "Сброс раскладки панелей"],
  ["Output pane", "Панель вывода"],
  ["Save all outputs to a zip file", "Сохранить все выводы в zip-файл"],
  ["Saving all outputs to a zip file", "Сохранение всех выводов в zip-файл"],
  ["Save output to file", "Сохранить вывод в файл"],
  ["Saving output to a file", "Сохранение вывода в файл"],
  ["Copy raw output to the clipboard", "Скопировать вывод в буфер обмена"],
  ["Copying raw output to the clipboard", "Копирование вывода в буфер обмена"],
  ["copy content", "копировать содержимое"],
  ["Replace input with output", "Заменить ввод выводом"],
  ["Replacing input with output", "Замена ввода выводом"],
  ["Maximise output pane", "Развернуть панель вывода"],
  ["Maximising the Output pane", "Разворачивание панели вывода"],
  ["The output is stale. The input or recipe has changed since this output was generated. Bake again to get the new value.", "Вывод устарел: ввод или рецепт изменились после его генерации. Запустите выполнение снова, чтобы получить новый результат."],
  ["Staleness indicator", "Индикатор устаревания"],
  ["Loading animation", "Анимация загрузки"],
  ["FAQ pane", "Панель ЧаВо"],
];

// Keep "Recipe" in English everywhere it appears as a short label/tooltip
// (user found the RU "Рецепт" awkward). Explanatory prose stays translated.
const KEEP_EN = new Set([
  "Recipe", "Save recipe", "Load recipe", "Recipe name", "Recipe pane",
  "Saving a recipe", "Loading a recipe", "Clear recipe", "Clearing a recipe",
  "Hiding every Operation's argument view in a Recipe",
  "Step through the recipe", "Stepping through the Recipe",
]);

let textHits = 0, attrHits = 0, miss = [];
for (const [en, ru] of TEXT.filter(([e]) => !KEEP_EN.has(e))) {
  const re = new RegExp(">\\s*" + escapeRe(en) + "\\s*<", "g");
  const before = html;
  html = html.replace(re, ">" + ru + "<");
  if (html === before) miss.push("TEXT: " + en); else textHits++;
}
for (const [en, ru] of ATTR.filter(([e]) => !KEEP_EN.has(e))) {
  const needle = '="' + en + '"';
  if (html.includes(needle)) { html = html.split(needle).join('="' + ru + '"'); attrHits++; }
  else miss.push("ATTR: " + en);
}

writeFileSync(file, html, "utf8");
console.log(`localized ${entry}: text ${textHits}/${TEXT.length}, attr ${attrHits}/${ATTR.length}`);
if (miss.length) console.log("UNMATCHED (left English):\n  " + miss.join("\n  "));
