"use client";

import { createContext, useContext } from "react";
import type { Store } from "./store-types";

export type { NewClaimInput, Store } from "./store-types";

export const StoreContext = createContext<Store | null>(null);

/** 画面側はこれだけを使う（デモ／Supabase どちらでも同じ） */
export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("StoreProvider がありません");
  return ctx;
}
