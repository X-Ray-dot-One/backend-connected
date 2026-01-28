"use client";

import { useState, useEffect } from "react";
import {
  Home,
  Search,
  Bell,
  Mail,
  User,
  Wallet,
  LogOut,
  Sun,
  Moon,
  HelpCircle,
  PenSquare,
  Loader2,
} from "lucide-react";
import { useMode } from "@/contexts/mode-context";
import { FlipButton } from "./ui/flip-button";
import { usePostModal, useSearchModal } from "./app-layout";
import { useAuth } from "@/contexts/auth-context";
import { getImageUrl } from "@/lib/utils";

const navItems = [
  { icon: Bell, label: "notifications", href: "/notifications", comingSoon: false, publicOnly: true },
  { icon: Mail, label: "messages", href: "/messages", comingSoon: false, publicOnly: false },
];

// Wallet types detection
interface SolanaWallet {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
  publicKey?: { toString(): string };
  connect(): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  on(event: string, callback: () => void): void;
  off(event: string, callback: () => void): void;
}

declare global {
  interface Window {
    solana?: SolanaWallet;
    solflare?: SolanaWallet;
    phantom?: { solana?: SolanaWallet };
    backpack?: SolanaWallet;
    coinbaseSolana?: SolanaWallet;
    trustwallet?: { solana?: SolanaWallet };
  }
}

// Known wallets configuration
const KNOWN_WALLETS = [
  {
    id: "phantom",
    name: "Phantom",
    icon: "/phantom logo.png",
    downloadUrl: "https://phantom.app/download",
  },
  {
    id: "solflare",
    name: "Solflare",
    icon: "https://solflare.com/favicon.ico",
    downloadUrl: "https://solflare.com/download",
  },
  {
    id: "backpack",
    name: "Backpack",
    icon: "https://backpack.app/favicon.ico",
    downloadUrl: "https://backpack.app/download",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    icon: "https://www.coinbase.com/favicon.ico",
    downloadUrl: "https://www.coinbase.com/wallet/downloads",
  },
  {
    id: "trust",
    name: "Trust Wallet",
    icon: "https://trustwallet.com/favicon.ico",
    downloadUrl: "https://trustwallet.com/download",
  },
] as const;

