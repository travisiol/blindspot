"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson } from "@/lib/client";
import { useWallet } from "@/components/wallet/store";
import type { Account } from "./types";

/** The signed-in account, refreshed every 10 s while the tab is visible. */
export function useAccount() {
  const wallet = useWallet();
  const signedIn = wallet.address !== null && wallet.session === wallet.address;
  const [account, setAccount] = useState<Account | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    const load = () =>
      getJson<Account>("/api/account")
        .then((a) => alive && setAccount(a))
        .catch(() => {});
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [signedIn, tick]);

  return { account: signedIn ? account : null, signedIn, connected: wallet.address !== null, refresh };
}
