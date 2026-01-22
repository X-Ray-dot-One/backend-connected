"use client";

import { ReactNode, useState, useEffect, createContext, useContext, useCallback } from "react";
import { ChevronDown, Check, Plus, User, Loader2, Crown } from "lucide-react";
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
  const { isShadowMode } = useMode();
  const { user, showProfileSetup, closeProfileSetup, refreshUser } = useAuth();
  const {
    isUnlocked: isShadowUnlocked,
    isRestoring: isShadowRestoring,
    wallets: shadowWallets,
    selectedWallet,
    selectedWalletIndex,
    selectWallet,
    generateNewWallet,
    isLoading: shadowLoading,
  } = useShadow();
  const [isIdentityOpen, setIsIdentityOpen] = useState(false);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [refreshCallbacks, setRefreshCallbacks] = useState<(() => void)[]>([]);
  const [premiumWallets, setPremiumWallets] = useState<Map<string, { isPremium: boolean; profilePicture: string | null }>>(new Map());

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
      <div className={`min-h-screen bg-background transition-colors duration-300 ${isShadowMode ? "shadow-mode" : ""}`}>
        <LeftSidebar />

      {/* Global Identity Selector - Shadow mode only */}
      {isShadowMode && !isShadowRestoring && (
        <div className="fixed top-4 right-[25rem] z-50">
          {!isShadowUnlocked ? (
            /* Not unlocked yet - show link to profile */
            <a
              href="/profile"
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-primary/30 shadow-lg hover:bg-primary/10 transition-colors"
            >
              <User className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">unlock shadow wallets →</span>
            </a>
          ) : shadowWallets.length === 0 ? (
            /* No wallets yet - show generate first button */
            <button
              onClick={async () => {
                await generateNewWallet();
              }}
              disabled={shadowLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {shadowLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span className="text-sm font-medium">generate first shadow identity</span>
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
                    className={`flex items-center gap-2 px-4 py-2 rounded-full bg-card shadow-lg hover:bg-primary/10 transition-colors ${
                      isSelectedPremium ? "border border-pink-500/50" : "border border-primary/30"
                    }`}
                  >
                    {isSelectedPremium ? (
                      <Crown className="w-4 h-4 text-pink-500" />
                    ) : (
                      <User className="w-4 h-4 text-primary" />
                    )}
                    <span className="text-xs text-muted-foreground">posting as</span>
                    <span className={`text-sm font-medium ${isSelectedPremium ? "text-pink-500" : "text-primary"}`}>
                      {selectedWallet?.name || "Select wallet"}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isSelectedPremium ? "text-pink-500" : "text-primary"} ${isIdentityOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isIdentityOpen && (
                    <div className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-lg py-1 max-h-80 overflow-y-auto">
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
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}

      <main className="ml-64 mr-96">
          {children}
        </main>
        <RightPanel />

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
      </div>
    </SearchModalContext.Provider>
    </PostModalContext.Provider>
  );
}
