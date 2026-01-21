"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Check, AlertCircle, Crown, EyeOff, ChevronDown, Image, Sparkles, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useShadow } from "@/contexts/shadow-context";
import { purchaseNdd } from "@/lib/shadow/nddPurchaseService";
import { PremiumNdd, getPremiumNdd, isPremiumWallet } from "@/lib/api";
import { getImageUrl } from "@/lib/utils";

interface NddPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  ndd: PremiumNdd;
  onSuccess?: () => void;
}

type ModalStep = "loading" | "ready" | "processing" | "success" | "error" | "sold";

interface WalletPremiumStatus {
  isPremium: boolean;
  pfp: string | null;
}

function getProvider(): { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> } | null {
  if (typeof window === "undefined") return null;
  const provider = (window as unknown as { solana?: { isPhantom?: boolean; publicKey?: PublicKey; signTransaction?: (tx: Transaction) => Promise<Transaction> } }).solana;
  if (provider?.isPhantom && provider.publicKey && provider.signTransaction) {
    return {
      publicKey: provider.publicKey,
      signTransaction: provider.signTransaction.bind(provider),
    };
  }
  return null;
}

export function NddPurchaseModal({ isOpen, onClose, ndd, onSuccess }: NddPurchaseModalProps) {
  const router = useRouter();
  const { selectedWallet: currentWallet, wallets, selectedWalletIndex, selectWallet, refreshBalances, refreshWalletNames, getSelectedKeypair } = useShadow();
  const [step, setStep] = useState<ModalStep>("loading");
  const [error, setError] = useState<string | null>(null);
  const [verifiedNdd, setVerifiedNdd] = useState<PremiumNdd | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [premiumStatuses, setPremiumStatuses] = useState<Map<string, WalletPremiumStatus>>(new Map());

  const provider = getProvider();

  // Load NDD data and premium statuses
  useEffect(() => {
    if (isOpen && step !== "success" && step !== "processing") {
      setStep("loading");
      setError(null);
      setIsDropdownOpen(false);

      // Load NDD
      getPremiumNdd(ndd.name)
        .then((res) => {
          if (res.success && res.ndd) {
            setVerifiedNdd(res.ndd);
            setStep("ready");
          } else {
            setStep("sold");
          }
        })
        .catch(() => {
          setStep("sold");
        });

      // Load premium statuses for all wallets
      if (wallets.length > 0) {
        Promise.all(
          wallets.map(async (wallet) => {
            try {
              const result = await isPremiumWallet(wallet.publicKey);
              return { pubkey: wallet.publicKey, isPremium: result.is_premium, pfp: result.profile_picture };
            } catch {
              return { pubkey: wallet.publicKey, isPremium: false, pfp: null };
            }
          })
        ).then((results) => {
          const map = new Map<string, WalletPremiumStatus>();
          results.forEach((r) => map.set(r.pubkey, { isPremium: r.isPremium, pfp: r.pfp }));
          setPremiumStatuses(map);
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, ndd.name]);

  const handlePurchase = async () => {
    if (!provider || !currentWallet) {
      setError("wallet not connected");
      setStep("error");
      return;
    }

    // Check if current wallet is already premium
    const currentStatus = premiumStatuses.get(currentWallet.publicKey);
    if (currentStatus?.isPremium) {
      setError("this wallet already has a premium identity");
      setStep("error");
      return;
    }

    try {
      setStep("processing");

      // Get the keypair for the selected shadow wallet
      const keypair = await getSelectedKeypair();
      if (!keypair) {
        setError("shadow wallet not unlocked");
        setStep("error");
        return;
      }

      const finalNdd = verifiedNdd || ndd;
      const result = await purchaseNdd(
        provider,
        keypair,
        finalNdd.name,
        finalNdd.cost
      );

      console.log("Purchase result:", result);

      if (!result.success) {
        setError(result.error || "purchase failed");
        setStep("error");
        return;
      }

      await refreshBalances();
      await refreshWalletNames();
      setStep("success");
      onSuccess?.();

      // Redirect to shadow profile page with refresh flag
      const finalNddName = (verifiedNdd || ndd).name;
      router.push(`/shadow/${encodeURIComponent(finalNddName)}?refresh=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
      setStep("error");
    }
  };

  const handleClose = () => {
    if (step !== "processing") {
      setStep("loading");
      setError(null);
      setVerifiedNdd(null);
      setIsDropdownOpen(false);
      onClose();
    }
  };

  const displayNdd = verifiedNdd || ndd;
  const currentWalletPremium = currentWallet ? premiumStatuses.get(currentWallet.publicKey) : null;
  const isCurrentWalletPremium = currentWalletPremium?.isPremium || false;

  // Calculate fees that X-RAY covers for the user (Privacy Cash: 0.35% + 0.006 SOL base)
  const feesCovered = displayNdd.cost * 0.0035 + 0.006;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[100]"
            onClick={handleClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl bg-card border border-border rounded-xl z-[100]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-medium text-foreground">checkout</h2>
              {step !== "processing" && (
                <button onClick={handleClose} className="p-1 hover:bg-muted rounded">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>

            <div className="p-6">
              {/* Loading */}
              {step === "loading" && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Sold */}
              {step === "sold" && (
                <div className="text-center py-12">
                  <p className="text-base text-muted-foreground">
                    <span className="text-pink-500 font-medium">{displayNdd.name}</span> has already been claimed
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-6 px-6 py-2.5 text-sm bg-muted text-foreground rounded-full hover:bg-muted/80"
                  >
                    close
                  </button>
                </div>
              )}

              {/* Ready - Horizontal Layout */}
              {step === "ready" && (
                <div className="flex gap-8">
                  {/* Left side - Preview + Wallet + Buy */}
                  <div className="flex-1 space-y-6">
                    {/* Fake Post Preview */}
                    <div className="border border-border rounded-xl p-5 bg-background">
                      <div className="flex gap-4">
                        <div className="w-16 h-16 rounded-full bg-pink-500/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {displayNdd.pfp ? (
                            <img src={getImageUrl(displayNdd.pfp, "")} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <EyeOff className="w-8 h-8 text-pink-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-pink-500 text-lg">{displayNdd.name}</span>
                            <Crown className="w-4 h-4 text-pink-500" />
                            <span className="text-muted-foreground">· 2m</span>
                          </div>
                          <p className="text-foreground mt-2">
                            this is how you will appear on the feed
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Wallet selector */}
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">apply to</p>

                      {wallets.length === 0 ? (
                        <div className="text-muted-foreground p-4 border border-border rounded-xl">
                          no shadow wallets
                        </div>
                      ) : (
                        <div className="relative">
                          <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className={`w-full flex items-center justify-between p-3 border rounded-xl transition-colors ${
                              isCurrentWalletPremium
                                ? "border-red-500/50 bg-red-500/5"
                                : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                isCurrentWalletPremium ? "bg-pink-500/20" : "bg-primary/20"
                              }`}>
                                {currentWalletPremium?.pfp ? (
                                  <img src={getImageUrl(currentWalletPremium.pfp, "")} alt="" className="w-full h-full rounded-full object-cover" />
                                ) : (
                                  <EyeOff className={`w-4 h-4 ${isCurrentWalletPremium ? "text-pink-500" : "text-primary"}`} />
                                )}
                              </div>
                              <span className={`font-medium ${isCurrentWalletPremium ? "text-pink-500" : "text-foreground"}`}>
                                {currentWallet?.name || "Select"}
                              </span>
                            </div>
                            <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
                          </button>

                          {/* Dropdown */}
                          {isDropdownOpen && (
                            <div
                              className="absolute bottom-full left-0 right-0 mb-2 bg-card border border-border rounded-xl shadow-lg z-30 max-h-48 overflow-y-auto"
                            >
                              {wallets.map((wallet, index) => {
                                const status = premiumStatuses.get(wallet.publicKey);
                                const isPremium = status?.isPremium || false;

                                return (
                                  <button
                                    key={wallet.publicKey}
                                    onClick={() => {
                                      if (!isPremium) {
                                        selectWallet(index);
                                        setIsDropdownOpen(false);
                                      }
                                    }}
                                    disabled={isPremium}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors ${
                                      isPremium
                                        ? "opacity-50 cursor-not-allowed"
                                        : selectedWalletIndex === index
                                          ? "bg-primary/20"
                                          : "hover:bg-muted"
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                        isPremium ? "bg-pink-500/20" : "bg-primary/20"
                                      }`}>
                                        <EyeOff className={`w-3 h-3 ${isPremium ? "text-pink-500" : "text-primary"}`} />
                                      </div>
                                      <span className={isPremium ? "text-pink-500 line-through" : "text-foreground font-medium"}>{wallet.name}</span>
                                    </div>
                                    {isPremium ? (
                                      <span className="text-xs text-muted-foreground">premium</span>
                                    ) : selectedWalletIndex === index ? (
                                      <Check className="w-4 h-4 text-primary" />
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                      {isCurrentWalletPremium && (
                        <p className="text-sm text-red-400">this wallet already has premium</p>
                      )}
                    </div>

                    {/* Buy Button */}
                    <button
                      onClick={handlePurchase}
                      disabled={!provider || !currentWallet || isCurrentWalletPremium}
                      className="w-full py-3 bg-pink-500 text-white font-medium rounded-full hover:bg-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {!provider ? "connect wallet" : !currentWallet ? "unlock shadow" : isCurrentWalletPremium ? "select another" : `pay ${displayNdd.cost} SOL`}
                    </button>
                  </div>

                  {/* Right side - Features + Price */}
                  <div className="w-72 space-y-5">
                    {/* Features */}
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">includes</p>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-4 py-2 bg-pink-500/10 rounded-full">
                          <Crown className="w-4 h-4 text-pink-500" />
                          <span className="text-foreground">premium identity</span>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-pink-500/10 rounded-full">
                          <Sparkles className="w-4 h-4 text-pink-500" />
                          <span className="text-foreground">premium feed</span>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-pink-500/10 rounded-full">
                          <Image className="w-4 h-4 text-pink-500" />
                          <span className="text-foreground">profile picture</span>
                        </div>
                      </div>
                    </div>

                    {/* Price breakdown */}
                    <div className="border border-border rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">price</span>
                        <span className="text-foreground font-medium">{displayNdd.cost} SOL</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">fees</span>
                        <span className="text-green-500 font-medium">covered</span>
                      </div>
                      <div className="border-t border-border pt-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">total</span>
                          <span className="font-bold text-lg text-foreground">{displayNdd.cost} SOL</span>
                        </div>
                        <p className="text-xs text-green-500 mt-1">you save {feesCovered.toFixed(4)} SOL</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Processing */}
              {step === "processing" && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
                  <div className="text-center">
                    <p className="text-sm text-foreground">processing...</p>
                    <p className="text-xs text-muted-foreground mt-1">confirm in your wallet</p>
                  </div>
                </div>
              )}

              {/* Success */}
              {step === "success" && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check className="w-5 h-5 text-green-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-foreground">
                      <span className="text-pink-500">{displayNdd.name}</span> is yours
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">switch identity from profile dropdown</p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="mt-2 px-4 py-2 text-sm bg-muted text-foreground rounded-full hover:bg-muted/80"
                  >
                    done
                  </button>
                </div>
              )}

              {/* Error */}
              {step === "error" && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-foreground">failed</p>
                    <p className="text-xs text-red-400 mt-1">{error}</p>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleClose}
                      className="px-4 py-2 text-sm bg-muted text-foreground rounded-full hover:bg-muted/80"
                    >
                      cancel
                    </button>
                    <button
                      onClick={() => { setStep("ready"); setError(null); }}
                      className="px-4 py-2 text-sm bg-pink-500 text-white rounded-full hover:bg-pink-600"
                    >
                      retry
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
