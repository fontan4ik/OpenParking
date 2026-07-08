'use client';

import React from 'react';
import { type Locale } from '@/lib/i18n';

interface FlagIconProps {
  locale: Locale;
  className?: string;
  width?: number;
  height?: number;
}

export function FlagIcon({ locale, className = '', width = 18, height = 12 }: FlagIconProps) {
  if (locale === 'en') {
    return (
      <svg
        className={`flag-icon ${className}`}
        viewBox="0 0 20 14"
        width={width}
        height={height}
        style={{
          borderRadius: '2px',
          display: 'inline-block',
          verticalAlign: 'middle',
          flexShrink: 0,
        }}
      >
        <rect width="20" height="14" fill="#B22234" />
        <path d="M0 1h20M0 3h20M0 5h20M0 7h20M0 9h20M0 11h20M0 13h20" stroke="#fff" strokeWidth="1" />
        <rect width="9" height="8" fill="#3C3B6E" />
        {/* Stylized Star Grid */}
        <circle cx="1.5" cy="1.5" r="0.3" fill="#fff" />
        <circle cx="3.0" cy="1.5" r="0.3" fill="#fff" />
        <circle cx="4.5" cy="1.5" r="0.3" fill="#fff" />
        <circle cx="6.0" cy="1.5" r="0.3" fill="#fff" />
        <circle cx="7.5" cy="1.5" r="0.3" fill="#fff" />
        
        <circle cx="2.25" cy="3.0" r="0.3" fill="#fff" />
        <circle cx="3.75" cy="3.0" r="0.3" fill="#fff" />
        <circle cx="5.25" cy="3.0" r="0.3" fill="#fff" />
        <circle cx="6.75" cy="3.0" r="0.3" fill="#fff" />
        
        <circle cx="1.5" cy="4.5" r="0.3" fill="#fff" />
        <circle cx="3.0" cy="4.5" r="0.3" fill="#fff" />
        <circle cx="4.5" cy="4.5" r="0.3" fill="#fff" />
        <circle cx="6.0" cy="4.5" r="0.3" fill="#fff" />
        <circle cx="7.5" cy="4.5" r="0.3" fill="#fff" />
        
        <circle cx="2.25" cy="6.0" r="0.3" fill="#fff" />
        <circle cx="3.75" cy="6.0" r="0.3" fill="#fff" />
        <circle cx="5.25" cy="6.0" r="0.3" fill="#fff" />
        <circle cx="6.75" cy="6.0" r="0.3" fill="#fff" />
      </svg>
    );
  }

  if (locale === 'ru') {
    return (
      <svg
        className={`flag-icon ${className}`}
        viewBox="0 0 20 14"
        width={width}
        height={height}
        style={{
          borderRadius: '2px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          display: 'inline-block',
          verticalAlign: 'middle',
          flexShrink: 0,
        }}
      >
        <rect width="20" height="4.66" fill="#fff" />
        <rect y="4.66" width="20" height="4.66" fill="#0039A6" />
        <rect y="9.32" width="20" height="4.66" fill="#D52B1E" />
      </svg>
    );
  }

  return null;
}
