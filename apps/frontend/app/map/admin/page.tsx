'use client';

import MapPage from '../page';
import { AdminModeProvider } from '@/components/AdminModeContext';

export default function AdminMapPage() {
  return (
    <AdminModeProvider>
      <MapPage />
    </AdminModeProvider>
  );
}
