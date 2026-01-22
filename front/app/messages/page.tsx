"use client";

import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/app-layout";
import { useShadow } from "@/contexts/shadow-context";
import { useMessages } from "@/contexts/messages-context";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/components/toast";
import {
  Mail,
  Send,
  MessageSquare,
  Shield,
  Loader2,
  Search,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  EyeOff,
  Wallet,
  ArrowRight,
  FileText,
  Zap,
  Clock,
  UserPlus,
  Crown,
  ExternalLink,
} from "lucide-react";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { searchShadowWallets, isPremiumWallet, type ShadowWalletSearchResult } from "@/lib/api";
import { getShadowWalletStats, type ShadowWalletStats } from "@/lib/shadow/topPosts";

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

// Extended shadow wallet result with stats and premium info
interface ShadowWalletWithStats extends ShadowWalletSearchResult {
  stats?: ShadowWalletStats;
  isPremium?: boolean;
  premiumPfp?: string | null;
}

function formatSol(lamports: bigint): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL;
  return sol < 0.01 ? "<0.01" : sol.toFixed(2);
}

function formatTimeAgo(timestamp: number): string {
  if (timestamp === 0) return "never";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

function MessagesContent() {
  const { selectedWallet, isUnlocked: shadowUnlocked, refreshBalances } = useShadow();
  const { user } = useAuth();
  const publicWallet = user?.wallet_address;
  const {
    isRegistered,
    isUnlocked,
    keysMismatch,
    contacts,
    selectedContact,
    messages,
    allMessagesByContact,
    isLoading,
    shadowWalletAddress,
    register,
    syncKeysOnChain,
    selectContact,
    sendMessage,
    addContact,
    refreshContacts,
    loadMessages,
  } = useMessages();
  const { showToast } = useToast();

  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isBackgroundRegistering, setIsBackgroundRegistering] = useState(false);
  const [registrationAttempted, setRegistrationAttempted] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [fundingStep, setFundingStep] = useState<"idle" | "signing" | "confirming" | "waiting">("idle");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Search states
  const [searchResults, setSearchResults] = useState<ShadowWalletWithStats[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isAddingContact, setIsAddingContact] = useState<string | null>(null);
  const [pendingSelectWallet, setPendingSelectWallet] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Premium status cache for contacts
  const [contactPremiumInfo, setContactPremiumInfo] = useState<Map<string, { isPremium: boolean; pfp: string | null }>>(new Map());

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Calculate balance
  const walletBalanceLamports = selectedWallet?.balance || 0;
  const walletBalanceSol = walletBalanceLamports / LAMPORTS_PER_SOL;
  const hasEnoughSol = walletBalanceSol >= 0.003;

  // When balance becomes sufficient, stop the funding loader
  useEffect(() => {
    if (hasEnoughSol && fundingStep === "waiting") {
      setIsFunding(false);
      setFundingStep("idle");
    }
  }, [hasEnoughSol, fundingStep]);

  // Background registration - happens silently when conditions are met
  useEffect(() => {
    const doBackgroundRegister = async () => {
      if (isRegistered || isBackgroundRegistering || registrationAttempted || !isUnlocked || !hasEnoughSol) return;

      setIsBackgroundRegistering(true);
      setRegistrationAttempted(true);

      try {
        await register();
        showToast("Messaging enabled!", "success");
      } catch (error) {
        console.error("Background registration failed:", error);
        // Silent failure - user can still see the interface
        setRegistrationAttempted(false); // Allow retry
      } finally {
        setIsBackgroundRegistering(false);
      }
    };

    doBackgroundRegister();
  }, [isRegistered, isBackgroundRegistering, registrationAttempted, isUnlocked, hasEnoughSol]);

  // Reset registration attempt when wallet changes
  useEffect(() => {
    setRegistrationAttempted(false);
  }, [shadowWalletAddress]);

  // Load message requests when registered (to find incoming messages from unknown senders)
  useEffect(() => {
    if (isRegistered && isUnlocked && !isLoading) {
      loadMessages();
    }
  }, [isRegistered, isUnlocked]);

  // Select newly added contact when it appears in contacts list
  useEffect(() => {
    if (pendingSelectWallet) {
      const newContact = contacts.find(c => c.walletAddress === pendingSelectWallet);
      if (newContact) {
        selectContact(newContact);
        setPendingSelectWallet(null);
      }
    }
  }, [contacts, pendingSelectWallet, selectContact]);

  // Load premium status for contacts
  useEffect(() => {
    const loadPremiumInfo = async () => {
      const newPremiumInfo = new Map(contactPremiumInfo);
      let hasUpdates = false;

      for (const contact of contacts) {
        if (!newPremiumInfo.has(contact.walletAddress)) {
          try {
            const info = await isPremiumWallet(contact.walletAddress);
            newPremiumInfo.set(contact.walletAddress, {
              isPremium: info.is_premium || false,
              pfp: info.profile_picture || null,
            });
            hasUpdates = true;
          } catch {
            newPremiumInfo.set(contact.walletAddress, { isPremium: false, pfp: null });
          }
        }
      }

      if (hasUpdates) {
        setContactPremiumInfo(newPremiumInfo);
      }
    };

    if (contacts.length > 0) {
      loadPremiumInfo();
    }
  }, [contacts]);

  // Handle funding shadow wallet from public wallet
  const handleFundWallet = async () => {
    if (!publicWallet || !shadowWalletAddress) {
      showToast("Wallet not connected", "error");
      return;
    }

    setIsFunding(true);
    setFundingStep("signing");
    try {
      const connection = new Connection(RPC_URL, "confirmed");
      const fromPubkey = new PublicKey(publicWallet);
      const toPubkey = new PublicKey(shadowWalletAddress);

      // Send 0.005 SOL (enough for registration + some buffer)
      const lamports = Math.floor(0.005 * LAMPORTS_PER_SOL);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports,
        })
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;

      const wallet = (window as { solana?: { signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }> } }).solana;
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      setFundingStep("confirming");
      const { signature } = await wallet.signAndSendTransaction(transaction);
      await connection.confirmTransaction(signature, "confirmed");

      showToast("Wallet funded!", "success");
      setFundingStep("waiting");

      // Keep polling until React state reflects the new balance
      // The useEffect above will reset isFunding when hasEnoughSol becomes true
      const pollBalance = async () => {
        for (let i = 0; i < 120; i++) { // Poll for up to 60 seconds
          await refreshBalances();
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      };
      pollBalance();

    } catch (error) {
      console.error("Failed to fund wallet:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to fund wallet";
      showToast(errorMsg, "error");
      setIsFunding(false);
      setFundingStep("idle");
    }
  };

  // Build Solana Explorer URL
  const getExplorerUrl = (signature: string) => {
    return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedContact || isSending) return;

    const messageContent = newMessage.trim();
    setNewMessage(""); // Clear input immediately for better UX
    setIsSending(true);

    try {
      const result = await sendMessage(messageContent);

      // Show success toast with Solana Explorer link
      const explorerLink = getExplorerUrl(result.messageSignature);
      showToast(
        <div className="flex items-center gap-2">
          <span>Message sent!</span>
          <a
            href={explorerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3" />
            <span className="text-xs">Explorer</span>
          </a>
        </div>,
        "success"
      );

      // Log funding tx if there was one
      if (result.fundingSignature) {
        console.log("Funding tx:", getExplorerUrl(result.fundingSignature));
      }
      console.log("Message tx:", explorerLink);

    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to send message";

      // Restore the message if it failed
      setNewMessage(messageContent);

      // Show specific error message to help user understand the issue
      if (errorMsg.includes("Insufficient balance") || errorMsg.includes("connect your public wallet") || errorMsg.includes("Phantom wallet not found")) {
        showToast(errorMsg, "error");
      } else if (errorMsg.includes("User rejected") || errorMsg.includes("rejected")) {
        showToast("Transaction cancelled", "error");
      } else if (errorMsg.includes("Failed to fund")) {
        showToast("Failed to fund shadow wallet. Please try again.", "error");
      } else {
        showToast("Failed to send message. Please try again.", "error");
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle search with debounce - like explore modal
  const handleSearch = (query: string) => {
    setSearchQuery(query);

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.length > 0) {
      setIsSearching(true);
      // Debounce API call
      debounceRef.current = setTimeout(async () => {
        try {
          // Search shadow wallets by name
          const response = await searchShadowWallets(query);
          const wallets = response.wallets || [];
          // Filter out own wallet
          const filteredWallets = wallets.filter(w => w.shadow_pubkey !== shadowWalletAddress);
          setSearchResults(filteredWallets);

          // Fetch stats and premium status for each wallet in parallel (in background)
          if (filteredWallets.length > 0) {
            setIsLoadingStats(true);
            const walletsWithStatsAndPremium = await Promise.all(
              filteredWallets.map(async (wallet) => {
                try {
                  const [stats, premiumInfo] = await Promise.all([
                    getShadowWalletStats(wallet.shadow_pubkey),
                    isPremiumWallet(wallet.shadow_pubkey),
                  ]);
                  return {
                    ...wallet,
                    stats,
                    isPremium: premiumInfo.is_premium || false,
                    premiumPfp: premiumInfo.profile_picture || null,
                  };
                } catch {
                  return wallet;
                }
              })
            );
            setSearchResults(walletsWithStatsAndPremium);
            setIsLoadingStats(false);
          }
        } catch (error) {
          console.error("Search error:", error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  };

  // Start conversation with a shadow wallet from search
  const handleStartConversation = async (wallet: ShadowWalletWithStats) => {
    if (isAddingContact) return;

    setIsAddingContact(wallet.shadow_pubkey);
    try {
      // Check if already a contact
      const existingContact = contacts.find(c => c.walletAddress === wallet.shadow_pubkey);
      if (existingContact) {
        // Just select the existing contact
        selectContact(existingContact);
        setSearchQuery("");
        setSearchResults([]);
        return;
      }

      // Add as new contact
      await addContact(wallet.shadow_pubkey, wallet.name);
      showToast(`Added ${wallet.name} to contacts!`, "success");

      // Clear search
      setSearchQuery("");
      setSearchResults([]);

      // Set pending wallet to select after contacts refresh
      setPendingSelectWallet(wallet.shadow_pubkey);

      // Refresh contacts
      refreshContacts();
    } catch (error) {
      console.error("Failed to start conversation:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to start conversation";
      showToast(errorMsg, "error");
    } finally {
      setIsAddingContact(null);
    }
  };

  // Helper to get the latest message timestamp for a contact
  const getLatestMessageTimestamp = (walletAddress: string): number => {
    const contactMessages = allMessagesByContact.get(walletAddress) || [];
    if (contactMessages.length === 0) return 0;
    return Math.max(...contactMessages.map(m => m.timestamp));
  };

  // Filter and sort contacts based on search and most recent message
  const filteredContacts = (searchQuery.length === 0
    ? contacts
    : contacts.filter(
        (contact) =>
          contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          contact.walletAddress.toLowerCase().includes(searchQuery.toLowerCase())
      )
  ).sort((a, b) => {
    // Sort by most recent message (newest first)
    const timestampA = getLatestMessageTimestamp(a.walletAddress);
    const timestampB = getLatestMessageTimestamp(b.walletAddress);
    return timestampB - timestampA;
  });

  // Format timestamp for display
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  // Shadow wallet not unlocked state
  if (!shadowUnlocked || !selectedWallet) {
    return (
      <div className="border-x border-border min-h-screen flex flex-col items-center justify-center p-8">
        <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-6">
          <EyeOff className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Unlock Shadow Wallet</h2>
        <p className="text-muted-foreground text-center mb-6 max-w-md">
          You need to unlock your shadow wallets first to use encrypted messaging.
          Each shadow wallet has its own private conversations.
        </p>
        <a
          href="/"
          className="px-6 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go to Home
        </a>
      </div>
    );
  }

  // Messages unlocking in progress (auto-unlock)
  if (!isUnlocked) {
    return (
      <div className="border-x border-border min-h-screen flex flex-col items-center justify-center p-8">
        <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-6">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Unlocking Messages...</h2>
        <p className="text-muted-foreground text-center mb-4 max-w-md">
          Deriving encryption keys for your shadow wallet.
        </p>
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border">
          <EyeOff className="w-4 h-4 text-primary" />
          <span className="text-sm text-foreground font-mono">
            {shadowWalletAddress?.slice(0, 8)}...{shadowWalletAddress?.slice(-8)}
          </span>
        </div>
      </div>
    );
  }

  // Keys mismatch warning
  if (keysMismatch) {
    return (
      <div className="border-x border-border min-h-screen flex flex-col items-center justify-center p-8">
        <div className="w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Keys Out of Sync</h2>
        <p className="text-muted-foreground text-center mb-6 max-w-md">
          Your local encryption keys don't match the registered keys on-chain.
          This can happen if you registered from a different device.
        </p>
        <button
          onClick={syncKeysOnChain}
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="w-5 h-5" />
              Sync Keys
            </>
          )}
        </button>
      </div>
    );
  }

  // Show funding screen only for empty wallets
  const isEmptyWallet = walletBalanceLamports === 0;
  if (isEmptyWallet && !isRegistered) {
    return (
      <div className="border-x border-border min-h-screen flex flex-col items-center justify-center p-8">
        <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-6">
          <Wallet className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Initialize Shadow Wallet</h2>
        <p className="text-muted-foreground text-center mb-4 max-w-md">
          This shadow wallet is empty. Fund it to enable encrypted messaging.
        </p>
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border mb-6">
          <EyeOff className="w-4 h-4 text-primary" />
          <span className="text-sm text-foreground font-mono">
            {shadowWalletAddress?.slice(0, 8)}...{shadowWalletAddress?.slice(-8)}
          </span>
        </div>
        <button
          onClick={handleFundWallet}
          disabled={isFunding || !publicWallet}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isFunding ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {fundingStep === "signing" && "Sign in wallet..."}
              {fundingStep === "confirming" && "Confirming tx..."}
              {fundingStep === "waiting" && "Waiting for balance..."}
            </>
          ) : !publicWallet ? (
            <>
              <Wallet className="w-5 h-5" />
              <span>Connect wallet first</span>
            </>
          ) : (
            <>
              <Wallet className="w-5 h-5" />
              <ArrowRight className="w-4 h-4" />
              <span>Fund 0.005 SOL</span>
            </>
          )}
        </button>
        {isFunding && (
          <p className="text-xs text-muted-foreground mt-3 animate-pulse">
            {fundingStep === "signing" && "Please approve the transaction in your wallet"}
            {fundingStep === "confirming" && "Waiting for Solana confirmation..."}
            {fundingStep === "waiting" && "Funded! Waiting for balance to update..."}
          </p>
        )}
      </div>
    );
  }

  // Determine if we need to show a status banner (not registered or registering)
  const needsRegistration = !isRegistered && !isBackgroundRegistering;
  const isCurrentlyRegistering = isBackgroundRegistering;

  // Main messaging UI - always show it, with optional status banner
  return (
    <div className="border-x border-border min-h-screen flex">
      {/* Left Panel - Contact List (1/3 width) */}
      <div className="w-1/3 border-r border-border flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3">
          <h1 className="text-xl font-bold text-foreground">messages</h1>
          <div className="flex items-center gap-2 mt-1">
            <EyeOff className="w-3 h-3 text-primary" />
            <span className="text-xs text-muted-foreground font-mono">
              {shadowWalletAddress?.slice(0, 6)}...{shadowWalletAddress?.slice(-4)}
            </span>
          </div>
          {/* Status banner */}
          {isCurrentlyRegistering && (
            <div className="flex items-center gap-2 mt-2 px-2 py-1 rounded bg-primary/10 text-xs text-primary">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Setting up messaging...</span>
            </div>
          )}
          {needsRegistration && !hasEnoughSol && (
            <div className="flex items-center gap-2 mt-2 px-2 py-1 rounded bg-amber-500/10 text-xs text-amber-500">
              <Wallet className="w-3 h-3" />
              <span>Fund wallet to enable sending ({walletBalanceSol.toFixed(4)} SOL)</span>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search shadow identities..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Search Results */}
          {searchQuery.length > 0 && (
            <div className="mt-3 max-h-60 overflow-y-auto rounded-lg border border-border bg-card">
              {isSearching && (
                <div className="px-4 py-4 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </div>
              )}

              {!isSearching && searchResults.length === 0 && (
                <div className="px-4 py-4 text-center">
                  <p className="text-muted-foreground text-sm">no shadow identities found</p>
                </div>
              )}

              {!isSearching && searchResults.map((wallet) => (
                <button
                  key={wallet.shadow_pubkey}
                  onClick={() => handleStartConversation(wallet)}
                  disabled={isAddingContact === wallet.shadow_pubkey}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ring-2 flex-shrink-0 overflow-hidden ${
                    wallet.isPremium
                      ? "bg-pink-500/20 ring-pink-500/30"
                      : "bg-primary/20 ring-primary/30"
                  }`}>
                    {wallet.isPremium && wallet.premiumPfp ? (
                      <img
                        src={wallet.premiumPfp.startsWith('http') ? wallet.premiumPfp : `/api/public/${wallet.premiumPfp}`}
                        alt={wallet.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <EyeOff className={`w-5 h-5 ${wallet.isPremium ? "text-pink-500" : "text-primary"}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`font-medium truncate ${wallet.isPremium ? "text-pink-500" : "text-primary"}`}>
                        {wallet.name}
                      </p>
                      {wallet.isPremium && (
                        <Crown className="w-3.5 h-3.5 text-pink-500 flex-shrink-0" />
                      )}
                    </div>
                    {wallet.stats ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {wallet.stats.postsCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-500" />
                          {formatSol(wallet.stats.totalBid)} SOL
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(wallet.stats.lastActive)}
                        </span>
                      </div>
                    ) : isLoadingStats ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        loading...
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {wallet.shadow_pubkey.slice(0, 8)}...{wallet.shadow_pubkey.slice(-6)}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {isAddingContact === wallet.shadow_pubkey ? (
                      <Loader2 className={`w-4 h-4 animate-spin ${wallet.isPremium ? "text-pink-500" : "text-primary"}`} />
                    ) : contacts.find(c => c.walletAddress === wallet.shadow_pubkey) ? (
                      <span className="text-xs text-muted-foreground">contact</span>
                    ) : (
                      <UserPlus className={`w-4 h-4 ${wallet.isPremium ? "text-pink-500" : "text-primary"}`} />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Contacts Section */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Contacts</span>
          </div>

          {filteredContacts.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No contacts yet</p>
              <p className="text-xs text-muted-foreground mt-1">Search for shadow identities to start chatting</p>
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const premiumInfo = contactPremiumInfo.get(contact.walletAddress);
              const isPremium = premiumInfo?.isPremium || false;
              const premiumPfp = premiumInfo?.pfp || null;

              return (
                <button
                  key={contact.walletAddress}
                  onClick={() => selectContact(contact)}
                  className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors ${
                    selectedContact?.walletAddress === contact.walletAddress
                      ? isPremium
                        ? "bg-pink-500/10 border-l-2 border-pink-500"
                        : "bg-primary/10 border-l-2 border-primary"
                      : ""
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${
                    isPremium ? "bg-pink-500/20" : "bg-primary/20"
                  }`}>
                    {isPremium && premiumPfp ? (
                      <img
                        src={premiumPfp.startsWith('http') ? premiumPfp : `/api/public/${premiumPfp}`}
                        alt={contact.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className={`text-sm font-bold ${isPremium ? "text-pink-500" : "text-primary"}`}>
                        {contact.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-medium truncate ${isPremium ? "text-pink-500" : "text-foreground"}`}>
                        {contact.name}
                      </span>
                      {isPremium && (
                        <Crown className="w-3.5 h-3.5 text-pink-500 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel - Chat Area (2/3 width) */}
      <div className="flex-1 flex flex-col">
        {selectedContact ? (
          (() => {
            const selectedPremiumInfo = contactPremiumInfo.get(selectedContact.walletAddress);
            const isSelectedPremium = selectedPremiumInfo?.isPremium || false;
            const selectedPremiumPfp = selectedPremiumInfo?.pfp || null;

            return (
              <>
                {/* Chat Header */}
                <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ${
                        isSelectedPremium ? "bg-pink-500/20" : "bg-primary/20"
                      }`}>
                        {isSelectedPremium && selectedPremiumPfp ? (
                          <img
                            src={selectedPremiumPfp.startsWith('http') ? selectedPremiumPfp : `/api/public/${selectedPremiumPfp}`}
                            alt={selectedContact.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className={`text-sm font-bold ${isSelectedPremium ? "text-pink-500" : "text-primary"}`}>
                            {selectedContact.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <h2 className={`font-bold ${isSelectedPremium ? "text-pink-500" : "text-foreground"}`}>
                          {selectedContact.name}
                        </h2>
                        {isSelectedPremium && (
                          <Crown className="w-4 h-4 text-pink-500" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <MessageSquare className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-muted-foreground">No messages yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Send a message to start the conversation</p>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.isOutgoing ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                          message.isOutgoing
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-card border border-border text-foreground rounded-bl-md"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                        <div className={`flex items-center gap-1 mt-1 ${message.isOutgoing ? "justify-end" : "justify-start"}`}>
                          <span className={`text-xs ${message.isOutgoing ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            {formatTimestamp(message.timestamp)}
                          </span>
                          {message.isOutgoing && (
                            <CheckCircle className="w-3 h-3 text-primary-foreground/70" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Message Input */}
            <div className="border-t border-border p-4">
              <div className="flex items-end gap-3">
                <div className="flex-1 relative">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Type a message..."
                    rows={1}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none min-h-[48px] max-h-[120px]"
                    style={{
                      height: "auto",
                      overflow: "hidden",
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                    }}
                  />
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || isSending}
                  className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
              </>
            );
          })()
        ) : (
          /* Empty state - no contact selected */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Mail className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Select a conversation</h2>
            <p className="text-muted-foreground max-w-sm">
              Choose a contact from the list to start messaging, or accept a message request.
            </p>
            <div className="flex items-center gap-2 mt-6 px-4 py-2 rounded-full bg-[#14F195]/10 border border-[#14F195]/30">
              <Shield className="w-4 h-4 text-[#14F195]" />
              <span className="text-sm text-[#14F195]">All messages are end-to-end encrypted</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <AppLayout>
      <MessagesContent />
    </AppLayout>
  );
}
