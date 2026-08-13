import type { Metadata } from 'next';
import { LanguageProvider } from '@/components/LanguageProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenParking — Find parking with real prices and payment links',
  description:
    'Search an address and see every nearby garage, lot, and meter with the actual price, hours, and a direct link to pay or book. Real data, no guesswork.',
  keywords: [
    'OpenParking',
    'parking',
    'USA',
    'parking map',
    'parking prices',
    'pay for parking',
    'book parking',
    'ParkMobile',
    'PayByPhone',
    'SpotHero',
    'Miami parking',
    'San Francisco parking',
  ],
  openGraph: {
    title: 'OpenParking — Real prices and payment links for parking',
    description: 'Find a place to park with the real price and a direct link to pay.',
    type: 'website',
  },
  icons: {
    icon: [
      { url: '/brand/openparking-mark.svg', type: 'image/svg+xml' },
      { url: '/brand/openparking-mark-light.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: light)' },
      { url: '/brand/openparking-mark-dark.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: dark)' },
    ],
    shortcut: '/brand/openparking-mark.svg',
  },
};

/**
 * Pre-hydration theme bootstrap. Runs synchronously in <head> so the
 * correct data-theme attribute is set on <html> before any CSS resolves,
 * preventing a flash of light-theme styles when the user prefers dark.
 */
const themeBootstrapScript = `
(function () {
  try {
    var stored = window.localStorage.getItem('openparking-theme');
    if (stored !== 'light' && stored !== 'dark') {
      var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      stored = prefersDark ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = stored;
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `suppressHydrationWarning` is required because the pre-hydration
    // script in <head> sets `data-theme` based on the user's last choice
    // or system preference, which the server cannot know. The attribute is
    // intentionally different between SSR and the first client paint, so
    // we tell React not to warn about that one node.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
