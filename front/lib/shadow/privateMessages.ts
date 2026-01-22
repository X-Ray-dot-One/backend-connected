import { PublicKey, Connection, SystemProgram, Transaction } from "@solana/web3.js";
import * as nacl from "tweetnacl";
import { getShadowWalletName } from "@/lib/api";

// ============================================================================
// CONFIGURATION
// ============================================================================

export const PRIVATE_MESSAGES_PROGRAM_ID = new PublicKey("A8r4vLoD79gtdwvyHBY7bXzRSXjFNBbuXic9cPHUJa2s");
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

// ============================================================================
// TYPES
// ============================================================================

export interface Contact {
  walletAddress: string;
  x25519Pubkey: Uint8Array;
  name: string;
}

export interface PrivateMessage {
  id: string;
  sender: string;
  recipient: string;
  content: string;
  timestamp: number;
  isOutgoing: boolean;
}

export interface X25519KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

// ============================================================================
// KEY DERIVATION
// ============================================================================

/**
 * Derive X25519 keypair from shadow wallet keypair
 */
export async function deriveX25519KeyPairFromKeypair(
  shadowSecretKey: Uint8Array
): Promise<X25519KeyPair> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", shadowSecretKey);
  const seed = new Uint8Array(hashBuffer);
  return nacl.box.keyPair.fromSecretKey(seed);
}

// ============================================================================
// MESSAGE ENCRYPTION / DECRYPTION
// ============================================================================

const MSG_PREFIX_TO_RECIPIENT = "\x01";
const MSG_PREFIX_TO_SENDER = "\x02";

export function encryptMessage(
  message: string,
  recipientX25519Pubkey: Uint8Array,
  senderX25519SecretKey: Uint8Array
): { encrypted: Uint8Array; nonce: Uint8Array } {
  const messageBytes = new TextEncoder().encode(MSG_PREFIX_TO_RECIPIENT + message);
  const nonce = nacl.randomBytes(24);
  const encrypted = nacl.box(messageBytes, nonce, recipientX25519Pubkey, senderX25519SecretKey);
  return { encrypted, nonce };
}

export function decryptMessage(
  encrypted: Uint8Array,
  nonce: Uint8Array,
  otherPartyX25519Pubkey: Uint8Array,
  myX25519SecretKey: Uint8Array
): string | null {
  const decrypted = nacl.box.open(encrypted, nonce, otherPartyX25519Pubkey, myX25519SecretKey);
  if (!decrypted) return null;

  const text = new TextDecoder().decode(decrypted);

  if (text.startsWith(MSG_PREFIX_TO_RECIPIENT) || text.startsWith(MSG_PREFIX_TO_SENDER)) {
    return text.slice(1);
  }

  return text;
}

// ============================================================================
// PDA UTILS
// ============================================================================

export function getUserPDA(userWallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user"), userWallet.toBuffer()],
    PRIVATE_MESSAGES_PROGRAM_ID
  );
}

export function getPrivateMessageCounterPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("private_message_counter")],
    PRIVATE_MESSAGES_PROGRAM_ID
  );
}

function bigintToLeBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number(value & BigInt(0xff));
    value = value >> BigInt(8);
  }
  return bytes;
}

function leBytesToBigint(bytes: Uint8Array, offset: number, length: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < length; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }
  return value;
}

function leBytesToBigintSigned(bytes: Uint8Array, offset: number, length: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < length; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }
  const signBit = BigInt(1) << BigInt(length * 8 - 1);
  if (value >= signBit) {
    value -= BigInt(1) << BigInt(length * 8);
  }
  return value;
}

export function getPrivateMessagePDA(
  sender: PublicKey,
  messageIndex: bigint
): [PublicKey, number] {
  const indexBuffer = bigintToLeBytes(messageIndex, 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("private_message"), sender.toBuffer(), Buffer.from(indexBuffer)],
    PRIVATE_MESSAGES_PROGRAM_ID
  );
}

// ============================================================================
// ON-CHAIN OPERATIONS
// ============================================================================

export async function isUserRegistered(walletAddress: string): Promise<boolean> {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const [userPDA] = getUserPDA(new PublicKey(walletAddress));
    const accountInfo = await connection.getAccountInfo(userPDA);
    return accountInfo !== null;
  } catch {
    return false;
  }
}

export async function getUserX25519Pubkey(walletAddress: string): Promise<Uint8Array | null> {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const [userPDA] = getUserPDA(new PublicKey(walletAddress));
    const accountInfo = await connection.getAccountInfo(userPDA);
    if (!accountInfo) return null;
    return new Uint8Array(accountInfo.data.slice(40, 72));
  } catch {
    return null;
  }
}

