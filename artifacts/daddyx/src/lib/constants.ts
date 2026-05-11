import { PublicKey } from "@solana/web3.js";

// ── Program ────────────────────────────────────────────────
export const DADDYX_PROGRAM_ID = new PublicKey(
  "D1YJeGTthCfJ6UnKsQzz79fevvKhfRrT3jhiAC8Ct978"
);

// ── Network ────────────────────────────────────────────────
export const SOLANA_NETWORK = "devnet" as const;
export const SOLANA_RPC_URL = "https://api.devnet.solana.com";
export const SOLANA_WS_URL  = "wss://api.devnet.solana.com/";

// ── Platform ───────────────────────────────────────────────
export const PLATFORM_FEE_BPS = 300;            // 3%
export const LAMPORTS_PER_SOL = 1_000_000_000;

// ── PDA Seeds (must match b"..." literals in lib.rs) ──────
export const SEED_PLATFORM_CONFIG = "platform";
export const SEED_CREATOR_PROFILE = "creator";
export const SEED_EVENT_CONFIG    = "event";
export const SEED_EVENT_ESCROW    = "escrow";
export const SEED_TOKEN_STATE     = "token";

// ── Explorer ───────────────────────────────────────────────
export function explorerUrl(type: "tx" | "address", value: string): string {
  return `https://explorer.solana.com/${type}/${value}?cluster=${SOLANA_NETWORK}`;
}
