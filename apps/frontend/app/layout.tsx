import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ParkingUSA — Find Every Parking Spot in America',
  description:
    'The most comprehensive parking data layer for the USA. Real parking inventory with prices, rules, confidence scores, and multi-source verification across major US cities.',
  keywords: [
    'parking',
    'USA',
    'parking map',
    'street parking',
    'garage',
    'parking lot',
    'parking prices',
    'San Francisco parking',
    'NYC parking',
  ],
  openGraph: {
    title: 'ParkingUSA — Find Every Parking Spot in America',
    description: 'The most comprehensive parking data layer for the USA.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
