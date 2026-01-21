"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, TrendingUp, Flame, Globe, Loader2, Crown } from "lucide-react";
import { useMode } from "@/contexts/mode-context";
import { useSearchModal } from "./app-layout";
import { getTop20Posts, TopPost } from "@/lib/shadow/topPosts";
import { getShadowWalletName, isPremiumWallet, getPremiumNddList, PremiumNdd } from "@/lib/api";
import { getImageUrl } from "@/lib/utils";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { EyeOff } from "lucide-react";
import { NddPurchaseModal } from "./ndd-purchase-modal";

// Mock data - waiting for API endpoints
const trendingTopics = [
  { tag: "Solana", posts: "12.4K" },
  { tag: "DeFi", posts: "8.2K" },
  { tag: "NFTs", posts: "5.7K" },
  { tag: "Airdrop", posts: "4.1K" },
  { tag: "Web3", posts: "3.8K" },
];

const suggestedUsers = [
  {
    id: 1,
    username: "solana_dev",
    handle: "@solana_dev",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=solana",
    bio: "Building the future of finance",
  },
  {
    id: 2,
    username: "crypto_whale",
    handle: "@crypto_whale",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=whale",
    bio: "On-chain analyst",
  },
  {
    id: 3,
    username: "defi_queen",
    handle: "@defi_queen",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=queen",
    bio: "Yield farming expert",
  },
  {
    id: 4,
    username: "nft_collector",
    handle: "@nft_collector",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=nft",
    bio: "Digital art enthusiast",
  },
];


// Helper to format time ago
function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Helper to format SOL amount
function formatSol(lamports: bigint): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL;
  return sol < 0.01 ? "<0.01 SOL" : `${sol.toFixed(2)} SOL`;
}

// Helper to shorten author address (fallback)
function shortenAuthor(author: string): string {
  return `${author.slice(0, 4)}...${author.slice(-4)}`;
}

// Extended TopPost with name, premium status, and profile picture
interface TopPostWithName extends TopPost {
  authorName?: string;
  isPremium?: boolean;
  premiumPfp?: string | null;
}

