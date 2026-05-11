/**
 * DaddyX Devnet Deploy Script
 * Run: npx ts-node scripts/deploy.ts
 *
 * Prerequisites:
 *   solana config set --url devnet
 *   anchor build
 *   anchor keys list
 */

import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";

const PROGRAM_ID = new PublicKey("D1YJeGTthCfJ6UnKsQzz79fevvKhfRrT3jhiAC8Ct978");
const DEVNET_URL = clusterApiUrl("devnet");

async function main() {
  console.log("=== DaddyX Devnet Deploy ===");
  console.log(`Program ID: ${PROGRAM_ID.toBase58()}`);
  console.log(`Network: ${DEVNET_URL}`);

  const connection = new Connection(DEVNET_URL, "confirmed");

  // Load wallet from default Solana keypair
  const walletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  if (!fs.existsSync(walletPath)) {
    console.error("No wallet found. Run: solana-keygen new");
    process.exit(1);
  }

  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const balance = await connection.getBalance(walletKeypair.publicKey);
  console.log(`Wallet: ${walletKeypair.publicKey.toBase58()}`);
  console.log(`Balance: ${balance / 1e9} SOL`);

  if (balance < 0.5 * 1e9) {
    console.log("Requesting airdrop...");
    const sig = await connection.requestAirdrop(walletKeypair.publicKey, 2 * 1e9);
    await connection.confirmTransaction(sig);
    console.log("Airdrop confirmed");
  }

  // Deploy using anchor CLI
  console.log("\nDeploy command:");
  console.log("  anchor build && anchor deploy --provider.cluster devnet");
  console.log("\nAfter deploy, initialize platform:");
  console.log(`  anchor run initialize-platform`);

  console.log("\n=== Demo Event Seed ===");
  console.log("Events to initialize on-chain:");
  const demoEvents = [
    {
      name: "Kigali Jazz Festival",
      initialPriceSol: 0.05,
      stepFactor: "1.5x",
      payoutFactor: "1.2x",
      tokens: 50,
      revenueShare: "20%",
      preSeedPurchases: 6,
    },
    {
      name: "Uganda Netball League Finals",
      initialPriceSol: 0.02,
      stepFactor: "2.0x",
      payoutFactor: "1.2x",
      tokens: 100,
      revenueShare: "15%",
      preSeedPurchases: 4,
    },
    {
      name: "Doha Electronic Night",
      initialPriceSol: 0.1,
      stepFactor: "1.5x",
      payoutFactor: "1.2x",
      tokens: 200,
      revenueShare: "25%",
      preSeedPurchases: 3,
    },
  ];

  for (const evt of demoEvents) {
    console.log(`\n${evt.name}`);
    console.log(`  Initial: ${evt.initialPriceSol} SOL | S: ${evt.stepFactor} | P: ${evt.payoutFactor}`);
    console.log(`  Tokens: ${evt.tokens} | Rev share: ${evt.revenueShare} | Purchases: ${evt.preSeedPurchases}`);
  }

  console.log("\n=== Submission Info ===");
  console.log(`Program ID on devnet: ${PROGRAM_ID.toBase58()}`);
  console.log("Explorer: https://explorer.solana.com/address/" + PROGRAM_ID.toBase58() + "?cluster=devnet");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
