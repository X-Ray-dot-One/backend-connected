# Private Messages - Architecture Documentation

## Overview

Système de messagerie privée on-chain avec métadonnées cachées via Arcium MPC.

**Objectif** : Personne ne peut voir qui parle à qui, même en analysant la blockchain.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User A        │     │   Solana        │     │   User B        │
│   (Sender)      │     │   Program       │     │   (Recipient)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  1. Encrypt message   │                       │
         │     with B's X25519   │                       │
         │                       │                       │
         │  2. Hash A & B pubkeys│                       │
         │     encrypt with MPC  │                       │
         │                       │                       │
         │  3. send_private_msg  │                       │
         │ ─────────────────────>│                       │
         │                       │                       │
         │                       │  4. Store on-chain:   │
         │                       │     - encrypted_sender_hash
         │                       │     - encrypted_recipient_hash
         │                       │     - encrypted_content
         │                       │     - timestamp (only public data)
         │                       │                       │
         │                       │                       │  5. Scan all messages
         │                       │                       │     try decrypt with
         │                       │                       │     each user's pubkey
         │                       │<──────────────────────│
         │                       │                       │
         │                       │  6. Return encrypted  │
         │                       │     content           │
         │                       │ ─────────────────────>│
         │                       │                       │
         │                       │                       │  7. Decrypt with
         │                       │                       │     own X25519 key
```

## Key Components

### 1. User Registration

Chaque utilisateur doit s'enregistrer avec sa clé publique X25519.

```typescript
// Derive X25519 keypair from wallet signature (deterministic)
const message = "X-RAY Private Messages - Unlock Encryption Keys" + walletPubkey
const signature = await wallet.signMessage(message)
const seed = sha256(signature)
const x25519Keypair = nacl.box.keyPair.fromSecretKey(seed)

// Register on-chain
register_user(x25519Keypair.publicKey)
```

**UserAccount** (81 bytes):
- discriminator: 8 bytes
- wallet: 32 bytes (Solana pubkey)
- x25519_pubkey: 32 bytes
- message_count: 8 bytes
- bump: 1 byte

### 2. Sending Messages

```typescript
// 1. Encrypt content with recipient's X25519 pubkey
const PREFIX = '\x01' // Indicates "for recipient"
const encrypted = nacl.box(PREFIX + message, nonce, recipientX25519, senderSecret)

// 2. Hash sender & recipient pubkeys
const senderHash = sha256(senderWallet)
const recipientHash = sha256(recipientWallet)

// 3. Encrypt hashes with Arcium MPC
const cipher = new RescueCipher(mpcSharedSecret)
const encryptedSenderHash = cipher.encrypt(senderHash, mpcNonce)
const encryptedRecipientHash = cipher.encrypt(recipientHash, mpcNonce)

// 4. Send on-chain
send_private_message(encryptedSenderHash, encryptedRecipientHash, encrypted, nonce)
```

**PrivateMessageAccount** (413 bytes):
- discriminator: 8 bytes
- encrypted_sender_hash: 32 bytes
- encrypted_recipient_hash: 32 bytes
- encrypted_content: 4 + 256 bytes (Vec<u8>)
- nonce: 24 bytes
- timestamp: 8 bytes
- mpc_pubkey: 32 bytes
- mpc_nonce: 16 bytes
- bump: 1 byte

### 3. Receiving Messages

Le destinataire ne sait pas a priori qui lui a envoyé un message. Il doit essayer de décrypter avec chaque clé publique.

```typescript
// 1. Fetch all registered users
const allUsers = await getProgramAccounts(PROGRAM_ID, { dataSize: 81 })

// 2. Fetch all private messages
const allMessages = await getProgramAccounts(PROGRAM_ID, { dataSize: 413 })

// 3. For each message, try to decrypt with each user's pubkey
for (const message of allMessages) {
  for (const user of allUsers) {
    const decrypted = nacl.box.open(
      message.encryptedContent,
      message.nonce,
      user.x25519Pubkey,
      mySecretKey
    )
    if (decrypted) {
      // Found! This message is from this user
      console.log(`Message from ${user.wallet}: ${decrypted}`)
      break
    }
  }
}
```

### 4. Identifying Sent vs Received Messages

Problème : NaCl box utilise ECDH, donc l'expéditeur peut aussi décrypter ses propres messages.

Solution : Utiliser la dérivation PDA pour identifier les messages envoyés.

```typescript
// PDA seeds: ["private_message", sender_wallet, message_index]
// Si le PDA correspond à notre wallet, c'est un message envoyé

