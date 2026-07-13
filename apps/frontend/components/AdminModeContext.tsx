'use client';

import { createContext, useContext, type ReactNode } from 'react';

const AdminModeContext = createContext(false);

export function AdminModeProvider({ children }: { children: ReactNode }) {
  return <AdminModeContext.Provider value>{children}</AdminModeContext.Provider>;
}

export function useAdminMode() {
  return useContext(AdminModeContext);
}
