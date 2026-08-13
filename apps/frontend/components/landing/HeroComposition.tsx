'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const Car3D = dynamic(() => import('./Car3D').then((module) => module.Car3D), { ssr: false, loading: () => <div className="car-3d car-3d--loading" data-media-state="loading" aria-hidden="true" /> });

export function HeroComposition({ content, carLabel }: { content: ReactNode; carLabel?: string }) {
  return <div className="hero-composition">
    <div className="hero-composition__content"><div className="hero-composition__editorial">{content}</div></div>
    <div className="hero-composition__car"><Car3D label={carLabel} /></div>
    <div className="hero-composition__caption" aria-hidden="true"><span>REAL_3D / BMW M3</span><span>TOPAZ BLUE / WEBGL</span></div>
  </div>;
}
