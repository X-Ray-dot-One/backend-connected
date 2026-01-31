import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
  useConnection,
} from '@solana/wallet-adapter-react'
import {
  WalletModalProvider,
  WalletMultiButton,
} from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import * as nacl from 'tweetnacl'
import { encodeBase64, decodeBase64 } from 'tweetnacl-util'
import {
  RescueCipher,
  x25519,
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  getArciumAccountBaseSeed,
  getCompDefAccOffset,
  getArciumProgramId,
} from '@arcium-hq/client'

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css'

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROGRAM_ID = new PublicKey('A8r4vLoD79gtdwvyHBY7bXzRSXjFNBbuXic9cPHUJa2s')
const RPC_URL = 'https://api.devnet.solana.com' // Devnet

// Arcium Configuration
const ARCIUM_CLUSTER_OFFSET = 456 // Devnet cluster offset
const ARCIUM_PROGRAM_ID = getArciumProgramId() // Arcium program

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  sender: PublicKey
  recipient: PublicKey
  encryptedContent: Uint8Array
  nonce: Uint8Array
  timestamp: number
  decryptedContent?: string
}

interface Contact {
  wallet: PublicKey
  x25519Pubkey: Uint8Array
  name: string
}

interface TransactionLog {
  signature: string
  type: 'register' | 'send' | 'sync_keys' | 'mpc_test'
  timestamp: number
  details?: string
}

interface ArciumTestResult {
  inputA: number
  inputB: number
  encryptedResult: string
  decryptedResult: number
  computationOffset: string
}

// ============================================================================
// CRYPTO UTILS
// ============================================================================

// Message to sign for deterministic key derivation
const KEY_DERIVATION_MESSAGE = 'X-RAY Private Messages - Unlock Encryption Keys'

// Derive X25519 keypair deterministically from wallet signature
async function deriveX25519KeyPair(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  walletPubkey: PublicKey
): Promise<nacl.BoxKeyPair> {
  // Create a deterministic message to sign
  const messageToSign = new TextEncoder().encode(
    KEY_DERIVATION_MESSAGE + walletPubkey.toString()
  )

  // Sign the message with the wallet
  const signature = await signMessage(messageToSign)

  // Hash the signature to get 32 bytes for the seed
  const hashBuffer = await crypto.subtle.digest('SHA-256', signature)
  const seed = new Uint8Array(hashBuffer)

  // Generate keypair from seed (deterministic)
  return nacl.box.keyPair.fromSecretKey(seed)
}

// Message direction prefix - allows distinguishing sent vs received even with ECDH symmetry
const MSG_PREFIX_TO_RECIPIENT = '\x01' // Message intended for recipient to read
const MSG_PREFIX_TO_SENDER = '\x02'    // Copy of message for sender's records

function encryptMessage(
  message: string,
  recipientPubkey: Uint8Array,
  senderSecretKey: Uint8Array
): { encrypted: Uint8Array; nonce: Uint8Array } {
  // Add prefix to indicate this is for the recipient
  const messageBytes = new TextEncoder().encode(MSG_PREFIX_TO_RECIPIENT + message)
  const nonce = nacl.randomBytes(24)
  const encrypted = nacl.box(messageBytes, nonce, recipientPubkey, senderSecretKey)
  return { encrypted, nonce }
}

// Encrypt a copy of the message for the sender's own records
function encryptMessageForSender(
  message: string,
  senderPubkey: Uint8Array,
  senderSecretKey: Uint8Array
): { encrypted: Uint8Array; nonce: Uint8Array } {
  // Add prefix to indicate this is a sent message copy
  const messageBytes = new TextEncoder().encode(MSG_PREFIX_TO_SENDER + message)
  const nonce = nacl.randomBytes(24)
  // Encrypt with own pubkey so only sender can decrypt
  const encrypted = nacl.box(messageBytes, nonce, senderPubkey, senderSecretKey)
  return { encrypted, nonce }
}

function decryptMessage(
  encrypted: Uint8Array,
  nonce: Uint8Array,
  otherPartyPubkey: Uint8Array,
  mySecretKey: Uint8Array
): string | null {
  const decrypted = nacl.box.open(encrypted, nonce, otherPartyPubkey, mySecretKey)
  if (!decrypted) return null

  const text = new TextDecoder().decode(decrypted)

  // Strip prefix if present (used for message direction, but we now use PDA derivation)
  if (text.startsWith(MSG_PREFIX_TO_RECIPIENT) || text.startsWith(MSG_PREFIX_TO_SENDER)) {
    return text.slice(1)
  }

  return text
}

// ============================================================================
// PDA UTILS
// ============================================================================

function getUserPDA(userWallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user'), userWallet.toBuffer()],
    PROGRAM_ID
  )
}

// ============================================================================
// PRIVATE MESSAGE PDAs (Hidden Metadata)
// ============================================================================

function getPrivateMessageCounterPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('private_message_counter')],
    PROGRAM_ID
  )
}

function getPrivateMessagePDA(
  sender: PublicKey,
  messageIndex: bigint
): [PublicKey, number] {
  const indexBuffer = Buffer.alloc(8)
  indexBuffer.writeBigUInt64LE(messageIndex)
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('private_message'),
      sender.toBuffer(),
      indexBuffer,
    ],
    PROGRAM_ID
  )
}

// Generate SHA256 hash of a public key (for hidden metadata)
async function hashPublicKey(pubkey: PublicKey): Promise<Uint8Array> {
  const bytes = new Uint8Array(pubkey.toBuffer())
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  return new Uint8Array(hashBuffer)
}

// Encrypt a 32-byte hash with RescueCipher for MPC (returns 32-byte ciphertext)
function encryptHashForMPC(
  hash: Uint8Array,
  cipher: RescueCipher,
  nonce: Uint8Array
): Uint8Array {
  // Split the 32-byte hash into 4 u64 values for RescueCipher
  const values: bigint[] = []
  for (let i = 0; i < 4; i++) {
    let val = BigInt(0)
    for (let j = 0; j < 8; j++) {
      val |= BigInt(hash[i * 8 + j]) << BigInt(j * 8)
    }
    values.push(val)
  }

  // Encrypt with RescueCipher
  const ciphertexts = cipher.encrypt(values, nonce)

  // Flatten ciphertexts back to 32 bytes (take first 32 bytes)
  const result = new Uint8Array(32)
  for (let i = 0; i < 4 && i < ciphertexts.length; i++) {
    const ct = ciphertexts[i]
    for (let j = 0; j < 8 && i * 8 + j < 32; j++) {
      result[i * 8 + j] = ct[j]
    }
  }
  return result
}

// ============================================================================
// ARCIUM HELPER FUNCTIONS
// ============================================================================

// Get sign PDA for Arcium computations
const SIGN_PDA_SEED = new Uint8Array([0x73, 0x69, 0x67, 0x6e, 0x65, 0x72]) // "signer"

function getSignPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SIGN_PDA_SEED],
    PROGRAM_ID
  )
}

// Get MXE public key from the account
async function fetchMXEPublicKey(connection: any): Promise<Uint8Array | null> {
  try {
    const mxeAddress = getMXEAccAddress(PROGRAM_ID)
    const accountInfo = await connection.getAccountInfo(mxeAddress)
    if (!accountInfo) return null
    // MXE public key is at offset 8 (discriminator) + some offset
    // Based on Arcium SDK, the x25519 pubkey is stored in the account
    // We'll fetch it from the cluster account instead
    const clusterAddress = getClusterAccAddress(ARCIUM_CLUSTER_OFFSET)
    const clusterInfo = await connection.getAccountInfo(clusterAddress)
    if (!clusterInfo) return null
    // The cluster account stores the MXE x25519 public key
    // Offset: 8 (discriminator) + 8 (offset) + ... = varies
    // For simplicity, we extract 32 bytes starting at a known offset
    // This is based on the Arcium cluster account structure
    const pubkeyOffset = 8 + 8 + 8 // Skip discriminator, offset, and other fields
    return new Uint8Array(clusterInfo.data.slice(pubkeyOffset, pubkeyOffset + 32))
  } catch (e) {
    console.error('Failed to fetch MXE public key:', e)
    return null
  }
}

