'use client';

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageProvider';
import { LOCALES, LOCALE_LABELS, type Locale, type TranslationKey } from '@/lib/i18n';
import { FlagIcon } from '@/components/FlagIcon';
import { BrandMark } from '@/components/BrandMark';
import { HeroComposition } from '@/components/landing/HeroComposition';
import { MediaPlaceholder, type MediaAsset } from '@/components/landing/MediaPlaceholder';
import { MagicBentoGrid, MagicBentoTile } from '@/components/landing/magic/MagicBentoGrid';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'openparking-theme';
const SOURCES_DOC_HREF = '/map';
const DATA_BRIEF_HREF = '/map';

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
            <path d="M31 23.3545C32.1114 23.2995 33.0551 22.8503 33.8313 21.9977C34.6075 21.1543 34.9956 20.1459 34.9956 19C34.9956 20.1459 35.3837 21.1543 36.1599 21.9977C36.9361 22.8503 37.8798 23.2995 39 23.3545C37.8798 23.4095 36.9361 23.8587 36.1599 24.7112C35.3837 25.5546 34.9956 26.563 34.9956 27.7273C34.9956 26.563 34.6075 25.5546 33.8313 24.7112C33.0551 22.8503 32.1114 23.4095 31 23.3545Z" fill="currentColor" />
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
function Reveal({
  children,
  as = 'div',
  className = '',
  delayMs = 0,
}: {
  children: ReactNode;
  as?: 'div' | 'li';
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement | HTMLLIElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Activate the reveal gate. Content is visible by default; once JS
    // hydrates we add this attribute so any below-the-fold reveal can
    // hide itself and animate in.
    document.documentElement.setAttribute('data-landing-reveal-ready', '');

    const node = ref.current;
    if (!node) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const revealClass = `landing-reveal ${visible ? 'is-visible' : ''} ${className}`.trim();
  const revealStyle = { transitionDelay: `${delayMs}ms` };
  if (as === 'li') {
    return <li ref={ref as Ref<HTMLLIElement>} className={revealClass} style={revealStyle}>{children}</li>;
  }
  return <div ref={ref as Ref<HTMLDivElement>} className={revealClass} style={revealStyle}>{children}</div>;
}

type MetricCard = {
  valKey: TranslationKey;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  accent: 'blue' | 'emerald' | 'amber' | 'cyan';
};

const METRIC_CARDS: MetricCard[] = [
  { valKey: 'landing.metric1.val', labelKey: 'landing.metric1.label', descKey: 'landing.metric1.desc', accent: 'blue' },
  { valKey: 'landing.metric2.val', labelKey: 'landing.metric2.label', descKey: 'landing.metric2.desc', accent: 'emerald' },
  { valKey: 'landing.metric3.val', labelKey: 'landing.metric3.label', descKey: 'landing.metric3.desc', accent: 'cyan' },
  { valKey: 'landing.metric4.val', labelKey: 'landing.metric4.label', descKey: 'landing.metric4.desc', accent: 'amber' },
];

type StepCard = {
  number: string;
  titleKey: TranslationKey;
  descKey: TranslationKey;
};

const STEPS: StepCard[] = [
  { number: '01', titleKey: 'landing.how.step1.title', descKey: 'landing.how.step1.desc' },
  { number: '02', titleKey: 'landing.how.step2.title', descKey: 'landing.how.step2.desc' },
  { number: '03', titleKey: 'landing.how.step3.title', descKey: 'landing.how.step3.desc' },
];

type CityChip = {
  id: string;
  statusKey: TranslationKey;
  live: boolean;
};

const CITIES: CityChip[] = [
  { id: 'miami', statusKey: 'landing.cities.miami.status', live: true },
  { id: 'sf', statusKey: 'landing.cities.sf.status', live: true },
  { id: 'nyc', statusKey: 'landing.cities.nyc.status', live: false },
  { id: 'la', statusKey: 'landing.cities.la.status', live: false },
  { id: 'seattle', statusKey: 'landing.cities.seattle.status', live: false },
  { id: 'chicago', statusKey: 'landing.cities.chicago.status', live: false },
];

type OperatorCard = {
  key: string;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  href: string;
  badge: string;
  media: MediaAsset;
};

const OPERATORS: OperatorCard[] = [
  {
    key: 'paybyphone',
    labelKey: 'landing.operators.paybyphone.label',
    descKey: 'landing.operators.paybyphone.desc',
    href: 'https://www.paybyphone.com/',
    badge: 'PB',
    media: {
      base: 'source-overture',
      folder: 'landing',
      aspect: 600 / 400,
      objectPosition: 'center 50%',
      alt: 'Phone screen showing a parking meter payment confirmation',
      tone: 'miami-aerial',
    },
  },
  {
    key: 'parkmobile',
    labelKey: 'landing.operators.parkmobile.label',
    descKey: 'landing.operators.parkmobile.desc',
    href: 'https://www.parkmobile.com/',
    badge: 'PM',
    media: {
      base: 'source-miami',
      folder: 'landing',
      aspect: 600 / 400,
      objectPosition: 'center 50%',
      alt: 'Person paying for parking from a phone at a city meter',
      tone: 'street-curb',
    },
  },
  {
    key: 'parkwhiz',
    labelKey: 'landing.operators.parkwhiz.label',
    descKey: 'landing.operators.parkwhiz.desc',
    href: 'https://www.spothero.com/',
    badge: 'SH',
    media: {
      base: 'source-sf',
      folder: 'landing',
      aspect: 600 / 400,
      objectPosition: 'center 50%',
      alt: 'Booking screen showing a reserved garage spot with the address and rate',
      tone: 'sf-street',
    },
  },
  {
    key: 'passport',
    labelKey: 'landing.operators.passport.label',
    descKey: 'landing.operators.passport.desc',
    href: 'https://www.ppprk.com/',
    badge: 'PP',
    media: {
      base: 'source-osm',
      folder: 'landing',
      aspect: 600 / 400,
      objectPosition: 'center 50%',
      alt: 'Modern parking pay station on a city sidewalk',
      tone: 'kiosk',
    },
  },
];

type FeatureCard = {
  titleKey: TranslationKey;
  descKey: TranslationKey;
  icon: 'layer' | 'shield' | 'route';
  media: MediaAsset;
};

const FEATURES: FeatureCard[] = [
  {
    titleKey: 'landing.feature1.title',
    descKey: 'landing.feature1.desc',
    icon: 'layer',
    media: {
      base: 'feature-facilities',
      folder: 'landing',
      aspect: 800 / 1000, // 4:5 portrait
      objectPosition: '50% 60%',
      alt: 'Miami Beach curb with a single chrome parking meter in the foreground',
      tone: 'street-curb',
    },
  },
  {
    titleKey: 'landing.feature2.title',
    descKey: 'landing.feature2.desc',
    icon: 'shield',
    media: {
      base: 'feature-curb',
      folder: 'landing',
      aspect: 800 / 1000,
      objectPosition: '50% 50%',
      alt: 'San Francisco SoMa curb with yellow and white paint markings and a meter post',
      tone: 'sf-street',
    },
  },
  {
    titleKey: 'landing.feature3.title',
    descKey: 'landing.feature3.desc',
    icon: 'route',
    media: {
      base: 'feature-confidence',
      folder: 'landing',
      aspect: 800 / 1000,
      objectPosition: '50% 50%',
      alt: 'Close-up of a modern parking pay station on a city sidewalk',
      tone: 'kiosk',
    },
  },
];

function FeatureIcon({ name }: { name: FeatureCard['icon'] }) {
  const stroke = 'currentColor';
  if (name === 'layer') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 2.5 7.5 12 12l9.5-4.5L12 3Z" />
        <path d="m2.5 12 9.5 4.5 9.5-4.5" />
        <path d="m2.5 16.5 9.5 4.5 9.5-4.5" />
      </svg>
    );
  }
  if (name === 'shield') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 4 6v6.2c0 4.6 3.2 7.7 8 8.8 4.8-1.1 8-4.2 8-8.8V6l-8-3Z" />
        <path d="m8.7 12.2 2.4 2.4 4.2-4.2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M8 6.6c4.4 0 7.4 3 7.4 7.4" />
      <path d="M6 8.2c0 4.4 3 7.4 7.4 7.4" />
    </svg>
  );
}

