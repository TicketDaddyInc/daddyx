// tests/daddyx.ts
// DaddyX — Colosseum Frontier Hackathon · Anchor Test Suite
// Covers: platform init → creator vetting → event init → purchase → revenue → claim
//
// Run: anchor test --provider.cluster devnet
// Or:  anchor test  (uses localnet by default — faster for CI)

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

// ---------------------------------------------------------
// Import the generated IDL type — run `anchor build` first
// ---------------------------------------------------------
import { Daddyx } from "../target/types/daddyx";

// =========================================================
// HELPERS
// =========================================================

async function airdrop(
  connection: Connection,
  pubkey: PublicKey,
  sol = 2
): Promise<void> {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

function lamports(sol: number): BN {
  return new BN(sol * LAMPORTS_PER_SOL);
}

// Derive PDA helpers — seed structure must match your Anchor program exactly.
// Update seeds here if your program uses different seeds.
function deriveEventConfig(
  programId: PublicKey,
  organizer: PublicKey,
  eventId: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("event_config"), organizer.toBuffer(), Buffer.from(eventId)],
    programId
  );
}

function deriveTokenState(
  programId: PublicKey,
  eventConfig: PublicKey,
  buyer: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("token_state"), eventConfig.toBuffer(), buyer.toBuffer()],
    programId
  );
}

function deriveEscrow(
  programId: PublicKey,
  eventConfig: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), eventConfig.toBuffer()],
    programId
  );
}

function deriveCreatorProfile(
  programId: PublicKey,
  creator: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator_profile"), creator.toBuffer()],
    programId
  );
}

function derivePlatformConfig(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("platform_config")],
    programId
  );
}

// =========================================================
// TEST PARAMETERS
// Mirrors the FeedbackFunding math:
//   Step Factor [S] = 1.5   → each purchase costs 1.5× the previous price
//   Payout Factor [P] = 1.2 → outbid holders receive 1.2× their purchase price
//   Revenue Share [O] = 20% → final holder earns 20% of net event revenue
//   Initial Price [I] = 0.1 SOL
//
// Exploit-prevention invariant: S > P (always enforced at program level)
//   1.5 > 1.2 ✓ — re-buying after being outbid is always net-negative
// =========================================================
const EVENT_ID = "test-kigali-jazz-001";
const INITIAL_PRICE_SOL = 0.1;
const STEP_FACTOR_BPS = 15000; // 150.00% = 1.5× in basis points (×10000)
const PAYOUT_FACTOR_BPS = 12000; // 120.00% = 1.2× in basis points
const REVENUE_SHARE_BPS = 2000; // 20.00%
const PLATFORM_FEE_BPS = 250; // 2.5%

