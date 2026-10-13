import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

/** Parses base58 or a JSON byte array (`solana-keygen` file contents). Null when unset or malformed; never logs the value. */
export function parseSecretKey(raw: string | undefined | null): Keypair | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const bytes = value.startsWith("[") ? Uint8Array.from(JSON.parse(value) as number[]) : bs58.decode(value);
    if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
    if (bytes.length === 32) return Keypair.fromSeed(bytes);
    return null;
  } catch {
    return null;
  }
}
