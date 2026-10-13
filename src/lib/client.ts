"use client";

import { useSyncExternalStore } from "react";
import { formatUnits } from "./format";

export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw Object.assign(new Error(j.error ?? "Request failed."), { status: r.status });
  return j;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw Object.assign(new Error(j.error ?? "Request failed."), { status: r.status });
  return j;
}

export function errorText(e: unknown): string {
  const m = (e as { message?: string })?.message;
  return m && m.length < 160 ? m : "Something went wrong. Try again.";
}

/** Base-unit string → readable amount (compact for large numbers). */
export function amountText(raw: string | bigint | null | undefined, decimals: number, maxFraction = 4): string {
  if (raw == null) return "—";
  const value = BigInt(raw);
  const abs = value < BigInt(0) ? -value : value;
  const whole = abs / BigInt(10) ** BigInt(decimals);
  if (whole >= BigInt(1_000_000)) {
    const n = Number(formatUnits(abs, decimals, 2).replace(/,/g, ""));
    const text = n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : `${(n / 1e6).toFixed(2)}M`;
    return `${value < BigInt(0) ? "-" : ""}${text}`;
  }
  const text = formatUnits(value, decimals, whole >= BigInt(1000) ? 2 : maxFraction);
  // Dust that rounds to zero is shown as such, never as "0" or "-0".
  if (value !== BigInt(0) && /^-?0$/.test(text)) return `${value < BigInt(0) ? "-" : ""}<0.${"0".repeat(Math.max(0, maxFraction - 1))}1`;
  return text;
}

export function usdText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value > 0 && value < 0.01) return "<$0.01";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

// ───────────────────────────── shared clock (no Date.now() in render)

let now = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 15_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now, () => 0);
}

/** Postgres timestamptz text ("2026-10-13 15:07:00.12+00") or seconds/ms → ms. */
export function toMs(time: number | string): number {
  if (typeof time === "number") return time < 1e12 ? time * 1000 : time;
  return Date.parse(time.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
}

export function ago(time: number | string | null | undefined, nowMs: number): string {
  if (!time || !nowMs) return "";
  const t = toMs(time);
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function inText(time: string, nowMs: number): string {
  if (!nowMs) return "";
  const s = Math.round((toMs(time) - nowMs) / 1000);
  if (s <= 30) return "due now";
  if (s < 3600) return `in ${Math.ceil(s / 60)}m`;
  return `in ${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}