// =========================================================
// MAIN TEST SUITE
// =========================================================
describe("DaddyX Protocol", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Daddyx as Program<Daddyx>;
  const connection = provider.connection;

  // Keypairs
  const admin = provider.wallet as anchor.Wallet;
  const organizer = Keypair.generate();
  const fan1 = Keypair.generate(); // first buyer
  const fan2 = Keypair.generate(); // second buyer — outbids fan1
  const oracle = Keypair.generate(); // signs report_revenue

  // PDAs (populated in before())
  let platformConfigPda: PublicKey;
  let eventConfigPda: PublicKey;
  let escrowPda: PublicKey;
  let creatorProfilePda: PublicKey;
  let fan1TokenState: PublicKey;
  let fan2TokenState: PublicKey;

  // Prices (computed after fetching on-chain state)
  let fan1PurchasePrice: BN; // = INITIAL_PRICE (0.1 SOL)
  let fan2PurchasePrice: BN; // = fan1Price * S  (0.15 SOL)

  // -------------------------------------------------------
  // SETUP
  // -------------------------------------------------------
  before(async () => {
    // Airdrop to all test wallets
    await Promise.all([
      airdrop(connection, organizer.publicKey),
      airdrop(connection, fan1.publicKey),
      airdrop(connection, fan2.publicKey),
      airdrop(connection, oracle.publicKey, 0.5),
    ]);

    // Derive all PDAs
    [platformConfigPda] = derivePlatformConfig(program.programId);
    [creatorProfilePda] = deriveCreatorProfile(
      program.programId,
      organizer.publicKey
    );
    [eventConfigPda] = deriveEventConfig(
      program.programId,
      organizer.publicKey,
      EVENT_ID
    );
    [escrowPda] = deriveEscrow(program.programId, eventConfigPda);
    [fan1TokenState] = deriveTokenState(
      program.programId,
      eventConfigPda,
      fan1.publicKey
    );
    [fan2TokenState] = deriveTokenState(
      program.programId,
      eventConfigPda,
      fan2.publicKey
    );

    // Set initial prices
    fan1PurchasePrice = lamports(INITIAL_PRICE_SOL);
    // fan2 price = fan1Price * stepFactor (1.5) = 0.15 SOL
    fan2PurchasePrice = fan1PurchasePrice
      .mul(new BN(STEP_FACTOR_BPS))
      .div(new BN(10000));
  });

  // =========================================================
  // 1. PLATFORM INITIALIZATION
  // =========================================================
  describe("1. Platform Setup", () => {
    it("initializes the platform config", async () => {
      await program.methods
        .initializePlatform(
          admin.publicKey, // admin
          oracle.publicKey, // oracle authority
          PLATFORM_FEE_BPS // 2.5%
        )
        .accounts({
          admin: admin.publicKey,
          platformConfig: platformConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const config = await program.account.platformConfig.fetch(
        platformConfigPda
      );
      assert.ok(config.admin.equals(admin.publicKey), "admin mismatch");
      assert.equal(
        config.feeBps,
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
      await program.methods
        .applyAsCreator("Kigali Jazz Festival", "kigali-jazz.com")
        .accounts({
          creator: organizer.publicKey,
          creatorProfile: creatorProfilePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();

      const profile = await program.account.creatorProfile.fetch(
        creatorProfilePda
      );
      assert.equal(
        profile.status.toString(),
        "pending",
        "status should be Pending after apply"
      );
    });

    it("admin approves the creator", async () => {
      await program.methods
        .approveCreator()
        .accounts({
          admin: admin.publicKey,
          platformConfig: platformConfigPda,
          creatorProfile: creatorProfilePda,
        })
        .rpc();

      const profile = await program.account.creatorProfile.fetch(
        creatorProfilePda
      );
      assert.equal(
        profile.status.toString(),
        "approved",
        "status should be Approved after admin approval"
      );
    });

    it("rejects un-approved organizer from initializing an event", async () => {
      const badOrganizer = Keypair.generate();
      await airdrop(connection, badOrganizer.publicKey);

      const [badProfile] = deriveCreatorProfile(
        program.programId,
        badOrganizer.publicKey
      );
      const [badEvent] = deriveEventConfig(
        program.programId,
        badOrganizer.publicKey,
        "unauthorized-event"
      );
      const [badEscrow] = deriveEscrow(program.programId, badEvent);

      // Apply but do NOT approve
      await program.methods
        .applyAsCreator("Bad Actor", "bad.example")
        .accounts({
          creator: badOrganizer.publicKey,
          creatorProfile: badProfile,
          systemProgram: SystemProgram.programId,
        })
        .signers([badOrganizer])
        .rpc();

      try {
        await program.methods
          .initializeEvent(
            "unauthorized-event",
            lamports(INITIAL_PRICE_SOL),
            STEP_FACTOR_BPS,
            PAYOUT_FACTOR_BPS,
            REVENUE_SHARE_BPS,
            new BN(100),
            new BN(Math.floor(Date.now() / 1000) + 86400)
          )
          .accounts({
            organizer: badOrganizer.publicKey,
            creatorProfile: badProfile,
            eventConfig: badEvent,
            escrow: badEscrow,
            systemProgram: SystemProgram.programId,
          })
          .signers([badOrganizer])
          .rpc();
        assert.fail("should have thrown — creator not approved");
      } catch (err: any) {
        assert.include(
          err.message,
          "CreatorNotApproved",
          "wrong error: " + err.message
        );
      }
    });
  });

  // =========================================================
  // 3. EVENT INITIALIZATION
  // =========================================================
  describe("3. Event Initialization", () => {
    const eventEndTs = new BN(Math.floor(Date.now() / 1000) + 7 * 86400); // 7 days
    const maxTokens = new BN(50);

    it("initializes event with correct parameters", async () => {
      await program.methods
        .initializeEvent(
          EVENT_ID,
          fan1PurchasePrice, // initial price [I]
          STEP_FACTOR_BPS, // [S] = 1.5
          PAYOUT_FACTOR_BPS, // [P] = 1.2
          REVENUE_SHARE_BPS, // [O] = 20%
          maxTokens,
          eventEndTs
        )
        .accounts({
          organizer: organizer.publicKey,
          creatorProfile: creatorProfilePda,
          eventConfig: eventConfigPda,
          escrow: escrowPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();

      const config = await program.account.eventConfig.fetch(eventConfigPda);

      assert.ok(
        config.organizer.equals(organizer.publicKey),
        "organizer mismatch"
      );
      assert.equal(config.stepFactorBps, STEP_FACTOR_BPS, "step factor mismatch");
      assert.equal(
        config.payoutFactorBps,
        PAYOUT_FACTOR_BPS,
        "payout factor mismatch"
      );
      assert.equal(
        config.revenueShareBps,
        REVENUE_SHARE_BPS,
        "revenue share mismatch"
      );
      assert.ok(
        config.currentPrice.eq(fan1PurchasePrice),
        "initial price mismatch"
      );
    });

    it("enforces S > P invariant at initialization", async () => {
      // S=1.2, P=1.5 — should fail because P > S (exploit vector)
      const [badEventPda] = deriveEventConfig(
        program.programId,
        organizer.publicKey,
        "bad-params-event"
      );
      const [badEscrowPda] = deriveEscrow(program.programId, badEventPda);

      try {
        await program.methods
          .initializeEvent(
            "bad-params-event",
            lamports(0.1),
            12000, // S = 1.2
            15000, // P = 1.5 — INVALID: P > S
            REVENUE_SHARE_BPS,
            new BN(50),
            new BN(Math.floor(Date.now() / 1000) + 86400)
          )
          .accounts({
            organizer: organizer.publicKey,
            creatorProfile: creatorProfilePda,
            eventConfig: badEventPda,
            escrow: badEscrowPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([organizer])
          .rpc();
        assert.fail("should have rejected P > S");
      } catch (err: any) {
        assert.include(
          err.message,
          "InvalidParameters",
          "wrong error: " + err.message
        );
      }
    });
  });

  // =========================================================
  // 4. TOKEN PURCHASE — FAN 1
  // =========================================================
  describe("4. Token Purchase", () => {
    let fan1BalanceBefore: number;

    it("fan1 purchases the first token at initial price", async () => {
      fan1BalanceBefore = await connection.getBalance(fan1.publicKey);

      await program.methods
        .purchaseToken(fan1PurchasePrice)
        .accounts({
          buyer: fan1.publicKey,
          eventConfig: eventConfigPda,
          tokenState: fan1TokenState,
          previousOwner: organizer.publicKey, // organizer is initial "holder"
          escrow: escrowPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan1])
        .rpc();

      // Verify TokenState created for fan1
      const ts = await program.account.tokenState.fetch(fan1TokenState);
      assert.ok(ts.owner.equals(fan1.publicKey), "owner should be fan1");
      assert.ok(
        ts.purchasePrice.eq(fan1PurchasePrice),
        "purchase price mismatch"
      );

      // Verify EventConfig updated current price to next step
      const config = await program.account.eventConfig.fetch(eventConfigPda);
      const expectedNextPrice = fan1PurchasePrice
        .mul(new BN(STEP_FACTOR_BPS))
        .div(new BN(10000));
      assert.ok(
        config.currentPrice.eq(expectedNextPrice),
        `next price should be ${expectedNextPrice.toString()} lamports`
      );

      // Verify SOL left fan1's wallet
      const fan1BalanceAfter = await connection.getBalance(fan1.publicKey);
      const spent = fan1BalanceBefore - fan1BalanceAfter;
      // spent ≈ purchasePrice + tx fee (tx fee < 0.001 SOL on devnet)
      assert.isAbove(
        spent,
        fan1PurchasePrice.toNumber() - 5000,
        "fan1 did not spend the correct amount"
      );
    });

    it("fan2 outbids fan1 — fan1 receives guaranteed 1.2× payout instantly", async () => {
      const fan1BalanceBeforeOutbid = await connection.getBalance(fan1.publicKey);

      await program.methods
        .purchaseToken(fan2PurchasePrice)
        .accounts({
          buyer: fan2.publicKey,
          eventConfig: eventConfigPda,
          tokenState: fan2TokenState,
          previousOwner: fan1.publicKey, // fan1 is outbid, receives payout
          escrow: escrowPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan2])
        .rpc();

      // fan1 should have received payout = purchasePrice * P = 0.1 * 1.2 = 0.12 SOL
      const fan1PayoutExpected = fan1PurchasePrice
        .mul(new BN(PAYOUT_FACTOR_BPS))
        .div(new BN(10000));

      const fan1BalanceAfterOutbid = await connection.getBalance(fan1.publicKey);
      const fan1Received = fan1BalanceAfterOutbid - fan1BalanceBeforeOutbid;

      // Received ≈ payout amount (within 1000 lamports for rounding)
      assert.approximately(
        fan1Received,
        fan1PayoutExpected.toNumber(),
        1000,
        `fan1 should have received ~${fan1PayoutExpected.toNumber()} lamports payout`
      );

      // Verify fan2 is now the token owner
      const config = await program.account.eventConfig.fetch(eventConfigPda);
      assert.ok(
        config.currentOwner.equals(fan2.publicKey),
        "current owner should be fan2"
      );
    });

    it("rejects purchase with wrong SOL amount", async () => {
      const wrongPrice = fan2PurchasePrice.subn(1); // one lamport short

      try {
        await program.methods
          .purchaseToken(wrongPrice)
          .accounts({
            buyer: fan1.publicKey,
            eventConfig: eventConfigPda,
            tokenState: fan1TokenState,
            previousOwner: fan2.publicKey,
            escrow: escrowPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([fan1])
          .rpc();
        assert.fail("should have rejected incorrect payment amount");
      } catch (err: any) {
        assert.include(
          err.message,
          "IncorrectPaymentAmount",
          "wrong error: " + err.message
        );
      }
    });
  });

  // =========================================================
  // 5. REVENUE REPORTING (oracle-signed)
  // =========================================================
  describe("5. Revenue Reporting", () => {
    // Simulate 500 SOL gross event revenue
    const grossRevenueLamports = lamports(500);

    it("oracle reports verified gross revenue for the event", async () => {
      await program.methods
        .reportRevenue(grossRevenueLamports)
        .accounts({
          oracle: oracle.publicKey,
          platformConfig: platformConfigPda,
          eventConfig: eventConfigPda,
        })
        .signers([oracle])
        .rpc();

      const config = await program.account.eventConfig.fetch(eventConfigPda);
      assert.ok(
        config.reportedRevenueLamports.eq(grossRevenueLamports),
        "reported revenue mismatch"
      );
      assert.ok(config.settled, "event should be marked as settled");
    });

    it("rejects revenue report from non-oracle signer", async () => {
      const imposter = Keypair.generate();
      await airdrop(connection, imposter.publicKey, 0.1);

      try {
        await program.methods
          .reportRevenue(lamports(1000))
          .accounts({
            oracle: imposter.publicKey,
            platformConfig: platformConfigPda,
            eventConfig: eventConfigPda,
          })
          .signers([imposter])
          .rpc();
        assert.fail("should have rejected non-oracle signer");
      } catch (err: any) {
        assert.include(
          err.message,
          "Unauthorized",
          "wrong error: " + err.message
        );
      }
    });
  });

  // =========================================================
  // 6. REVENUE CLAIM — FAN 2 (final token holder)
  // =========================================================
  describe("6. Revenue Claim", () => {
    it("fan2 (final holder) claims revenue share and receives correct payout", async () => {
      const fan2BalanceBefore = await connection.getBalance(fan2.publicKey);

      await program.methods
        .claimRevenue()
        .accounts({
          claimant: fan2.publicKey,
          eventConfig: eventConfigPda,
          tokenState: fan2TokenState,
          escrow: escrowPda,
          platformConfig: platformConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan2])
        .rpc();

      // Expected revenue share:
      // grossRevenue = 500 SOL
      // platformFee  = 500 * 2.5% = 12.5 SOL
      // netRevenue   = 487.5 SOL
      // fan2 share   = 487.5 * 20% = 97.5 SOL
      const grossLamports = 500 * LAMPORTS_PER_SOL;
      const platformFee = Math.floor(grossLamports * PLATFORM_FEE_BPS / 10000);
      const netRevenue = grossLamports - platformFee;
      const expectedShare = Math.floor(netRevenue * REVENUE_SHARE_BPS / 10000);

      const fan2BalanceAfter = await connection.getBalance(fan2.publicKey);
      const received = fan2BalanceAfter - fan2BalanceBefore;

      // Within 10000 lamports for tx fees
      assert.approximately(
        received,
        expectedShare,
        10000,
        `fan2 should have received ~${expectedShare / LAMPORTS_PER_SOL} SOL`
      );

      // TokenState should be marked as claimed
      const ts = await program.account.tokenState.fetch(fan2TokenState);
      assert.ok(ts.claimed, "token should be marked as claimed");
    });

    it("rejects double-claim on the same token", async () => {
      try {
        await program.methods
          .claimRevenue()
          .accounts({
            claimant: fan2.publicKey,
            eventConfig: eventConfigPda,
            tokenState: fan2TokenState,
            escrow: escrowPda,
            platformConfig: platformConfigPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([fan2])
          .rpc();
        assert.fail("double-claim should have been rejected");
      } catch (err: any) {
        assert.include(
          err.message,
          "AlreadyClaimed",
          "wrong error: " + err.message
        );
      }
    });
  });

  // =========================================================
  // 7. CANCEL + REFUND PATH
  // =========================================================
  describe("7. Cancel & Refund", () => {
    // Set up a fresh event for the cancel test
    const cancelEventId = "cancel-test-event";
    let cancelEventPda: PublicKey;
    let cancelEscrowPda: PublicKey;
    let fan3: Keypair;
    let fan3TokenState: PublicKey;

    before(async () => {
      fan3 = Keypair.generate();
      await airdrop(connection, fan3.publicKey);

      [cancelEventPda] = deriveEventConfig(
        program.programId,
        organizer.publicKey,
        cancelEventId
      );
      [cancelEscrowPda] = deriveEscrow(program.programId, cancelEventPda);
      [fan3TokenState] = deriveTokenState(
        program.programId,
        cancelEventPda,
        fan3.publicKey
      );

      // Initialize and purchase on the cancel event
      await program.methods
        .initializeEvent(
          cancelEventId,
          lamports(0.1),
          STEP_FACTOR_BPS,
          PAYOUT_FACTOR_BPS,
          REVENUE_SHARE_BPS,
          new BN(50),
          new BN(Math.floor(Date.now() / 1000) + 86400)
        )
        .accounts({
          organizer: organizer.publicKey,
          creatorProfile: creatorProfilePda,
          eventConfig: cancelEventPda,
          escrow: cancelEscrowPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();

      await program.methods
        .purchaseToken(lamports(0.1))
        .accounts({
          buyer: fan3.publicKey,
          eventConfig: cancelEventPda,
          tokenState: fan3TokenState,
          previousOwner: organizer.publicKey,
          escrow: cancelEscrowPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan3])
        .rpc();
    });

    it("organizer can cancel the event", async () => {
      await program.methods
        .cancelEvent()
        .accounts({
          organizer: organizer.publicKey,
          eventConfig: cancelEventPda,
        })
        .signers([organizer])
        .rpc();

      const config = await program.account.eventConfig.fetch(cancelEventPda);
      assert.ok(config.cancelled, "event should be marked as cancelled");
    });

    it("fan3 can claim full refund after cancellation", async () => {
      const fan3BalanceBefore = await connection.getBalance(fan3.publicKey);

      await program.methods
        .claimRefund()
        .accounts({
          claimant: fan3.publicKey,
          eventConfig: cancelEventPda,
          tokenState: fan3TokenState,
          escrow: cancelEscrowPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([fan3])
        .rpc();

      const fan3BalanceAfter = await connection.getBalance(fan3.publicKey);
      const refunded = fan3BalanceAfter - fan3BalanceBefore;

      // Should get back the full 0.1 SOL minus tx fee
      assert.approximately(
        refunded,
        0.1 * LAMPORTS_PER_SOL,
        5000,
        "fan3 should have been refunded 0.1 SOL"
      );
    });
  });
});