const myMessagePDAs = new Set()
for (let i = 0; i < 1000; i++) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("private_message"), myWallet.toBuffer(), i.toBuffer()],
    PROGRAM_ID
  )
  myMessagePDAs.add(pda.toString())
}

// Pour chaque message décrypté
if (myMessagePDAs.has(messagePDA.toString())) {
  // C'est un message que J'AI envoyé
} else {
  // C'est un message que J'AI reçu
}
```

## Costs

| Action | Cost | Details |
|--------|------|---------|
| Register | ~0.0012 SOL | UserAccount rent (81 bytes) |
| Send message | ~0.00377 SOL | PrivateMessageAccount rent (413 bytes) |
| Transaction fee | ~0.000005 SOL | Per transaction |

## Security Model

### What's Hidden
- **Sender identity**: encrypted with MPC
- **Recipient identity**: encrypted with MPC
- **Message content**: encrypted with X25519

### What's Visible
- **Timestamp**: when message was sent
- **Message size**: ~413 bytes (fixed)
- **Transaction signer**: who paid for the transaction (can use fee payer to hide)

### Attack Vectors

| Attack | Risk | Mitigation |
|--------|------|------------|
| Brute-force X25519 | Very Low | 2^128 security |
| Traffic analysis | Medium | Use Tor/VPN, random delays |
| MPC compromise | Medium-High | Requires collusion of MPC nodes |
| LocalStorage theft | High | Keys stored in browser, use hardware wallet |

## Integration into X-RAY

### Frontend Changes

1. Add new tab/section for private messages
2. Integrate shadow wallet derivation (reuse existing X-RAY shadow system)
3. Add contact management UI

### Backend Changes

None required - all data is on-chain.

### Smart Contract

Deploy `private_messages` program alongside existing X-RAY program.

```toml
# Anchor.toml
[programs.devnet]
private_messages = "A8r4vLoD79gtdwvyHBY7bXzRSXjFNBbuXic9cPHUJa2s"
```

### Arcium Setup

```toml
# Arcium.toml
[clusters.devnet]
offset = 456  # Get from `arcium init-mxe`
```

## File Structure

```
private_messages/
├── programs/
│   └── private_messages/
│       └── src/
│           └── lib.rs          # Solana program
├── frontend/
│   └── src/
│       └── App.tsx             # React frontend
├── Anchor.toml                 # Anchor config
├── Arcium.toml                 # Arcium MPC config
└── CLAUDE.md                   # This file
```

## Key Functions

### Rust Program (lib.rs)

```rust
// Register user with X25519 pubkey
pub fn register_user(ctx: Context<RegisterUser>, x25519_pubkey: [u8; 32])

// Send private message with hidden metadata
pub fn send_private_message(
    ctx: Context<SendPrivateMessage>,
    message_index: u64,
    encrypted_sender_hash: [u8; 32],
    encrypted_recipient_hash: [u8; 32],
    encrypted_content: Vec<u8>,
    nonce: [u8; 24],
    mpc_pubkey: [u8; 32],
    mpc_nonce: u128,
)

// Update X25519 key
pub fn update_user_key(ctx: Context<UpdateUserKey>, new_x25519_pubkey: [u8; 32])
```

### TypeScript Frontend

```typescript
// Derive X25519 keys from wallet
deriveX25519KeyPair(signMessage, walletPubkey): Promise<nacl.BoxKeyPair>

// Encrypt message for recipient
encryptMessage(message, recipientPubkey, senderSecret): { encrypted, nonce }

// Decrypt message
decryptMessage(encrypted, nonce, senderPubkey, mySecret): string | null

// Get user PDA
getUserPDA(wallet): [PublicKey, number]

// Get message PDA
getPrivateMessagePDA(sender, messageIndex): [PublicKey, number]
```

## Scalability Considerations

### Current Approach
- O(n*m) decryption attempts where n=users, m=messages
- Works for small number of users (<1000)

### Future Improvements
1. **Sender hint**: Add first 4 bytes of sender hash (unhashed) to reduce candidates
2. **MPC reveal**: Use Arcium to reveal sender only to authorized recipient
3. **Bloom filters**: Store encrypted bloom filter of recipients per message
4. **Indexed messages**: Off-chain indexer that stores encrypted mappings

## Testing

```bash
# Build program
cd programs/private_messages && anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Run frontend
cd frontend && npm run dev
```

## Dependencies

### Rust
- anchor-lang
- arcium-anchor (for MPC integration)

### TypeScript
- @solana/web3.js
- @solana/wallet-adapter-react
- tweetnacl (NaCl crypto)
- @arcium-hq/client (MPC client)
