'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageProvider';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n';
import { FlagIcon } from '@/components/FlagIcon';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'openparking-theme';
const HERO_VIDEO_SOURCES: Record<ThemeMode, string> = {
  dark: '/hero/openparking-hero-dark.mp4',
  light: '/hero/openparking-hero-light.mp4',
};
const HERO_VIDEO_PLAYBACK_RATE = 0.78;

function syncHeroVideoSpeed(video: HTMLVideoElement) {
  video.playbackRate = HERO_VIDEO_PLAYBACK_RATE;
}

function ThemeSwitch({ theme, onChange, label }: { theme: ThemeMode; onChange: (theme: ThemeMode) => void; label: string }) {
  return (
    <label className="theme-switch" aria-label={label} title={label}>
      <input
        className="theme-switch__checkbox"
        type="checkbox"
        checked={theme === 'dark'}
        onChange={(event) => onChange(event.target.checked ? 'dark' : 'light')}
      />
      <span className="theme-switch__container" aria-hidden="true">
        <span className="theme-switch__clouds" />
        <span className="theme-switch__stars-container">
          <svg viewBox="0 0 144 55" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M135.831 3.00688C135.055 3.85027 134.111 4.29946 133 4.35447C134.111 4.40947 135.055 4.85867 135.831 5.71123C136.607 6.55462 136.996 7.56303 136.996 8.72727C136.996 7.56303 137.384 6.55462 138.16 5.71123C138.936 4.85867 139.88 4.40947 141 4.35447C139.88 4.29946 138.936 3.85027 138.16 3.00688C137.384 2.15432 136.996 1.14591 136.996 0C136.996 1.14591 136.607 2.15432 135.831 3.00688Z" fill="currentColor" />
            <path d="M31 23.3545C32.1114 23.2995 33.0551 22.8503 33.8313 21.9977C34.6075 21.1543 34.9956 20.1459 34.9956 19C34.9956 20.1459 35.3837 21.1543 36.1599 21.9977C36.9361 22.8503 37.8798 23.2995 39 23.3545C37.8798 23.4095 36.9361 23.8587 36.1599 24.7112C35.3837 25.5546 34.9956 26.563 34.9956 27.7273C34.9956 26.563 34.6075 25.5546 33.8313 24.7112C33.0551 23.8587 32.1114 23.4095 31 23.3545Z" fill="currentColor" />
            <circle cx="76" cy="17" r="2" fill="currentColor" />
            <circle cx="99" cy="38" r="2" fill="currentColor" />
          </svg>
        </span>
        <span className="theme-switch__circle-container">
          <span className="theme-switch__sun-moon-container">
            <span className="theme-switch__moon">
              <span className="theme-switch__spot" />
              <span className="theme-switch__spot" />
              <span className="theme-switch__spot" />
            </span>
          </span>
        </span>
      </span>
    </label>
  );
}

export default function LandingPage() {
  const { locale, setLocale, t } = useLanguage();
  const darkVideoRef = useRef<HTMLVideoElement | null>(null);
  const lightVideoRef = useRef<HTMLVideoElement | null>(null);
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [isThemeReady, setIsThemeReady] = useState(false);

  useEffect(() => {
    [darkVideoRef.current, lightVideoRef.current].forEach((video) => {
      if (video) syncHeroVideoSpeed(video);
    });
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    setThemeState(stored === 'light' || stored === 'dark' ? stored : 'dark');
    setIsThemeReady(true);
  }, []);

  useEffect(() => {
    if (!isThemeReady) return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [isThemeReady, theme]);

  const handleThemeChange = (nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  };

  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-video-stage" aria-hidden="true">
          <video
            ref={darkVideoRef}
            className={`landing-hero-video ${theme === 'dark' ? 'is-active' : ''}`}
            src={HERO_VIDEO_SOURCES.dark}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onLoadedMetadata={(event) => syncHeroVideoSpeed(event.currentTarget)}
            onPlay={(event) => syncHeroVideoSpeed(event.currentTarget)}
          />
          <video
            ref={lightVideoRef}
            className={`landing-hero-video ${theme === 'light' ? 'is-active' : ''}`}
            src={HERO_VIDEO_SOURCES.light}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onLoadedMetadata={(event) => syncHeroVideoSpeed(event.currentTarget)}
            onPlay={(event) => syncHeroVideoSpeed(event.currentTarget)}
          />
        </div>
        
        <header className="landing-header">
          <nav className="landing-nav" aria-label="OpenParking">
            <Link className="landing-brand" href="/">
              <img 
                src="/brand/openparking-mark.svg" 
                className="landing-logo-img" 
                alt="OpenParking" 
                width="42" 
                height="42" 
              />
              <span>OpenParking</span>
            </Link>
            
            <div className="landing-nav-actions">
              <ThemeSwitch
                theme={theme}
                onChange={handleThemeChange}
                label={locale === 'ru' ? 'Переключить тему' : 'Switch color theme'}
              />
              <div className="language-switcher" aria-label={t('language.label')}>
                {LOCALES.map((option: Locale) => {
                  const label = LOCALE_LABELS[option];
                  return (
                    <button
                      key={option}
                      type="button"
                      className={`language-option ${locale === option ? 'active' : ''}`}
                      onClick={() => setLocale(option)}
                      aria-label={`${t('language.switchTo')} ${label.nativeName}`}
                      aria-pressed={locale === option}
                    >
                      <FlagIcon locale={option} className="language-flag" />
                      <span>{label.short}</span>
                    </button>
                  );
                })}
              </div>
              <Link className="landing-nav-link" href="/map">
                {t('landing.nav.openApp')}
              </Link>
            </div>
          </nav>
        </header>

        <div className="landing-hero-container">
          <div className="landing-hero-content">
            <p className="landing-kicker">{t('landing.kicker')}</p>
            <h1 id="landing-title">OpenParking</h1>
            <p className="landing-copy">{t('landing.copy')}</p>
            <div className="landing-actions">
              <Link className="landing-primary" href="/map">
                {t('landing.actions.launch')}
              </Link>
              <a className="landing-secondary" href="#platform">
                {t('landing.actions.platform')}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-platform" id="platform" aria-label="OpenParking platform highlights">
        <div className="landing-metric">
          <span className="metric-val">{t('landing.metric1.val')}</span>
          <strong>{t('landing.metric1.label')}</strong>
          <p>{t('landing.metric1.desc')}</p>
        </div>
        <div className="landing-metric">
          <span className="metric-val">{t('landing.metric2.val')}</span>
          <strong>{t('landing.metric2.label')}</strong>
          <p>{t('landing.metric2.desc')}</p>
        </div>
        <div className="landing-metric">
          <span className="metric-val">{t('landing.metric3.val')}</span>
          <strong>{t('landing.metric3.label')}</strong>
          <p>{t('landing.metric3.desc')}</p>
        </div>
      </section>
    </main>
  );
}
