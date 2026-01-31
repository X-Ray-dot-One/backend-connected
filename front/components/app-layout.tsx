"use client";

import { ReactNode, useState, useEffect, createContext, useContext, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Check, Plus, User, Loader2, Crown, Home, Search, Bell, Mail, PenSquare, Sun, Moon, Wallet, EyeOff, Lock } from "lucide-react";
import { useMode } from "@/contexts/mode-context";
import { useAuth } from "@/contexts/auth-context";
import { useShadow } from "@/contexts/shadow-context";
import { LeftSidebar } from "./left-sidebar";
import { RightPanel } from "./right-panel";
import { PostModal } from "./post-modal";
import { ProfileSetupModal } from "./profile-setup-modal";
import { SearchModal } from "./search-modal";
import { getImageUrl, getDefaultAvatar } from "@/lib/utils";
import * as api from "@/lib/api";

// Context for post modal
interface PostModalContextType {
  openPostModal: () => void;
  closePostModal: () => void;
  onPostSuccess: () => void;
  registerRefreshCallback: (callback: () => void) => void;
}

const PostModalContext = createContext<PostModalContextType | null>(null);

export function usePostModal() {
  const context = useContext(PostModalContext);
  if (!context) {
    throw new Error("usePostModal must be used within AppLayout");
  }
  return context;
}

// Context for search modal
interface SearchModalContextType {
  openSearchModal: () => void;
  closeSearchModal: () => void;
  isSearchOpen: boolean;
}

const SearchModalContext = createContext<SearchModalContextType | null>(null);

