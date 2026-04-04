/**
 * i18n configuration — react-i18next with English (default) and Hindi.
 *
 * Usage in components:
 *   import { useTranslation } from "react-i18next";
 *   const { t } = useTranslation();
 *   <h1>{t("dashboard.title")}</h1>
 *
 * Switch language programmatically:
 *   import i18n from "@/i18n";
 *   i18n.changeLanguage("hi");
 *
 * Or use the <LanguageSwitcher /> component in the Navbar.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import hi from "./locales/hi.json";

const LANG_KEY = "giggo_lang";
let savedLang = "en";
try {
  savedLang = localStorage.getItem(LANG_KEY) ?? "en";
} catch {
  // localStorage may be unavailable (e.g. in some privacy modes)
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
  },
  lng: savedLang,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes values
  },
});

// Persist language preference
i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem(LANG_KEY, lng);
  } catch { /* storage unavailable */ }
  document.documentElement.lang = lng;
});

// Set initial lang attribute
document.documentElement.lang = savedLang;

export default i18n;
