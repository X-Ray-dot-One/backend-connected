"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { useShadow } from "./shadow-context";
import { useAuth } from "./auth-context";
import {
  Contact,
  PrivateMessage,
  X25519KeyPair,
  deriveX25519KeyPairFromKeypair,
  isUserRegistered,
  getUserX25519Pubkey,
  registerUser,
  updateUserKey,
  encryptMessage,
  sendPrivateMessageOnChain,
  loadAllMessagesForUser,
  loadContacts,
  saveContacts,
  saveSentMessage,
  getMessageIndex,
  refreshContactNames,
} from "@/lib/shadow/privateMessages";

// ============================================================================
// TYPES
// ============================================================================

interface MessagesContextType {
  // State
  isRegistered: boolean;
  isUnlocked: boolean;
  keysMismatch: boolean;
  contacts: Contact[];
  selectedContact: Contact | null;
  messages: PrivateMessage[];
  allMessagesByContact: Map<string, PrivateMessage[]>;
  isLoading: boolean;
  shadowWalletAddress: string | null;
  x25519Keys: X25519KeyPair | null;

  // Actions
  register: () => Promise<void>;
  syncKeysOnChain: () => Promise<void>;
  selectContact: (contact: Contact | null) => void;
  sendMessage: (content: string) => Promise<{ fundingSignature?: string; messageSignature: string }>;
  addContact: (walletAddress: string, name: string) => Promise<void>;
  refreshContacts: () => void;
  loadMessages: () => Promise<void>;
}

const MessagesContext = createContext<MessagesContextType | undefined>(undefined);

// ============================================================================
// CONSTANTS
// ============================================================================

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const MIN_BALANCE_FOR_MESSAGE = 0.004 * LAMPORTS_PER_SOL; // Minimum balance to send a message (~0.00377 SOL for rent + fees)
const FUNDING_AMOUNT = 0.004 * LAMPORTS_PER_SOL; // Amount to fund when low balance

// ============================================================================
// PROVIDER
// ============================================================================

