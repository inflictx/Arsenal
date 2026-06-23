/* ARS3NAL runtime i18n for embedded CyberChef.
   Translates ONLY the JS-rendered chrome labels + category names that the
   static HTML pass can't reach (Bake button, Step, Auto Bake, the left
   category list). Operation names are intentionally left in English — they
   are technical terms and CyberChef matches them internally for search and
   recipe drag/drop, so renaming them would break functionality.
   Whole-text-node, dictionary-keyed, idempotent; a MutationObserver re-applies
   as CyberChef rebuilds the UI. */
(function () {
  "use strict";
  var DICT = {
    "Bake!": "Выполнить!",
    "Step": "Шаг",
    "Auto Bake": "Автозапуск",
    // operation categories (display only)
    "Favourites": "Избранное",
    "Data format": "Форматы данных",
    "Encryption / Encoding": "Шифрование / Кодирование",
    "Public Key": "Открытый ключ",
    "Arithmetic / Logic": "Арифметика / Логика",
    "Networking": "Сети",
    "Language": "Языки и кодировки",
    "Utils": "Утилиты",
    "Date / Time": "Дата / Время",
    "Extractors": "Извлечение данных",
    "Compression": "Сжатие",
    "Hashing": "Хеширование",
    "Code tooling": "Работа с кодом",
    "Forensics": "Форензика",
    "Multimedia": "Мультимедиа",
    "Other": "Прочее",
    "Flow control": "Управление потоком"
  };
  function apply() {
    try {
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var n, hits = [];
      while ((n = w.nextNode())) {
        var t = n.nodeValue.trim();
        if (t && DICT[t]) hits.push(n);
      }
      // changing nodeValue is a characterData mutation, not childList -> no observer loop
      for (var i = 0; i < hits.length; i++) {
        hits[i].nodeValue = hits[i].nodeValue.replace(hits[i].nodeValue.trim(), DICT[hits[i].nodeValue.trim()]);
      }
    } catch (e) { /* ignore */ }
  }
  function start() {
    if (!document.body) { setTimeout(start, 100); return; }
    apply();
    new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
    setTimeout(apply, 800);
    setTimeout(apply, 2500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