export function LeftSidebar() {
  const show = "hidden xl:inline";
  const showBlock = "hidden xl:block";
  const justify = "justify-center xl:justify-start";
  const { isShadowMode, toggleMode } = useMode();
  const { openPostModal } = usePostModal();
  const { openSearchModal } = useSearchModal();
  const { user, isAuthenticated, login, logout, isLoading: authLoading } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [availableWallets, setAvailableWallets] = useState<string[]>([]);

  // Detect available wallets
  useEffect(() => {
    const checkWallets = () => {
      const wallets: string[] = [];
      if (window.phantom?.solana || window.solana?.isPhantom) wallets.push("phantom");
      if (window.solflare) wallets.push("solflare");
      if (window.backpack) wallets.push("backpack");
      if (window.coinbaseSolana) wallets.push("coinbase");
      if (window.trustwallet?.solana) wallets.push("trust");
      setAvailableWallets(wallets);
    };

    // Check immediately and after a delay (wallets inject async)
    checkWallets();
    const timeout = setTimeout(checkWallets, 500);
    return () => clearTimeout(timeout);
  }, []);

  const getWallet = (type: string): SolanaWallet | null => {
    switch (type) {
      case "phantom":
        return window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
      case "solflare":
        return window.solflare || null;
      case "backpack":
        return window.backpack || null;
      case "coinbase":
        return window.coinbaseSolana || null;
      case "trust":
        return window.trustwallet?.solana || null;
      default:
        return null;
    }
  };

  const connectWallet = async (walletType: string) => {
    const wallet = getWallet(walletType);
    if (!wallet) {
      alert(`${walletType} wallet not found. Please install it.`);
      return;
    }

    setIsConnecting(true);
    setShowWalletMenu(false);

    try {
      const response = await wallet.connect();
      const publicKey = response.publicKey.toString();

      // Login to our API with the wallet address
      await login(publicKey);
    } catch (error: unknown) {
      console.error("Wallet connection failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Connection failed";
      alert(errorMessage);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      // Try to disconnect from all possible wallets
      const wallets = [
        window.phantom?.solana,
        window.solana,
        window.solflare,
        window.backpack,
        window.coinbaseSolana,
        window.trustwallet?.solana,
      ].filter(Boolean);

      for (const wallet of wallets) {
        try {
          await wallet?.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }

      await logout();
    } catch (error) {
      console.error("Disconnect failed:", error);
    }
  };

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  return (
    <aside className="fixed left-0 top-0 h-screen hidden md:flex w-16 xl:w-64 p-2 xl:p-4 border-r border-primary/20 bg-card flex-col transition-colors duration-300">
      {/* Logo */}
      <div className={`mb-6 px-0 xl:px-3`}>
        <div className={`flex items-center gap-3 justify-center xl:justify-start`}>
          <div className={`w-10 xl:w-16 h-10 xl:h-16 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0`}>
            <img
              src={isShadowMode ? "/private-logo.png" : "/public-logo.png"}
              alt="X-RAY"
              className="w-[175%] h-[175%] object-contain"
            />
          </div>
          <span className={`text-2xl font-bold text-foreground hidden xl:block`}>X-RAY</span>
        </div>
      </div>

      {/* Mode Toggle - Switch with Icons */}
      <div className={`mb-6 mx-0 xl:mx-3 flex flex-col items-center`}>
        <button
          onClick={toggleMode}
          className="flex items-center gap-2 p-1 rounded-full bg-muted/50 transition-colors"
        >
          {/* Sun icon */}
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
              !isShadowMode
                ? "bg-amber-500 text-white"
                : "text-muted-foreground"
            }`}
          >
            <Sun className="w-4 h-4" />
          </div>

          {/* Moon icon */}
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
              isShadowMode
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            <Moon className="w-4 h-4" />
          </div>
        </button>

        <p className={`text-xs text-muted-foreground mt-2 text-center hidden xl:block`}>
          {isShadowMode ? "// encrypted" : "// wallet visible"}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1">
        <ul className="space-y-1">
          <li>
            <a
              href="/"
              className={`flex items-center ${justify} gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-primary/10 hover:text-primary transition-colors`}
            >
              <Home className="w-5 h-5 flex-shrink-0" />
              <span className={show}>home</span>
            </a>
          </li>
          <li>
            <button
              onClick={openSearchModal}
              className={`w-full flex items-center ${justify} gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-primary/10 hover:text-primary transition-colors`}
            >
              <Search className="w-5 h-5 flex-shrink-0" />
              <span className={show}>explore</span>
            </button>
          </li>
          {/* Profile - disabled when not connected */}
          <li>
            {isAuthenticated ? (
              <a
                href="/profile"
                className={`flex items-center ${justify} gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-primary/10 hover:text-primary transition-colors`}
              >
                <User className="w-5 h-5 flex-shrink-0" />
                <span className={show}>profile</span>
              </a>
            ) : (
              <div className={`flex items-center ${justify} gap-3 px-3 py-3 rounded-lg text-muted-foreground/50 cursor-not-allowed`}>
                <User className="w-5 h-5 flex-shrink-0" />
                <span className={show}>profile</span>
              </div>
            )}
          </li>
          {navItems
            .filter((item) => {
              if (item.publicOnly && isShadowMode) return false;
              return true;
            })
            .map((item) => (
            <li key={item.label}>
              {item.comingSoon ? (
                <div className={`flex items-center ${justify} gap-3 px-3 rounded-lg text-muted-foreground`}>
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <div className={showBlock}>
                    <FlipButton
                      frontText={item.label}
                      backText="coming soon"
                      from="top"
                      className="h-auto py-3 px-0 text-base font-normal"
                      frontClassName="bg-transparent text-muted-foreground justify-start"
                      backClassName="bg-transparent text-primary justify-start"
                    />
                  </div>
                </div>
              ) : isAuthenticated ? (
                <a
                  href={item.href}
                  className={`flex items-center ${justify} gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-primary/10 hover:text-primary transition-colors`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className={show}>{item.label}</span>
                </a>
              ) : (
                <div className={`flex items-center ${justify} gap-3 px-3 py-3 rounded-lg text-muted-foreground/50 cursor-not-allowed`}>
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className={show}>{item.label}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* How it works */}
      <a
        href="/how-it-works"
        className={`flex items-center ${justify} gap-3 px-3 py-3 mx-0 xl:mx-3 mb-4 rounded-lg text-primary/70 hover:text-primary hover:bg-primary/10 transition-colors`}
      >
        <HelpCircle className="w-5 h-5 flex-shrink-0" />
        <span className={show}>how it works</span>
      </a>

      {/* Post Button - disabled when not connected */}
      <button
        onClick={isAuthenticated ? openPostModal : undefined}
        disabled={!isAuthenticated}
        className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-medium transition-all mb-4 ${
          isAuthenticated
            ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        }`}
      >
        <PenSquare className="w-4 h-4 flex-shrink-0" />
        <span className={show}>{isShadowMode ? "shadow post" : "post"}</span>
      </button>

      {/* Wallet Section */}
      <div className="border-t border-border pt-4 relative">
        {isAuthenticated && user ? (
          <div className={`flex items-center justify-center xl:justify-between px-1 xl:px-3 py-2`}>
            <a href="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                {user.profile_picture ? (
                  <img src={getImageUrl(user.profile_picture, "")} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Wallet className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className={`text-sm ${showBlock}`}>
                <p className="text-foreground">{user.username || "Anonymous"}</p>
                <p className="text-xs text-muted-foreground">{shortenAddress(user.wallet_address)}</p>
              </div>
            </a>
            <button
              onClick={disconnectWallet}
              className={`text-muted-foreground hover:text-foreground transition-colors ${showBlock}`}
              title="Disconnect"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowWalletMenu(!showWalletMenu)}
              disabled={isConnecting || authLoading}
              className={`w-full flex items-center justify-center gap-2 px-1 xl:px-3 py-3 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50`}
            >
              {isConnecting || authLoading ? (
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              ) : (
                <Wallet className="w-4 h-4 flex-shrink-0" />
              )}
              <span className={show}>{isConnecting ? "connecting..." : "connect_wallet"}</span>
            </button>

            {/* Wallet Selection Menu */}
            {showWalletMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <p className="text-sm font-medium text-foreground">Connect Wallet</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Select your preferred wallet</p>
                </div>
                <div className="p-2 max-h-[280px] overflow-y-auto">
                  {KNOWN_WALLETS.map((wallet) => {
                    const isInstalled = availableWallets.includes(wallet.id);
                    return (
                      <button
                        key={wallet.id}
                        onClick={() => {
                          if (isInstalled) {
                            connectWallet(wallet.id);
                          } else {
                            window.open(wallet.downloadUrl, "_blank");
                          }
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/80 transition-colors group"
                      >
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                          <img
                            src={wallet.icon}
                            alt={wallet.name}
                            className="w-6 h-6 object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-foreground">{wallet.name}</p>
                          {isInstalled ? (
                            <p className="text-xs text-green-500">Detected</p>
                          ) : (
                            <p className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                              Click to install
                            </p>
                          )}
                        </div>
                        {isInstalled && (
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {availableWallets.length === 0 && (
                  <div className="px-4 py-3 border-t border-border bg-amber-500/10">
                    <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                      No wallet detected. Install one to continue.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
