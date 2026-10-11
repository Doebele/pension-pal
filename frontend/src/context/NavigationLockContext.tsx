import React from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

type NavigationLockContextValue = {
  isLocked: boolean;
  withLock: <T>(task: () => Promise<T> | T, minDurationMs?: number) => Promise<T>;
  lockFor: (ms: number) => Promise<void>;
};

const NavigationLockContext = React.createContext<NavigationLockContextValue | null>(null);

export const NavigationLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const [manualLockCount, setManualLockCount] = React.useState(0);

  const lockFor = React.useCallback(async (ms: number) => {
    setManualLockCount((value) => value + 1);
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    });
    setManualLockCount((value) => Math.max(0, value - 1));
  }, []);

  const withLock = React.useCallback(
    async <T,>(task: () => Promise<T> | T, minDurationMs = 0): Promise<T> => {
      const startedAt = Date.now();
      setManualLockCount((value) => value + 1);
      try {
        const result = await task();
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, minDurationMs - elapsed);
        if (remaining > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
        }
        return result;
      } finally {
        setManualLockCount((value) => Math.max(0, value - 1));
      }
    },
    [],
  );

  const isLocked = manualLockCount > 0 || isFetching > 0 || isMutating > 0;

  return (
    <NavigationLockContext.Provider value={{ isLocked, withLock, lockFor }}>
      {children}
    </NavigationLockContext.Provider>
  );
};

export function useNavigationLock() {
  const context = React.useContext(NavigationLockContext);
  if (!context) {
    throw new Error("useNavigationLock must be used within NavigationLockProvider.");
  }
  return context;
}