export default function LandingPage() {
  const { locale, setLocale, t } = useLanguage();
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [isThemeReady, setIsThemeReady] = useState(false);

  useEffect(() => {
    // Allow ?theme=dark|light to override for screenshot tools and
    // for design review. localStorage still wins after the override.
    const params = new URLSearchParams(window.location.search);
    const override = params.get('theme');
    if (override === 'dark' || override === 'light') {
      setThemeState(override);
      setIsThemeReady(true);
      return;
    }
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const systemTheme: ThemeMode = window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    setThemeState(stored === 'light' || stored === 'dark' ? stored : systemTheme);
    setIsThemeReady(true);
  }, []);

  useEffect(() => {
    if (!isThemeReady) return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [isThemeReady, theme]);


  // The global html, body { overflow: hidden } rule in the legacy
  // globals.css clips the landing page below the viewport. The
  // ody:has(.landing-page) override is unreliable in some headless
  // environments, so we toggle an explicit class that the landing CSS
  // namespace understands.
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    body.classList.add('landing-active');
    html.classList.add('landing-active');
    return () => {
      body.classList.remove('landing-active');
      html.classList.remove('landing-active');
    };
  }, []);
  const handleThemeChange = (nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  };

  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="landing-header__inner">
          <Link className="landing-brand" href="/">
            <BrandMark size={36} className="landing-brand__mark" />
            <span className="landing-brand__name">OpenParking</span>
          </Link>

          <nav className="landing-nav-actions" aria-label="OpenParking primary">
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
          </nav>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <Reveal className="landing-hero__reveal" delayMs={80}>
          <HeroComposition
            carLabel={t('landing.hero.carAlt')}
            content={
              <div className="hero-editorial">
                <p className="hero-editorial__eyebrow">
                  {t('landing.kicker')}
                </p>
                <h1 id="landing-title" className="hero-editorial__title">
                  {t('landing.title.display')}
                </h1>
                <p className="hero-editorial__copy">{t('landing.copy')}</p>
                <p className="hero-editorial__signature">{t('landing.hero.signatureNote')}</p>
                <div className="hero-editorial__actions">
                  <Link className="landing-primary" href="/map">
                    <span>{t('landing.actions.launch')}</span>
                    <svg
                      className="landing-primary__arrow"
                      viewBox="0 0 18 12"
                      width="18"
                      height="12"
                      aria-hidden="true"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 6h15M11 1l5 5-5 5" />
                    </svg>
                  </Link>
                  <a className="landing-secondary" href="#landing-platform">
                    {t('landing.actions.platform')}
                  </a>
                  <a className="landing-tertiary" href={DATA_BRIEF_HREF}>
                    {t('landing.actions.docs')}
                    <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 11 11 3" />
                      <path d="M5 3h6v6" />
                    </svg>
                  </a>
                </div>
              </div>
            }
          />
        </Reveal>
      </section>

      <section
        className="landing-platform"
        id="landing-platform"
        aria-labelledby="landing-platform-title"
      >
        <div className="landing-section__header">
          <p className="landing-eyebrow">{t('landing.metrics.eyebrow')}</p>
          <h2 id="landing-platform-title" className="landing-section__title">
            {t('landing.metrics.title')}
          </h2>
        </div>
        <div className="landing-platform__inner">
          <div className="landing-metric-grid">
            {METRIC_CARDS.map((metric, index) => (
              <Reveal
                key={metric.valKey}
                className={`landing-metric landing-metric--${metric.accent}`}
                delayMs={index * 60}
              >
                <span className="landing-metric__val">{t(metric.valKey)}</span>
                <strong className="landing-metric__label">{t(metric.labelKey)}</strong>
                <p className="landing-metric__desc">{t(metric.descKey)}</p>
              </Reveal>
            ))}
          </div>
          <Reveal className="landing-platform__aerial" delayMs={120}>
            <MediaPlaceholder
              asset={{
                base: 'coverage-aerial',
                folder: 'landing',
                aspect: 1200 / 800, // 3:2
                objectPosition: 'center 50%',
                alt: 'Aerial top-down photograph of a South Beach block with surface parking lots',
                tone: 'miami-aerial',
              }}
              wrapperClassName="landing-platform__aerial-frame"
            />
          </Reveal>
        </div>
      </section>

      <section className="landing-features" aria-labelledby="landing-features-title">
        <div className="landing-section__header">
          <p className="landing-eyebrow">{t('landing.features.eyebrow')}</p>
          <h2 id="landing-features-title" className="landing-section__title">
            {t('landing.features.title')}
          </h2>
        </div>
        <div className="landing-features__grid">
          {FEATURES.map((feature, index) => (
            <Reveal
              key={feature.titleKey}
              className="landing-feature"
              delayMs={index * 80}
            >
              <div className="landing-feature__media">
                <MediaPlaceholder asset={feature.media} />
                <span className="landing-feature__icon" aria-hidden="true">
                  <FeatureIcon name={feature.icon} />
                </span>
              </div>
              <h3 className="landing-feature__title">{t(feature.titleKey)}</h3>
              <p className="landing-feature__desc">{t(feature.descKey)}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="landing-bento" aria-labelledby="landing-bento-title">
        <div className="landing-section__header">
          <p className="landing-eyebrow">{t('landing.metrics.eyebrow')}</p>
          <h2 id="landing-bento-title" className="landing-section__title">
            {t('landing.features.title')}
          </h2>
        </div>
        <MagicBentoGrid>
          <MagicBentoTile
            tone="facilities"
            media={<MediaPlaceholder asset={FEATURES[0].media} fillParent />}
            eyebrow={<span>{t('landing.bento.facilities.eyebrow')}</span>}
            title={t('landing.bento.facilities.title')}
            description={t('landing.bento.facilities.desc')}
            cta={
              <Link className="landing-bento__cta" href="/map?layer=facilities">
                {t('landing.actions.launch')}
              </Link>
            }
          />
          <MagicBentoTile
            tone="curb"
            media={<MediaPlaceholder asset={FEATURES[1].media} fillParent />}
            eyebrow={<span>{t('landing.bento.curb.eyebrow')}</span>}
            title={t('landing.bento.curb.title')}
            description={t('landing.bento.curb.desc')}
            cta={
              <Link className="landing-bento__cta" href="/map?layer=curb">
                {t('landing.actions.launch')}
              </Link>
            }
          />
          <MagicBentoTile
            tone="confidence"
            media={<MediaPlaceholder asset={FEATURES[2].media} fillParent />}
            eyebrow={<span>{t('landing.bento.confidence.eyebrow')}</span>}
            title={t('landing.bento.confidence.title')}
            description={t('landing.bento.confidence.desc')}
            cta={
              <Link className="landing-bento__cta" href="/admin">
                {t('landing.actions.docs')}
              </Link>
            }
          />
          <MagicBentoTile
            tone="sources"
            media={
              <MediaPlaceholder
                asset={{
                  base: 'coverage-aerial',
                  folder: 'landing',
                  aspect: 1200 / 800,
                  objectPosition: 'center 50%',
                  alt: 'Aerial view of mapped parking coverage',
                  tone: 'miami-aerial',
                }}
                fillParent
              />
            }
            eyebrow={<span>{t('landing.bento.sources.eyebrow')}</span>}
            title={t('landing.bento.sources.title')}
            description={t('landing.bento.sources.desc')}
            cta={
              <a className="landing-bento__cta" href={DATA_BRIEF_HREF}>
                {t('landing.actions.docs')}
              </a>
            }
          />
        </MagicBentoGrid>
      </section>

      <section className="landing-how" aria-labelledby="landing-how-title">
        <div className="landing-section__header">
          <p className="landing-eyebrow">{t('landing.how.eyebrow')}</p>
          <h2 id="landing-how-title" className="landing-section__title">
            {t('landing.how.title')}
          </h2>
        </div>
        <ol className="landing-how__list">
          {STEPS.map((step, index) => (
            <Reveal as="li" key={step.number} className="landing-how__step" delayMs={index * 80}>
              <span className="landing-how__number">{step.number}</span>
              <div className="landing-how__body">
                <h3 className="landing-how__step-title">{t(step.titleKey)}</h3>
                <p className="landing-how__step-desc">{t(step.descKey)}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="landing-operators" aria-labelledby="landing-operators-title">
        <div className="landing-section__header">
          <p className="landing-eyebrow">{t('landing.operators.eyebrow')}</p>
          <h2 id="landing-operators-title" className="landing-section__title">
            {t('landing.operators.title')}
          </h2>
          <p className="landing-section__note">{t('landing.operators.note')}</p>
        </div>
        <div className="landing-operators__grid">
          {OPERATORS.map((operator, index) => (
            <Reveal
              key={operator.key}
              className={`landing-operator landing-operator--${operator.key}`}
              delayMs={index * 70}
            >
              <a
                className="landing-operator__link"
                href={operator.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="landing-operator__media">
                  <MediaPlaceholder asset={operator.media} />
                  <span className="landing-operator__badge" aria-hidden="true">{operator.badge}</span>
                </div>
                <h3 className="landing-operator__title">{t(operator.labelKey)}</h3>
                <p className="landing-operator__desc">{t(operator.descKey)}</p>
                <span className="landing-operator__open" aria-hidden="true">
                  <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 11 11 3" />
                    <path d="M5 3h6v6" />
                  </svg>
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="landing-cities" aria-labelledby="landing-cities-title">
        <div className="landing-section__header">
          <p className="landing-eyebrow">{t('landing.cities.eyebrow')}</p>
          <h2 id="landing-cities-title" className="landing-section__title">
            {t('landing.cities.title')}
          </h2>
          <p className="landing-section__note">{t('landing.cities.note')}</p>
        </div>
        <div className="landing-cities__grid">
          {CITIES.map((city, index) => (
            <Reveal
              key={city.id}
              className={`landing-city ${city.live ? 'is-live' : 'is-research'}`}
              delayMs={index * 50}
            >
              <Link className="landing-city__link" href={city.live ? `/map?city=${city.id}` : SOURCES_DOC_HREF}>
                <span className="landing-city__name">{t(`city.${city.id}` as TranslationKey)}</span>
                <span className={`landing-city__status ${city.live ? 'is-live' : 'is-research'}`}>
                  {t(city.statusKey)}
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="landing-cta" aria-labelledby="landing-cta-title">
        <div className="landing-cta__backdrop" aria-hidden="true">
          <MediaPlaceholder
            asset={{
              base: 'cta-backdrop',
              folder: 'landing',
              aspect: 1920 / 900, // 21:10
              objectPosition: 'center 50%',
              alt: '',
              tone: 'miami-dusk',
            }}
            wrapperClassName="landing-cta__backdrop-frame"
            loading="lazy"
          />
          <div className="landing-cta__backdrop-mask" aria-hidden="true" />
        </div>
        <div className="landing-cta__inner">
            <p className="landing-eyebrow">{t('landing.metrics.eyebrow')}</p>
            <h2 id="landing-cta-title" className="landing-section__title">
              {t('landing.copy')}
            </h2>
            <div className="landing-cta__actions">
              <Link className="landing-primary" href="/map">
                <span>{t('landing.actions.launch')}</span>
                <svg
                  className="landing-primary__arrow"
                  viewBox="0 0 18 12"
                  width="18"
                  height="12"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 6h15M11 1l5 5-5 5" />
                </svg>
              </Link>
              <a className="landing-tertiary" href={DATA_BRIEF_HREF}>
                {t('landing.actions.docs')}
              </a>
            </div>
        </div>
      </section>

      <footer className="landing-footer" aria-label="OpenParking site footer">
        <div className="landing-footer__inner">
          <div className="landing-footer__brand">
            <Link className="landing-brand" href="/">
            <BrandMark size={32} className="landing-brand__mark" />
            <span className="landing-brand__name">OpenParking</span>
            </Link>
            <p className="landing-footer__tagline">{t('landing.footer.tagline')}</p>
          </div>
          <nav className="landing-footer__nav" aria-label="Footer">
            <Link className="landing-footer__link landing-footer__link--primary" href="/map">
              {t('landing.actions.launch')}
              <svg viewBox="0 0 18 12" width="14" height="10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 6h15M11 1l5 5-5 5" />
              </svg>
            </Link>
          </nav>
        </div>
        <p className="landing-footer__copyright">{t('landing.footer.copyright')}</p>
      </footer>
    </main>
  );
}