export function useSearchModal() {
  const context = useContext(SearchModalContext);
  if (!context) {
    throw new Error("useSearchModal must be used within AppLayout");
  }
  return context;
}

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { isShadowMode, toggleMode } = useMode();
  const { user, isAuthenticated, login, showProfileSetup, closeProfileSetup, refreshUser } = useAuth();
  const {
    isUnlocked: isShadowUnlocked,
    isRestoring: isShadowRestoring,
    wallets: shadowWallets,
    selectedWallet,
    selectedWalletIndex,
    selectWallet,
    generateNewWallet,
    isLoading: shadowLoading,
    unlockShadowWallets,
  } = useShadow();
  const pathname = usePathname();
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [isIdentityOpen, setIsIdentityOpen] = useState(false);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [refreshCallbacks, setRefreshCallbacks] = useState<(() => void)[]>([]);
  const [premiumWallets, setPremiumWallets] = useState<Map<string, { isPremium: boolean; profilePicture: string | null }>>(new Map());
  const [showMobileWalletMenu, setShowMobileWalletMenu] = useState(false);
  const [mobileAvailableWallets, setMobileAvailableWallets] = useState<string[]>([]);
  const [isMobileConnecting, setIsMobileConnecting] = useState(false);
  const [showBetaDisclaimer, setShowBetaDisclaimer] = useState(false);

  // Show beta disclaimer on first visit
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("xray_beta_accepted")) {
      setShowBetaDisclaimer(true);
    }
  }, []);

  const acceptBeta = () => {
    localStorage.setItem("xray_beta_accepted", "1");
    setShowBetaDisclaimer(false);
  };

  // Detect available wallets for mobile
  useEffect(() => {
    const checkWallets = () => {
      const wallets: string[] = [];
      if (typeof window === "undefined") return;
      if ((window as any).phantom?.solana || (window as any).solana?.isPhantom) wallets.push("phantom");
      if ((window as any).solflare) wallets.push("solflare");
      if ((window as any).backpack) wallets.push("backpack");
      if ((window as any).coinbaseSolana) wallets.push("coinbase");
      if ((window as any).trustwallet?.solana) wallets.push("trust");
      setMobileAvailableWallets(wallets);
    };
    checkWallets();
    const timeout = setTimeout(checkWallets, 500);
    return () => clearTimeout(timeout);
  }, []);

  // Reset navigating state when pathname changes
  useEffect(() => {
    setIsNavigating(false);
  }, [pathname]);

  const navigateTo = (href: string) => {
    if (pathname === href) return;
    setIsNavigating(true);
    router.push(href);
  };

  const MOBILE_WALLETS = [
    { id: "phantom", name: "Phantom", icon: "/phantom logo.png", downloadUrl: "https://phantom.app/download" },
    { id: "solflare", name: "Solflare", icon: "https://solflare.com/favicon.ico", downloadUrl: "https://solflare.com/download" },
    { id: "backpack", name: "Backpack", icon: "https://backpack.app/favicon.ico", downloadUrl: "https://backpack.app/download" },
    { id: "coinbase", name: "Coinbase Wallet", icon: "https://www.coinbase.com/favicon.ico", downloadUrl: "https://www.coinbase.com/wallet/downloads" },
    { id: "trust", name: "Trust Wallet", icon: "https://trustwallet.com/favicon.ico", downloadUrl: "https://trustwallet.com/download" },
  ];

  const getMobileWallet = (type: string) => {
    if (typeof window === "undefined") return null;
    const w = window as any;
    switch (type) {
      case "phantom": return w.phantom?.solana || (w.solana?.isPhantom ? w.solana : null);
      case "solflare": return w.solflare || null;
      case "backpack": return w.backpack || null;
      case "coinbase": return w.coinbaseSolana || null;
      case "trust": return w.trustwallet?.solana || null;
      default: return null;
    }
  };

  const connectMobileWallet = async (walletType: string) => {
    const wallet = getMobileWallet(walletType);
    if (!wallet) {
      const info = MOBILE_WALLETS.find(w => w.id === walletType);
      if (info) window.open(info.downloadUrl, "_blank");
      return;
    }
    setIsMobileConnecting(true);
    setShowMobileWalletMenu(false);
    try {
      let publicKey: string;
      if (wallet.publicKey) {
        // Already connected (Phantom auto-connect)
        publicKey = wallet.publicKey.toString();
      } else {
        const connectTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), 15000)
        );
        const response = await Promise.race([wallet.connect(), connectTimeout]) as { publicKey: { toString(): string } };
        publicKey = response.publicKey.toString();
      }
      await login(publicKey);
    } catch (error: unknown) {
      console.error("Wallet connection failed:", error);
    } finally {
      setIsMobileConnecting(false);
    }
  };

  // Load premium status for all shadow wallets
  useEffect(() => {
    const loadPremiumStatus = async () => {
      if (shadowWallets.length === 0) return;

      const newPremiumMap = new Map<string, { isPremium: boolean; profilePicture: string | null }>();
      for (const wallet of shadowWallets) {
        try {
          const result = await api.isPremiumWallet(wallet.publicKey);
          newPremiumMap.set(wallet.publicKey, {
            isPremium: result.is_premium || false,
            profilePicture: result.profile_picture || null,
          });
        } catch {
          newPremiumMap.set(wallet.publicKey, { isPremium: false, profilePicture: null });
        }
      }
      setPremiumWallets(newPremiumMap);
    };

    loadPremiumStatus();
  }, [shadowWallets]);

  const registerRefreshCallback = useCallback((callback: () => void) => {
    setRefreshCallbacks(prev => [...prev, callback]);
  }, []);

  const handlePostSuccess = useCallback(() => {
    refreshCallbacks.forEach(cb => cb());
  }, [refreshCallbacks]);

  const postModalValue = {
    openPostModal: () => setIsPostModalOpen(true),
    closePostModal: () => setIsPostModalOpen(false),
    onPostSuccess: handlePostSuccess,
    registerRefreshCallback,
  };

  const searchModalValue = {
    openSearchModal: () => setIsSearchOpen(true),
    closeSearchModal: () => setIsSearchOpen(false),
    isSearchOpen,
  };

  return (
    <PostModalContext.Provider value={postModalValue}>
    <SearchModalContext.Provider value={searchModalValue}>
      <div className={`h-full overflow-hidden bg-background transition-colors duration-300 ${isShadowMode ? "shadow-mode" : ""}`}>
        <LeftSidebar />

      {/* Global Identity Selector - Shadow mode only */}
      {isShadowMode && !isShadowRestoring && (
        <div className="hidden md:block fixed md:top-4 md:right-4 xl:right-[25rem] z-50">
          {!isShadowUnlocked ? (
            /* Not unlocked yet - show link to profile */
            <a
              href="/profile"
              className="flex items-center gap-1.5 px-3 py-1.5 md:gap-2 md:px-4 md:py-2 rounded-full bg-card border border-primary/30 shadow-lg hover:bg-primary/10 transition-colors"
            >
              <User className="w-4 h-4 text-primary" />
              <span className="text-xs md:text-sm text-primary font-medium">unlock →</span>
            </a>
          ) : shadowWallets.length === 0 ? (
            /* No wallets yet - show generate first button */
            <button
              onClick={async () => {
                await generateNewWallet();
              }}
              disabled={shadowLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 md:gap-2 md:px-4 md:py-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {shadowLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span className="text-xs md:text-sm font-medium hidden md:inline">generate first shadow identity</span>
              <span className="text-xs font-medium md:hidden">new identity</span>
            </button>
          ) : (
            /* Has wallets - show selector dropdown */
            (() => {
              const selectedPremiumStatus = selectedWallet ? premiumWallets.get(selectedWallet.publicKey) : null;
              const isSelectedPremium = selectedPremiumStatus?.isPremium || false;

              return (
                <div className="relative">
                  <button
                    onClick={() => setIsIdentityOpen(!isIdentityOpen)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 md:gap-2 md:px-4 md:py-2 rounded-full bg-card shadow-lg hover:bg-primary/10 transition-colors ${
                      isSelectedPremium ? "border border-pink-500/50" : "border border-primary/30"
                    }`}
                  >
                    {isSelectedPremium ? (
                      <Crown className="w-3.5 h-3.5 md:w-4 md:h-4 text-pink-500" />
                    ) : (
                      <User className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary" />
                    )}
                    <span className="hidden md:inline text-xs text-muted-foreground">posting as</span>
                    <span className={`text-xs md:text-sm font-medium max-w-[120px] md:max-w-none truncate ${isSelectedPremium ? "text-pink-500" : "text-primary"}`}>
                      {selectedWallet?.name || "Select"}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-transform ${isSelectedPremium ? "text-pink-500" : "text-primary"} ${isIdentityOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isIdentityOpen && (
                    <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsIdentityOpen(false)} />
                    <div className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-lg py-1 max-h-80 overflow-y-auto z-50">
                      {shadowWallets.map((wallet, index) => {
                        const walletPremiumStatus = premiumWallets.get(wallet.publicKey);
                        const isPremium = walletPremiumStatus?.isPremium || false;

                        return (
                          <button
                            key={wallet.publicKey}
                            onClick={() => {
                              selectWallet(index);
                              setIsIdentityOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                              selectedWalletIndex === index
                                ? isPremium
                                  ? "bg-pink-500/20 text-pink-500"
                                  : "bg-primary/20 text-primary"
                                : isPremium
                                  ? "text-pink-500 hover:bg-pink-500/10"
                                  : "text-foreground hover:bg-muted"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isPremium && <Crown className="w-3.5 h-3.5 text-pink-500" />}
                              <span>{wallet.name}</span>
                            </div>
                            {selectedWalletIndex === index && <Check className="w-4 h-4" />}
                          </button>
                        );
                      })}
                      <div className="border-t border-border mt-1 pt-1">
                        <button
                          onClick={async () => {
                            await generateNewWallet();
                            setIsIdentityOpen(false);
                          }}
                          disabled={shadowLoading}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                        >
                          {shadowLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                          <span>generate new</span>
                        </button>
                      </div>
                    </div>
                    </>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}

      <main className="ml-0 md:ml-16 xl:ml-64 mr-0 xl:mr-96 pb-16 md:pb-0 h-full overflow-y-auto overflow-x-hidden">
          {children}
        </main>
        <div className="hidden xl:block">
          <RightPanel />
        </div>

        {/* Mobile Mode Toggle - fixed bottom-right (hidden on messages page) */}
        {pathname !== "/messages" && (
        <button
          onClick={toggleMode}
          className={`md:hidden fixed bottom-[5.5rem] right-4 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors ${
            isShadowMode
              ? "bg-card text-primary border border-primary/40"
              : "bg-card text-amber-500 border border-amber-500/40"
          }`}
        >
          {isShadowMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>
        )}

        {/* Mobile Identity Selector - floating above nav bar in shadow mode (hidden on messages page) */}
        {isShadowMode && isAuthenticated && pathname !== "/messages" && (
          <div className="md:hidden fixed bottom-[5rem] left-1/2 -translate-x-1/2 z-50">
            {!isShadowUnlocked ? (
              /* Not unlocked - show sign prompt */
              <button
                onClick={async () => {
                  try {
                    const phantom = (window as any).phantom?.solana || (window as any).solana;
                    if (!phantom) return;
                    let walletAddress = phantom.publicKey?.toString();
                    if (!walletAddress) {
                      const { publicKey } = await phantom.connect();
                      walletAddress = publicKey.toString();
                    }
                    await unlockShadowWallets(walletAddress, async (message: Uint8Array) => {
                      const { signature } = await phantom.signMessage(message);
                      return signature;
                    });
                  } catch (error) {
                    console.error("Failed to unlock:", error);
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shadow-lg bg-card text-yellow-500 border border-yellow-500/40 backdrop-blur-sm"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>sign to unlock</span>
              </button>
            ) : shadowWallets.length === 0 ? (
              /* Unlocked but no wallets - show generate */
              <button
                onClick={async () => { await generateNewWallet(); }}
                disabled={shadowLoading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shadow-lg bg-card text-primary border border-primary/40 backdrop-blur-sm disabled:opacity-50"
              >
                {shadowLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>generate identity</span>
              </button>
            ) : selectedWallet ? (
              /* Has wallets - show selector dropdown */
              <>
                <button
                  onClick={() => setIsIdentityOpen(!isIdentityOpen)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shadow-lg ${
                    (() => {
                      const sp = premiumWallets.get(selectedWallet.publicKey);
                      return sp?.isPremium
                        ? "bg-pink-500/20 text-pink-500 border border-pink-500/40 backdrop-blur-sm"
                        : "bg-card text-primary border border-primary/40 backdrop-blur-sm";
                    })()
                  }`}
                >
                  {(() => {
                    const sp = premiumWallets.get(selectedWallet.publicKey);
                    return sp?.isPremium ? <Crown className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />;
                  })()}
                  <span className="max-w-[100px] truncate">{selectedWallet.name}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isIdentityOpen ? "rotate-180" : ""}`} />
                </button>
                {isIdentityOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsIdentityOpen(false)} />
                    <div className="absolute bottom-full mb-2 left-0 w-52 bg-card border border-border rounded-xl shadow-xl py-1.5 max-h-60 overflow-y-auto z-50">
                      {shadowWallets.map((wallet, index) => {
                        const wp = premiumWallets.get(wallet.publicKey);
                        const isPrem = wp?.isPremium || false;
                        return (
                          <button
                            key={wallet.publicKey}
                            onClick={() => { selectWallet(index); setIsIdentityOpen(false); }}
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm transition-colors ${
                              selectedWalletIndex === index
                                ? isPrem ? "bg-pink-500/20 text-pink-500" : "bg-primary/20 text-primary"
                                : isPrem ? "text-pink-500 hover:bg-pink-500/10" : "text-foreground hover:bg-muted"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isPrem && <Crown className="w-3.5 h-3.5 text-pink-500" />}
                              <span className="truncate">{wallet.name}</span>
                            </div>
                            {selectedWalletIndex === index && <Check className="w-4 h-4" />}
                          </button>
                        );
                      })}
                      <div className="border-t border-border mt-1 pt-1">
                        <button
                          onClick={async () => { await generateNewWallet(); setIsIdentityOpen(false); }}
                          disabled={shadowLoading}
                          className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                        >
                          {shadowLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          <span>generate new</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* Navigation loading bar */}
        {isNavigating && (
          <div className="md:hidden fixed top-0 left-0 right-0 z-[70] h-0.5 bg-primary/20">
            <div className="h-full bg-primary animate-[loading_1.5s_ease-in-out_infinite] w-1/3" />
          </div>
        )}

        {/* Mobile Bottom Navigation Bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
          <div className="grid grid-cols-5 h-16">
            <button onClick={() => navigateTo("/")} className={`flex flex-col items-center justify-center gap-1 ${pathname === "/" ? "text-primary" : "text-foreground"}`}>
              <Home className="w-6 h-6" />
              <span className="text-[10px]">home</span>
            </button>
            <button onClick={() => setIsSearchOpen(true)} className="flex flex-col items-center justify-center gap-1 text-foreground active:text-primary">
              <Search className="w-6 h-6" />
              <span className="text-[10px]">explore</span>
            </button>
            <div className="relative flex items-center justify-center">
              <button
                onClick={isAuthenticated ? () => setIsPostModalOpen(true) : () => setShowMobileWalletMenu(true)}
                className={`flex items-center justify-center w-12 h-12 rounded-full ${isAuthenticated ? "bg-primary text-primary-foreground" : "bg-primary/80 text-primary-foreground animate-pulse"}`}
              >
                {isMobileConnecting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isAuthenticated ? (
                  <PenSquare className="w-5 h-5" />
                ) : (
                  <Wallet className="w-5 h-5" />
                )}
              </button>
            </div>
            {isShadowMode ? (
              <button onClick={() => navigateTo("/messages")} className={`flex flex-col items-center justify-center gap-1 ${pathname === "/messages" ? "text-primary" : "text-foreground"}`}>
                <Mail className="w-6 h-6" />
                <span className="text-[10px]">messages</span>
              </button>
            ) : (
              <button className="flex flex-col items-center justify-center gap-1 text-muted-foreground/40 cursor-not-allowed">
                <Bell className="w-6 h-6" />
                <span className="text-[10px]">alpha</span>
              </button>
            )}
            {isAuthenticated ? (
              <button onClick={() => navigateTo("/profile")} className={`flex flex-col items-center justify-center gap-1 ${pathname === "/profile" ? "text-primary" : "text-foreground"}`}>
                <User className="w-6 h-6" />
                <span className="text-[10px]">profile</span>
              </button>
            ) : (
              <button onClick={() => setShowMobileWalletMenu(true)} className="flex flex-col items-center justify-center gap-1 text-muted-foreground active:text-primary">
                <User className="w-6 h-6" />
                <span className="text-[10px]">profile</span>
              </button>
            )}
          </div>
        </nav>

        {/* Mobile Wallet Connection Menu */}
        {showMobileWalletMenu && (
          <>
            <div className="md:hidden fixed inset-0 z-[60] bg-black/50" onClick={() => setShowMobileWalletMenu(false)} />
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-[61] bg-card border-t border-border rounded-t-2xl safe-area-bottom animate-in slide-in-from-bottom duration-200">
              <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mt-3" />
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className="w-5 h-5 text-primary" />
                  <p className="text-base font-semibold text-foreground">Connect Wallet</p>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  {mobileAvailableWallets.length > 0
                    ? "Select your wallet to get started"
                    : "Open X-RAY in your wallet's browser to connect"}
                </p>
                <div className="space-y-2">
                  {mobileAvailableWallets.length > 0 ? (
                    // Wallets detected (in-app browser) - show connect buttons
                    MOBILE_WALLETS.filter(w => mobileAvailableWallets.includes(w.id)).map((wallet) => (
                      <button
                        key={wallet.id}
                        onClick={() => connectMobileWallet(wallet.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/80 transition-colors border border-border"
                      >
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                          <img src={wallet.icon} alt={wallet.name} className="w-6 h-6 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-foreground">{wallet.name}</p>
                          <p className="text-xs text-green-500">Detected - tap to connect</p>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                      </button>
                    ))
                  ) : (
                    // No wallet detected (normal mobile browser) - show deep links to open in wallet browsers
                    <>
                      {[
                        { id: "phantom", name: "Phantom", icon: "/phantom logo.png", getDeepLink: (url: string) => `https://phantom.app/ul/browse/${url}?ref=${url}`, recommended: true },
                        { id: "solflare", name: "Solflare", icon: "https://solflare.com/favicon.ico", getDeepLink: (url: string) => `https://solflare.com/ul/v1/browse/${url}?ref=${url}` },
                        { id: "backpack", name: "Backpack", icon: "https://backpack.app/favicon.ico", getDeepLink: () => `https://backpack.app/download` },
                        { id: "coinbase", name: "Coinbase Wallet", icon: "https://www.coinbase.com/favicon.ico", getDeepLink: (url: string) => `https://go.cb-w.com/dapp?cb_url=${url}` },
                        { id: "trust", name: "Trust Wallet", icon: "https://trustwallet.com/favicon.ico", getDeepLink: (url: string) => `https://link.trustwallet.com/open_url?coin_id=501&url=${url}` },
                      ].map((wallet) => (
                        <button
                          key={wallet.id}
                          onClick={() => {
                            const currentUrl = encodeURIComponent(window.location.href);
                            window.location.href = wallet.getDeepLink(currentUrl);
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/80 transition-colors ${
                            wallet.recommended ? "border border-primary/30 bg-primary/5" : "border border-border"
                          }`}
                        >
                          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                            <img src={wallet.icon} alt={wallet.name} className="w-6 h-6 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-medium text-foreground">Open in {wallet.name}</p>
                            {wallet.recommended && <p className="text-xs text-primary">Recommended</p>}
                          </div>
                        </button>
                      ))}
                      <div className="mt-3 px-3 py-2 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground text-center">
                          Don't have a wallet? <a href="https://phantom.app/download" target="_blank" rel="noopener" className="text-primary underline">Download Phantom</a>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Post Modal - rendered at root level for proper CSS inheritance */}
        <PostModal
          isOpen={isPostModalOpen}
          onClose={() => setIsPostModalOpen(false)}
          userAvatar={getImageUrl(user?.profile_picture, getDefaultAvatar(user?.wallet_address || user?.username || "user"))}
          username={user?.username || "Anonymous"}
          isShadowMode={isShadowMode}
          onPostSuccess={handlePostSuccess}
        />

        {/* Profile Setup Modal for new users */}
        <ProfileSetupModal
          isOpen={showProfileSetup}
          onClose={closeProfileSetup}
          onComplete={async () => {
            await refreshUser();
            closeProfileSetup();
          }}
          walletAddress={user?.wallet_address || ""}
        />

        {/* Search Modal - rendered at root level */}
        <SearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />

        {/* Beta Disclaimer Modal */}
        {showBetaDisclaimer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="bg-card border border-border rounded-2xl max-w-md w-full mx-4 overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="px-6 pt-6 pb-4 text-center">
                <div className="inline-flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                    <img src="/public-logo.png" alt="X-RAY" className="w-full h-full object-contain scale-[1.8]" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">Welcome to X-RAY</h2>
                </div>
                <div>
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">EARLY BETA</span>
                </div>
              </div>

              <div className="px-6 pb-6 space-y-3">
                {/* Discord */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                  <span className="text-lg mt-0.5">💬</span>
                  <p className="text-sm text-muted-foreground">Report bugs & share feedback on <a href="https://discord.gg/HBUWsX47Jn" target="_blank" rel="noopener" className="text-primary font-medium hover:underline">Discord</a></p>
                </div>

                {/* Devnet */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                  <span className="text-lg mt-0.5">⚡</span>
                  <div className="text-sm text-muted-foreground">
                    <p>Running on <span className="text-foreground font-medium">Solana Devnet</span>, set your wallet to Devnet mode</p>
                    <p className="mt-1">Get free SOL at <a href="https://faucet.solana.com/" target="_blank" rel="noopener" className="text-primary font-medium hover:underline">faucet.solana.com</a></p>
                  </div>
                </div>

                {/* Privacy Cash */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                  <img src="https://privacycash.vip/logo.png" alt="Privacy Cash" className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground"><span className="text-foreground font-medium">Privacy Cash</span> is not available on Devnet, wallet funding is not private in this version</p>
                </div>

                {/* Content creation */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                  <span className="text-lg mt-0.5">🎨</span>
                  <p className="text-sm text-muted-foreground">Posting content about X-RAY is greatly appreciated! Share it in <a href="https://discord.gg/HBUWsX47Jn" target="_blank" rel="noopener" className="text-primary font-medium hover:underline">#post-contents-🖌️</a> on Discord</p>
                </div>

                <button
                  onClick={acceptBeta}
                  className="w-full mt-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
                >
                  I understand, let me in
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SearchModalContext.Provider>
    </PostModalContext.Provider>
  );
}