export function RightPanel() {
  const router = useRouter();
  const { isShadowMode } = useMode();
  const { openSearchModal } = useSearchModal();
  const [followingIds, setFollowingIds] = useState<Set<number>>(new Set());
  const [topPosts, setTopPosts] = useState<TopPostWithName[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [nddList, setNddList] = useState<PremiumNdd[]>([]);
  const [isLoadingNdd, setIsLoadingNdd] = useState(false);
  const [selectedNdd, setSelectedNdd] = useState<PremiumNdd | null>(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);

  // Fetch top posts when in shadow mode
  useEffect(() => {
    if (isShadowMode) {
      setIsLoadingPosts(true);
      getTop20Posts()
        .then(async (posts) => {
          const topFive = posts.slice(0, 5);
          // Fetch names and premium status for all authors in parallel
          const postsWithNames = await Promise.all(
            topFive.map(async (post) => {
              let authorName: string | undefined;
              let isPremium = false;

              try {
                const nameResult = await getShadowWalletName(post.author);
                authorName = nameResult.name || undefined;
              } catch (e) {
                console.error("Failed to get shadow name:", e);
              }

              let premiumPfp: string | null = null;
              try {
                const premiumResult = await isPremiumWallet(post.author);
                isPremium = premiumResult.is_premium || false;
                premiumPfp = premiumResult.profile_picture || null;
              } catch (e) {
                console.error("Failed to get premium status:", e);
              }

              return {
                ...post,
                authorName,
                isPremium,
                premiumPfp,
              };
            })
          );
          setTopPosts(postsWithNames);
        })
        .catch((error) => {
          console.error("Failed to fetch top posts:", error);
        })
        .finally(() => {
          setIsLoadingPosts(false);
        });

      // Fetch NDD list
      setIsLoadingNdd(true);
      getPremiumNddList(10)
        .then((res) => {
          setNddList(res.ndds || []);
        })
        .catch((error) => {
          console.error("Failed to fetch NDD list:", error);
        })
        .finally(() => {
          setIsLoadingNdd(false);
        });
    }
  }, [isShadowMode]);

  const handleFollow = (userId: number) => {
    setFollowingIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  return (
    <aside className="fixed right-0 top-0 w-96 h-screen p-4 flex flex-col gap-4 overflow-y-auto bg-background border-l border-border">
      {/* Search - opens search modal */}
      <button
        onClick={openSearchModal}
        className="relative w-full"
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <div className="w-full pl-10 pr-4 py-2.5 bg-muted rounded-full text-sm text-muted-foreground text-left hover:bg-muted/80 transition-colors">
          search...
        </div>
      </button>

      {/* Trending / Top Posts 24h */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          {isShadowMode ? (
            <>
              <Flame className="w-4 h-4 text-primary" />
              <h2 className="font-bold text-foreground">top_posts_24h</h2>
            </>
          ) : (
            <h2 className="font-bold text-foreground">Trending</h2>
          )}
        </div>
        <div>
          {isShadowMode ? (
            isLoadingPosts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : topPosts.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                no posts in the last 24h
              </div>
            ) : (
              topPosts.map((post) => (
                <button
                  key={post.pubkey}
                  onClick={() => {
                    if (post.authorName) {
                      router.push(`/shadow/${encodeURIComponent(post.authorName)}`);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer text-left"
                >
                  {/* Avatar - premium pfp or anonymous icon */}
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden ${
                    post.isPremium ? "bg-pink-500/20" : "bg-primary/20"
                  }`}>
                    {post.premiumPfp ? (
                      <img
                        src={getImageUrl(post.premiumPfp, "")}
                        alt="Premium avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <EyeOff className={`w-4 h-4 ${post.isPremium ? "text-pink-500" : "text-primary"}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-sm flex items-center gap-1 ${post.isPremium ? "text-pink-500" : "text-foreground"}`}>
                      {post.isPremium && <Crown className="w-3 h-3 text-pink-500" />}
                      {post.authorName || shortenAuthor(post.author)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{post.content.slice(0, 30)}...</p>
                  </div>
                  <div className="text-right ml-2">
                    <p className="text-sm font-medium text-primary">{formatSol(post.bid)}</p>
                    <p className="text-xs text-muted-foreground">{formatTimeAgo(post.timestamp)}</p>
                  </div>
                </button>
              ))
            )
          ) : (
            trendingTopics.map((topic) => (
              <a
                key={topic.tag}
                href={`/explore?tag=${topic.tag}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors cursor-pointer"
              >
                <div>
                  <p className="font-medium text-foreground">#{topic.tag}</p>
                  <p className="text-xs text-muted-foreground">{topic.posts} posts</p>
                </div>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </a>
            ))
          )}
        </div>
      </div>

      {/* Who to follow / NDD Marketplace */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          {isShadowMode ? (
            <>
              <Globe className="w-4 h-4 text-primary" />
              <h2 className="font-bold text-foreground">premium_ndd</h2>
            </>
          ) : (
            <h2 className="font-bold text-foreground">Who to follow</h2>
          )}
        </div>
        <div>
          {isShadowMode ? (
            isLoadingNdd ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : nddList.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                no premium ndd available
              </div>
            ) : (
              nddList.map((ndd) => (
                <div
                  key={ndd.name}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={ndd.pfp ? getImageUrl(ndd.pfp, "") : `https://api.dicebear.com/7.x/shapes/svg?seed=${ndd.name}&backgroundColor=ec4899,a855f7,8b5cf6`}
                      alt={ndd.name}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                    <div>
                      <p className="font-medium text-pink-500">{ndd.name}</p>
                      <p className="text-xs text-muted-foreground">{ndd.cost} SOL</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedNdd(ndd);
                      setIsPurchaseModalOpen(true);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
                  >
                    buy
                  </button>
                </div>
              ))
            )
          ) : (
            suggestedUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer"
                onClick={() => window.location.href = `/user/${user.username}`}
              >
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="w-10 h-10 rounded-full"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{user.username}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.bio}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFollow(user.id);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    followingIds.has(user.id)
                      ? "bg-muted text-foreground hover:bg-muted/80"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {followingIds.has(user.id) ? "following" : "follow"}
                </button>
              </div>
            ))
          )}
        </div>
        <a
          href={isShadowMode ? "/marketplace" : "/explore/users"}
          className="block px-4 py-3 text-sm text-primary hover:bg-muted transition-colors border-t border-border"
        >
          {isShadowMode ? "view_all_domains" : "show more"}
        </a>
      </div>

      {/* Footer */}
      <div className="text-xs text-muted-foreground px-2">
        <div className="flex flex-wrap gap-2">
          <a href="/terms" className="hover:text-primary transition-colors">terms</a>
          <span>·</span>
          <a href="/privacy" className="hover:text-primary transition-colors">privacy</a>
          <span>·</span>
          <a href="/about" className="hover:text-primary transition-colors">about</a>
          <span>·</span>
          <a href="/docs" className="hover:text-primary transition-colors">docs</a>
        </div>
        <p className="mt-2">© 2025 X-RAY</p>
      </div>

      {/* NDD Purchase Modal */}
      {selectedNdd && (
        <NddPurchaseModal
          isOpen={isPurchaseModalOpen}
          onClose={() => {
            setIsPurchaseModalOpen(false);
            setSelectedNdd(null);
          }}
          ndd={selectedNdd}
          onSuccess={() => {
            setNddList(prev => prev.filter(n => n.name !== selectedNdd.name));
          }}
        />
      )}
    </aside>
  );
}
