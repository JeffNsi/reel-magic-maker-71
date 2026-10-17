import { useEffect, useState } from "react";

// The project had no locale provider; shared bilingual lookup for the new film tools.
export function useLocale() {
  const [locale, setLocale] = useState<"en" | "sv">("en");
  useEffect(() => {
    if (localStorage.getItem("shortizereel_locale") === "sv") setLocale("sv");
  }, []);
  const changeLocale = (value: "en" | "sv") => {
    localStorage.setItem("shortizereel_locale", value);
    setLocale(value);
  };
  return {
    locale,
    setLocale: changeLocale,
    t: (en: string, sv: string) => (locale === "sv" ? sv : en),
  };
}
