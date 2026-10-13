import { SITE } from "../config/site.ts";

export type IntentAction = "swap" | "split" | "withdraw" | "cancel";

const TITLES: Record<IntentAction, string> = {
  swap: "Swap from the vault",
  split: "Split swap from the vault",
  withdraw: "Withdraw to your wallet",
  cancel: "Cancel a split order",
};

/**
 * The exact text a wallet signs to authorise one vault action. The server rebuilds it from the
 * request fields, so the client cannot change what was signed. One nonce, two-minute expiry.
 */
export function intentMessage(input: {
  host: string;
  action: IntentAction;
  wallet: string;
  fields: [string, string][];
  nonce: string;
  expiresAt: string;
}): string {
  return [
    `${input.host} asks ${SITE.name} to act for your vault account:`,
    input.wallet,
    "",
    `Action: ${TITLES[input.action]}`,
    ...input.fields.map(([label, value]) => `${label}: ${value}`),
    "",
    "Signing authorises this one action only. It does not move funds from your wallet.",
    "",
    `Nonce: ${input.nonce}`,
    `Expires At: ${input.expiresAt}`,
  ].join("\n");
}
