import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { signInMessage } from "../lib/signin-message.ts";
import { intentMessage, type IntentAction } from "../lib/intent-message.ts";
import { isBase58Address } from "../lib/format.ts";
import type { Queryable } from "./db.ts";
import { HttpError } from "./errors.ts";

/** A sign-in nonce lives 10 minutes; an action intent 2 minutes. Both are spent once. */
export const NONCE_TTL_MS = 10 * 60_000;
export const INTENT_TTL_MS = 2 * 60_000;

export async function issueNonce(q: Queryable, now = Date.now()): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  await q.query("DELETE FROM nonces WHERE created_at < $1", [now - NONCE_TTL_MS]);
  await q.query("INSERT INTO nonces (nonce, created_at) VALUES ($1, $2)", [nonce, now]);
  return nonce;
}

/** Deletes the nonce; true only if it existed and was fresh. A nonce can never be used twice. */
export async function consumeNonce(q: Queryable, nonce: string, now = Date.now()): Promise<boolean> {
  const rows = await q.query<{ created_at: string }>("DELETE FROM nonces WHERE nonce = $1 RETURNING created_at::text", [nonce]);
  return rows.length > 0 && Number(rows[0].created_at) >= now - NONCE_TTL_MS;
}

/** ed25519 check of a base58 signature over `message`. */
export function verifySignature(address: string, message: string, signatureB58: string): boolean {
  try {
    const signature = bs58.decode(signatureB58);
    const publicKey = bs58.decode(address);
    if (signature.length !== 64 || publicKey.length !== 32) return false;
    return nacl.sign.detached.verify(new TextEncoder().encode(message), signature, publicKey);
  } catch {
    return false;
  }
}

export interface SignInRequest {
  host: string;
  address?: string;
  nonce?: string;
  issuedAt?: string;
  signature?: string;
}

/** Spend the nonce, rebuild the message server-side, check the signature. Returns the address. */
export async function verifySignIn(q: Queryable, input: SignInRequest): Promise<string> {
  const { address, nonce, issuedAt, signature, host } = input;
  if (!isBase58Address(address)) throw new HttpError(400, "Invalid wallet address.");
  if (!nonce || !issuedAt || !signature) throw new HttpError(400, "Incomplete sign-in request.");
  // The nonce is spent before the signature is checked, so it can never be tried twice.
  if (!(await consumeNonce(q, nonce))) throw new HttpError(401, "That sign-in request expired. Try again.");
  const message = signInMessage({ host, address, nonce, issuedAt });
  if (!verifySignature(address, message, signature)) throw new HttpError(401, "The signature does not match this wallet.");
  return address;
}

export interface SignedIntent {
  nonce?: string;
  expiresAt?: string;
  signature?: string;
}

/** Issues the nonce and the exact message for an action. */
export async function prepareIntent(q: Queryable, input: { host: string; action: IntentAction; wallet: string; fields: [string, string][] }, now = Date.now()) {
  const nonce = await issueNonce(q, now);
  const expiresAt = new Date(now + INTENT_TTL_MS).toISOString();
  return { nonce, expiresAt, message: intentMessage({ ...input, nonce, expiresAt }) };
}

/** Checks expiry, spends the nonce, rebuilds the message from the server's own view of the fields. */
export async function verifyIntent(
  q: Queryable,
  input: { host: string; action: IntentAction; wallet: string; fields: [string, string][] } & SignedIntent,
  now = Date.now(),
) {
  const { nonce, expiresAt, signature } = input;
  if (!nonce || !expiresAt || !signature) throw new HttpError(400, "Sign the request in your wallet first.");
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry < now || expiry > now + INTENT_TTL_MS + 5_000) throw new HttpError(401, "That signature expired. Try again.");
  if (!(await consumeNonce(q, nonce, now))) throw new HttpError(401, "That signature was already used or expired. Try again.");
  const message = intentMessage({ host: input.host, action: input.action, wallet: input.wallet, fields: input.fields, nonce, expiresAt });
  if (!verifySignature(input.wallet, message, signature)) throw new HttpError(401, "The signature does not match this request.");
}
