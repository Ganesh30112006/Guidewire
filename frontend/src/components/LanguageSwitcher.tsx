import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "EN", fullLabel: "English" },
  { code: "hi", label: "हि", fullLabel: "हिंदी" },
] as const;

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const currentLang = i18n.language;

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/50 p-0.5" role="group" aria-label="Language selector">
      {LANGUAGES.map(({ code, label, fullLabel }) => (
        <button
          key={code}
          onClick={() => i18n.changeLanguage(code)}
          aria-label={`Switch to ${fullLabel}`}
          aria-pressed={currentLang === code || currentLang.startsWith(code + "-")}
          className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
            (currentLang === code || currentLang.startsWith(code + "-"))
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
