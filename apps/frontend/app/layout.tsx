import type { Metadata } from 'next';
import { LanguageProvider } from '@/components/LanguageProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenParking — Open Parking Intelligence',
  description:
    'A premium open parking intelligence platform for maps, prices, rules, confidence scores, and multi-source verification across major US cities.',
  keywords: [
    'OpenParking',
    'parking',
    'USA',
    'parking map',
    'street parking',
    'garage',
    'parking lot',
    'parking prices',
    'Miami parking',
    'San Francisco parking',
    'NYC parking',
  ],
  openGraph: {
    title: 'OpenParking — Open Parking Intelligence',
    description: 'A premium open parking data layer for the USA.',
    type: 'website',
  },
  icons: {
    icon: '/brand/openparking-mark.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
