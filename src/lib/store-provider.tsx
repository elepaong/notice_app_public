"use client";

import { DemoStoreProvider } from "./demo-store";
import { SupabaseStoreProvider } from "./supabase-store";
import { isSupabaseConfigured } from "./supabase/client";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseStoreProvider>{children}</SupabaseStoreProvider>
  ) : (
    <DemoStoreProvider>{children}</DemoStoreProvider>
  );
}