export async function getMessageIndex(senderWallet: string): Promise<bigint> {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const [counterPDA] = getPrivateMessageCounterPDA();
    const accountInfo = await connection.getAccountInfo(counterPDA);
    if (!accountInfo) return BigInt(0);
    // Counter layout: discriminator (8) + count (8) + bump (1)
    return leBytesToBigint(new Uint8Array(accountInfo.data), 8, 8);
  } catch {
    return BigInt(0);
  }
}

export async function registerUser(
  connection: Connection,
  walletPubkey: PublicKey,
  x25519Pubkey: Uint8Array,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<string> {
  const discriminator = Buffer.from([2, 241, 150, 223, 99, 214, 116, 97]);
  const instructionData = Buffer.concat([discriminator, Buffer.from(x25519Pubkey)]);

  const [userPDA] = getUserPDA(walletPubkey);

  const transaction = new Transaction().add({
    keys: [
      { pubkey: walletPubkey, isSigner: true, isWritable: true },
      { pubkey: userPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PRIVATE_MESSAGES_PROGRAM_ID,
    data: instructionData,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = walletPubkey;

  const signed = await signTransaction(transaction);
  const txid = await connection.sendRawTransaction(signed.serialize());

  // Wait for proper confirmation
  await connection.confirmTransaction({
    signature: txid,
    blockhash,
    lastValidBlockHeight,
  }, "confirmed");

  return txid;
}

export async function updateUserKey(
  connection: Connection,
  walletPubkey: PublicKey,
  newX25519Pubkey: Uint8Array,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<string> {
  const discriminator = Buffer.from([7, 244, 36, 173, 32, 227, 249, 92]);
  const instructionData = Buffer.concat([discriminator, Buffer.from(newX25519Pubkey)]);

  const [userPDA] = getUserPDA(walletPubkey);

  const transaction = new Transaction().add({
    keys: [
      { pubkey: walletPubkey, isSigner: true, isWritable: false },
      { pubkey: userPDA, isSigner: false, isWritable: true },
    ],
    programId: PRIVATE_MESSAGES_PROGRAM_ID,
    data: instructionData,
  });

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = walletPubkey;

  const signed = await signTransaction(transaction);
  const txid = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(txid);

  return txid;
}

export async function sendPrivateMessageOnChain(
  connection: Connection,
  senderPubkey: PublicKey,
  encryptedContent: Uint8Array,
  nonce: Uint8Array,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<string> {
  const messageIndex = await getMessageIndex(senderPubkey.toString());

  const discriminator = Buffer.from([241, 158, 126, 220, 116, 108, 212, 168]);
  const messageIndexBuffer = bigintToLeBytes(messageIndex, 8);
  const emptyHash = new Uint8Array(32);
  const contentLenBuffer = bigintToLeBytes(BigInt(encryptedContent.length), 4);
  const emptyMpcPubkey = new Uint8Array(32);
  const emptyMpcNonce = new Uint8Array(16);

  const instructionData = Buffer.concat([
    discriminator,
    messageIndexBuffer,
    emptyHash,
    emptyHash,
    contentLenBuffer,
    Buffer.from(encryptedContent),
    Buffer.from(nonce),
    emptyMpcPubkey,
    emptyMpcNonce,
  ]);

  const [counterPDA] = getPrivateMessageCounterPDA();
  const [privateMessagePDA] = getPrivateMessagePDA(senderPubkey, messageIndex);

  const transaction = new Transaction().add({
    keys: [
      { pubkey: senderPubkey, isSigner: true, isWritable: true },
      { pubkey: counterPDA, isSigner: false, isWritable: true },
      { pubkey: privateMessagePDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PRIVATE_MESSAGES_PROGRAM_ID,
    data: instructionData,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = senderPubkey;

  const signed = await signTransaction(transaction);

  // Send and properly confirm the transaction
  const txid = await connection.sendRawTransaction(signed.serialize());

  const confirmation = await connection.confirmTransaction({
    signature: txid,
    blockhash,
    lastValidBlockHeight,
  }, "confirmed");

  // Check if transaction actually succeeded
  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  return txid;
}

// ============================================================================
// MESSAGE LOADING
// ============================================================================

interface AllUserKeys {
  wallet: PublicKey;
  x25519Pubkey: Uint8Array;
}

async function getAllRegisteredUsers(): Promise<Map<string, AllUserKeys>> {
  const connection = new Connection(RPC_URL, "confirmed");
  const userKeys = new Map<string, AllUserKeys>();

  try {
    const allUserAccounts = await connection.getProgramAccounts(PRIVATE_MESSAGES_PROGRAM_ID, {
      filters: [{ dataSize: 81 }],
    });

    for (const { account } of allUserAccounts) {
      try {
        const wallet = new PublicKey(account.data.slice(8, 40));
        const x25519Pubkey = new Uint8Array(account.data.slice(40, 72));
        userKeys.set(wallet.toString(), { wallet, x25519Pubkey });
      } catch {
        // Skip malformed accounts
      }
    }
  } catch (error) {
    console.error("Failed to fetch registered users:", error);
  }

  return userKeys;
}

interface RawPrivateMessage {
  pda: string;
  encryptedContent: Uint8Array;
  nonce: Uint8Array;
  timestamp: number;
}

async function getAllPrivateMessages(): Promise<RawPrivateMessage[]> {
  const connection = new Connection(RPC_URL, "confirmed");
  const messages: RawPrivateMessage[] = [];

  try {
    const allPrivateAccounts = await connection.getProgramAccounts(PRIVATE_MESSAGES_PROGRAM_ID, {
      filters: [{ dataSize: 413 }],
    });

    for (const { account, pubkey } of allPrivateAccounts) {
      try {
        const data = new Uint8Array(account.data);

        // Parse using variable offsets and browser-compatible helpers
        const contentLen = Number(leBytesToBigint(data, 72, 4));
        const contentOffset = 76;
        const encryptedContent = new Uint8Array(data.slice(contentOffset, contentOffset + contentLen));
        const nonceOffset = contentOffset + contentLen;
        const nonce = new Uint8Array(data.slice(nonceOffset, nonceOffset + 24));
        const timestampOffset = nonceOffset + 24;
        const timestamp = Number(leBytesToBigintSigned(data, timestampOffset, 8));

        messages.push({
          pda: pubkey.toString(),
          encryptedContent,
          nonce,
          timestamp,
        });
      } catch {
        // Skip malformed messages
      }
    }
  } catch (error) {
    console.error("Failed to fetch private messages:", error);
  }

  return messages;
}

export interface NewContact {
  wallet: string;
  x25519Pubkey: Uint8Array;
  name: string;
}

/**
 * Load all messages for a user, auto-discover new contacts
 */
export async function loadAllMessagesForUser(
  myWalletAddress: string,
  myX25519Keys: X25519KeyPair,
  contacts: Contact[]
): Promise<{
  messages: Map<string, PrivateMessage[]>;
  newContacts: NewContact[];
}> {
  const allUserKeys = await getAllRegisteredUsers();
  const allRawMessages = await getAllPrivateMessages();

  const messagesByContact = new Map<string, PrivateMessage[]>();
  const newContactsByWallet = new Map<string, { wallet: string; x25519Pubkey: Uint8Array }>();

  const myPubkey = new PublicKey(myWalletAddress);
  const contactWallets = new Set(contacts.map(c => c.walletAddress));

  // Build set of PDAs derived from our wallet (to identify sent messages)
  const myMessagePDAs = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const [pda] = getPrivateMessagePDA(myPubkey, BigInt(i));
    myMessagePDAs.add(pda.toString());
  }

  for (const rawMsg of allRawMessages) {
    const isSentByMe = myMessagePDAs.has(rawMsg.pda);

    // Try to decrypt with each registered user's pubkey
    for (const [walletStr, userInfo] of allUserKeys) {
      if (walletStr === myWalletAddress) continue;

      const decrypted = decryptMessage(
        rawMsg.encryptedContent,
        rawMsg.nonce,
        userInfo.x25519Pubkey,
        myX25519Keys.secretKey
      );

      if (decrypted) {
        const isContact = contactWallets.has(walletStr);

        if (isSentByMe) {
          // Message WE sent
          if (!messagesByContact.has(walletStr)) {
            messagesByContact.set(walletStr, []);
          }
          messagesByContact.get(walletStr)!.push({
            id: rawMsg.pda,
            sender: myWalletAddress,
            recipient: walletStr,
            content: decrypted,
            timestamp: rawMsg.timestamp * 1000,
            isOutgoing: true,
          });

          if (!isContact && !newContactsByWallet.has(walletStr)) {
            newContactsByWallet.set(walletStr, {
              wallet: walletStr,
              x25519Pubkey: userInfo.x25519Pubkey,
            });
          }
        } else {
          // Message FROM this wallet TO me
          if (!messagesByContact.has(walletStr)) {
            messagesByContact.set(walletStr, []);
          }
          messagesByContact.get(walletStr)!.push({
            id: rawMsg.pda,
            sender: walletStr,
            recipient: myWalletAddress,
            content: decrypted,
            timestamp: rawMsg.timestamp * 1000,
            isOutgoing: false,
          });

          if (!isContact && !newContactsByWallet.has(walletStr)) {
            newContactsByWallet.set(walletStr, {
              wallet: walletStr,
              x25519Pubkey: userInfo.x25519Pubkey,
            });
          }
        }

        break;
      }
    }
  }

  // Sort messages by timestamp
  for (const [, msgs] of messagesByContact) {
    msgs.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Fetch names for new contacts
  const newContactsArray = Array.from(newContactsByWallet.values());
  const newContactsWithNames: NewContact[] = await Promise.all(
    newContactsArray.map(async (contact) => {
      try {
        const nameResponse = await getShadowWalletName(contact.wallet);
        return {
          wallet: contact.wallet,
          x25519Pubkey: contact.x25519Pubkey,
          name: nameResponse.name || `${contact.wallet.slice(0, 6)}...${contact.wallet.slice(-4)}`,
        };
      } catch {
        return {
          wallet: contact.wallet,
          x25519Pubkey: contact.x25519Pubkey,
          name: `${contact.wallet.slice(0, 6)}...${contact.wallet.slice(-4)}`,
        };
      }
    })
  );

  return {
    messages: messagesByContact,
    newContacts: newContactsWithNames,
  };
}

// ============================================================================
// LOCAL STORAGE
// ============================================================================

const CONTACTS_STORAGE_KEY = "xray_private_messages_contacts";
const SENT_MESSAGES_STORAGE_KEY = "xray_private_messages_sent";

export function saveContacts(walletAddress: string, contacts: Contact[]): void {
  const stored = JSON.parse(localStorage.getItem(CONTACTS_STORAGE_KEY) || "{}");

  // Deduplicate
  const seen = new Set<string>();
  const deduped = contacts.filter((c) => {
    if (seen.has(c.walletAddress)) return false;
    seen.add(c.walletAddress);
    return true;
  });

  stored[walletAddress] = deduped.map((c) => ({
    walletAddress: c.walletAddress,
    x25519Pubkey: Array.from(c.x25519Pubkey),
    name: c.name,
  }));
  localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(stored));
}

export function loadContacts(walletAddress: string): Contact[] {
  const stored = JSON.parse(localStorage.getItem(CONTACTS_STORAGE_KEY) || "{}");
  if (!stored[walletAddress]) return [];

  const seen = new Set<string>();
  const contacts: Contact[] = [];

  for (const c of stored[walletAddress]) {
    if (!seen.has(c.walletAddress)) {
      seen.add(c.walletAddress);
      contacts.push({
        walletAddress: c.walletAddress,
        x25519Pubkey: new Uint8Array(c.x25519Pubkey),
        name: c.name,
      });
    }
  }

  return contacts;
}

/**
 * Refresh contact names from the API (for contacts that have truncated addresses as names)
 */
export async function refreshContactNames(contacts: Contact[]): Promise<Contact[]> {
  const updated = await Promise.all(
    contacts.map(async (contact) => {
      // Check if name looks like a truncated address (e.g., "5gUG3K...abcd" or full address)
      const isTruncatedAddress = /^[A-HJ-NP-Za-km-z1-9]{6}\.\.\.[A-HJ-NP-Za-km-z1-9]{4}$/.test(contact.name);
      const isFullAddress = /^[A-HJ-NP-Za-km-z1-9]{32,44}$/.test(contact.name);

      if (isTruncatedAddress || isFullAddress) {
        try {
          const nameResponse = await getShadowWalletName(contact.walletAddress);
          if (nameResponse.name) {
            return { ...contact, name: nameResponse.name };
          }
        } catch {
          // Keep existing name on error
        }
      }
      return contact;
    })
  );
  return updated;
}

export function saveSentMessage(senderWallet: string, recipientWallet: string, messageIndex: string, content: string): void {
  const key = `${SENT_MESSAGES_STORAGE_KEY}_${senderWallet}`;
  const stored = JSON.parse(localStorage.getItem(key) || "[]");
  stored.push({
    messageIndex,
    recipientWallet,
    content,
    timestamp: Date.now(),
  });
  localStorage.setItem(key, JSON.stringify(stored));
}
