import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import { createHash } from "crypto";
import * as fs from "fs";

// Configuration - CHANGE FOR MAINNET
const PROGRAM_ID = new PublicKey("5gPGpcXTq1R2chrEP9qPaFw4i1ge5ZgG2n7xnrUGZHPk");
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";

/**
 * Initialize the treasury PDA with rent-exempt minimum
 * Run once per network (devnet/mainnet)
 *
 * Usage:
 *   npx tsx initTreasury.ts <path-to-keypair.json>
 *
 * Example:
 *   npx tsx initTreasury.ts ~/.config/solana/id.json
 */
async function initializeTreasury(payerKeypairPath: string) {
    // Load payer keypair
    const keypairData = JSON.parse(fs.readFileSync(payerKeypairPath, "utf-8"));
    const payer = Keypair.fromSecretKey(new Uint8Array(keypairData));

    const connection = new Connection(RPC_URL, "confirmed");

    // Derive treasury PDA
    const [treasuryPDA, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("treasury")],
        PROGRAM_ID
    );

    console.log("=== Initialize Treasury PDA ===");
    console.log("Program ID:", PROGRAM_ID.toBase58());
    console.log("Treasury PDA:", treasuryPDA.toBase58());
    console.log("Payer:", payer.publicKey.toBase58());
    console.log("RPC:", RPC_URL);

    // Check current treasury balance
    const treasuryBalance = await connection.getBalance(treasuryPDA);
    console.log("Current treasury balance:", treasuryBalance / 1e9, "SOL");

    if (treasuryBalance >= 890_880) {
        console.log("Treasury already initialized with rent-exempt minimum!");
        return;
    }

    // Build instruction
    const discriminator = createHash("sha256")
        .update("global:initialize_treasury")
        .digest()
        .slice(0, 8);

    const keys = [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },  // payer
        { pubkey: treasuryPDA, isSigner: false, isWritable: true },      // treasury
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false } // system_program
    ];

    const instruction = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys,
        data: discriminator
    });

    const transaction = new Transaction().add(instruction);

    console.log("\nSending transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);

    console.log("✅ Treasury initialized!");
    console.log("Signature:", signature);

    // Verify
    const newBalance = await connection.getBalance(treasuryPDA);
    console.log("New treasury balance:", newBalance / 1e9, "SOL");
}

// CLI
const keypairPath = process.argv[2];
if (!keypairPath) {
    console.error("Usage: npx tsx initTreasury.ts <path-to-keypair.json>");
    console.error("Example: npx tsx initTreasury.ts ~/.config/solana/id.json");
    process.exit(1);
}

initializeTreasury(keypairPath).catch(console.error);
