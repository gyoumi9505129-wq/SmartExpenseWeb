"use client";

import { AuthProvider } from "@/contexts/AuthProvider";
import { IdleSessionGuard } from "@/components/IdleSessionGuard";
import { InputLangDefaults } from "@/components/InputLangDefaults";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <IdleSessionGuard />
      <InputLangDefaults />
      {children}
    </AuthProvider>
  );
}
