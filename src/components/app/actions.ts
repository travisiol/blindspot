"use client";

import { postJson } from "@/lib/client";
import { signAndSendTransaction, signMessage } from "@/components/wallet/store";
import type { IntentAction } from "@/lib/intent-message";

/** Server builds the message → wallet signs it → the action is posted with the signature. */
export async function signedAction<T>(action: IntentAction, endpoint: string, params: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<T> {
  const intent = await postJson<{ nonce: string; expiresAt: string; message: string }>("/api/intent", { action, params });
  const signature = await signMessage(intent.message);
  return postJson<T>(endpoint, { ...extra, params, nonce: intent.nonce, expiresAt: intent.expiresAt, signature });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Builds the transfer on the server, has the wallet sign and send it, then claims it once confirmed. */
export async function deposit(mint: string, amount: string, onStage: (stage: "sign" | "confirm") => void): Promise<string> {
  const { transaction } = await postJson<{ transaction: string }>("/api/deposit", { mint, amount });
  onStage("sign");
  const bytes = Uint8Array.from(atob(transaction), (c) => c.charCodeAt(0));
  const signature = await signAndSendTransaction(bytes);
  onStage("confirm");
  for (let i = 0; i < 40; i++) {
    try {
      await postJson("/api/deposit/claim", { signature });
      return signature;
    } catch (e) {
      if ((e as { status?: number }).status !== 409) throw e;
      await sleep(2500);
    }
  }
  throw new Error("Sent, still confirming. Your balance will update when it lands (use “Find my deposit” if it doesn't).");
}