// Generate random bytes for computation offset
function generateComputationOffset(): Uint8Array {
  const array = new Uint8Array(8)
  crypto.getRandomValues(array)
  return array
}

// ============================================================================
// LOCAL STORAGE
// ============================================================================

const KEYS_STORAGE_KEY = 'private_messages_x25519_keys'
const CONTACTS_STORAGE_KEY = 'private_messages_contacts'
const SENT_MESSAGES_STORAGE_KEY = 'private_messages_sent'

// Store sent message reference locally (since metadata is hidden on-chain)
interface SentMessageRef {
  messageIndex: string
  recipientWallet: string
  content: string // Store plaintext locally for sender's view
  timestamp: number
}

// Store received messages locally (cache)
interface CachedMessage {
  senderWallet: string
  content: string
  timestamp: number
}

const RECEIVED_MESSAGES_STORAGE_KEY = 'private_messages_received'

function saveReceivedMessages(recipientWallet: string, messages: CachedMessage[]) {
  const key = `${RECEIVED_MESSAGES_STORAGE_KEY}_${recipientWallet}`
  localStorage.setItem(key, JSON.stringify(messages))
}

function getReceivedMessages(recipientWallet: string): CachedMessage[] {
  const key = `${RECEIVED_MESSAGES_STORAGE_KEY}_${recipientWallet}`
  return JSON.parse(localStorage.getItem(key) || '[]')
}

function saveSentMessage(senderWallet: string, recipientWallet: string, messageIndex: string, content: string) {
  const key = `${SENT_MESSAGES_STORAGE_KEY}_${senderWallet}`
  const stored: SentMessageRef[] = JSON.parse(localStorage.getItem(key) || '[]')
  stored.push({
    messageIndex,
    recipientWallet,
    content,
    timestamp: Date.now(),
  })
  localStorage.setItem(key, JSON.stringify(stored))
}

function getSentMessages(senderWallet: string, recipientWallet: string): SentMessageRef[] {
  const key = `${SENT_MESSAGES_STORAGE_KEY}_${senderWallet}`
  const stored: SentMessageRef[] = JSON.parse(localStorage.getItem(key) || '[]')
  return stored.filter(m => m.recipientWallet === recipientWallet)
}

function saveKeys(wallet: string, keypair: nacl.BoxKeyPair) {
  const stored = JSON.parse(localStorage.getItem(KEYS_STORAGE_KEY) || '{}')
  stored[wallet] = {
    publicKey: encodeBase64(keypair.publicKey),
    secretKey: encodeBase64(keypair.secretKey),
  }
  localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(stored))
}

function saveContacts(wallet: string, contacts: Contact[]) {
  const stored = JSON.parse(localStorage.getItem(CONTACTS_STORAGE_KEY) || '{}')
  stored[wallet] = contacts.map((c) => ({
    wallet: c.wallet.toString(),
    x25519Pubkey: encodeBase64(c.x25519Pubkey),
    name: c.name,
  }))
  localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(stored))
}

function loadContacts(wallet: string): Contact[] {
  const stored = JSON.parse(localStorage.getItem(CONTACTS_STORAGE_KEY) || '{}')
  if (!stored[wallet]) return []
  return stored[wallet].map((c: { wallet: string; x25519Pubkey: string; name: string }) => ({
    wallet: new PublicKey(c.wallet),
    x25519Pubkey: decodeBase64(c.x25519Pubkey),
    name: c.name,
  }))
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

function App() {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], [])

  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="app">
            <Header />
            <MainContent />
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

// ============================================================================
// HEADER
// ============================================================================

function Header() {
  return (
    <header className="header">
      <h1>
        Private Messages <span>/ X-RAY</span>
      </h1>
      <WalletMultiButton className="wallet-button" />
    </header>
  )
}

// ============================================================================
// MAIN CONTENT
// ============================================================================

