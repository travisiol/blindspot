/**
 * Plays BLINDSPOT end to end in headless Chrome over CDP, with the "Solkit Test" stub wallet
 * (scripts/dev-wallet.js, a fresh keypair each run) and the in-process fake RPC (tests/fake-rpc.ts),
 * which lands plain SOL transfers for real and rejects versioned swap transactions the way an
 * unfunded vault is rejected at preflight. Quotes and swap transactions come from the real Jupiter API.
 *
 *   npx next build && node scripts/play-vault.mjs
 *
 * Starts `next start -p 3711` with a fresh PGlite dir (data/play-pglite) and a throwaway vault key.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { startFakeRpc, SYSTEM } from "../tests/fake-rpc.ts";

const PORT = 3711;
const base = `http://localhost:${PORT}`;
const root = resolve(import.meta.dirname, "..");
const shots = join(root, "shots");
mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const secret = nacl.sign.keyPair().secretKey;
const testAddress = bs58.encode(secret.slice(32));
const vault = nacl.sign.keyPair();
const vaultAddress = bs58.encode(vault.publicKey);
console.log("test wallet:", testAddress, "\nvault:", vaultAddress);

const fake = await startFakeRpc();
fake.state.accounts.set(testAddress, { lamports: 3_000_000_000, owner: SYSTEM });
// The operator's gas top-up: 0.05 SOL that belongs to nobody's balance.
fake.state.accounts.set(vaultAddress, { lamports: 50_000_000, owner: SYSTEM });

const pgDir = join(root, "data", "play-pglite");
rmSync(pgDir, { recursive: true, force: true });
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
  cwd: root,
  env: { ...process.env, SOLANA_RPC_URL: fake.url, PGLITE_DIR: pgDir, DATABASE_URL: "", VAULT_SECRET_KEY: bs58.encode(vault.secretKey), SESSION_SECRET: "play-session-secret-play-session-secret-0123" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (d) => process.stderr.write(`[next] ${d}`));
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {}
  await sleep(500);
}

const chromePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((p) => p && existsSync(p));
const profile = join(tmpdir(), `blindspot-play-${Date.now()}`);
const chrome = spawn(chromePath, ["--headless=new", "--no-first-run", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--window-size=1536,960", "about:blank"], { stdio: "ignore" });
let cdpPort = null;
for (let i = 0; i < 100 && !cdpPort; i++) {
  try {
    cdpPort = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]) || null;
  } catch {}
  if (!cdpPort) await sleep(150);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) rej(new Error(m.error.message));
        else res(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

async function main() {
  const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1536, height: 1100, deviceScaleFactor: 1, mobile: false });
  const naclSrc = readFileSync(join(root, "node_modules", "tweetnacl", "nacl-fast.min.js"), "utf8");
  const stub = readFileSync(join(root, "scripts", "dev-wallet.js"), "utf8");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `${naclSrc}\n;window.SOLKIT_TEST_SECRET=${JSON.stringify(Array.from(secret))};window.SOLKIT_TEST_RPC=${JSON.stringify(fake.url)};\n${stub}`,
  });
  const js = async (expression) => (await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  const clickText = (text, scope = "") =>
    js(`(() => { const b = [...document.querySelectorAll("${scope} button")].find((x) => x.textContent.trim().includes(${JSON.stringify(text)}) && !x.disabled); if (b) b.click(); return Boolean(b); })()`);
  const waitFor = async (expression, ms = 20000) => {
    for (let t = 0; t < ms; t += 250) {
      const v = await js(expression).catch(() => null);
      if (v) return v;
      await sleep(250);
    }
    return null;
  };
  const type = (selector, value) =>
    js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  const shot = async (name) => {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(shots, `${name}.png`), Buffer.from(data, "base64"));
    console.log(`     shots/${name}.png`);
  };
  let lastNotice = null;
  const notice = async () => {
    const text = await waitFor(`(() => { const n = [...document.querySelectorAll(".notice")].pop(); return n && n.innerText !== ${JSON.stringify("__LAST__")} ? n.innerText : null; })()`.replace(JSON.stringify("__LAST__"), JSON.stringify(lastNotice ?? "")));
    lastNotice = text;
    return text;
  };
  const solBalance = () => js(`(() => { const li = [...document.querySelectorAll(".rows li")].find((l) => l.innerText.startsWith("SOL")); return li ? li.querySelector(".num")?.innerText : null; })()`);

  await cdp.send("Page.navigate", { url: `${base}/app` });
  await waitFor(`document.readyState === "complete" && Boolean(document.querySelector(".wallet-connect"))`);
  await sleep(1000);

  // connect + sign in
  check("connect", await clickText("Connect wallet", "header"));
  await waitFor(`[...document.querySelectorAll(".wallet-option")].some((b) => b.textContent.includes("Solkit Test"))`);
  await clickText("Solkit Test");
  await waitFor(`document.querySelector("dialog[open] button") && [...document.querySelectorAll("dialog[open] button")].some((b) => b.textContent.trim() === "Sign in")`);
  await js(`[...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent.trim() === "Sign in").click()`);
  check("signed in", Boolean(await waitFor(`fetch("/api/auth/me").then((r) => r.json()).then((j) => j.address === ${JSON.stringify(testAddress)})`)));
  await js(`document.querySelector("dialog[open]")?.close()`);
  check("vault account loads", Boolean(await waitFor(`document.body.innerText.includes("Vault balance")`)));

  // deposit 1 SOL
  await type(".field input", "1");
  check("deposit clicked", await clickText("Deposit SOL"));
  const dep = await notice();
  check("deposit credited after the wallet's transfer confirmed", /Deposited 1 SOL/.test(dep ?? ""), dep ?? "");
  await waitFor(`(() => { const li = [...document.querySelectorAll(".rows li")].find((l) => l.innerText.startsWith("SOL")); return li?.querySelector(".num")?.innerText === "1"; })()`);
  check("balance shows 1 SOL", (await solBalance()) === "1", await solBalance());
  check("vault received 1 SOL on chain", fake.state.accounts.get(vaultAddress).lamports === 1_050_000_000, String(fake.state.accounts.get(vaultAddress).lamports));
  await shot("play-1-deposited");

  // swap SOL → BONK: real quote, signed intent, vault-signed Jupiter transaction (rejected: the vault is not funded on mainnet)
  await clickText("swap", "[role=tablist]");
  await waitFor(`document.body.innerText.includes("You sell")`);
  await js(`document.querySelector("[aria-label='Token to buy']").click()`);
  await type(".card.absolute input", "bonk");
  const picked = await waitFor(`(() => { const b = [...document.querySelectorAll(".card.absolute li button")].find((x) => x.innerText.startsWith("Bonk") || x.innerText.startsWith("BONK")); if (b) { b.click(); return b.innerText.split("\\n")[0]; } return null; })()`);
  check("token search found BONK", Boolean(picked), picked ?? "");
  await type("input[aria-label='Amount to sell']", "0.1");
  const quote = await waitFor(`(() => { const t = document.body.innerText; return t.includes("Minimum received") ? [...document.querySelectorAll(".kv")].map((k) => k.innerText.replace("\\n", ": ")).join(" | ") : null; })()`);
  check("live Jupiter quote with the fee shown", Boolean(quote && quote.includes("Fee (0.5%)")), quote ?? "");
  await shot("play-2-quote");
  await clickText("Swap from the vault");
  const sw = await notice();
  check("swap: the vault signed and sent; rejected (unfunded) → balance restored", /restored/.test(sw ?? ""), sw ?? "");
  await sleep(1500);
  check("SOL balance back to 1 after the failed swap", (await solBalance()) === "1", await solBalance());
  const lastMsg = await js("window.__SOLKIT_LAST_MESSAGE");
  check("the signed message lists the swap, minimum and nonce", /Action: Swap from the vault[\s\S]*Sell: 0\.1 SOL[\s\S]*Minimum received: [\s\S]*Nonce: [0-9a-f]{32}/.test(lastMsg ?? ""), (lastMsg ?? "").split("\n").slice(3, 8).join(" / "));

  // split order then cancel
  check("a swap refused at preflight has no tx link", !(await js(`[...document.querySelectorAll("tr")].find((r) => r.innerText.startsWith("Swap"))?.querySelector("a")`)));
  await type("input[aria-label='Amount to sell']", "0.1");
  await js(`(() => { const c = document.querySelector("input[type=checkbox]"); if (!c.checked) c.click(); })()`);
  await waitFor(`document.body.innerText.includes("Place split order") && ![...document.querySelectorAll("button")].find((b) => b.innerText.includes("Place split order")).disabled`);
  await clickText("Place split order");
  const sp = await notice();
  check("split order placed", /Split order placed/.test(sp ?? ""), sp ?? "");
  await waitFor(`document.body.innerText.includes("Split · ")`);
  check("0.1 SOL reserved for the split", Boolean(await waitFor(`document.body.innerText.includes("reserved for orders")`)));
  await shot("play-3-split");
  await clickText("Cancel rest");
  check("split cancelled, reservation released", Boolean(await waitFor(`!document.body.innerText.includes("reserved for orders") && document.body.innerText.includes("Cancelled")`, 25000)));

  // withdraw 0.4 SOL to the connected wallet
  const before = fake.state.accounts.get(testAddress).lamports;
  await clickText("withdraw", "[role=tablist]");
  await waitFor(`document.body.innerText.includes("(this wallet)")`);
  await type("input[aria-label='Amount to withdraw']", "0.4");
  await clickText("Withdraw SOL");
  const wd = await notice();
  check("withdrawal queued", /Queued/.test(wd ?? ""), wd ?? "");
  const sent = await waitFor(`[...document.querySelectorAll("tr")].some((r) => r.innerText.startsWith("Withdraw") && r.innerText.includes("Sent"))`, 30000);
  check("withdrawal sent (history shows Sent with tx link)", Boolean(sent));
  check("wallet received 0.4 SOL on chain", fake.state.accounts.get(testAddress).lamports - before === 400_000_000, String(fake.state.accounts.get(testAddress).lamports - before));
  check("SOL balance now 0.6", (await solBalance()) === "0.6", await solBalance());
  await shot("play-4-withdrawn");

  // replaying a used signature is refused
  const replay = await js(`fetch("/api/withdraw", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ params: { mint: "So11111111111111111111111111111111111111112", amount: "0.4" }, nonce: "00000000000000000000000000000000", expiresAt: new Date(Date.now() + 60000).toISOString(), signature: "1111" }) }).then((r) => r.status)`);
  check("withdraw with a forged/used signature is refused", replay === 401, String(replay));

  // reserves
  await cdp.send("Page.navigate", { url: `${base}/reserves` });
  const row = await waitFor(`(() => { const r = [...document.querySelectorAll("tbody tr")].find((x) => x.innerText.startsWith("SOL")); return r && !r.innerText.includes("Reading") ? r.innerText.replace(/\\s+/g, " ") : null; })()`);
  check("reserves: on-chain SOL vs owed", Boolean(row && row.includes("0.6")), row ?? "");
  check("reserves: users covered", Boolean(await waitFor(`document.body.innerText.includes("Yes, every token")`)));
  await shot("play-5-reserves");

  // the public side
  await cdp.send("Page.navigate", { url: `${base}/` });
  const feed = await waitFor(`(() => { const t = document.querySelector(".public-feed")?.innerText; return t && t.includes("Transfer") ? t : null; })()`);
  check("home: trackers see the vault's transfers, all as the vault", Boolean(feed && feed.includes("Transfer in") && feed.includes("Transfer out")), (feed ?? "").split("\n").slice(3, 7).join(" / "));
  await js(`document.querySelector(".public-feed").scrollIntoView({ block: "center" })`);
  await sleep(800);
  await shot("play-6-trackers");
  ws.close();
}

let failed = true;
try {
  await main();
  failed = results.some((r) => !r.ok);
} catch (e) {
  console.error(e);
} finally {
  chrome.kill();
  server.kill();
  await fake.close();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  console.log(failed ? "\nplay-vault: FAILED" : `\nplay-vault: green (${results.length} checks)`);
  process.exit(failed ? 1 : 0);
}
