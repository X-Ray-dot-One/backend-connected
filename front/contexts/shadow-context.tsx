"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  hashUserId,
  generateShadowWallet,
  generateShadowName,
  ShadowWallet,
} from "@/lib/shadow/shadowWallet";
import { getShadowStats, ShadowStats } from "@/lib/shadow/shadowStats";
import { getWalletBalance } from "@/lib/shadow/postService";
import * as api from "@/lib/api";

// ============================================================================
// TYPES
// ============================================================================

interface ShadowWalletWithBalance extends ShadowWallet {
  balance: number;
}

interface ShadowContextType {
  // State
  isUnlocked: boolean;
  isRestoring: boolean;
  signature: string | null;
  hashedUserId: string | null;
  wallets: ShadowWalletWithBalance[];
  selectedWalletIndex: number | null;
  selectedWallet: ShadowWalletWithBalance | null;
  stats: ShadowStats | null;
  isLoading: boolean;

  // Actions
  unlockShadowWallets: (publicKey: string, signMessage: (message: Uint8Array) => Promise<Uint8Array>) => Promise<void>;
  lockShadowWallets: () => void;
  generateNewWallet: () => Promise<void>;
  selectWallet: (index: number) => void;
  refreshStats: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  refreshWalletNames: () => Promise<void>;
  getSelectedKeypair: () => Promise<Keypair | null>;
}

const ShadowContext = createContext<ShadowContextType | undefined>(undefined);

// ============================================================================
// CONSTANTS
// ============================================================================

const SIGN_MESSAGE = "X-RAY Shadow Wallet Access";
const STORAGE_KEY_PREFIX = "xray_shadow_";
const SESSION_KEY = "xray_shadow_session";
const CLEAR_SHADOW_EVENT = "xray_clear_shadow";

// Export function to clear shadow session (for use in auth-context)
// This triggers a custom event that the ShadowProvider listens to
export function clearShadowSession() {
  sessionStorage.removeItem(SESSION_KEY);
  // Dispatch event to notify ShadowProvider to reset its state
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CLEAR_SHADOW_EVENT));
  }
}

// ============================================================================
// PROVIDER
// ============================================================================

