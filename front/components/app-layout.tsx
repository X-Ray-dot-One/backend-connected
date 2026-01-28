"use client";

import { ReactNode, useState, useEffect, createContext, useContext, useCallback } from "react";
import { ChevronDown, Check, Plus, User, Loader2, Crown, Home, Search, Bell, Mail, PenSquare, Sun, Moon } from "lucide-react";
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
  const { user, isAuthenticated, showProfileSetup, closeProfileSetup, refreshUser } = useAuth();
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

      <main className="ml-0 md:ml-16 xl:ml-64 mr-0 xl:mr-96 pb-16 md:pb-0">
          {children}
        </main>
        <div className="hidden xl:block">
          <RightPanel />
        </div>

        {/* Mobile Mode Toggle - fixed bottom-right */}
        <button
          onClick={toggleMode}
          className={`md:hidden fixed bottom-[4.5rem] right-4 z-50 w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-colors ${
            isShadowMode
              ? "bg-card text-primary border border-primary/40"
              : "bg-card text-amber-500 border border-amber-500/40"
          }`}
        >
          {isShadowMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
          <div className="grid grid-cols-5 h-14">
            <a href="/" className="flex flex-col items-center justify-center gap-0.5 text-foreground active:text-primary">
              <Home className="w-5 h-5" />
              <span className="text-[10px]">home</span>
            </a>
            <button onClick={() => setIsSearchOpen(true)} className="flex flex-col items-center justify-center gap-0.5 text-foreground active:text-primary">
              <Search className="w-5 h-5" />
              <span className="text-[10px]">explore</span>
            </button>
            <div className="relative flex items-center justify-center">
              {/* Mobile identity selector - above post button */}
              {isShadowMode && isShadowUnlocked && shadowWallets.length > 0 && selectedWallet && (
                <>
                  <button
                    onClick={() => setIsIdentityOpen(!isIdentityOpen)}
                    className={`absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shadow-lg ${
                      (() => {
                        const sp = premiumWallets.get(selectedWallet.publicKey);
                        return sp?.isPremium
                          ? "bg-pink-500/20 text-pink-500 border border-pink-500/40"
                          : "bg-card text-primary border border-primary/40";
                      })()
                    }`}
                  >
                    {(() => {
                      const sp = premiumWallets.get(selectedWallet.publicKey);
                      return sp?.isPremium ? <Crown className="w-3 h-3" /> : <User className="w-3 h-3" />;
                    })()}
                    <span className="max-w-[90px] truncate">{selectedWallet.name}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${isIdentityOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isIdentityOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsIdentityOpen(false)} />
                      <div className="absolute bottom-full mb-8 left-1/2 -translate-x-1/2 w-48 bg-card border border-border rounded-lg shadow-lg py-1 max-h-60 overflow-y-auto z-50">
                        {shadowWallets.map((wallet, index) => {
                          const wp = premiumWallets.get(wallet.publicKey);
                          const isPrem = wp?.isPremium || false;
                          return (
                            <button
                              key={wallet.publicKey}
                              onClick={() => { selectWallet(index); setIsIdentityOpen(false); }}
                              className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                                selectedWalletIndex === index
                                  ? isPrem ? "bg-pink-500/20 text-pink-500" : "bg-primary/20 text-primary"
                                  : isPrem ? "text-pink-500 hover:bg-pink-500/10" : "text-foreground hover:bg-muted"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                {isPrem && <Crown className="w-3 h-3 text-pink-500" />}
                                <span className="truncate">{wallet.name}</span>
                              </div>
                              {selectedWalletIndex === index && <Check className="w-3.5 h-3.5" />}
                            </button>
                          );
                        })}
                        <div className="border-t border-border mt-1 pt-1">
                          <button
                            onClick={async () => { await generateNewWallet(); setIsIdentityOpen(false); }}
                            disabled={shadowLoading}
                            className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                          >
                            {shadowLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                            <span>generate new</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
              <button
                onClick={isAuthenticated ? () => setIsPostModalOpen(true) : undefined}
                className={`flex items-center justify-center w-10 h-10 rounded-full ${isAuthenticated ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                <PenSquare className="w-5 h-5" />
              </button>
            </div>
            {isShadowMode ? (
              <a href="/messages" className="flex flex-col items-center justify-center gap-0.5 text-foreground active:text-primary">
                <Mail className="w-5 h-5" />
                <span className="text-[10px]">messages</span>
              </a>
            ) : (
              <a href="/notifications" className="flex flex-col items-center justify-center gap-0.5 text-foreground active:text-primary">
                <Bell className="w-5 h-5" />
                <span className="text-[10px]">notifs</span>
              </a>
            )}
            <a href={isAuthenticated ? "/profile" : "#"} className={`flex flex-col items-center justify-center gap-0.5 ${isAuthenticated ? "text-foreground active:text-primary" : "text-muted-foreground/50"}`}>
              <User className="w-5 h-5" />
              <span className="text-[10px]">profile</span>
            </a>
          </div>
        </nav>

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