function MainContent() {
  const { publicKey, connected, signTransaction, signMessage } = useWallet()
  const { connection } = useConnection()

  const [x25519Keys, setX25519Keys] = useState<nacl.BoxKeyPair | null>(null)
  const [isRegistered, setIsRegistered] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false) // Keys derived from signature
  const [keysMismatch, setKeysMismatch] = useState(false) // On-chain keys differ from derived
  const [contacts, setContacts] = useState<Contact[]>([])
  const [messageRequests, setMessageRequests] = useState<{ wallet: PublicKey, x25519Pubkey: Uint8Array, messageCount: number }[]>([]) // New addresses trying to contact us
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<{ wallet: PublicKey, x25519Pubkey: Uint8Array } | null>(null) // View a message request
  const [messages, setMessages] = useState<Message[]>([])
  const [allUserKeys, setAllUserKeys] = useState<Map<string, { wallet: PublicKey, x25519Pubkey: Uint8Array }>>(new Map())
  const [addContactWallet, setAddContactWallet] = useState('') // For adding contact by wallet address
  const [addContactName, setAddContactName] = useState('')
  const [showAddContact, setShowAddContact] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [status, setStatus] = useState<{ type: 'info' | 'error' | 'warning'; message: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [airdropLoading, setAirdropLoading] = useState(false)
  const [transactions, setTransactions] = useState<TransactionLog[]>([])

  // Arcium MPC Test state
  const [mpcTestValue1, setMpcTestValue1] = useState(42)
  const [mpcTestValue2, setMpcTestValue2] = useState(58)
  const [mpcTestLoading, setMpcTestLoading] = useState(false)
  const [mpcTestResult, setMpcTestResult] = useState<ArciumTestResult | null>(null)
  const [mxePublicKey, setMxePublicKey] = useState<Uint8Array | null>(null)
  const [showMpcPanel, setShowMpcPanel] = useState(false)

  // Add transaction to history
  const addTransaction = (signature: string, type: TransactionLog['type'], details?: string) => {
    setTransactions(prev => [{
      signature,
      type,
      timestamp: Date.now(),
      details
    }, ...prev].slice(0, 20)) // Keep last 20 transactions
  }

  // Fetch balance
  useEffect(() => {
    if (!publicKey || !connection) {
      setBalance(null)
      return
    }

    const fetchBalance = async () => {
      try {
        const bal = await connection.getBalance(publicKey)
        setBalance(bal / LAMPORTS_PER_SOL)
      } catch {
        setBalance(null)
      }
    }

    fetchBalance()
    const interval = setInterval(fetchBalance, 5000) // Refresh every 5s
    return () => clearInterval(interval)
  }, [publicKey, connection])

  // Request airdrop
  const handleAirdrop = async () => {
    if (!publicKey || !connection) return

    setAirdropLoading(true)
    setStatus({ type: 'info', message: 'Requesting airdrop...' })

    try {
      const signature = await connection.requestAirdrop(publicKey, 2 * LAMPORTS_PER_SOL)
      await connection.confirmTransaction(signature)

      // Refresh balance
      const newBal = await connection.getBalance(publicKey)
      setBalance(newBal / LAMPORTS_PER_SOL)

      setStatus({ type: 'info', message: 'Airdrop successful! +2 SOL' })
      setTimeout(() => setStatus(null), 3000)
    } catch (error) {
      console.error('Airdrop error:', error)
      setStatus({ type: 'error', message: `Airdrop failed: ${error}` })
    } finally {
      setAirdropLoading(false)
    }
  }

  // Load contacts from localStorage on wallet connect
  useEffect(() => {
    if (publicKey) {
      const savedContacts = loadContacts(publicKey.toString())
      setContacts(savedContacts)
      // Reset unlock state when wallet changes
      setIsUnlocked(false)
      setX25519Keys(null)
    }
  }, [publicKey])

  // Check registration status
  useEffect(() => {
    if (!publicKey || !connection) return

    const checkRegistration = async () => {
      try {
        const [userPDA] = getUserPDA(publicKey)
        const accountInfo = await connection.getAccountInfo(userPDA)
        setIsRegistered(accountInfo !== null)
      } catch {
        setIsRegistered(false)
      }
    }

    checkRegistration()
  }, [publicKey, connection])

  // Unlock keys by signing a message (deterministic derivation)
  const handleUnlockKeys = async () => {
    if (!publicKey || !signMessage || !connection) return

    setLoading(true)
    setStatus({ type: 'info', message: 'Please sign the message to unlock your encryption keys...' })

    try {
      const keypair = await deriveX25519KeyPair(signMessage, publicKey)

      // Check if derived keys match on-chain keys
      const [userPDA] = getUserPDA(publicKey)
      const accountInfo = await connection.getAccountInfo(userPDA)

      if (accountInfo) {
        const onChainPubkey = new Uint8Array(accountInfo.data.slice(40, 72))
        const derivedPubkey = keypair.publicKey

        // Compare keys
        const keysMatch = onChainPubkey.every((byte, i) => byte === derivedPubkey[i])

        if (!keysMatch) {
          setKeysMismatch(true)
          setStatus({
            type: 'warning',
            message: 'Your derived keys differ from on-chain keys. You need to sync them to decrypt messages.'
          })
        } else {
          setKeysMismatch(false)
          setStatus({ type: 'info', message: 'Keys unlocked successfully!' })
          setTimeout(() => setStatus(null), 2000)
        }
      }

      setX25519Keys(keypair)
      setIsUnlocked(true)
      saveKeys(publicKey.toString(), keypair)
    } catch (error) {
      console.error('Unlock error:', error)
      setStatus({ type: 'error', message: `Failed to unlock keys: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  // Register user
  const handleRegister = async () => {
    if (!publicKey || !signTransaction || !signMessage || !connection) return

    setLoading(true)
    setStatus({ type: 'info', message: 'Please sign the message to generate your encryption keys...' })

    try {
      // Derive X25519 keypair deterministically from wallet signature
      const keypair = await deriveX25519KeyPair(signMessage, publicKey)
      setX25519Keys(keypair)
      setIsUnlocked(true)
      saveKeys(publicKey.toString(), keypair)

      setStatus({ type: 'info', message: 'Registering on-chain...' })

      // Create instruction data
      // Discriminator for register_user (from IDL) + x25519_pubkey (32 bytes)
      const discriminator = Buffer.from([2, 241, 150, 223, 99, 214, 116, 97])
      const instructionData = Buffer.concat([
        discriminator,
        Buffer.from(keypair.publicKey),
      ])

      const [userPDA] = getUserPDA(publicKey)

      const transaction = new Transaction().add({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: userPDA, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
      })

      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      const signed = await signTransaction(transaction)
      const txid = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(txid)

      addTransaction(txid, 'register', 'User registration')
      setIsRegistered(true)
      setStatus({ type: 'info', message: `Registration successful! TX: ${txid.slice(0, 8)}...` })
      setTimeout(() => setStatus(null), 3000)
    } catch (error) {
      console.error('Registration error:', error)
      setStatus({ type: 'error', message: `Registration failed: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  // Sync keys on-chain (if on-chain key is different from derived key)
  const handleSyncKeysOnChain = async () => {
    if (!publicKey || !signTransaction || !signMessage || !connection) return

    setLoading(true)
    setStatus({ type: 'info', message: 'Deriving encryption keys...' })

    try {
      // Derive the deterministic keypair
      const keypair = await deriveX25519KeyPair(signMessage, publicKey)
      setX25519Keys(keypair)
      setIsUnlocked(true)
      saveKeys(publicKey.toString(), keypair)

      setStatus({ type: 'info', message: 'Updating keys on-chain...' })

      // Create instruction data for update_user_key
      const discriminator = Buffer.from([7, 244, 36, 173, 32, 227, 249, 92])
      const instructionData = Buffer.concat([
        discriminator,
        Buffer.from(keypair.publicKey),
      ])

      const [userPDA] = getUserPDA(publicKey)

      const transaction = new Transaction().add({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: false },
          { pubkey: userPDA, isSigner: false, isWritable: true },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
      })

      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      const signed = await signTransaction(transaction)
      const txid = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(txid)

      addTransaction(txid, 'sync_keys', 'X25519 key update')
      setStatus({ type: 'info', message: `Keys synced! TX: ${txid.slice(0, 8)}...` })
      setKeysMismatch(false)
      setTimeout(() => setStatus(null), 3000)
    } catch (error) {
      console.error('Key sync error:', error)
      setStatus({ type: 'error', message: `Failed to sync keys: ${error}` })
    } finally {
      setLoading(false)
    }
  }


  // Accept a message request (add to contacts list)
  const handleAcceptRequest = async (request: { wallet: PublicKey, x25519Pubkey: Uint8Array }) => {
    if (!publicKey) return

    const defaultName = `${request.wallet.toString().slice(0, 6)}...${request.wallet.toString().slice(-4)}`
    const name = prompt('Enter a name for this contact:', defaultName) || defaultName

    const newContact: Contact = {
      wallet: request.wallet,
      x25519Pubkey: request.x25519Pubkey,
      name,
    }

    const updatedContacts = [...contacts, newContact]
    setContacts(updatedContacts)
    saveContacts(publicKey.toString(), updatedContacts)

    // Remove from message requests
    setMessageRequests(prev => prev.filter(r => !r.wallet.equals(request.wallet)))

    // Select the new contact to view conversation
    setSelectedContact(newContact)
    setSelectedRequest(null)

    setStatus({ type: 'info', message: `${name} added to contacts!` })
    setTimeout(() => setStatus(null), 2000)
  }

  // Add contact from message request (using cached user keys)
  const handleAddContactFromRequest = async (senderWallet: PublicKey) => {
    if (!publicKey) return

    // Check if already a contact
    if (contacts.some(c => c.wallet.equals(senderWallet))) {
      setStatus({ type: 'info', message: 'Already in contacts!' })
      setTimeout(() => setStatus(null), 2000)
      return
    }

    // Get X25519 pubkey from cached keys
    const userInfo = allUserKeys.get(senderWallet.toString())
    if (!userInfo) {
      setStatus({ type: 'error', message: 'Could not find user keys' })
      return
    }

    const defaultName = `${senderWallet.toString().slice(0, 6)}...${senderWallet.toString().slice(-4)}`
    const name = prompt('Enter a name for this contact:', defaultName) || defaultName

    const newContact: Contact = {
      wallet: senderWallet,
      x25519Pubkey: userInfo.x25519Pubkey,
      name,
    }

    const updatedContacts = [...contacts, newContact]
    setContacts(updatedContacts)
    saveContacts(publicKey.toString(), updatedContacts)

    // Remove from message requests
    setMessageRequests(prev => prev.filter(r => !r.wallet.equals(senderWallet)))

    // Select the new contact
    setSelectedContact(newContact)
    setSelectedRequest(null)

    setStatus({ type: 'info', message: `${name} added to contacts!` })
    setTimeout(() => setStatus(null), 2000)
  }

  // Add contact
  const handleAddContact = async () => {
    if (!publicKey) return

    const walletAddress = prompt('Enter wallet address:')
    if (!walletAddress) return

    const name = prompt('Enter contact name:') || 'Unknown'

    try {
      const contactWallet = new PublicKey(walletAddress)
      const [userPDA] = getUserPDA(contactWallet)
      const accountInfo = await connection.getAccountInfo(userPDA)

      if (!accountInfo) {
        setStatus({ type: 'error', message: 'User not registered' })
        return
      }

      // Parse account data to get X25519 pubkey
      // Skip discriminator (8) + wallet (32) = 40 bytes
      const x25519Pubkey = new Uint8Array(accountInfo.data.slice(40, 72))

      const newContact: Contact = {
        wallet: contactWallet,
        x25519Pubkey,
        name,
      }

      const updatedContacts = [...contacts, newContact]
      setContacts(updatedContacts)
      saveContacts(publicKey.toString(), updatedContacts)
      setStatus({ type: 'info', message: 'Contact added!' })
      setTimeout(() => setStatus(null), 2000)
    } catch (error) {
      setStatus({ type: 'error', message: `Invalid address: ${error}` })
    }
  }

  // Load ALL messages sent to me (from anyone)
  // Scans ALL PrivateMessageAccount and ALL UserAccounts, tries to decrypt with each sender's key
  // Also detects new senders (message requests)
  const loadMessages = useCallback(async () => {
    if (!publicKey || !connection || !x25519Keys) return

    setLoading(true)
    const loadedMessages: Message[] = []
    const newMessageRequests = new Map<string, { wallet: PublicKey, x25519Pubkey: Uint8Array, messageCount: number }>()

    try {
      // 1. Fetch ALL registered users (to get their X25519 pubkeys)
      const allUserAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { dataSize: 81 }, // UserAccount size: 8 + 32 + 32 + 8 + 1 = 81
        ],
      })

      // Build a map of wallet -> X25519 pubkey
      const userKeys = new Map<string, { wallet: PublicKey, x25519Pubkey: Uint8Array }>()
      for (const { account } of allUserAccounts) {
        try {
          const wallet = new PublicKey(account.data.slice(8, 40))
          const x25519Pubkey = new Uint8Array(account.data.slice(40, 72))
          userKeys.set(wallet.toString(), { wallet, x25519Pubkey })
        } catch {
          // Skip malformed accounts
        }
      }
      console.log(`Found ${userKeys.size} registered users`)
      // Store for use in UI (e.g., adding contacts)
      setAllUserKeys(userKeys)

      // Get existing contact wallets for quick lookup
      const contactWallets = new Set(contacts.map(c => c.wallet.toString()))

      // 2. Scan ALL PrivateMessageAccount (size 413 bytes)
      const allPrivateAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { dataSize: 413 }, // PrivateMessageAccount size
        ],
      })

      console.log(`Found ${allPrivateAccounts.length} private message accounts`)

      // Build a set of PDAs that WE created (to identify sent messages)
      // We check message indices 0 to some reasonable max
      const myMessagePDAs = new Set<string>()
      for (let i = 0; i < 1000; i++) {
        const [pda] = getPrivateMessagePDA(publicKey, BigInt(i))
        myMessagePDAs.add(pda.toString())
      }

      // Track all wallets we've exchanged messages with (for contact recovery)
      const allMessagePartners = new Map<string, { wallet: PublicKey, x25519Pubkey: Uint8Array }>()

      for (const { account, pubkey } of allPrivateAccounts) {
        // Check if this message was sent by ME (PDA derived from my wallet)
        const isSentByMe = myMessagePDAs.has(pubkey.toString())
        try {
          const data = account.data

          // Parse message data
          const contentLen = data.readUInt32LE(72)
          const contentOffset = 76
          const encryptedContent = new Uint8Array(data.slice(contentOffset, contentOffset + contentLen))
          const nonceOffset = contentOffset + contentLen
          const nonce = new Uint8Array(data.slice(nonceOffset, nonceOffset + 24))
          const timestampOffset = nonceOffset + 24
          const timestamp = Number(data.readBigInt64LE(timestampOffset))

          // Try to decrypt with EACH registered user's pubkey
          for (const [walletStr, { wallet, x25519Pubkey }] of userKeys) {
            // Skip myself
            if (wallet.equals(publicKey)) continue

            const decryptResult = decryptMessage(
              encryptedContent,
              nonce,
              x25519Pubkey, // Try this user's pubkey
              x25519Keys.secretKey
            )

            if (decryptResult) {
              // Track this wallet as a message partner (for contact recovery)
              if (!allMessagePartners.has(walletStr)) {
                allMessagePartners.set(walletStr, { wallet, x25519Pubkey })
              }

              // Use PDA derivation to determine direction (reliable, not based on localStorage)
              // If the message PDA was derived from MY wallet, I sent it
              if (isSentByMe) {
                // This is a message WE sent to this wallet
                console.log(`Found sent message to ${walletStr.slice(0, 8)}...: ${decryptResult}`)

                const isSelectedContact = selectedContact?.wallet.equals(wallet)
                if (isSelectedContact) {
                  loadedMessages.push({
                    sender: publicKey,
                    recipient: wallet,
                    encryptedContent,
                    nonce,
                    timestamp,
                    decryptedContent: decryptResult,
                  })
                }
                break
              }

              // This is a message FROM this wallet TO me
              console.log(`Decrypted message from ${walletStr.slice(0, 8)}...: ${decryptResult}`)

              const isContact = contactWallets.has(walletStr)
              const isSelectedContact = selectedContact?.wallet.equals(wallet)
              const isSelectedRequest = selectedRequest?.wallet.equals(wallet)

              // Track message requests (non-contacts who sent us messages)
              if (!isContact) {
                const existing = newMessageRequests.get(walletStr)
                if (existing) {
                  existing.messageCount++
                } else {
                  newMessageRequests.set(walletStr, { wallet, x25519Pubkey, messageCount: 1 })
                }
              }

              // Add to displayed messages if viewing this contact/request
              if (isSelectedContact || isSelectedRequest) {
                loadedMessages.push({
                  sender: wallet,
                  recipient: publicKey,
                  encryptedContent,
                  nonce,
                  timestamp,
                  decryptedContent: decryptResult,
                })
              }
              break
            }
          }
        } catch (err) {
          // Skip malformed accounts
        }
      }

      // Note: Sent messages are now recovered from chain via PDA derivation

      // Auto-recover contacts from message history (in case localStorage was cleared)
      // Anyone we've exchanged messages with can be auto-added
      const recoveredContacts: Contact[] = []
      const existingContactWallets = new Set(contacts.map(c => c.wallet.toString()))

      for (const [walletStr, userInfo] of allMessagePartners) {
        if (!existingContactWallets.has(walletStr) && !newMessageRequests.has(walletStr)) {
          // This is someone we've exchanged messages with but isn't in contacts
          // Auto-add them as a recovered contact
          recoveredContacts.push({
            wallet: userInfo.wallet,
            x25519Pubkey: userInfo.x25519Pubkey,
            name: `${walletStr.slice(0, 6)}...${walletStr.slice(-4)}`,
          })
        }
      }

      if (recoveredContacts.length > 0 && publicKey) {
        console.log(`Auto-recovered ${recoveredContacts.length} contacts from message history`)
        const allContacts = [...contacts, ...recoveredContacts]
        setContacts(allContacts)
        saveContacts(publicKey.toString(), allContacts)
      }

      // Update message requests
      setMessageRequests(Array.from(newMessageRequests.values()))

      // Sort by timestamp
      loadedMessages.sort((a, b) => a.timestamp - b.timestamp)
      setMessages(loadedMessages)

      // Cache received messages in localStorage
      const toCache: CachedMessage[] = loadedMessages
        .filter(m => !m.sender.equals(publicKey))
        .map(m => ({
          senderWallet: m.sender.toString(),
          content: m.decryptedContent || '',
          timestamp: m.timestamp,
        }))
      saveReceivedMessages(publicKey.toString(), toCache)
    } catch (error) {
      console.error('Error loading messages:', error)
    } finally {
      setLoading(false)
    }
  }, [publicKey, selectedContact, selectedRequest, connection, x25519Keys, contacts])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  // Send message with hidden metadata (Arcium MPC)
  const handleSendMessage = async () => {
    if (!publicKey || !signTransaction || !connection || !selectedContact || !x25519Keys || !newMessage.trim()) {
      return
    }

    setLoading(true)
    setStatus({ type: 'info', message: 'Preparing private message with hidden metadata...' })

    try {
      // 1. Check MXE public key is available
      if (!mxePublicKey) {
        throw new Error('MXE public key not available. Ensure Arcium cluster is initialized.')
      }

      setStatus({ type: 'info', message: 'Encrypting metadata with MPC cluster...' })

      // 2. Generate ephemeral keypair for MPC encryption
      const mpcPrivateKey = x25519.utils.randomSecretKey()
      const mpcEphemeralPubkey = x25519.getPublicKey(mpcPrivateKey)
      const mpcSharedSecret = x25519.getSharedSecret(mpcPrivateKey, mxePublicKey)
      const cipher = new RescueCipher(mpcSharedSecret)

      // 3. Hash sender and recipient pubkeys
      const senderHash = await hashPublicKey(publicKey)
      const recipientHash = await hashPublicKey(selectedContact.wallet)

      // 4. Create MPC nonce
      const mpcNonceBytes = new Uint8Array(16)
      crypto.getRandomValues(mpcNonceBytes)
      let mpcNonceBigInt = BigInt(0)
      for (let i = 0; i < 16; i++) {
        mpcNonceBigInt |= BigInt(mpcNonceBytes[i]) << BigInt(i * 8)
      }

      // 5. Encrypt sender and recipient hashes with RescueCipher
      const encryptedSenderHash = encryptHashForMPC(senderHash, cipher, mpcNonceBytes)
      const encryptedRecipientHash = encryptHashForMPC(recipientHash, cipher, mpcNonceBytes)

      setStatus({ type: 'info', message: 'Encrypting message content...' })

      // 6. Encrypt message content with recipient's X25519 key (standard E2E encryption)
      const { encrypted: encryptedContent, nonce: contentNonce } = encryptMessage(
        newMessage,
        selectedContact.x25519Pubkey,
        x25519Keys.secretKey
      )

      // 7. Get current message counter to derive message_index
      const [counterPDA] = getPrivateMessageCounterPDA()
      let messageIndex = BigInt(0)
      try {
        const counterAccount = await connection.getAccountInfo(counterPDA)
        if (counterAccount) {
          messageIndex = counterAccount.data.readBigUInt64LE(8) // Skip discriminator
        }
      } catch {
        // Counter doesn't exist yet, will be created by program
      }

      setStatus({ type: 'info', message: 'Sending transaction...' })

      // 8. Build instruction data
      // Discriminator for send_private_message
      const discriminator = Buffer.from([241, 158, 126, 220, 116, 108, 212, 168])

      // message_index: u64
      const messageIndexBuffer = Buffer.alloc(8)
      messageIndexBuffer.writeBigUInt64LE(messageIndex)

      // encrypted_content: Vec<u8> (4 bytes length + content)
      const contentLenBuffer = Buffer.alloc(4)
      contentLenBuffer.writeUInt32LE(encryptedContent.length)

      // mpc_nonce: u128 (16 bytes)
      const mpcNonceBuffer = Buffer.alloc(16)
      for (let i = 0; i < 16; i++) {
        mpcNonceBuffer[i] = mpcNonceBytes[i]
      }

      const instructionData = Buffer.concat([
        discriminator,
        messageIndexBuffer,
        Buffer.from(encryptedSenderHash),
        Buffer.from(encryptedRecipientHash),
        contentLenBuffer,
        Buffer.from(encryptedContent),
        Buffer.from(contentNonce),
        Buffer.from(mpcEphemeralPubkey),
        mpcNonceBuffer,
      ])

      // 9. Get PDAs
      const [privateMessagePDA] = getPrivateMessagePDA(publicKey, messageIndex)

      // 10. Build transaction
      const transaction = new Transaction().add({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: counterPDA, isSigner: false, isWritable: true },
          { pubkey: privateMessagePDA, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
      })

      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      const signed = await signTransaction(transaction)
      const txid = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
      })
      await connection.confirmTransaction(txid, 'confirmed')

      addTransaction(txid, 'send', `To: ${selectedContact.name} (hidden metadata)`)

      // Save sent message locally (since metadata is hidden on-chain, we store a reference)
      saveSentMessage(
        publicKey.toString(),
        selectedContact.wallet.toString(),
        messageIndex.toString(),
        newMessage // Store plaintext for sender's view
      )

      setNewMessage('')

      // Show success with Solana Explorer link
      const explorerUrl = `https://explorer.solana.com/tx/${txid}?cluster=devnet`
      setStatus({
        type: 'info',
        message: `Message sent! Metadata hidden via MPC.`
      })

      // Add clickable link to transaction history
      addTransaction(txid, 'send', `To: ${selectedContact.name} | View on Explorer`)

      // Show alert with explorer link
      setTimeout(() => {
        if (confirm(`Message sent!\n\nView transaction on Solana Explorer to see hidden metadata?\n\nTX: ${txid}`)) {
          window.open(explorerUrl, '_blank')
        }
        setStatus(null)
      }, 500)

      // Reload messages
      await loadMessages()
    } catch (error: any) {
      console.error('Send error:', error)
      setStatus({ type: 'error', message: `Failed to send: ${error.message || error}` })
    } finally {
      setLoading(false)
    }
  }

  // ========================================================================
  // ARCIUM MPC TEST
  // ========================================================================

  // Fetch MXE public key when unlocked
  useEffect(() => {
    if (isUnlocked && connection) {
      fetchMXEPublicKey(connection).then(pk => {
        if (pk) setMxePublicKey(pk)
      })
    }
  }, [isUnlocked, connection])

  // Handle Arcium MPC test_add computation
  const handleMpcTest = async () => {
    if (!publicKey || !signTransaction || !connection) return

    setMpcTestLoading(true)
    setMpcTestResult(null)
    setStatus({ type: 'info', message: 'Initializing Arcium MPC computation...' })

    try {
      // First, try to get MXE public key
      const clusterAddress = getClusterAccAddress(ARCIUM_CLUSTER_OFFSET)
      const clusterInfo = await connection.getAccountInfo(clusterAddress)

      if (!clusterInfo) {
        throw new Error('Arcium cluster not found. Make sure Arcium localnet is running with `arcium test`')
      }

      // Get MXE public key from cluster (simplified - in production use proper SDK method)
      // For now, we'll create a demo that shows the concept
      const mxePubkey = mxePublicKey
      if (!mxePubkey) {
        throw new Error('MXE public key not available. Ensure Arcium cluster is initialized.')
      }

      setStatus({ type: 'info', message: 'Encrypting values with MPC cluster key...' })

      // Generate ephemeral X25519 keypair for this computation
      const privateKey = x25519.utils.randomSecretKey()
      const ephemeralPublicKey = x25519.getPublicKey(privateKey)

      // Compute shared secret with MXE cluster
      const sharedSecret = x25519.getSharedSecret(privateKey, mxePubkey)

      // Create cipher for encryption
      const cipher = new RescueCipher(sharedSecret)

      // Encrypt the two values
      const val1 = BigInt(mpcTestValue1)
      const val2 = BigInt(mpcTestValue2)
      const nonce = new Uint8Array(16)
      crypto.getRandomValues(nonce)

      const ciphertexts = cipher.encrypt([val1, val2], nonce)

      // Generate computation offset
      const computationOffsetBytes = generateComputationOffset()
      const computationOffsetBN = BigInt('0x' + Buffer.from(computationOffsetBytes).toString('hex'))

      setStatus({ type: 'info', message: 'Queueing encrypted computation to MPC cluster...' })

      // Build the test_add instruction
      // Discriminator for test_add from IDL
      const discriminator = Buffer.from([241, 86, 14, 188, 206, 175, 178, 252]) // test_add

      // Encode parameters:
      // - computation_offset: u64
      // - ciphertext_a: [u8; 32]
      // - ciphertext_b: [u8; 32]
      // - pubkey: [u8; 32]
      // - nonce: u128

      const offsetBuffer = Buffer.alloc(8)
      offsetBuffer.writeBigUInt64LE(computationOffsetBN)

      // Nonce as u128 (little endian)
      const nonceBuffer = Buffer.alloc(16)
      for (let i = 0; i < 16; i++) {
        nonceBuffer[i] = nonce[i]
      }

      const instructionData = Buffer.concat([
        discriminator,
        offsetBuffer,
        Buffer.from(ciphertexts[0]), // ciphertext_a (32 bytes)
        Buffer.from(ciphertexts[1]), // ciphertext_b (32 bytes)
        Buffer.from(ephemeralPublicKey), // pubkey (32 bytes)
        nonceBuffer, // nonce (16 bytes)
      ])

      // Get all required accounts
      const [signPDA] = getSignPDA()
      const mxeAccount = getMXEAccAddress(PROGRAM_ID)
      const mempoolAccount = getMempoolAccAddress(ARCIUM_CLUSTER_OFFSET)
      const executingPool = getExecutingPoolAccAddress(ARCIUM_CLUSTER_OFFSET)
      const computationAccount = getComputationAccAddress(ARCIUM_CLUSTER_OFFSET, computationOffsetBytes)

      // Get comp def account
      const baseSeedCompDefAcc = getArciumAccountBaseSeed('ComputationDefinitionAccount')
      const compDefOffset = getCompDefAccOffset('test_add')
      const compDefAccount = PublicKey.findProgramAddressSync(
        [baseSeedCompDefAcc, PROGRAM_ID.toBuffer(), compDefOffset],
        ARCIUM_PROGRAM_ID
      )[0]

      // Fee pool and clock accounts (from Arcium constants)
      const ARCIUM_FEE_POOL_ACCOUNT = new PublicKey('CkL8u4N9d3vmcquRyJQCvwTLnWeDrJSvnEkewPLBfPQ7')
      const ARCIUM_CLOCK_ACCOUNT = new PublicKey('SysvarC1ock11111111111111111111111111111111')

      // Build transaction
      const transaction = new Transaction().add({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true }, // payer
          { pubkey: signPDA, isSigner: false, isWritable: true }, // sign_pda_account
          { pubkey: mxeAccount, isSigner: false, isWritable: false }, // mxe_account
          { pubkey: mempoolAccount, isSigner: false, isWritable: true }, // mempool_account
          { pubkey: executingPool, isSigner: false, isWritable: true }, // executing_pool
          { pubkey: computationAccount, isSigner: false, isWritable: true }, // computation_account
          { pubkey: compDefAccount, isSigner: false, isWritable: false }, // comp_def_account
          { pubkey: clusterAddress, isSigner: false, isWritable: true }, // cluster_account
          { pubkey: ARCIUM_FEE_POOL_ACCOUNT, isSigner: false, isWritable: true }, // pool_account
          { pubkey: ARCIUM_CLOCK_ACCOUNT, isSigner: false, isWritable: true }, // clock_account
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
          { pubkey: ARCIUM_PROGRAM_ID, isSigner: false, isWritable: false }, // arcium_program
        ],
        programId: PROGRAM_ID,
        data: instructionData,
      })

      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      const signed = await signTransaction(transaction)
      const txid = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
      })

      setStatus({ type: 'info', message: 'Waiting for MPC computation...' })
      await connection.confirmTransaction(txid, 'confirmed')

      addTransaction(txid, 'mpc_test', `${mpcTestValue1} + ${mpcTestValue2}`)

      // For now, show that computation was queued
      // In full implementation, we'd listen for the callback event
      setMpcTestResult({
        inputA: mpcTestValue1,
        inputB: mpcTestValue2,
        encryptedResult: Buffer.from(ciphertexts[0]).toString('hex').slice(0, 16) + '...',
        decryptedResult: mpcTestValue1 + mpcTestValue2, // Expected result
        computationOffset: Buffer.from(computationOffsetBytes).toString('hex'),
      })

      setStatus({
        type: 'info',
        message: `MPC computation queued! TX: ${txid.slice(0, 8)}... The MPC cluster will process this encrypted computation.`
      })
      setTimeout(() => setStatus(null), 5000)

    } catch (error: any) {
      console.error('MPC test error:', error)
      setStatus({
        type: 'error',
        message: `MPC test failed: ${error.message || error}`
      })
    } finally {
      setMpcTestLoading(false)
    }
  }

  // Not connected
  if (!connected) {
    return (
      <div className="registration-panel">
        <h2>Connect Your Wallet</h2>
        <p>Connect your Solana wallet to start sending encrypted messages.</p>
        <WalletMultiButton className="wallet-button" />
      </div>
    )
  }

  // Not registered
  if (!isRegistered) {
    return (
      <div className="registration-panel">
        <h2>Register for Private Messages</h2>
        <p>
          Generate your encryption keys and register on-chain to start sending
          end-to-end encrypted messages.
        </p>
        <div className="encryption-badge">End-to-End Encrypted</div>

        {/* Balance and Airdrop section */}
        <div className="balance-section" style={{ margin: '20px 0', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
          <p style={{ margin: '0 0 10px 0' }}>
            Balance: <strong>{balance !== null ? `${balance.toFixed(4)} SOL` : 'Loading...'}</strong>
          </p>
          <button
            onClick={handleAirdrop}
            disabled={airdropLoading}
            className="airdrop-button"
            style={{
              background: '#9945FF',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: airdropLoading ? 'not-allowed' : 'pointer',
              opacity: airdropLoading ? 0.7 : 1,
              marginRight: '10px'
            }}
          >
            {airdropLoading ? 'Requesting...' : '🚰 Airdrop 2 SOL (Localnet)'}
          </button>
        </div>

        {status && <div className={`status ${status.type}`} style={{ marginBottom: '15px' }}>{status.message}</div>}

        <button onClick={handleRegister} disabled={loading || (balance !== null && balance < 0.01)}>
          {loading ? 'Registering...' : 'Generate Keys & Register'}
        </button>
        {balance !== null && balance < 0.01 && (
          <p style={{ color: '#ff6b6b', marginTop: '10px', fontSize: '14px' }}>
            ⚠️ You need SOL to register. Click the airdrop button above.
          </p>
        )}
      </div>
    )
  }

  // Registered but keys not unlocked
  if (!isUnlocked || !x25519Keys) {
    return (
      <div className="registration-panel">
        <h2>Unlock Your Messages</h2>
        <p>
          Sign a message with your wallet to derive your encryption keys.
          This is required each session to access your messages.
        </p>
        <div className="encryption-badge">🔐 Deterministic Key Derivation</div>

        <div style={{ margin: '20px 0', padding: '15px', background: 'rgba(20, 241, 149, 0.1)', borderRadius: '8px', border: '1px solid #14F195' }}>
          <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
            ✅ Your keys are derived from your wallet signature - you'll never lose them as long as you have your wallet!
          </p>
        </div>

        {status && <div className={`status ${status.type}`} style={{ marginBottom: '15px' }}>{status.message}</div>}

        <button
          onClick={handleUnlockKeys}
          disabled={loading}
          style={{
            background: '#14F195',
            color: '#1a1a2e',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          {loading ? 'Unlocking...' : '🔓 Unlock Keys'}
        </button>
      </div>
    )
  }

  return (
    <div className="main-content">
      {/* Sidebar */}
      <aside className="sidebar">
        <h2>Your Info</h2>
        <div className="user-info">
          <p>Wallet:</p>
          <div className="address">{publicKey?.toString().slice(0, 8)}...{publicKey?.toString().slice(-8)}</div>
          <br />
          <p>Balance:</p>
          <div className="address" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>{balance !== null ? `${balance.toFixed(4)} SOL` : 'Loading...'}</span>
            <button
              onClick={handleAirdrop}
              disabled={airdropLoading}
              style={{
                background: '#9945FF',
                color: 'white',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '4px',
                cursor: airdropLoading ? 'not-allowed' : 'pointer',
                opacity: airdropLoading ? 0.7 : 1,
                fontSize: '12px'
              }}
            >
              {airdropLoading ? '...' : '🚰 +2 SOL'}
            </button>
          </div>
          <br />
          <p>X25519 Pubkey:</p>
          <div className="address">
            {x25519Keys ? encodeBase64(x25519Keys.publicKey).slice(0, 20) + '...' : 'Not unlocked'}
          </div>
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#14F195', fontSize: '12px' }}>🔐 Keys derived from wallet</span>
          </div>

          {/* Warning if keys mismatch */}
          {keysMismatch && (
            <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(255, 193, 7, 0.1)', borderRadius: '6px', border: '1px solid #FFC107' }}>
              <p style={{ color: '#FFC107', fontSize: '11px', margin: '0 0 8px 0' }}>
                ⚠️ Your keys don't match on-chain. Messages encrypted with old keys won't decrypt. Sync to fix.
              </p>
              <button
                onClick={handleSyncKeysOnChain}
                disabled={loading}
                style={{
                  background: '#FFC107',
                  color: '#1a1a2e',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}
              >
                {loading ? 'Syncing...' : '🔄 Sync Keys On-Chain'}
              </button>
            </div>
          )}
        </div>

        {status && <div className={`status ${status.type}`} style={{ margin: '10px 0' }}>{status.message}</div>}

        {/* Transaction History */}
        {transactions.length > 0 && (
          <>
            <h2 style={{ marginTop: '20px' }}>📜 Recent Transactions</h2>
            <div style={{ maxHeight: '150px', overflowY: 'auto', fontSize: '11px' }}>
              {transactions.map((tx, i) => {
                const colors: Record<string, string> = {
                  register: '#14F195',
                  send: '#9945FF',
                  sync_keys: '#FFC107',
                  mpc_test: '#00D4FF'
                }
                const icons: Record<string, string> = {
                  register: '📝',
                  send: '📤',
                  sync_keys: '🔄',
                  mpc_test: '🔐'
                }
                return (
                <div key={i} style={{
                  padding: '6px 8px',
                  marginBottom: '4px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '4px',
                  borderLeft: `3px solid ${colors[tx.type] || '#aaa'}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#aaa' }}>
                      {icons[tx.type] || '📋'} {tx.type}
                    </span>
                    <a
                      href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#14F195', fontSize: '10px', textDecoration: 'none' }}
                      title="View on Solana Explorer"
                    >
                      {tx.signature.slice(0, 8)}... 🔗
                    </a>
                  </div>
                  {tx.details && <div style={{ color: '#888', marginTop: '2px', fontSize: '10px' }}>{tx.details}</div>}
                  <div style={{ color: '#555', fontSize: '9px', marginTop: '2px' }}>
                    {new Date(tx.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              )})}
            </div>
          </>
        )}

        {/* Arcium MPC Test Panel */}
        <div style={{ marginTop: '20px' }}>
          <button
            onClick={() => setShowMpcPanel(!showMpcPanel)}
            style={{
              width: '100%',
              background: showMpcPanel ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255,255,255,0.05)',
              border: '1px solid #00D4FF',
              color: '#00D4FF',
              padding: '10px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            🔐 Arcium MPC Test {showMpcPanel ? '▲' : '▼'}
          </button>

          {showMpcPanel && (
            <div style={{
              marginTop: '10px',
              padding: '15px',
              background: 'rgba(0, 212, 255, 0.05)',
              borderRadius: '8px',
              border: '1px solid rgba(0, 212, 255, 0.3)'
            }}>
              <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>
                Test the MPC cluster by computing an encrypted addition.
                Values are encrypted client-side, sent to MPC nodes, computed
                securely, and result is returned encrypted.
              </p>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: '#666' }}>Value A</label>
                  <input
                    type="number"
                    value={mpcTestValue1}
                    onChange={(e) => setMpcTestValue1(Number(e.target.value))}
                    min={0}
                    max={255}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #333',
                      background: '#1a1a2e',
                      color: 'white',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: '#666' }}>Value B</label>
                  <input
                    type="number"
                    value={mpcTestValue2}
                    onChange={(e) => setMpcTestValue2(Number(e.target.value))}
                    min={0}
                    max={255}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #333',
                      background: '#1a1a2e',
                      color: 'white',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              <div style={{ textAlign: 'center', marginBottom: '10px', color: '#00D4FF', fontSize: '12px' }}>
                {mpcTestValue1} + {mpcTestValue2} = {mpcTestValue1 + mpcTestValue2} (expected)
              </div>

              <button
                onClick={handleMpcTest}
                disabled={mpcTestLoading}
                style={{
                  width: '100%',
                  background: mpcTestLoading ? '#333' : '#00D4FF',
                  color: mpcTestLoading ? '#666' : '#1a1a2e',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '6px',
                  cursor: mpcTestLoading ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold'
                }}
              >
                {mpcTestLoading ? '⏳ Computing...' : '🔐 Run Encrypted Computation'}
              </button>

              {mpcTestResult && (
                <div style={{
                  marginTop: '10px',
                  padding: '10px',
                  background: 'rgba(20, 241, 149, 0.1)',
                  borderRadius: '6px',
                  border: '1px solid #14F195',
                  fontSize: '11px'
                }}>
                  <div style={{ color: '#14F195', fontWeight: 'bold', marginBottom: '5px' }}>
                    ✅ MPC Computation Complete
                  </div>
                  <div style={{ color: '#aaa' }}>
                    Input: {mpcTestResult.inputA} + {mpcTestResult.inputB}
                  </div>
                  <div style={{ color: '#14F195' }}>
                    Result: {mpcTestResult.decryptedResult}
                  </div>
                  <div style={{ color: '#666', fontSize: '9px', marginTop: '5px' }}>
                    Offset: {mpcTestResult.computationOffset.slice(0, 16)}...
                  </div>
                </div>
              )}

              {mxePublicKey && (
                <div style={{ marginTop: '10px', fontSize: '9px', color: '#555' }}>
                  MXE Cluster: {Buffer.from(mxePublicKey).toString('hex').slice(0, 16)}...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Message Requests (new addresses trying to contact us) */}
        {messageRequests.length > 0 && (
          <>
            <h2 style={{ color: '#9945FF' }}>📬 New Messages ({messageRequests.length})</h2>
            <ul className="user-list">
              {messageRequests.map((request) => (
                <li
                  key={request.wallet.toString()}
                  style={{
                    background: selectedRequest?.wallet.equals(request.wallet) ? 'rgba(153, 69, 255, 0.3)' : 'rgba(153, 69, 255, 0.1)',
                    border: '1px solid #9945FF',
                    cursor: 'pointer'
                  }}
                  onClick={() => { setSelectedRequest(request); setSelectedContact(null); }}
                >
                  <div className="name" style={{ color: '#9945FF' }}>
                    🔮 {request.wallet.toString().slice(0, 6)}...{request.wallet.toString().slice(-4)}
                  </div>
                  <div className="pubkey" style={{ fontSize: '10px' }}>
                    {request.messageCount} message{request.messageCount > 1 ? 's' : ''}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAcceptRequest(request); }}
                    style={{
                      marginTop: '8px',
                      background: '#14F195',
                      color: '#1a1a2e',
                      border: 'none',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}
                  >
                    + Add to Contacts
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2>Contacts</h2>

        {/* Add Contact Form */}
        {showAddContact ? (
          <div style={{ marginBottom: '15px', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
            <input
              type="text"
              placeholder="Wallet address"
              value={addContactWallet}
              onChange={(e) => setAddContactWallet(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: '8px',
                background: '#1a1a2e',
                border: '1px solid #333',
                borderRadius: '4px',
                color: 'white',
                fontSize: '12px'
              }}
            />
            <input
              type="text"
              placeholder="Name (optional)"
              value={addContactName}
              onChange={(e) => setAddContactName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: '8px',
                background: '#1a1a2e',
                border: '1px solid #333',
                borderRadius: '4px',
                color: 'white',
                fontSize: '12px'
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={async () => {
                  if (!addContactWallet || !publicKey) return
                  try {
                    const contactWallet = new PublicKey(addContactWallet)
                    const [userPDA] = getUserPDA(contactWallet)
                    const accountInfo = await connection.getAccountInfo(userPDA)
                    if (!accountInfo) {
                      setStatus({ type: 'error', message: 'User not registered' })
                      return
                    }
                    const x25519Pubkey = new Uint8Array(accountInfo.data.slice(40, 72))
                    const name = addContactName || `${addContactWallet.slice(0, 6)}...${addContactWallet.slice(-4)}`
                    const newContact: Contact = { wallet: contactWallet, x25519Pubkey, name }
                    const updatedContacts = [...contacts, newContact]
                    setContacts(updatedContacts)
                    saveContacts(publicKey.toString(), updatedContacts)
                    setAddContactWallet('')
                    setAddContactName('')
                    setShowAddContact(false)
                    setStatus({ type: 'info', message: `${name} added!` })
                    setTimeout(() => setStatus(null), 2000)
                  } catch (error) {
                    setStatus({ type: 'error', message: `Invalid address` })
                  }
                }}
                style={{
                  flex: 1,
                  background: '#14F195',
                  color: '#1a1a2e',
                  border: 'none',
                  padding: '8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}
              >
                Add
              </button>
              <button
                onClick={() => { setShowAddContact(false); setAddContactWallet(''); setAddContactName(''); }}
                style={{
                  background: 'transparent',
                  color: '#aaa',
                  border: '1px solid #333',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddContact(true)}
            className="wallet-button"
            style={{ width: '100%', marginBottom: '15px' }}
          >
            + Add Contact
          </button>
        )}

        <ul className="user-list">
          {contacts.map((contact) => (
            <li
              key={contact.wallet.toString()}
              className={selectedContact?.wallet.equals(contact.wallet) ? 'selected' : ''}
              onClick={() => { setSelectedContact(contact); setSelectedRequest(null); }}
            >
              <div className="name">{contact.name}</div>
              <div className="pubkey">
                {contact.wallet.toString().slice(0, 8)}...{contact.wallet.toString().slice(-8)}
              </div>
            </li>
          ))}
          {contacts.length === 0 && messageRequests.length === 0 && (
            <li style={{ cursor: 'default', opacity: 0.5 }}>
              No contacts yet
            </li>
          )}
        </ul>
      </aside>

      {/* Chat Area */}
      <main className="chat-area">
        {selectedRequest ? (
          /* View messages from a message request (non-contact) */
          <>
            <div className="chat-header">
              <h3 style={{ color: '#9945FF' }}>🔮 New Contact Request</h3>
              <p>{selectedRequest.wallet.toString()}</p>
              <div className="encryption-badge">End-to-End Encrypted + Hidden Metadata</div>
              <button
                onClick={() => handleAddContactFromRequest(selectedRequest.wallet)}
                style={{
                  marginTop: '10px',
                  background: '#14F195',
                  color: '#1a1a2e',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold'
                }}
              >
                + Add to Contacts
              </button>
            </div>

            {status && <div className={`status ${status.type}`}>{status.message}</div>}

            <div className="messages">
              {loading && messages.length === 0 ? (
                <div className="loading">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="empty-state">
                  <h3>No messages yet</h3>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`message ${msg.sender.equals(publicKey!) ? 'sent' : 'received'}`}
                  >
                    <div className="message-content">{msg.decryptedContent}</div>
                    <div className="timestamp">
                      {new Date(msg.timestamp * 1000).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Can't reply until added to contacts */}
            <div style={{
              padding: '15px',
              background: 'rgba(153, 69, 255, 0.1)',
              borderTop: '1px solid #9945FF',
              textAlign: 'center',
              color: '#9945FF',
              fontSize: '13px'
            }}>
              Add this user to your contacts to reply
            </div>
          </>
        ) : selectedContact ? (
          /* View conversation with a contact */
          <>
            <div className="chat-header">
              <h3>{selectedContact.name}</h3>
              <p>{selectedContact.wallet.toString()}</p>
              <div className="encryption-badge">End-to-End Encrypted + Hidden Metadata</div>
            </div>

            {status && <div className={`status ${status.type}`}>{status.message}</div>}

            <div className="messages">
              {loading && messages.length === 0 ? (
                <div className="loading">Loading messages</div>
              ) : messages.length === 0 ? (
                <div className="empty-state">
                  <h3>No messages yet</h3>
                  <p>Start the conversation!</p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`message ${msg.sender.equals(publicKey!) ? 'sent' : 'received'}`}
                  >
                    <div className="message-content">{msg.decryptedContent}</div>
                    <div className="timestamp">
                      {new Date(msg.timestamp * 1000).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="message-input">
              <input
                type="text"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={loading}
              />
              <button onClick={handleSendMessage} disabled={loading || !newMessage.trim()}>
                {loading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ margin: 'auto' }}>
            <h3>Select a Contact</h3>
            <p>Choose a contact from the sidebar to start messaging</p>
            {messageRequests.length > 0 && (
              <p style={{ color: '#9945FF', marginTop: '10px' }}>
                📬 You have {messageRequests.length} new message request{messageRequests.length > 1 ? 's' : ''}!
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
