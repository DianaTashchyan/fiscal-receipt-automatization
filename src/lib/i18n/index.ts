// ============================================================
// src/lib/i18n/index.ts
// Minimal dictionary-based i18n — English (default), Armenian, Russian.
// Usage: import { t } from '@/lib/i18n'; t('key', lang)
// ============================================================

export type Lang = "en" | "hy" | "ru";
export const SUPPORTED_LANGS: Lang[] = ["en", "hy", "ru"];
export const DEFAULT_LANG: Lang = "en";

const dict: Record<string, Record<Lang, string>> = {
  // ---- Nav ----
  "nav.dashboard":    { en: "Dashboard",     hy: "Վահանակ",        ru: "Панель" },
  "nav.restaurants":  { en: "Restaurants",   hy: "Ռեստորաններ",    ru: "Рестораны" },
  "nav.receipts":     { en: "Receipts",      hy: "Կտրոններ",       ru: "Чеки" },
  "nav.docs":         { en: "Instructions",  hy: "Հրահանգներ",     ru: "Инструкции" },
  "nav.logout":       { en: "Log out",       hy: "Դուրս գալ",      ru: "Выйти" },

  // ---- Common ----
  "common.save":      { en: "Save",          hy: "Պահպանել",       ru: "Сохранить" },
  "common.cancel":    { en: "Cancel",        hy: "Չեղարկել",       ru: "Отмена" },
  "common.delete":    { en: "Delete",        hy: "Ջնջել",          ru: "Удалить" },
  "common.edit":      { en: "Edit",          hy: "Խմբագրել",       ru: "Изменить" },
  "common.back":      { en: "Back",          hy: "Հետ",            ru: "Назад" },
  "common.next":      { en: "Next",          ru: "Далее",           hy: "Հաջorddob" },
  "common.loading":   { en: "Loading…",      hy: "Բեռնվում է…",    ru: "Загрузка…" },
  "common.error":     { en: "Error",         hy: "Սխalid",          ru: "Ошибка" },
  "common.success":   { en: "Success",       hy: "Հaջorghunakan",   ru: "Успешно" },
  "common.required":  { en: "Required",      hy: "Պartkadzir",      ru: "Обязательно" },
  "common.copy":      { en: "Copy",          hy: "Copy",            ru: "Копировать" },

  // ---- Restaurants ----
  "rest.new":         { en: "New restaurant",    hy: "Նor reeestoran",   ru: "Новый ресторан" },
  "rest.name":        { en: "Restaurant name",   hy: "Reeestoran",       ru: "Название" },
  "rest.tin":         { en: "TIN (ՀVHH)",        hy: "ՀVHH",             ru: "ИНН (ННОУ)" },
  "rest.crn":         { en: "CRN (ՀDM number)",  hy: "ՀDM hamared",      ru: "Номер ККМ" },
  "rest.address":     { en: "Address",           hy: "Haasce",           ru: "Адрес" },

  // ---- Onboarding wizard ----
  "wizard.title":     { en: "SRC Onboarding",    hy: "SRC Onboarding",   ru: "Подключение SRC" },
  "wizard.step1":     { en: "Company info",      hy: "Reeestoran",       ru: "Данные компании" },
  "wizard.step2":     { en: "Generate CSR",      hy: "CSR",              ru: "Создать CSR" },
  "wizard.step3":     { en: "Download & submit CSR", hy: "CSR download", ru: "Скачать и подать CSR" },
  "wizard.step4":     { en: "Upload certificate", hy: "Cert upload",     ru: "Загрузить сертификат" },
  "wizard.step5":     { en: "Test connection",   hy: "Test connection",  ru: "Тест подключения" },
  "wizard.step6":     { en: "Add cashier",       hy: "Ggandapahh",       ru: "Добавить кассира" },
  "wizard.step7":     { en: "Configure departments", hy: "Bazhinner",    ru: "Настроить отделы" },
  "wizard.step8":     { en: "Activate ECR",      hy: "Activation",       ru: "Активировать ЭКМ" },
  "wizard.step9":     { en: "Add products",      hy: "Apranqner",        ru: "Добавить товары" },
  "wizard.done":      { en: "Setup complete",    hy: "Avelaqned e",      ru: "Настройка завершена" },

  // ---- SRC status ----
  "src.connected":    { en: "SRC Connected",     hy: "SRC Kaaped",       ru: "SRC подключён" },
  "src.activated":    { en: "ECR Activated",     hy: "HDM Activated",    ru: "ЭКМ активирован" },
  "src.notActivated": { en: "ECR not activated", hy: "HDM not active",   ru: "ЭКМ не активирован" },
  "src.certOk":       { en: "Certificate OK",    hy: "Cert OK",          ru: "Сертификат OK" },
  "src.certMissing":  { en: "Certificate missing", hy: "Cert missing",   ru: "Сертификат отсутствует" },
};

/** Translate a key to the given language, falling back to English. */
export function t(key: string, lang: Lang = DEFAULT_LANG): string {
  const entry = dict[key];
  if (!entry) return key;
  return entry[lang] ?? entry.en ?? key;
}

/** Parse a lang string into a supported Lang, defaulting to English. */
export function parseLang(raw: string | null | undefined): Lang {
  if (raw === "hy" || raw === "ru") return raw;
  return "en";
}
