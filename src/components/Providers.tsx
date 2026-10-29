"use client";

import { AuthProvider } from "@/contexts/AuthProvider";
import { InputLangDefaults } from "@/components/InputLangDefaults";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <InputLangDefaults />
      {children}
    </AuthProvider>
  );
}
