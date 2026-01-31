import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { PrivateMessages } from "../target/types/private_messages";
import { randomBytes } from "crypto";
import {
  awaitComputationFinalization,
  getArciumEnv,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  buildFinalizeCompDefTx,
  RescueCipher,
  deserializeLE,
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  x25519,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";
import { expect } from "chai";
import * as nacl from "tweetnacl";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function readKpJson(path: string): Keypair {
  const file = fs.readFileSync(path);
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(file.toString())));
}

async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 20,
  retryDelayMs: number = 500
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return mxePublicKey;
      }
    } catch (error) {
      console.log(`Attempt ${attempt} failed to fetch MXE public key:`, error);
    }

    if (attempt < maxRetries) {
      console.log(
        `Retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(
    `Failed to fetch MXE public key after ${maxRetries} attempts`
  );
}

/**
 * Dérive le PDA du compte utilisateur
 */
function getUserPDA(
  programId: PublicKey,
  userWallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user"), userWallet.toBuffer()],
    programId
  );
}

/**
 * Dérive le PDA d'un message
 */
function getMessagePDA(
  programId: PublicKey,
  sender: PublicKey,
  recipient: PublicKey,
  messageIndex: number
): [PublicKey, number] {
  const indexBuffer = Buffer.alloc(8);
  indexBuffer.writeBigUInt64LE(BigInt(messageIndex));

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("message"),
      sender.toBuffer(),
      recipient.toBuffer(),
      indexBuffer,
    ],
    programId
  );
}

/**
 * Chiffre un message avec la clé publique X25519 du destinataire
 * Utilise NaCl box (X25519 + XSalsa20-Poly1305)
 */
function encryptMessage(
  message: string,
  recipientX25519Pubkey: Uint8Array,
  senderX25519SecretKey: Uint8Array
): { encrypted: Uint8Array; nonce: Uint8Array } {
  const messageBytes = Buffer.from(message, "utf-8");
  const nonce = nacl.randomBytes(24);

  const encrypted = nacl.box(
    messageBytes,
    nonce,
    recipientX25519Pubkey,
    senderX25519SecretKey
  );

  return { encrypted, nonce };
}

/**
 * Déchiffre un message avec la clé privée X25519 du destinataire
 */
function decryptMessage(
  encrypted: Uint8Array,
  nonce: Uint8Array,
  senderX25519Pubkey: Uint8Array,
  recipientX25519SecretKey: Uint8Array
): string {
  const decrypted = nacl.box.open(
    encrypted,
    nonce,
    senderX25519Pubkey,
    recipientX25519SecretKey
  );

  if (!decrypted) {
    throw new Error("Failed to decrypt message");
  }

  return Buffer.from(decrypted).toString("utf-8");
}

// ============================================================================
// TESTS
// ============================================================================

describe("PrivateMessages", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.PrivateMessages as Program<PrivateMessages>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  // Utilisateurs pour les tests
  const alice = readKpJson(`${os.homedir()}/.config/solana/id.json`);
  const bob = Keypair.generate();

  // Clés X25519 pour le chiffrement
  let aliceX25519: nacl.BoxKeyPair;
  let bobX25519: nacl.BoxKeyPair;

  // Event listener helper
  type Event = anchor.IdlEvents<(typeof program)["idl"]>;
  const awaitEvent = async <E extends keyof Event>(
    eventName: E
  ): Promise<Event[E]> => {
    let listenerId: number;
    const event = await new Promise<Event[E]>((res) => {
      listenerId = program.addEventListener(eventName, (event) => {
        res(event);
      });
    });
    await program.removeEventListener(listenerId);
    return event;
  };

  // Arcium env - only needed for MPC tests
  // Will be undefined if ARCIUM_CLUSTER_OFFSET is not set
  let arciumEnv: ReturnType<typeof getArciumEnv> | null = null;
  let clusterAccount: PublicKey | null = null;

  try {
    arciumEnv = getArciumEnv();
    clusterAccount = getClusterAccAddress(arciumEnv.arciumClusterOffset);
  } catch (e) {
    console.log("Arcium env not available - MPC tests will be skipped");
  }

  before(async () => {
    // Générer les clés X25519 pour Alice et Bob
    aliceX25519 = nacl.box.keyPair();
    bobX25519 = nacl.box.keyPair();

    // Airdrop SOL à Bob pour les tests
    const airdropSig = await provider.connection.requestAirdrop(
      bob.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    console.log("Alice wallet:", alice.publicKey.toString());
    console.log("Bob wallet:", bob.publicKey.toString());
    console.log("Alice X25519 pubkey:", Buffer.from(aliceX25519.publicKey).toString("hex"));
    console.log("Bob X25519 pubkey:", Buffer.from(bobX25519.publicKey).toString("hex"));
  });

  // ========================================================================
  // TEST: User Registration
  // ========================================================================

  describe("User Registration", () => {
    it("Alice can register with her X25519 public key", async () => {
      const [userPDA] = getUserPDA(program.programId, alice.publicKey);

      const eventPromise = awaitEvent("userRegistered");

      const tx = await program.methods
        .registerUser(Array.from(aliceX25519.publicKey) as any)
        .accounts({
          owner: alice.publicKey,
          userAccount: userPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([alice])
        .rpc({ commitment: "confirmed" });

      console.log("Alice registered with tx:", tx);

      const event = await eventPromise;
      expect(event.wallet.toString()).to.equal(alice.publicKey.toString());

      // Vérifier le compte
      const userAccount = await program.account.userAccount.fetch(userPDA);
      expect(userAccount.wallet.toString()).to.equal(alice.publicKey.toString());
      expect(Buffer.from(userAccount.x25519Pubkey).toString("hex")).to.equal(
        Buffer.from(aliceX25519.publicKey).toString("hex")
      );
      expect(userAccount.messageCount.toNumber()).to.equal(0);
    });

    it("Bob can register with his X25519 public key", async () => {
      const [userPDA] = getUserPDA(program.programId, bob.publicKey);

      const tx = await program.methods
        .registerUser(Array.from(bobX25519.publicKey) as any)
        .accounts({
          owner: bob.publicKey,
          userAccount: userPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([bob])
        .rpc({ commitment: "confirmed" });

      console.log("Bob registered with tx:", tx);

      const userAccount = await program.account.userAccount.fetch(userPDA);
      expect(userAccount.wallet.toString()).to.equal(bob.publicKey.toString());
    });
  });

  // ========================================================================
  // TEST: Messaging
  // ========================================================================

  describe("Messaging", () => {
    it("Alice can send an encrypted message to Bob", async () => {
      const message = "Hello Bob! This is a secret message.";

      // Chiffrer le message avec la clé publique de Bob
      const { encrypted, nonce } = encryptMessage(
        message,
        bobX25519.publicKey,
        aliceX25519.secretKey
      );

      console.log("Original message:", message);
      console.log("Encrypted length:", encrypted.length);

      // Récupérer le PDA de Bob pour son message_count
      const [bobUserPDA] = getUserPDA(program.programId, bob.publicKey);
      const bobAccount = await program.account.userAccount.fetch(bobUserPDA);

      // Dériver le PDA du message
      const [messagePDA] = getMessagePDA(
        program.programId,
        alice.publicKey,
        bob.publicKey,
        bobAccount.messageCount.toNumber()
      );

      const eventPromise = awaitEvent("messageSent");

      const tx = await program.methods
        .sendMessage(Buffer.from(encrypted), Array.from(nonce) as any)
        .accounts({
          sender: alice.publicKey,
          recipientUser: bobUserPDA,
          messageAccount: messagePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([alice])
        .rpc({ commitment: "confirmed" });

      console.log("Message sent with tx:", tx);

      const event = await eventPromise;
      expect(event.sender.toString()).to.equal(alice.publicKey.toString());
      expect(event.recipient.toString()).to.equal(bob.publicKey.toString());

      // Vérifier que le message est stocké
      const messageAccount = await program.account.messageAccount.fetch(messagePDA);
      expect(messageAccount.sender.toString()).to.equal(alice.publicKey.toString());
      expect(messageAccount.recipient.toString()).to.equal(bob.publicKey.toString());
      expect(messageAccount.isRead).to.equal(false);
    });

    it("Bob can decrypt the message from Alice", async () => {
      // Récupérer le message
      const [bobUserPDA] = getUserPDA(program.programId, bob.publicKey);
      const [messagePDA] = getMessagePDA(
        program.programId,
        alice.publicKey,
        bob.publicKey,
        0 // Premier message
      );

      const messageAccount = await program.account.messageAccount.fetch(messagePDA);

      // Déchiffrer le message
      const decrypted = decryptMessage(
        Buffer.from(messageAccount.encryptedContent),
        Buffer.from(messageAccount.nonce),
        aliceX25519.publicKey,
        bobX25519.secretKey
      );

      console.log("Decrypted message:", decrypted);
      expect(decrypted).to.equal("Hello Bob! This is a secret message.");
    });

    it("Bob can mark the message as read", async () => {
      const [messagePDA] = getMessagePDA(
        program.programId,
        alice.publicKey,
        bob.publicKey,
        0
      );

      const tx = await program.methods
        .markAsRead()
        .accounts({
          reader: bob.publicKey,
          messageAccount: messagePDA,
        })
        .signers([bob])
        .rpc({ commitment: "confirmed" });

      console.log("Message marked as read with tx:", tx);

      const messageAccount = await program.account.messageAccount.fetch(messagePDA);
      expect(messageAccount.isRead).to.equal(true);
    });

    it("Alice cannot mark Bob's message as read (unauthorized)", async () => {
      // D'abord, envoyons un autre message
      const message = "Another secret!";
      const { encrypted, nonce } = encryptMessage(
        message,
        bobX25519.publicKey,
        aliceX25519.secretKey
      );

      const [bobUserPDA] = getUserPDA(program.programId, bob.publicKey);
      const bobAccount = await program.account.userAccount.fetch(bobUserPDA);

      const [messagePDA] = getMessagePDA(
        program.programId,
        alice.publicKey,
        bob.publicKey,
        bobAccount.messageCount.toNumber()
      );

      await program.methods
        .sendMessage(Buffer.from(encrypted), Array.from(nonce) as any)
        .accounts({
          sender: alice.publicKey,
          recipientUser: bobUserPDA,
          messageAccount: messagePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([alice])
        .rpc({ commitment: "confirmed" });

      // Alice essaie de marquer comme lu - devrait échouer
      try {
        await program.methods
          .markAsRead()
          .accounts({
            reader: alice.publicKey,
            messageAccount: messagePDA,
          })
          .signers([alice])
          .rpc({ commitment: "confirmed" });

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Unauthorized");
      }
    });
  });

  // ========================================================================
  // TEST: Arcium MPC Integration (requires arcium localnet)
  // ========================================================================

  describe("Arcium MPC Test", function() {
    before(function() {
      if (!arciumEnv || !clusterAccount) {
        console.log("Skipping Arcium MPC tests - run with 'arcium test' to enable");
        this.skip();
      }
    });

    it("Can initialize and run test_add circuit", async function() {
      if (!arciumEnv || !clusterAccount) {
        this.skip();
        return;
      }

      console.log("Initializing test_add computation definition...");

      // Initialize comp def
      const baseSeedCompDefAcc = getArciumAccountBaseSeed(
        "ComputationDefinitionAccount"
      );
      const offset = getCompDefAccOffset("test_add");

      const compDefPDA = PublicKey.findProgramAddressSync(
        [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
        getArciumProgramId()
      )[0];

      const initSig = await program.methods
        .initTestAddCompDef()
        .accounts({
          compDefAccount: compDefPDA,
          payer: alice.publicKey,
          mxeAccount: getMXEAccAddress(program.programId),
        })
        .signers([alice])
        .rpc({ commitment: "confirmed" });

      console.log("Comp def initialized with sig:", initSig);

      // Finalize comp def
      const finalizeTx = await buildFinalizeCompDefTx(
        provider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      finalizeTx.sign(alice);

      await provider.sendAndConfirm(finalizeTx);
      console.log("Comp def finalized");

      // Get MXE public key
      const mxePublicKey = await getMXEPublicKeyWithRetry(
        provider,
        program.programId
      );
      console.log("MXE x25519 pubkey:", Buffer.from(mxePublicKey).toString("hex"));

      // Generate keys and encrypt
      const privateKey = x25519.utils.randomSecretKey();
      const publicKey = x25519.getPublicKey(privateKey);
      const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
      const cipher = new RescueCipher(sharedSecret);

      const val1 = BigInt(42);
      const val2 = BigInt(58);
      const nonce = randomBytes(16);
      const ciphertext = cipher.encrypt([val1, val2], nonce);

      console.log(`Testing ${val1} + ${val2} = ${val1 + val2}`);

      // Queue computation
      const eventPromise = awaitEvent("testAddResult");
      const computationOffset = new anchor.BN(randomBytes(8), "hex");

      const queueSig = await program.methods
        .testAdd(
          computationOffset,
          Array.from(ciphertext[0]) as any,
          Array.from(ciphertext[1]) as any,
          Array.from(publicKey) as any,
          new anchor.BN(deserializeLE(nonce).toString())
        )
        .accountsPartial({
          computationAccount: getComputationAccAddress(
            arciumEnv!.arciumClusterOffset,
            computationOffset
          ),
          clusterAccount: clusterAccount!,
          mxeAccount: getMXEAccAddress(program.programId),
          mempoolAccount: getMempoolAccAddress(arciumEnv!.arciumClusterOffset),
          executingPool: getExecutingPoolAccAddress(
            arciumEnv!.arciumClusterOffset
          ),
          compDefAccount: getCompDefAccAddress(
            program.programId,
            Buffer.from(getCompDefAccOffset("test_add")).readUInt32LE()
          ),
        })
        .rpc({ skipPreflight: true, commitment: "confirmed" });

      console.log("Queue sig:", queueSig);

      // Wait for finalization
      const finalizeSig = await awaitComputationFinalization(
        provider,
        computationOffset,
        program.programId,
        "confirmed"
      );
      console.log("Finalize sig:", finalizeSig);

      // Decrypt result
      const resultEvent = await eventPromise;
      const decrypted = cipher.decrypt(
        [resultEvent.result],
        resultEvent.nonce
      )[0];

      console.log("Decrypted result:", decrypted.toString());
      expect(decrypted).to.equal(val1 + val2);
    });
  });
});