export function MessagesProvider({ children }: { children: ReactNode }) {
  const { selectedWallet, isUnlocked: shadowUnlocked, getSelectedKeypair, refreshBalances } = useShadow();
  const { user } = useAuth();
  const publicWalletAddress = user?.wallet_address || null;

  // Core state
  const [isRegistered, setIsRegistered] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [keysMismatch, setKeysMismatch] = useState(false);
  const [x25519Keys, setX25519Keys] = useState<X25519KeyPair | null>(null);

  // Contact state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Message state
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [allMessagesByContact, setAllMessagesByContact] = useState<Map<string, PrivateMessage[]>>(new Map());

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  const shadowWalletAddress = selectedWallet?.publicKey || null;

  // ============================================================================
  // AUTO-UNLOCK X25519 KEYS
  // ============================================================================

  useEffect(() => {
    const unlockKeys = async () => {
      if (!shadowUnlocked || !shadowWalletAddress) {
        setIsUnlocked(false);
        setX25519Keys(null);
        setIsRegistered(false);
        setKeysMismatch(false);
        return;
      }

      try {
        // Get the shadow keypair
        const keypair = await getSelectedKeypair();
        if (!keypair) {
          setIsUnlocked(false);
          return;
        }

        // Derive X25519 keys from the shadow keypair's secret key
        const x25519 = await deriveX25519KeyPairFromKeypair(keypair.secretKey);
        setX25519Keys(x25519);

        // Check registration status
        const registered = await isUserRegistered(shadowWalletAddress);
        setIsRegistered(registered);

        if (registered) {
          // Check if on-chain X25519 key matches our derived key
          const onChainPubkey = await getUserX25519Pubkey(shadowWalletAddress);
          if (onChainPubkey) {
            const keysMatch = onChainPubkey.every((byte, i) => byte === x25519.publicKey[i]);
            setKeysMismatch(!keysMatch);
          }
        }

        setIsUnlocked(true);

        // Load contacts from localStorage
        const savedContacts = loadContacts(shadowWalletAddress);
        setContacts(savedContacts);

        // Refresh contact names in background (for contacts with truncated addresses as names)
        if (savedContacts.length > 0) {
          refreshContactNames(savedContacts).then(updatedContacts => {
            const hasChanges = updatedContacts.some((c, i) => c.name !== savedContacts[i].name);
            if (hasChanges) {
              setContacts(updatedContacts);
              saveContacts(shadowWalletAddress, updatedContacts);
            }
          });
        }

      } catch (error) {
        console.error("Failed to unlock messaging keys:", error);
        setIsUnlocked(false);
      }
    };

    unlockKeys();
  }, [shadowUnlocked, shadowWalletAddress, getSelectedKeypair]);

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const register = useCallback(async () => {
    if (!shadowWalletAddress || !x25519Keys) {
      throw new Error("Shadow wallet not unlocked");
    }

    const keypair = await getSelectedKeypair();
    if (!keypair) {
      throw new Error("Could not get shadow keypair");
    }

    setIsLoading(true);

    try {
      const connection = new Connection(RPC_URL, "confirmed");

      // Sign transaction with shadow keypair
      const signTransaction = async (tx: Transaction): Promise<Transaction> => {
        tx.sign(keypair);
        return tx;
      };

      await registerUser(
        connection,
        keypair.publicKey,
        x25519Keys.publicKey,
        signTransaction
      );

      setIsRegistered(true);
      setKeysMismatch(false);
    } finally {
      setIsLoading(false);
    }
  }, [shadowWalletAddress, x25519Keys, getSelectedKeypair]);

  const syncKeysOnChain = useCallback(async () => {
    if (!shadowWalletAddress || !x25519Keys) {
      throw new Error("Shadow wallet not unlocked");
    }

    const keypair = await getSelectedKeypair();
    if (!keypair) {
      throw new Error("Could not get shadow keypair");
    }

    setIsLoading(true);

    try {
      const connection = new Connection(RPC_URL, "confirmed");

      const signTransaction = async (tx: Transaction): Promise<Transaction> => {
        tx.sign(keypair);
        return tx;
      };

      await updateUserKey(
        connection,
        keypair.publicKey,
        x25519Keys.publicKey,
        signTransaction
      );

      setKeysMismatch(false);
    } finally {
      setIsLoading(false);
    }
  }, [shadowWalletAddress, x25519Keys, getSelectedKeypair]);

  const selectContact = useCallback((contact: Contact | null) => {
    setSelectedContact(contact);
    if (contact) {
      // Show cached messages immediately
      const contactMessages = allMessagesByContact.get(contact.walletAddress) || [];
      setMessages(contactMessages);
    } else {
      setMessages([]);
    }
  }, [allMessagesByContact]);

  const sendMessage = useCallback(async (content: string): Promise<{ fundingSignature?: string; messageSignature: string }> => {
    if (!shadowWalletAddress || !x25519Keys || !selectedContact) {
      throw new Error("Not ready to send messages");
    }

    const keypair = await getSelectedKeypair();
    if (!keypair) {
      throw new Error("Could not get shadow keypair");
    }

    const connection = new Connection(RPC_URL, "confirmed");

    let fundingSignature: string | undefined;

    // Check if we need to fund from public wallet
    const balance = await connection.getBalance(keypair.publicKey);
    if (balance < MIN_BALANCE_FOR_MESSAGE) {
      // Need to fund from public wallet
      if (!publicWalletAddress) {
        throw new Error("Insufficient balance. Please connect your public wallet to fund your shadow wallet.");
      }

      const wallet = (window as { solana?: { signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }> } }).solana;
      if (!wallet) {
        throw new Error("Phantom wallet not found. Please install Phantom to fund your shadow wallet.");
      }

      // Create funding transaction
      const fundTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(publicWalletAddress),
          toPubkey: keypair.publicKey,
          lamports: Math.floor(FUNDING_AMOUNT),
        })
      );

      const { blockhash } = await connection.getLatestBlockhash();
      fundTx.recentBlockhash = blockhash;
      fundTx.feePayer = new PublicKey(publicWalletAddress);

      try {
        const { signature } = await wallet.signAndSendTransaction(fundTx);
        await connection.confirmTransaction(signature, "confirmed");
        fundingSignature = signature;

        // Refresh balances after funding
        refreshBalances();
      } catch (err) {
        throw new Error("Failed to fund shadow wallet. Please try again.");
      }
    }

    // Encrypt the message
    const { encrypted, nonce } = encryptMessage(
      content,
      selectedContact.x25519Pubkey,
      x25519Keys.secretKey
    );

    // Sign transaction with shadow keypair
    const signTransaction = async (tx: Transaction): Promise<Transaction> => {
      tx.sign(keypair);
      return tx;
    };

    // Send the message on-chain
    const messageSignature = await sendPrivateMessageOnChain(
      connection,
      keypair.publicKey,
      encrypted,
      nonce,
      signTransaction
    );

    // Save sent message locally
    const messageIndex = await getMessageIndex(shadowWalletAddress);
    saveSentMessage(shadowWalletAddress, selectedContact.walletAddress, messageIndex.toString(), content);

    // Add message to local state immediately
    const newMessage: PrivateMessage = {
      id: `${shadowWalletAddress}-${messageIndex}`,
      sender: shadowWalletAddress,
      recipient: selectedContact.walletAddress,
      content,
      timestamp: Date.now(),
      isOutgoing: true,
    };

    setMessages(prev => [...prev, newMessage]);

    // Update allMessagesByContact
    setAllMessagesByContact(prev => {
      const updated = new Map(prev);
      const contactMsgs = updated.get(selectedContact.walletAddress) || [];
      updated.set(selectedContact.walletAddress, [...contactMsgs, newMessage]);
      return updated;
    });

    // Refresh balances
    refreshBalances();

    return { fundingSignature, messageSignature };
  }, [shadowWalletAddress, x25519Keys, selectedContact, publicWalletAddress, getSelectedKeypair, refreshBalances]);

  const addContact = useCallback(async (walletAddress: string, name: string) => {
    if (!shadowWalletAddress) {
      throw new Error("Shadow wallet not unlocked");
    }

    // Check if user is registered and get their X25519 pubkey
    const x25519Pubkey = await getUserX25519Pubkey(walletAddress);
    if (!x25519Pubkey) {
      throw new Error("User is not registered for private messages");
    }

    // Check if already a contact
    if (contacts.some(c => c.walletAddress === walletAddress)) {
      throw new Error("Already a contact");
    }

    const newContact: Contact = {
      walletAddress,
      x25519Pubkey,
      name,
    };

    const updatedContacts = [...contacts, newContact];
    setContacts(updatedContacts);
    saveContacts(shadowWalletAddress, updatedContacts);
  }, [shadowWalletAddress, contacts]);

  const refreshContacts = useCallback(() => {
    if (!shadowWalletAddress) return;
    const savedContacts = loadContacts(shadowWalletAddress);
    setContacts(savedContacts);
  }, [shadowWalletAddress]);

  const loadMessages = useCallback(async () => {
    if (!shadowWalletAddress || !x25519Keys) return;

    setIsLoading(true);

    try {
      // Get current contacts from state
      const currentContacts = contacts;

      const { messages: messagesByContact, newContacts: discoveredContacts } = await loadAllMessagesForUser(
        shadowWalletAddress,
        x25519Keys,
        currentContacts
      );

      setAllMessagesByContact(messagesByContact);

      // Auto-add new contacts discovered from messages
      if (discoveredContacts.length > 0) {
        const newContactsToAdd: Contact[] = discoveredContacts.map(c => ({
          walletAddress: c.wallet,
          x25519Pubkey: c.x25519Pubkey,
          name: c.name,
        }));

        setContacts(prevContacts => {
          // Avoid duplicates
          const existingWallets = new Set(prevContacts.map(c => c.walletAddress));
          const uniqueNewContacts = newContactsToAdd.filter(c => !existingWallets.has(c.walletAddress));
          if (uniqueNewContacts.length === 0) return prevContacts;

          const updatedContacts = [...prevContacts, ...uniqueNewContacts];
          saveContacts(shadowWalletAddress, updatedContacts);
          return updatedContacts;
        });
      }

      // Update messages for selected contact
      if (selectedContact) {
        const contactMessages = messagesByContact.get(selectedContact.walletAddress) || [];
        setMessages(contactMessages);
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setIsLoading(false);
    }
  }, [shadowWalletAddress, x25519Keys, contacts, selectedContact]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Reset state when shadow wallet changes
  useEffect(() => {
    setSelectedContact(null);
    setMessages([]);
    setAllMessagesByContact(new Map());
  }, [shadowWalletAddress]);

  // Auto-load messages when unlocked and registered
  useEffect(() => {
    if (isUnlocked && isRegistered && x25519Keys && shadowWalletAddress) {
      loadMessages();
    }
  }, [isUnlocked, isRegistered, x25519Keys, shadowWalletAddress]);

  // Periodic refresh of messages (every 30 seconds)
  useEffect(() => {
    if (!isUnlocked || !isRegistered || !x25519Keys) return;

    const interval = setInterval(() => {
      loadMessages();
    }, 30000);

    return () => clearInterval(interval);
  }, [isUnlocked, isRegistered, x25519Keys, loadMessages]);

  // Update messages when allMessagesByContact changes for selected contact
  useEffect(() => {
    if (selectedContact) {
      const contactMessages = allMessagesByContact.get(selectedContact.walletAddress) || [];
      setMessages(contactMessages);
    }
  }, [allMessagesByContact, selectedContact]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <MessagesContext.Provider
      value={{
        isRegistered,
        isUnlocked,
        keysMismatch,
        contacts,
        selectedContact,
        messages,
        allMessagesByContact,
        isLoading,
        shadowWalletAddress,
        x25519Keys,
        register,
        syncKeysOnChain,
        selectContact,
        sendMessage,
        addContact,
        refreshContacts,
        loadMessages,
      }}
    >
      {children}
    </MessagesContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useMessages() {
  const context = useContext(MessagesContext);
  if (context === undefined) {
    throw new Error("useMessages must be used within a MessagesProvider");
  }
  return context;
}
