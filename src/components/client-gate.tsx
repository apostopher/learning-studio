"use client";
import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

// See https://tkdodo.eu/blog/avoiding-hydration-mismatches-with-use-sync-external-store
export function ClientGate({ children }: { children: () => React.ReactNode }) {
  const isServer = useSyncExternalStore(
    emptySubscribe,
    () => false,
    () => true,
  );

  return isServer ? null : children();
}