export function ShadowProvider({ children }: { children: ReactNode }) {
  // Core state
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [hashedUserId, setHashedUserId] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  // Wallet state
  const [wallets, setWallets] = useState<ShadowWalletWithBalance[]>([]);
  const [selectedWalletIndex, setSelectedWalletIndex] = useState<number | null>(null);
  const [stats, setStats] = useState<ShadowStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true); // For initial restore

  // Derived state
  const selectedWallet = selectedWalletIndex !== null ? wallets[selectedWalletIndex] : null;

  // ============================================================================
  // SESSION RESTORE - Restore unlock state from sessionStorage on mount
  // ============================================================================

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const sessionData = sessionStorage.getItem(SESSION_KEY);
        if (!sessionData) {
          setIsRestoring(false);
          return;
        }

        const { sig, odI, pk, swi } = JSON.parse(sessionData);
        if (!sig || !odI || !pk) {
          sessionStorage.removeItem(SESSION_KEY);
          setIsRestoring(false);
          return;
        }
        const savedWalletIndex = typeof swi === 'number' ? swi : 0;

        // Restore state
        setSignature(sig);
        setHashedUserId(odI);
        setPublicKey(pk);

        // Fetch wallet count and regenerate wallets
        let walletCount = 0;
        try {
          const countResponse = await api.getShadowWalletCount(odI);
          walletCount = countResponse.count;
        } catch {
          const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${odI}_wallets`);
          if (saved) {
            walletCount = JSON.parse(saved).length;
          }
        }

        if (walletCount > 0) {
          const savedKey = `${STORAGE_KEY_PREFIX}${odI}_wallets`;
          const savedData = localStorage.getItem(savedKey);
          const savedWallets: { index: number; name: string }[] = savedData ? JSON.parse(savedData) : [];
          const existingNames: string[] = [];
          const regeneratedWallets: ShadowWalletWithBalance[] = [];

          for (let i = 0; i < walletCount; i++) {
            const keypair = await generateShadowWallet(sig, odI, i);
            const pubkey = keypair.publicKey.toBase58();
            const savedWallet = savedWallets.find(w => w.index === i);

            let name: string;
            if (savedWallet) {
              name = savedWallet.name;
            } else {
              try {
                const nameResponse = await api.getShadowWalletName(pubkey);
                name = nameResponse.name || generateShadowName(existingNames);
              } catch {
                name = generateShadowName(existingNames);
              }
            }
            existingNames.push(name);

            regeneratedWallets.push({
              index: i,
              publicKey: pubkey,
              name,
              balance: 0,
            });
          }

          localStorage.setItem(savedKey, JSON.stringify(
            regeneratedWallets.map(w => ({ index: w.index, name: w.name }))
          ));

          setWallets(regeneratedWallets);
          if (regeneratedWallets.length > 0) {
            // Restore saved wallet index, or default to 0
            const indexToSelect = savedWalletIndex < regeneratedWallets.length ? savedWalletIndex : 0;
            setSelectedWalletIndex(indexToSelect);
          }
        }

        setIsUnlocked(true);
      } catch (error) {
        console.error("Failed to restore shadow session:", error);
        sessionStorage.removeItem(SESSION_KEY);
      } finally {
        setIsRestoring(false);
      }
    };

    restoreSession();
  }, []);

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  const getStorageKey = useCallback((key: string) => {
    return `${STORAGE_KEY_PREFIX}${hashedUserId}_${key}`;
  }, [hashedUserId]);

  const saveWalletsToStorage = useCallback((walletsToSave: ShadowWalletWithBalance[]) => {
    if (!hashedUserId) return;
    const key = getStorageKey("wallets");
    const data = walletsToSave.map(w => ({ index: w.index, name: w.name }));
    localStorage.setItem(key, JSON.stringify(data));
  }, [hashedUserId, getStorageKey]);

  const loadWalletsFromStorage = useCallback((): { index: number; name: string }[] => {
    if (!hashedUserId) return [];
    const key = getStorageKey("wallets");
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  }, [hashedUserId, getStorageKey]);

  // ============================================================================
  // WALLET GENERATION
  // ============================================================================

  const regenerateWallets = useCallback(async (
    sig: string,
    userId: string,
    savedWallets: { index: number; name: string }[]
  ): Promise<ShadowWalletWithBalance[]> => {
    const regenerated: ShadowWalletWithBalance[] = [];

    for (const saved of savedWallets) {
      const keypair = await generateShadowWallet(sig, userId, saved.index);
      regenerated.push({
        index: saved.index,
        publicKey: keypair.publicKey.toBase58(),
        name: saved.name,
        balance: 0,
      });
    }

    return regenerated;
  }, []);

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const unlockShadowWallets = useCallback(async (
    walletPublicKey: string,
    signMessage: (message: Uint8Array) => Promise<Uint8Array>
  ) => {
    setIsLoading(true);

    try {
      // Sign the message to derive shadow wallets
      const messageBytes = new TextEncoder().encode(SIGN_MESSAGE);
      const signatureBytes = await signMessage(messageBytes);
      const sig = Buffer.from(signatureBytes).toString("base64");

      // Hash the user ID
      const userId = await hashUserId(walletPublicKey);

      setSignature(sig);
      setHashedUserId(userId);
      setPublicKey(walletPublicKey);

      // Get wallet count from backend - this is the source of truth
      let walletCount = 0;
      try {
        const countResponse = await api.getShadowWalletCount(userId);
        walletCount = countResponse.count;
      } catch {
        // If backend not available, use localStorage as fallback
        const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}_wallets`);
        if (saved) {
          const parsed = JSON.parse(saved);
          walletCount = parsed.length;
        }
      }

      // Load saved wallet names from localStorage
      const savedKey = `${STORAGE_KEY_PREFIX}${userId}_wallets`;
      const savedData = localStorage.getItem(savedKey);
      const savedWallets: { index: number; name: string }[] = savedData ? JSON.parse(savedData) : [];

      // Regenerate wallets - DB count is the source of truth
      let regeneratedWallets: ShadowWalletWithBalance[] = [];

      if (walletCount > 0) {
        // Generate exactly walletCount wallets (matching DB count)
        const existingNames: string[] = [];

        for (let i = 0; i < walletCount; i++) {
          const keypair = await generateShadowWallet(sig, userId, i);
          const pubkey = keypair.publicKey.toBase58();

          // Try to get name from localStorage first, then backend, then generate new
          let name: string;
          const savedWallet = savedWallets.find(w => w.index === i);

          if (savedWallet) {
            name = savedWallet.name;
          } else {
            // Try to get name from backend
            try {
              const nameResponse = await api.getShadowWalletName(pubkey);
              name = nameResponse.name || generateShadowName(existingNames);
            } catch {
              name = generateShadowName(existingNames);
            }
          }
          existingNames.push(name);

          regeneratedWallets.push({
            index: i,
            publicKey: pubkey,
            name,
            balance: 0,
          });
        }

        // Update localStorage to match DB count
        localStorage.setItem(savedKey, JSON.stringify(
          regeneratedWallets.map(w => ({ index: w.index, name: w.name }))
        ));
      } else {
        // No wallets in DB, clear localStorage too
        localStorage.removeItem(savedKey);
      }

      setWallets(regeneratedWallets);
      setIsUnlocked(true);

      // Save session to sessionStorage (persists across page navigations)
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        sig,
        odI: userId,
        pk: walletPublicKey,
        swi: 0, // Selected wallet index
      }));

      // Select first wallet if available
      if (regeneratedWallets.length > 0) {
        setSelectedWalletIndex(0);
      }

    } catch (error) {
      console.error("Failed to unlock shadow wallets:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [regenerateWallets]);

  const lockShadowWallets = useCallback(() => {
    setIsUnlocked(false);
    setSignature(null);
    setHashedUserId(null);
    setPublicKey(null);
    setWallets([]);
    setSelectedWalletIndex(null);
    setStats(null);
    // Clear session
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const generateNewWallet = useCallback(async () => {
    if (!signature || !hashedUserId) return;

    setIsLoading(true);

    try {
      const newIndex = wallets.length;
      const existingNames = wallets.map(w => w.name);

      // Generate a unique name that doesn't exist in DB
      let name = generateShadowName(existingNames);
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        try {
          const nameCheck = await api.shadowWalletNameExists(name);
          if (!nameCheck.exists) {
            break; // Name is unique, use it
          }
          // Name exists in DB, generate a new one
          existingNames.push(name);
          name = generateShadowName(existingNames);
          attempts++;
        } catch {
          // If API fails, assume name is unique
          break;
        }
      }

      const keypair = await generateShadowWallet(signature, hashedUserId, newIndex);
      const pubkey = keypair.publicKey.toBase58();

      // First, increment count and register wallet in DB
      try {
        await api.incrementShadowWalletCount(hashedUserId);
        await api.createShadowWallet(pubkey, name);
      } catch (error) {
        console.error("Failed to sync with backend:", error);
        // Don't continue if we can't register in DB
        throw new Error("Failed to register wallet in database");
      }

      const newWallet: ShadowWalletWithBalance = {
        index: newIndex,
        publicKey: pubkey,
        name,
        balance: 0,
      };

      const updatedWallets = [...wallets, newWallet];
      setWallets(updatedWallets);

      // Save to localStorage
      const savedKey = `${STORAGE_KEY_PREFIX}${hashedUserId}_wallets`;
      localStorage.setItem(savedKey, JSON.stringify(
        updatedWallets.map(w => ({ index: w.index, name: w.name }))
      ));

      // Select the new wallet
      setSelectedWalletIndex(newIndex);

    } catch (error) {
      console.error("Failed to generate new wallet:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [signature, hashedUserId, wallets]);

  const selectWallet = useCallback((index: number) => {
    if (index >= 0 && index < wallets.length) {
      setSelectedWalletIndex(index);
    }
  }, [wallets.length]);

  const refreshStats = useCallback(async () => {
    if (!selectedWallet) {
      setStats(null);
      return;
    }

    try {
      const walletStats = await getShadowStats(selectedWallet.publicKey);
      setStats(walletStats);
    } catch (error) {
      // Silently handle RPC errors (rate limits, network issues)
      // Stats will be empty but app continues to work
      console.warn("Failed to fetch shadow stats (RPC may be rate limited):", error);
      setStats(null);
    }
  }, [selectedWallet]);

  const refreshBalances = useCallback(async () => {
    if (wallets.length === 0) return;

    try {
      // Fetch balances sequentially with delay to avoid rate limits
      const updatedWallets: ShadowWalletWithBalance[] = [];
      for (const wallet of wallets) {
        try {
          const balance = await getWalletBalance(new PublicKey(wallet.publicKey));
          updatedWallets.push({ ...wallet, balance });
        } catch {
          // Keep existing balance on error
          updatedWallets.push(wallet);
        }
        // Small delay between requests to avoid rate limiting
        if (wallets.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      setWallets(updatedWallets);
    } catch (error) {
      // Silently handle errors - balances will show as 0
      console.warn("Failed to refresh balances (RPC may be rate limited):", error);
    }
  }, [wallets]);

  const refreshWalletNames = useCallback(async () => {
    if (wallets.length === 0 || !hashedUserId) return;

    try {
      const updatedWallets: ShadowWalletWithBalance[] = [];
      for (const wallet of wallets) {
        try {
          const nameResponse = await api.getShadowWalletName(wallet.publicKey);
          updatedWallets.push({
            ...wallet,
            name: nameResponse.name || wallet.name
          });
        } catch {
          // Keep existing name on error
          updatedWallets.push(wallet);
        }
      }
      setWallets(updatedWallets);

      // Update localStorage
      const savedKey = `${STORAGE_KEY_PREFIX}${hashedUserId}_wallets`;
      localStorage.setItem(savedKey, JSON.stringify(
        updatedWallets.map(w => ({ index: w.index, name: w.name }))
      ));
    } catch (error) {
      console.warn("Failed to refresh wallet names:", error);
    }
  }, [wallets, hashedUserId]);

  const getSelectedKeypair = useCallback(async (): Promise<Keypair | null> => {
    if (!signature || !hashedUserId || selectedWalletIndex === null) {
      return null;
    }
    return generateShadowWallet(signature, hashedUserId, selectedWalletIndex);
  }, [signature, hashedUserId, selectedWalletIndex]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Listen for clear shadow event (triggered by logout/wallet change)
  useEffect(() => {
    const handleClearShadow = () => {
      setIsUnlocked(false);
      setSignature(null);
      setHashedUserId(null);
      setPublicKey(null);
      setWallets([]);
      setSelectedWalletIndex(null);
      setStats(null);
    };

    window.addEventListener(CLEAR_SHADOW_EVENT, handleClearShadow);
    return () => window.removeEventListener(CLEAR_SHADOW_EVENT, handleClearShadow);
  }, []);

  // Persist selected wallet index to session storage
  useEffect(() => {
    if (selectedWalletIndex === null || !isUnlocked) return;

    const sessionData = sessionStorage.getItem(SESSION_KEY);
    if (sessionData) {
      try {
        const parsed = JSON.parse(sessionData);
        parsed.swi = selectedWalletIndex;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
      } catch {
        // Ignore parse errors
      }
    }
  }, [selectedWalletIndex, isUnlocked]);

  // Refresh stats when selected wallet changes (with delay to avoid rate limits)
  useEffect(() => {
    if (!selectedWallet) return;

    // Delay stats fetch to avoid hitting rate limits during unlock
    const timeout = setTimeout(() => {
      refreshStats();
    }, 1000);

    return () => clearTimeout(timeout);
  }, [selectedWallet?.publicKey]);

  // Refresh balances periodically (with initial delay)
  useEffect(() => {
    if (!isUnlocked || wallets.length === 0) return;

    // Delay initial balance fetch to avoid rate limits during unlock
    const initialTimeout = setTimeout(() => {
      refreshBalances();
    }, 2000);

    // Then refresh every 60 seconds (reduced frequency to avoid rate limits)
    const interval = setInterval(refreshBalances, 60000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [isUnlocked, wallets.length]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <ShadowContext.Provider
      value={{
        isUnlocked,
        isRestoring,
        signature,
        hashedUserId,
        wallets,
        selectedWalletIndex,
        selectedWallet,
        stats,
        isLoading,
        unlockShadowWallets,
        lockShadowWallets,
        generateNewWallet,
        selectWallet,
        refreshStats,
        refreshBalances,
        refreshWalletNames,
        getSelectedKeypair,
      }}
    >
      {children}
    </ShadowContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useShadow() {
  const context = useContext(ShadowContext);
  if (context === undefined) {
    throw new Error("useShadow must be used within a ShadowProvider");
  }
  return context;
}
