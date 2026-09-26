import { strings } from "./strings.js";
import { load, save } from "./storage.js";

const listeners = new Set();

let lang = load("arcade.lang", null) ?? (navigator.language?.startsWith("ar") ? "ar" : "en");
if (!strings[lang]) lang = "ar";

export function getLang() {
  return lang;
}

export function t(key, vars) {
  let text = strings[lang][key] ?? strings.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, value);
  }
  return text;
}

export function applyTranslations(root = document) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  for (const el of root.querySelectorAll("[data-t]")) el.textContent = t(el.dataset.t);
  for (const el of root.querySelectorAll("[data-t-label]")) el.setAttribute("aria-label", t(el.dataset.tLabel));
  for (const el of root.querySelectorAll("[data-t-placeholder]")) el.placeholder = t(el.dataset.tPlaceholder);
  const title = document.querySelector("title[data-t]");
  if (title) document.title = t(title.dataset.t);
}

export function setLang(next) {
  lang = next;
  save("arcade.lang", lang);
  applyTranslations();
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn) {
  listeners.add(fn);
}
