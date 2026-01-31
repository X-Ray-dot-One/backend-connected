import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import { createHash } from "crypto";

const PROGRAM_ID = new PublicKey("6Suaf5mvzmogRtVXdckv7Ace8615Fnbu4rNBcnXprAj5");
const connection = new Connection("https://devnet.helius-rpc.com/?api-key=0f803376-0189-4d72-95f6-a5f41cef157d");

/**
 * Crée un post on-chain via le programme X-RAY
 * @param connection - Connexion RPC Solana
 * @param shadowKeypair - Keypair du shadow wallet (signer)
 * @param target - Profil ciblé par le post
 * @param content - Contenu du message
 * @param bid - Montant du bid pour le leaderboard
 * @returns Transaction signature
 */
async function createPost( connection: Connection, shadowKeypair: Keypair, target: string, content: string, bid: bigint): Promise<string>
{
    const [postPDA, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("post"), shadowKeypair.publicKey.toBuffer(), Buffer.from(target)],
        PROGRAM_ID
    );

    const discriminator = createHash("sha256")
        .update("global:create_post")
        .digest()
        .slice(0, 8);

    // Encoder target (String)
    const targetBytes = Buffer.from(target, "utf-8");
    const targetLen = Buffer.alloc(4);
    targetLen.writeUInt32LE(targetBytes.length);

    // Encoder content (String)
    const contentBytes = Buffer.from(content, "utf-8");
    const contentLen = Buffer.alloc(4);
    contentLen.writeUInt32LE(contentBytes.length);

    // Encoder bid (u64)
    const bidBuffer = Buffer.alloc(8);
    bidBuffer.writeBigUInt64LE(bid);

    // Concatener tout
    const data = Buffer.concat([
        discriminator,
        targetLen, targetBytes,
        contentLen, contentBytes,
        bidBuffer
    ]);

        // AccountMetas dans l'ordre du programme Rust
    const keys = [
        { pubkey: shadowKeypair.publicKey, isSigner: true, isWritable: true },  // author
        { pubkey: postPDA, isSigner: false, isWritable: true },                  // post (PDA)
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false } // system_program
    ];

    // Créer l'instruction
    const instruction = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys,
        data
    });

    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(connection, transaction, [shadowKeypair])

    return signature;
}

/**
 * Récupère tous les posts du programme X-RAY
 * @returns Tableau de tous les posts on-chain
 */
async function getAllPosts() {
    const accounts = await connection.getProgramAccounts(PROGRAM_ID);

    const posts = accounts.map(({ pubkey, account }) => {
        const data = account.data;

        // Skip discriminator (8 bytes)
        let offset = 8;

        // Author (32 bytes)
        const author = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;

        // Target (4 bytes len + string)
        const targetLen = data.readUInt32LE(offset);
        offset += 4;
        const target = data.slice(offset, offset + targetLen).toString("utf-8");
        offset += targetLen;

        // Content (4 bytes len + string)
        const contentLen = data.readUInt32LE(offset);
        offset += 4;
        const content = data.slice(offset, offset + contentLen).toString("utf-8");
        offset += contentLen;

        // Bid (8 bytes u64)
        const bid = data.readBigUInt64LE(offset);
        offset += 8;

        // Timestamp (8 bytes i64)
        const timestamp = data.readBigInt64LE(offset);
        offset += 8;

        // Bump (1 byte)
        const bump = data.readUInt8(offset);

        return {
            pubkey: pubkey.toBase58(),
            author: author.toBase58(),
            target,
            content,
            bid,
            timestamp: Number(timestamp),
            bump
        };
    });

    return posts;
}
