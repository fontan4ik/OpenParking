'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, LOCALE_LABELS, isLocale, translate, type Locale, type TranslationKey } from '@/lib/i18n';

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  formatNumber: (value: number) => string;
  formatDate: (value: unknown) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = 'parkingusa-locale';

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && isLocale(stored)) return stored;

  const browserLocale = window.navigator.language.slice(0, 2).toLowerCase();
  return isLocale(browserLocale) ? browserLocale : DEFAULT_LOCALE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = LOCALE_LABELS[locale].htmlLang;
    document.documentElement.dir = 'ltr';
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<LanguageContextValue>(() => {
    const dateFormatter = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const numberFormatter = new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US');

    return {
      locale,
      setLocale: setLocaleState,
      t: (key) => translate(locale, key),
      formatNumber: (value) => numberFormatter.format(value),
      formatDate: (value) => {
        if (typeof value !== 'string' || !value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.valueOf())) return value.slice(0, 10);
        return dateFormatter.format(date);
      },
    };
  }, [locale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
