"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, X, Loader2, EyeOff, Zap, FileText, Clock } from "lucide-react";
import { useMode } from "@/contexts/mode-context";
import { searchUsers, searchShadowWallets, type ShadowWalletSearchResult } from "@/lib/api";
import { getImageUrl, getDefaultAvatar } from "@/lib/utils";
import { getShadowWalletStats, type ShadowWalletStats } from "@/lib/shadow/topPosts";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

interface SearchResult {
  id: number;
  username: string;
  bio: string;
  profile_picture: string;
}

// Extended shadow wallet result with stats
interface ShadowWalletWithStats extends ShadowWalletSearchResult {
  stats?: ShadowWalletStats;
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

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const { isShadowMode } = useMode();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [shadowResults, setShadowResults] = useState<ShadowWalletWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
    if (!isOpen) {
      setSearchQuery("");
      setResults([]);
      setShadowResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.length > 0) {
      setIsLoading(true);
      // Debounce API call
      debounceRef.current = setTimeout(async () => {
        try {
          if (isShadowMode) {
            // Shadow mode: search shadow wallets by name
            const response = await searchShadowWallets(query);
            const wallets = response.wallets || [];
            setShadowResults(wallets);
            setResults([]);

            // Fetch stats for each wallet in parallel (in background)
            if (wallets.length > 0) {
              setIsLoadingStats(true);
              const walletsWithStats = await Promise.all(
                wallets.map(async (wallet) => {
                  try {
                    const stats = await getShadowWalletStats(wallet.shadow_pubkey);
                    return { ...wallet, stats };
                  } catch {
                    return wallet;
                  }
                })
              );
              setShadowResults(walletsWithStats);
              setIsLoadingStats(false);
            }
          } else {
            // Public mode: search regular users
            const response = await searchUsers(query);
            setResults(response.users || []);
            setShadowResults([]);
          }
        } catch (error) {
          console.error("Search error:", error);
          setResults([]);
          setShadowResults([]);
        } finally {
          setIsLoading(false);
        }
      }, 300);
    } else {
      setResults([]);
      setShadowResults([]);
      setIsLoading(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const hasNoResults = isShadowMode
    ? shadowResults.length === 0
    : results.length === 0;

  const modalContent = (
    <div className={isShadowMode ? "shadow-mode" : ""}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[100]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[101] flex items-start justify-center pt-20 px-4 pointer-events-none">
        <div className="w-full max-w-lg pointer-events-auto">
          <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="w-5 h-5 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={isShadowMode ? "search shadow identities..." : "search users..."}
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto">
              {isLoading && (
                <div className="px-4 py-6 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </div>
              )}

              {!isLoading && searchQuery.length > 0 && hasNoResults && (
                <div className="px-4 py-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    {isShadowMode ? "no shadow identities found" : "no users found"}
                  </p>
                </div>
              )}

              {/* Shadow mode results */}
              {!isLoading && isShadowMode && shadowResults.map((wallet) => (
                <a
                  key={wallet.shadow_pubkey}
                  href={`/shadow/${encodeURIComponent(wallet.name)}`}
                  onClick={onClose}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary/30">
                    <EyeOff className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-primary">{wallet.name}</p>
                    {wallet.stats ? (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {wallet.stats.postsCount} posts
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
                        loading stats...
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {wallet.shadow_pubkey.slice(0, 8)}...{wallet.shadow_pubkey.slice(-6)}
                      </p>
                    )}
                  </div>
                </a>
              ))}

              {/* Public mode results */}
              {!isLoading && !isShadowMode && results.map((user) => (
                <a
                  key={user.id}
                  href={`/user/${user.username}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer"
                  onClick={onClose}
                >
                  <img
                    src={getImageUrl(user.profile_picture, getDefaultAvatar(user.username))}
                    alt={user.username}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{user.username}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {user.bio || "No bio"}
                    </p>
                  </div>
                  <p className="text-sm text-primary">@{user.username}</p>
                </a>
              ))}

              {searchQuery.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    {isShadowMode ? "search for shadow identities" : "search for users"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
