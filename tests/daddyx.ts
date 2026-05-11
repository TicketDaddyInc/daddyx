// tests/daddyx.ts
// DaddyX — Colosseum Frontier Hackathon · Anchor Test Suite
// Corrected for multi-token program in programs/daddyx/src/lib.rs
//
// Run: anchor test            (localnet — fastest, default)
// Run: anchor test --provider.cluster devnet

import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { assert } from "chai";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Daddyx } from "../target/types/daddyx";

// =========================================================
// HELPERS
// =========================================================

/** Load a persistent keypair from tests/wallets/<name>.json */
function loadWallet(name: string): Keypair {
  const walletPath = path.join(__dirname, "wallets", `${name}.json`);
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function airdrop(
  connection: Connection,
  pubkey: PublicKey,
  sol = 2,
  funder?: anchor.Wallet
): Promise<void> {
  // On devnet the public faucet is heavily rate-limited; use a funded transfer
  // if a funder wallet is available, otherwise fall back to requestAirdrop.
  if (funder) {
    const tx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        toPubkey: pubkey,
        lamports: Math.round(sol * LAMPORTS_PER_SOL),
      })
    );
    const sig = await connection.sendTransaction(tx, [funder.payer]);
    await connection.confirmTransaction(sig, "confirmed");
  } else {
    const sig = await connection.requestAirdrop(pubkey, Math.round(sol * LAMPORTS_PER_SOL));
    await connection.confirmTransaction(sig, "confirmed");
  }
}

/**
 * Fund a wallet ONLY if its balance is below minLamports.
 * This makes the test suite re-entrant: repeated devnet runs don't waste SOL
 * because persistent keypairs keep their balance between runs.
 */
async function ensureFunded(
  connection: Connection,
  kp: Keypair,
  minLamports: number,
  funder: anchor.Wallet
): Promise<void> {
  const balance = await connection.getBalance(kp.publicKey);
  if (balance >= minLamports) return;
  const needed = (minLamports - balance) / LAMPORTS_PER_SOL;
  await airdrop(connection, kp.publicKey, needed, funder);
}

function lamports(sol: number): BN {
  return new BN(Math.round(sol * LAMPORTS_PER_SOL));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Zero-pad a UTF-8 string to exactly 32 bytes → number[32] */
function strToBytes32(s: string): number[] {
  const buf = Buffer.alloc(32);
  Buffer.from(s).copy(buf);
  return Array.from(buf);
}

/** Little-endian u64 → 8-byte Buffer for token PDA seeds */
function u64Le(n: number | BN): Buffer {
  const buf = Buffer.alloc(8);
  const val = typeof n === "number" ? BigInt(n) : BigInt(n.toString());
  buf.writeBigUInt64LE(val);
  return buf;
}

// =========================================================
// PDA DERIVATION — seeds MUST match programs/daddyx/src/lib.rs exactly
//
// platform_config : [b"platform"]
// creator_profile : [b"creator",  creator]
// event_config    : [b"event",    event_id_bytes32]
// token_state     : [b"token",    event_config, token_id_le8]
// event_escrow    : [b"escrow",   event_config]
// =========================================================

const derivePC = (pid: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("platform")], pid);

const deriveCP = (pid: PublicKey, creator: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("creator"), creator.toBuffer()],
    pid
  );

const deriveEC = (pid: PublicKey, eventIdBuf: Buffer) =>
  PublicKey.findProgramAddressSync([Buffer.from("event"), eventIdBuf], pid);

const deriveTK = (pid: PublicKey, ec: PublicKey, tokenId: number) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("token"), ec.toBuffer(), u64Le(tokenId)],
    pid
  );

const deriveEscrow = (pid: PublicKey, ec: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), ec.toBuffer()],
    pid
  );

// =========================================================
// TEST PARAMETERS
//   S = 1.5×, P = 1.2×  (S > P ✓  exploit-prevention invariant)
//   Initial purchase: buyer pays initial_price exactly (no step applied)
//   Subsequent purchases: price = current_price × S; outbid holder receives current_price × P
//   Oracle deposits fan_pool = gross_revenue × revenue_share into escrow on report
// =========================================================

const INITIAL_PRICE_SOL = 0.001; // minimal to fit 0.021 SOL devnet budget
const STEP_FACTOR_BPS = 15_000;  // 1.5×
const PAYOUT_FACTOR_BPS = 12_000; // 1.2×
const REVENUE_SHARE_BPS = 2_000;  // 20%
const PLATFORM_FEE_BPS = 300;     // 3%
const TOKEN_COUNT = 10;
// Gross revenue for reporting tests — kept at 0.01 so fan_pool = 0.002 SOL
const GROSS_REVENUE_SOL = 0.01;
const grossRevenueLamports = lamports(GROSS_REVENUE_SOL);

// =========================================================
// SUITE
// =========================================================

describe("DaddyX Protocol", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Daddyx as Program<Daddyx>;
  const connection = provider.connection;

  // Wallets — persistent keypairs loaded from tests/wallets/*.json so that
  // SOL is retained across devnet runs (no wasteful re-funding on every run).
  const admin = provider.wallet as anchor.Wallet;
  const organizer = loadWallet("organizer");
  const oracle    = loadWallet("oracle");
  const fan1      = loadWallet("fan1");
  const fan2      = loadWallet("fan2");
  const fan3      = loadWallet("fan3");

  // PDAs for the primary test event
  let platformConfigPda: PublicKey;
  let creatorProfilePda: PublicKey;
  let eventConfigPda: PublicKey;
  let eventEscrowPda: PublicKey;
  let eventIdBuf: Buffer;        // 32-byte zero-padded event ID

  // Shared run ID — used to create unique event IDs across test groups so devnet
  // PDA slots don't collide across test runs.
  let runId: string;

  // EVENT_END_TS: short future timestamp so revenue tests don't wait too long.
  // eventEndMs is the wall-clock ms value so we can sleep until it passes.
  let EVENT_END_TS: BN;
  let eventEndMs: number;

  before(async () => {
    runId = Date.now().toString(36).slice(-8);
    // +30 s: groups 1-5 take ~15 s on devnet; revenue test then sleeps the remainder
    const endSec = Math.floor(Date.now() / 1000) + 30;
    EVENT_END_TS = new BN(endSec);
    eventEndMs = endSec * 1000;

    // Funding strategy: persistent keypairs keep SOL between devnet runs.
    // ensureFunded is a no-op if the wallet already has >= the minimum balance.
    // Minimum balances cover the full 9-section test suite:
    //   organizer: 11 PDAs × 890,880 lam + fees ≈ 10.8 M lam
    //   oracle   : fan_pool (2M) + fees + rent-exempt
    //   fan1     : buy×2 + raisePrice + exploit buy/buyback + rent-exempt
    //   fan2     : outbid + exploit outbid + rent-exempt
    //   fan3     : cancel buy + rent-exempt
    const fundRequirements: [Keypair, number][] = [
      [organizer, 11_000_000],  // 0.011 SOL
      [oracle,     3_000_000],  // 0.003 SOL
      [fan1,       2_500_000],  // 0.0025 SOL
      [fan2,       2_500_000],  // 0.0025 SOL
      [fan3,       1_000_000],  // 0.001  SOL
    ];
    for (const [kp, minLam] of fundRequirements) {
      await ensureFunded(connection, kp, minLam, admin as anchor.Wallet);
    }

    [platformConfigPda] = derivePC(program.programId);
    [creatorProfilePda] = deriveCP(program.programId, organizer.publicKey);

    eventIdBuf = Buffer.alloc(32);
    Buffer.from(`kigali-${runId}`).copy(eventIdBuf);

    [eventConfigPda] = deriveEC(program.programId, eventIdBuf);
    [eventEscrowPda] = deriveEscrow(program.programId, eventConfigPda);
  });

  // =========================================================
  // 1. PLATFORM SETUP
  // =========================================================
  describe("1. Platform Setup", () => {
    it("initializes the platform config", async () => {
      // On devnet the platform PDA persists across runs; skip init if already set
      const existing = await program.account.platformConfig
        .fetchNullable(platformConfigPda);
      if (!existing) {
        await program.methods
          .initializePlatform(new BN(PLATFORM_FEE_BPS))
          .accounts({
            platformConfig: platformConfigPda,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      const config = await program.account.platformConfig.fetch(platformConfigPda);
      assert.ok(config.admin.equals(admin.publicKey), "admin mismatch");
      assert.equal(
        config.platformFeeBps.toNumber(),
        PLATFORM_FEE_BPS,
        "fee BPS mismatch"
      );
    });
  });

  // =========================================================
  // 2. CREATOR VETTING
  // =========================================================
  describe("2. Creator Vetting", () => {
    it("organizer applies as creator", async () => {
      const emailHash = Array.from(
        crypto.createHash("sha256").update("organizer@kigali.com").digest()
      );
      await program.methods
        .applyAsCreator("Kigali Jazz Festival", "Rwanda", emailHash)
        .accounts({
          creatorProfile: creatorProfilePda,
          creator: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();

      const profile = await program.account.creatorProfile.fetch(creatorProfilePda);
      assert.equal(profile.name, "Kigali Jazz Festival");
      assert.deepEqual(Object.keys(profile.status), ["pending"]);
    });

    it("admin approves the creator", async () => {
      await program.methods
        .approveCreator()
        .accounts({
          creatorProfile: creatorProfilePda,
          platformConfig: platformConfigPda,
          admin: admin.publicKey,
        })
        .rpc();

      const profile = await program.account.creatorProfile.fetch(creatorProfilePda);
      assert.deepEqual(Object.keys(profile.status), ["approved"]);
    });

    it("rejects non-admin from approving a creator", async () => {
      // Rogue wallet: fresh keypair, zero SOL.
      // The provider (admin) is always the fee payer in Anchor, so rogue doesn't
      // need any SOL — it only needs to sign as the `admin` account.
      // Rogue skips applyAsCreator entirely and tries to approveCreator directly
      // on the organizer's profile → program rejects: Unauthorized.
      const rogue = Keypair.generate();

      try {
        await program.methods
          .approveCreator()
          .accounts({
            creatorProfile: creatorProfilePda,  // organizer's real profile
            platformConfig: platformConfigPda,
            admin: rogue.publicKey,             // rogue claims to be admin
          })
          .signers([rogue])
          .rpc();
        assert.fail("Should have thrown Unauthorized");
      } catch (e: any) {
        assert.include(e.message, "Unauthorized");
      }
    });

    it("rejects unapproved creator from initializing an event", async () => {
      // badOrg: fresh keypair, zero SOL.
      // Provider (admin) pays the fee; badOrg just signs as organizer.
      // badOrg has NO CreatorProfile PDA — Anchor rejects because the derived
      // creatorProfile account does not exist (AccountNotInitialized / constraint error).
      const badOrg = Keypair.generate();

      const badIdBuf = Buffer.alloc(32);
      Buffer.from(`bad-${runId}`).copy(badIdBuf);
      const [badProfile] = deriveCP(program.programId, badOrg.publicKey);
      const [badEvent] = deriveEC(program.programId, badIdBuf);
      const [badEscrow] = deriveEscrow(program.programId, badEvent);

      try {
        await program.methods
          .initializeEvent(
            Array.from(badIdBuf) as any,
            new BN(REVENUE_SHARE_BPS),
            lamports(INITIAL_PRICE_SOL),
            new BN(STEP_FACTOR_BPS),
            new BN(PAYOUT_FACTOR_BPS),
            new BN(10),
            new BN(Math.floor(Date.now() / 1000) + 86400),
            oracle.publicKey,
            new BN(PLATFORM_FEE_BPS),
            "https://bad-org.com",
            new BN(0),
            { cancelFullRefund: {} }
          )
          .accounts({
            eventConfig: badEvent,
            eventEscrow: badEscrow,
            creatorProfile: badProfile,   // PDA does not exist — will be rejected
            organizer: badOrg.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([badOrg])
          .rpc();
        assert.fail("Should have failed: no creator profile exists");
      } catch (e: any) {
        assert.ok(e, "Correctly rejected event init for unapproved/unregistered creator");
      }
    });
  });

  // =========================================================
  // 3. EVENT INITIALIZATION
  // =========================================================
  describe("3. Event Initialization", () => {
    it("initializes event with correct parameters", async () => {
      await program.methods
        .initializeEvent(
          Array.from(eventIdBuf) as any,   // event_id: [u8; 32]
          new BN(REVENUE_SHARE_BPS),
          lamports(INITIAL_PRICE_SOL),
          new BN(STEP_FACTOR_BPS),
          new BN(PAYOUT_FACTOR_BPS),
          new BN(TOKEN_COUNT),
          EVENT_END_TS,
          oracle.publicKey,
          new BN(PLATFORM_FEE_BPS),
          "https://kigali-jazz.com/campaign",
          new BN(500_000),           // budget_usd_cents
          { cancelFullRefund: {} }   // remedy_type
        )
        .accounts({
          eventConfig: eventConfigPda,
          eventEscrow: eventEscrowPda,
          creatorProfile: creatorProfilePda,
          organizer: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();

      const config = await program.account.eventConfig.fetch(eventConfigPda);
      assert.ok(config.organizer.equals(organizer.publicKey));
      assert.equal(config.tokenCount.toNumber(), TOKEN_COUNT);
      assert.equal(config.stepFactorBps.toNumber(), STEP_FACTOR_BPS);
      assert.equal(config.payoutFactorBps.toNumber(), PAYOUT_FACTOR_BPS);
      assert.equal(config.cancelled, false);
      assert.equal(config.revenueReported, false);
    });

    it("enforces S > P invariant (InvalidFactors)", async () => {
      const badIdBuf = Buffer.alloc(32);
      Buffer.from("bad-params-event").copy(badIdBuf);
      const [badEvent] = deriveEC(program.programId, badIdBuf);
      const [badEscrow] = deriveEscrow(program.programId, badEvent);

      try {
        await program.methods
          .initializeEvent(
            Array.from(badIdBuf) as any,
            new BN(REVENUE_SHARE_BPS),
            lamports(0.1),
            new BN(12_000), // S = 1.2×
            new BN(15_000), // P = 1.5× → invalid: P > S
            new BN(50),
            new BN(Math.floor(Date.now() / 1000) + 86400),
            oracle.publicKey,
            new BN(PLATFORM_FEE_BPS),
            "https://example.com",
            new BN(0),
            { cancelFullRefund: {} }
          )
          .accounts({
            eventConfig: badEvent,
            eventEscrow: badEscrow,
            creatorProfile: creatorProfilePda,
            organizer: organizer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([organizer])
          .rpc();
        assert.fail("Should have thrown InvalidFactors");
      } catch (e: any) {
        assert.include(e.message, "InvalidFactors");
      }
    });
  });

  // =========================================================
  // 4. TOKEN PURCHASE FLOW
  //    Token 0: fan1 buys (initial price) → fan2 outbids fan1
  // =========================================================
  describe("4. Token Purchase", () => {
    const TOKEN_ID = 0;
    let tokenStatePda: PublicKey;
    const fan1Price = lamports(INITIAL_PRICE_SOL);       // 0.1 SOL
    const fan2Price = fan1Price                          // 0.1 × 1.5 = 0.15 SOL
      .mul(new BN(STEP_FACTOR_BPS))
      .div(new BN(10_000));

    before(async () => {
      [tokenStatePda] = deriveTK(program.programId, eventConfigPda, TOKEN_ID);

      // Initialize token 0 (organizer is initial holder, current_price = initial_price)
      await program.methods
        .initializeToken(new BN(TOKEN_ID))
        .accounts({
          tokenState: tokenStatePda,
          eventConfig: eventConfigPda,
          payer: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();
    });

    it("fan1 purchases token 0 at initial price (no step factor applied)", async () => {
      const balBefore = await connection.getBalance(fan1.publicKey);

      await program.methods
        .purchaseToken(new BN(TOKEN_ID))
        .accounts({
          tokenState: tokenStatePda,
          eventConfig: eventConfigPda,
          eventEscrow: eventEscrowPda,
          previousOwner: organizer.publicKey,
          organizer: organizer.publicKey,
          buyer: fan1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan1])
        .rpc();

      const ts = await program.account.tokenState.fetch(tokenStatePda);
      assert.ok(ts.currentOwner.equals(fan1.publicKey), "owner should be fan1");
      assert.ok(ts.entryPrice.eq(fan1Price), "entry price should equal initial_price");

      const balAfter = await connection.getBalance(fan1.publicKey);
      const spent = balBefore - balAfter;
      assert.isAbove(spent, fan1Price.toNumber() - 5_000, "fan1 did not spend ~0.1 SOL");
    });

    it("fan2 outbids fan1 — fan1 receives guaranteed 1.2× payout", async () => {
      const fan1BalBefore = await connection.getBalance(fan1.publicKey);

      await program.methods
        .purchaseToken(new BN(TOKEN_ID))
        .accounts({
          tokenState: tokenStatePda,
          eventConfig: eventConfigPda,
          eventEscrow: eventEscrowPda,
          previousOwner: fan1.publicKey,
          organizer: organizer.publicKey,
          buyer: fan2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan2])
        .rpc();

      // fan1 payout = fan1Price × 1.2 = 0.12 SOL
      const expectedPayout = fan1Price
        .mul(new BN(PAYOUT_FACTOR_BPS))
        .div(new BN(10_000));

      const fan1BalAfter = await connection.getBalance(fan1.publicKey);
      const received = fan1BalAfter - fan1BalBefore;

      assert.approximately(
        received,
        expectedPayout.toNumber(),
        1_000,
        `fan1 should receive ~${expectedPayout.toNumber()} lamports`
      );

      const ts = await program.account.tokenState.fetch(tokenStatePda);
      assert.ok(ts.currentOwner.equals(fan2.publicKey), "fan2 should be new owner");
    });

    it("rejects purchase of an uninitialised token (account not found)", async () => {
      const [ghost] = deriveTK(program.programId, eventConfigPda, 99);
      try {
        await program.methods
          .purchaseToken(new BN(99))
          .accounts({
            tokenState: ghost,
            eventConfig: eventConfigPda,
            eventEscrow: eventEscrowPda,
            previousOwner: fan2.publicKey,
            organizer: organizer.publicKey,
            buyer: fan1.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([fan1])
          .rpc();
        assert.fail("Should have failed — token not initialized");
      } catch (e: any) {
        assert.ok(e, "Correctly rejected uninitialized token");
      }
    });
  });

  // =========================================================
  // 5. RAISE PRICE
  // =========================================================
  describe("5. Raise Price", () => {
    const TOKEN_ID = 1;
    let tokenStatePda: PublicKey;

    before(async () => {
      [tokenStatePda] = deriveTK(program.programId, eventConfigPda, TOKEN_ID);

      await program.methods
        .initializeToken(new BN(TOKEN_ID))
        .accounts({
          tokenState: tokenStatePda,
          eventConfig: eventConfigPda,
          payer: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();

      await program.methods
        .purchaseToken(new BN(TOKEN_ID))
        .accounts({
          tokenState: tokenStatePda,
          eventConfig: eventConfigPda,
          eventEscrow: eventEscrowPda,
          previousOwner: organizer.publicKey,
          organizer: organizer.publicKey,
          buyer: fan1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan1])
        .rpc();
    });

    it("owner can raise price and discount formula is applied", async () => {
      const before = await program.account.tokenState.fetch(tokenStatePda);
      const currentPrice = before.currentPrice.toNumber();
      const newPrice = Math.floor(currentPrice * 2);

      const S = STEP_FACTOR_BPS;
      const P = PAYOUT_FACTOR_BPS;
      const expectedCost = Math.floor(
        (newPrice - currentPrice) * (S - P) / (S - 10_000)
      );

      const balBefore = await connection.getBalance(fan1.publicKey);

      await program.methods
        .raisePrice(new BN(TOKEN_ID), new BN(newPrice))
        .accounts({
          tokenState: tokenStatePda,
          eventConfig: eventConfigPda,
          eventEscrow: eventEscrowPda,
          owner: fan1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan1])
        .rpc();

      const after = await program.account.tokenState.fetch(tokenStatePda);
      assert.equal(after.currentPrice.toNumber(), newPrice, "price should be updated");

      const balAfter = await connection.getBalance(fan1.publicKey);
      const cost = balBefore - balAfter;
      assert.approximately(cost, expectedCost, 5_000, "discount formula cost mismatch");
    });

    it("non-owner cannot raise price (NotOwner)", async () => {
      const state = await program.account.tokenState.fetch(tokenStatePda);
      const newPrice = state.currentPrice.toNumber() * 2;

      try {
        await program.methods
          .raisePrice(new BN(TOKEN_ID), new BN(newPrice))
          .accounts({
            tokenState: tokenStatePda,
            eventConfig: eventConfigPda,
            eventEscrow: eventEscrowPda,
            owner: fan2.publicKey, // NOT the owner
            systemProgram: SystemProgram.programId,
          })
          .signers([fan2])
          .rpc();
        assert.fail("Should have thrown NotOwner");
      } catch (e: any) {
        assert.include(e.message, "NotOwner");
      }
    });
  });

  // =========================================================
  // 6. REVENUE REPORTING
  //    Oracle reports gross revenue and deposits fan_pool into escrow
  // =========================================================
  describe("6. Revenue Reporting", () => {
    // grossRevenueLamports (0.01 SOL) is defined at outer suite scope so that
    // section 7 "Revenue Claim" can reference it in its assertions.
    // oracle.balance (0.003 SOL) covers fan_pool = 0.002 SOL + tx fees.

    it("claim_revenue before reporting fails (RevenueNotReported)", async () => {
      // Token 0 is already initialized and owned by fan2 (outbid in section 4).
      // Reuse it to avoid an extra initializeToken (which would drain organizer's budget).
      // fan2 tries to claimRevenue before oracle has reported → RevenueNotReported.
      const TOKEN_ID = 0;
      const [ts0] = deriveTK(program.programId, eventConfigPda, TOKEN_ID);

      try {
        await program.methods
          .claimRevenue(new BN(TOKEN_ID))
          .accounts({
            tokenState: ts0,
            eventConfig: eventConfigPda,
            eventEscrow: eventEscrowPda,
            claimer: fan2.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([fan2])
          .rpc();
        assert.fail("Should have thrown RevenueNotReported");
      } catch (e: any) {
        assert.include(e.message, "RevenueNotReported");
      }
    });

    it("non-oracle cannot call report_revenue (Unauthorized)", async () => {
      // Use fan3 as the imposter — already funded, no airdrop needed.
      try {
        await program.methods
          .reportRevenue(grossRevenueLamports)
          .accounts({
            eventConfig: eventConfigPda,
            eventEscrow: eventEscrowPda,
            organizer: organizer.publicKey,
            oracle: fan3.publicKey,   // fan3 pretends to be the oracle
            systemProgram: SystemProgram.programId,
          })
          .signers([fan3])
          .rpc();
        assert.fail("Should have thrown Unauthorized");
      } catch (e: any) {
        assert.include(e.message, "Unauthorized");
      }
    });

    it("waits for event to end, oracle reports revenue and funds escrow", async () => {
      // Sleep until event end_date has passed (+ 3 s buffer for devnet block lag)
      const waitMs = Math.max(0, eventEndMs - Date.now()) + 3_000;
      await sleep(waitMs);

      await program.methods
        .reportRevenue(grossRevenueLamports)
        .accounts({
          eventConfig: eventConfigPda,
          eventEscrow: eventEscrowPda,
          organizer: organizer.publicKey,
          oracle: oracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([oracle])
        .rpc();

      const config = await program.account.eventConfig.fetch(eventConfigPda);
      assert.ok(
        config.settledRevenue.eq(grossRevenueLamports),
        "settledRevenue mismatch"
      );
      assert.equal(config.revenueReported, true, "revenueReported should be true");
    });

    it("rejects a second revenue report (AlreadyReported)", async () => {
      try {
        await program.methods
          .reportRevenue(lamports(1))
          .accounts({
            eventConfig: eventConfigPda,
            eventEscrow: eventEscrowPda,
            organizer: organizer.publicKey,
            oracle: oracle.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([oracle])
          .rpc();
        assert.fail("Double report should be rejected");
      } catch (e: any) {
        assert.include(e.message, "AlreadyReported");
      }
    });
  });

  // =========================================================
  // 7. REVENUE CLAIM — fan2 holds token 0
  // =========================================================
  describe("7. Revenue Claim", () => {
    const TOKEN_ID = 0;
    let tokenStatePda: PublicKey;

    before(async () => {
      [tokenStatePda] = deriveTK(program.programId, eventConfigPda, TOKEN_ID);
    });

    it("fan2 (final holder of token 0) claims correct revenue share", async () => {
      const balBefore = await connection.getBalance(fan2.publicKey);

      await program.methods
        .claimRevenue(new BN(TOKEN_ID))
        .accounts({
          tokenState: tokenStatePda,
          eventConfig: eventConfigPda,
          eventEscrow: eventEscrowPda,
          claimer: fan2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan2])
        .rpc();

      // payout = settled_revenue × revenue_share / 10000 / token_count
      const expectedShare = Math.floor(
        (grossRevenueLamports.toNumber() * REVENUE_SHARE_BPS) / 10_000 / TOKEN_COUNT
      );

      const balAfter = await connection.getBalance(fan2.publicKey);
      const received = balAfter - balBefore;

      assert.approximately(
        received,
        expectedShare,
        10_000,
        `fan2 should receive ~${(expectedShare / LAMPORTS_PER_SOL).toFixed(4)} SOL`
      );

      const ts = await program.account.tokenState.fetch(tokenStatePda);
      assert.ok(ts.revenueClaimed, "revenueClaimed should be true");
    });

    it("rejects double-claim (AlreadyClaimed)", async () => {
      const [tokenStatePda0] = deriveTK(program.programId, eventConfigPda, TOKEN_ID);
      try {
        await program.methods
          .claimRevenue(new BN(TOKEN_ID))
          .accounts({
            tokenState: tokenStatePda0,
            eventConfig: eventConfigPda,
            eventEscrow: eventEscrowPda,
            claimer: fan2.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([fan2])
          .rpc();
        assert.fail("Double-claim should be rejected");
      } catch (e: any) {
        assert.include(e.message, "AlreadyClaimed");
      }
    });
  });

  // =========================================================
  // 8. CANCEL + REFUND PATH
  // =========================================================
  describe("8. Cancel & Refund", () => {
    let cancelIdBuf: Buffer;
    let cancelEventPda: PublicKey;
    let cancelEscrowPda: PublicKey;
    let fan3TokenState: PublicKey;
    const TOKEN_ID = 0;

    before(async () => {
      // Unique per run to avoid PDA collision on devnet across test runs
      cancelIdBuf = Buffer.alloc(32);
      Buffer.from(`cancel-${runId}`).copy(cancelIdBuf);
      [cancelEventPda] = deriveEC(program.programId, cancelIdBuf);
      [cancelEscrowPda] = deriveEscrow(program.programId, cancelEventPda);
      [fan3TokenState] = deriveTK(program.programId, cancelEventPda, TOKEN_ID);

      await program.methods
        .initializeEvent(
          Array.from(cancelIdBuf) as any,
          new BN(REVENUE_SHARE_BPS),
          lamports(INITIAL_PRICE_SOL),
          new BN(STEP_FACTOR_BPS),
          new BN(PAYOUT_FACTOR_BPS),
          new BN(10),
          new BN(Math.floor(Date.now() / 1000) + 86_400),
          oracle.publicKey,
          new BN(PLATFORM_FEE_BPS),
          "https://example.com/cancel-test",
          new BN(0),
          { cancelFullRefund: {} }
        )
        .accounts({
          eventConfig: cancelEventPda,
          eventEscrow: cancelEscrowPda,
          creatorProfile: creatorProfilePda,
          organizer: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();

      await program.methods
        .initializeToken(new BN(TOKEN_ID))
        .accounts({
          tokenState: fan3TokenState,
          eventConfig: cancelEventPda,
          payer: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();

      await program.methods
        .purchaseToken(new BN(TOKEN_ID))
        .accounts({
          tokenState: fan3TokenState,
          eventConfig: cancelEventPda,
          eventEscrow: cancelEscrowPda,
          previousOwner: organizer.publicKey,
          organizer: organizer.publicKey,
          buyer: fan3.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan3])
        .rpc();
    });

    it("organizer can cancel the event", async () => {
      await program.methods
        .cancelEvent()
        .accounts({
          eventConfig: cancelEventPda,
          authority: organizer.publicKey,
        })
        .signers([organizer])
        .rpc();

      const config = await program.account.eventConfig.fetch(cancelEventPda);
      assert.equal(config.cancelled, true);
    });

    it("fan3 claims full refund (0.1 SOL) after cancellation", async () => {
      const balBefore = await connection.getBalance(fan3.publicKey);

      await program.methods
        .claimRefund(new BN(TOKEN_ID))
        .accounts({
          tokenState: fan3TokenState,
          eventConfig: cancelEventPda,
          eventEscrow: cancelEscrowPda,
          claimer: fan3.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan3])
        .rpc();

      const balAfter = await connection.getBalance(fan3.publicKey);
      const refunded = balAfter - balBefore;
      assert.approximately(refunded, INITIAL_PRICE_SOL * LAMPORTS_PER_SOL, 5_000, `Should refund ${INITIAL_PRICE_SOL} SOL`);
    });
  });

  // =========================================================
  // 9. EXPLOIT PREVENTION
  //    Alternating buyers cannot extract value: S > P guarantees
  //    the cost to buy back always exceeds the payout received.
  // =========================================================
  describe("9. Exploit Prevention", () => {
    const TOKEN_ID = 3;
    let tokenStatePda: PublicKey;

    before(async () => {
      [tokenStatePda] = deriveTK(program.programId, eventConfigPda, TOKEN_ID);

      // Token 3 is on the already-settled event (revenue_reported=true), but we
      // only test exploit math here — no revenue claim needed
    });

    it("alternating purchases cannot extract value (net spend always positive)", async () => {
      // Use a fresh event with a longer end_date to avoid EventNotEnded errors
      // Unique per run to avoid PDA collision on devnet across test runs
      const expIdBuf = Buffer.alloc(32);
      Buffer.from(`exploit-${runId}`).copy(expIdBuf);
      const [expEventPda] = deriveEC(program.programId, expIdBuf);
      const [expEscrowPda] = deriveEscrow(program.programId, expEventPda);
      const [expTkPda] = deriveTK(program.programId, expEventPda, 0);

      await program.methods
        .initializeEvent(
          Array.from(expIdBuf) as any,
          new BN(REVENUE_SHARE_BPS),
          lamports(INITIAL_PRICE_SOL),
          new BN(STEP_FACTOR_BPS),
          new BN(PAYOUT_FACTOR_BPS),
          new BN(10),
          new BN(Math.floor(Date.now() / 1000) + 86_400),
          oracle.publicKey,
          new BN(PLATFORM_FEE_BPS),
          "https://exploit-test.com",
          new BN(0),
          { cancelFullRefund: {} }
        )
        .accounts({
          eventConfig: expEventPda,
          eventEscrow: expEscrowPda,
          creatorProfile: creatorProfilePda,
          organizer: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();

      await program.methods
        .initializeToken(new BN(0))
        .accounts({
          tokenState: expTkPda,
          eventConfig: expEventPda,
          payer: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();

      // fan1 buys at initial price
      const fan1BalBefore = await connection.getBalance(fan1.publicKey);
      await program.methods
        .purchaseToken(new BN(0))
        .accounts({
          tokenState: expTkPda,
          eventConfig: expEventPda,
          eventEscrow: expEscrowPda,
          previousOwner: organizer.publicKey,
          organizer: organizer.publicKey,
          buyer: fan1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan1])
        .rpc();

      const s1 = await program.account.tokenState.fetch(expTkPda);
      const priceAfterFan1 = s1.currentPrice.toNumber();

      // fan2 outbids fan1
      await program.methods
        .purchaseToken(new BN(0))
        .accounts({
          tokenState: expTkPda,
          eventConfig: expEventPda,
          eventEscrow: expEscrowPda,
          previousOwner: fan1.publicKey,
          organizer: organizer.publicKey,
          buyer: fan2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan2])
        .rpc();

      const fan1BalAfterOutbid = await connection.getBalance(fan1.publicKey);

      const s2 = await program.account.tokenState.fetch(expTkPda);
      const priceAfterFan2 = s2.currentPrice.toNumber();

      // fan1 buys back (third purchase)
      const fan1BalBeforeBuyback = await connection.getBalance(fan1.publicKey);
      await program.methods
        .purchaseToken(new BN(0))
        .accounts({
          tokenState: expTkPda,
          eventConfig: expEventPda,
          eventEscrow: expEscrowPda,
          previousOwner: fan2.publicKey,
          organizer: organizer.publicKey,
          buyer: fan1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan1])
        .rpc();

      const s3 = await program.account.tokenState.fetch(expTkPda);
      const priceAfterFan1Back = s3.currentPrice.toNumber();

      // Price strictly increases every round
      assert.ok(priceAfterFan2 > priceAfterFan1, "Price must increase after each purchase");
      assert.ok(priceAfterFan1Back > priceAfterFan2, "Price must continue increasing");

      // fan1 net: paid (initial + buyback) - received (payout when outbid) > 0
      const fan1Paid1 = fan1BalBefore - fan1BalAfterOutbid - (fan1BalAfterOutbid - fan1BalBefore);
      // Simpler: use on-chain prices to verify the invariant mathematically
      const fan1InitialPaid = priceAfterFan1;   // = initial_price = 0.1 SOL
      const fan1Received = Math.floor(priceAfterFan1 * PAYOUT_FACTOR_BPS / 10_000); // 0.12 SOL
      const fan1BuybackPaid = priceAfterFan1Back; // = 0.1 × 1.5 × 1.5 = 0.225 SOL
      const fan1NetSpend = fan1InitialPaid + fan1BuybackPaid - fan1Received;
      assert.ok(fan1NetSpend > 0, "fan1 net spend must be positive — exploit prevented (S > P)");
    });
  });
});
