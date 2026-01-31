"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Heart,
  MessageCircle,
  Share,
  Loader2,
  EyeOff,
  Zap,
  Target,
  ExternalLink,
  Crown,
  Globe,
} from "lucide-react";
import { useMode } from "@/contexts/mode-context";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/components/toast";
import { usePostModal } from "@/components/app-layout";
import { useShadow } from "@/contexts/shadow-context";
import * as api from "@/lib/api";
import { getImageUrl } from "@/lib/utils";
import { getTop20Posts, getRecentPosts, type TopPost } from "@/lib/shadow/topPosts";
import { formatSol } from "@/lib/shadow/postService";
import { extractXUsername, extractXrayUsername } from "@/lib/shadow/targetProfile";
import { NddPurchaseModal } from "@/components/ndd-purchase-modal";
import type { PremiumNdd } from "@/lib/api";

// Cache for shadow wallet names to avoid repeated API calls
const shadowNameCache = new Map<string, string>();
// Cache for premium status and profile picture
const premiumCache = new Map<string, { isPremium: boolean; profilePicture: string | null }>();
// Queue for progressive loading (most recent first)
let loadingQueue: string[] = [];
let isProcessingQueue = false;

async function getShadowName(authorPubkey: string): Promise<string> {
  // Check cache first
  if (shadowNameCache.has(authorPubkey)) {
    return shadowNameCache.get(authorPubkey)!;
  }

  try {
    const response = await api.getShadowWalletName(authorPubkey);
    const name = response.name || "unknown";
    shadowNameCache.set(authorPubkey, name);
    return name;
  } catch {
    shadowNameCache.set(authorPubkey, "unknown");
    return "unknown";
  }
}

async function checkPremiumStatus(authorPubkey: string): Promise<{ isPremium: boolean; profilePicture: string | null }> {
  // Check cache first
  if (premiumCache.has(authorPubkey)) {
    return premiumCache.get(authorPubkey)!;
  }

  try {
    const response = await api.isPremiumWallet(authorPubkey);
    const result = {
      isPremium: response.is_premium || false,
      profilePicture: response.profile_picture || null
    };
    premiumCache.set(authorPubkey, result);
    return result;
  } catch {
    const defaultResult = { isPremium: false, profilePicture: null };
    premiumCache.set(authorPubkey, defaultResult);
    return defaultResult;
  }
}

// Event emitter for author info updates
type AuthorInfoListener = (pubkey: string, name: string, isPremium: boolean, pfp: string | null) => void;
const authorInfoListeners = new Set<AuthorInfoListener>();

function subscribeToAuthorInfo(listener: AuthorInfoListener) {
  authorInfoListeners.add(listener);
  return () => { authorInfoListeners.delete(listener); };
}

function notifyAuthorInfoUpdate(pubkey: string, name: string, isPremium: boolean, pfp: string | null) {
  authorInfoListeners.forEach(listener => listener(pubkey, name, isPremium, pfp));
}

/**
 * Process the loading queue progressively (most recent posts first)
 * Loads author names and premium status one by one with a small delay
 */
async function processLoadingQueue() {
  if (isProcessingQueue || loadingQueue.length === 0) return;

  isProcessingQueue = true;

  while (loadingQueue.length > 0) {
    const pubkey = loadingQueue.shift()!;

    // Skip if already cached
    if (shadowNameCache.has(pubkey) && premiumCache.has(pubkey)) {
      notifyAuthorInfoUpdate(
        pubkey,
        shadowNameCache.get(pubkey)!,
        premiumCache.get(pubkey)!.isPremium,
        premiumCache.get(pubkey)!.profilePicture
      );
      continue;
    }

    // Fetch name and premium status
    try {
      const [name, premiumStatus] = await Promise.all([
        getShadowName(pubkey),
        checkPremiumStatus(pubkey)
      ]);

      notifyAuthorInfoUpdate(pubkey, name, premiumStatus.isPremium, premiumStatus.profilePicture);
    } catch {
      notifyAuthorInfoUpdate(pubkey, "unknown", false, null);
    }

    // Small delay to avoid hammering the API
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  isProcessingQueue = false;
}

/**
 * Queue authors for progressive loading (call with posts sorted by timestamp desc)
 */
function queueAuthorsForLoading(authorPubkeys: string[]) {
  // Clear existing queue
  loadingQueue = [];

  // Add unique authors to queue (maintain order - most recent first)
  const seen = new Set<string>();
  for (const pubkey of authorPubkeys) {
    if (!seen.has(pubkey)) {
      seen.add(pubkey);
      loadingQueue.push(pubkey);
    }
  }

  // Start processing
  processLoadingQueue();
}

interface Post {
  id: number;
  content: string;
  user_id: number;
  username: string;
  profile_picture: string | null;
  wallet_address: string | null;
  created_at: string;
  time_ago: string;
  like_count: number;
  comment_count: number;
  has_liked: boolean;
  image: string | null;
}

// Helper function to render content with colored mentions
function renderContentWithMentions(content: string) {
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, index) => {
    if (part.startsWith("@")) {
      const username = part.slice(1);
      return (
        <a
          key={index}
          href={`/user/${username}`}
          className="text-primary hover:underline cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

// Helper to extract target display name
function getTargetDisplay(target: string): { name: string; platform: "x" | "xray" } {
  if (target.includes("x.com") || target.includes("twitter.com")) {
    const match = target.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)/);
    return { name: match?.[1] || target, platform: "x" };
  }
  if (target.includes("xray.one")) {
    const match = target.match(/xray\.one\/user\/([a-zA-Z0-9_]+)/);
    return { name: match?.[1] || target, platform: "xray" };
  }
  return { name: target, platform: "xray" };
}

// Helper to get time ago string
function getTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Shadow post card component
function ShadowPostCard({
  post,
  rank,
  isOwnPost,
}: {
  post: TopPost;
  rank?: number;
  isOwnPost: boolean;
}) {
  const router = useRouter();
  const targetInfo = getTargetDisplay(post.target);
  const timeAgo = getTimeAgo(post.timestamp);

  // Initialize from cache if available
  const [authorName, setAuthorName] = useState<string | null>(
    shadowNameCache.get(post.author) || null
  );
  const [isPremium, setIsPremium] = useState(
    premiumCache.get(post.author)?.isPremium || false
  );
  const [premiumPfp, setPremiumPfp] = useState<string | null>(
    premiumCache.get(post.author)?.profilePicture || null
  );

  // Subscribe to author info updates from progressive loader
  useEffect(() => {
    const unsubscribe = subscribeToAuthorInfo((pubkey, name, premium, pfp) => {
      if (pubkey === post.author) {
        setAuthorName(name);
        setIsPremium(premium);
        setPremiumPfp(pfp);
      }
    });

    return unsubscribe;
  }, [post.author]);

  // Navigate to target profile page with shadow tab open
  const handleTargetClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (targetInfo.platform === "x") {
      // X/Twitter profile - go to /user/x/username with shadow tab
      const username = extractXUsername(post.target);
      if (username) {
        router.push(`/user/x/${username}?tab=shadow`);
      }
    } else {
      // X-RAY profile - go to /user/username with shadow tab
      const username = extractXrayUsername(post.target);
      if (username) {
        router.push(`/user/${username}?tab=shadow`);
      }
    }
  };

  return (
    <div className="p-4 border-b border-primary/10 hover:bg-primary/5 transition-colors">
      <div className="flex gap-3">
        {/* Avatar - custom pfp for premium, anonymous icon for others */}
        <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ring-2 overflow-hidden ${
          isPremium
            ? "bg-pink-500/20 ring-pink-500/50"
            : "bg-primary/20 ring-primary/30"
        }`}>
          {premiumPfp ? (
            <img
              src={getImageUrl(premiumPfp, "")}
              alt="Premium avatar"
              className="w-full h-full object-cover"
            />
          ) : (
            <EyeOff className={`w-5 h-5 ${isPremium ? "text-pink-500" : "text-primary"}`} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Rank badge (if in premium feed) */}
            {rank && (
              <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                rank === 1 ? "bg-amber-400/20 text-amber-500" :
                rank === 2 ? "bg-slate-300/20 text-slate-400" :
                rank === 3 ? "bg-amber-600/20 text-amber-700" :
                "bg-primary/10 text-primary"
              }`}>
                #{rank}
              </span>
            )}

            {/* Shadow identity name - clickable to go to shadow profile, pink for premium */}
            {isPremium && <Crown className="w-3.5 h-3.5 text-pink-500" />}
            {authorName ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/shadow/${encodeURIComponent(authorName)}`);
                }}
                className={`font-medium hover:underline ${isPremium ? "text-pink-500" : "text-primary"}`}
              >
                {authorName}
              </button>
            ) : (
              <span className={`font-medium ${isPremium ? "text-pink-500" : "text-primary"}`}>...</span>
            )}

            {isOwnPost && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-green-500/20 text-green-500">
                you
              </span>
            )}

            <span className="text-muted-foreground text-sm">
              {timeAgo}
            </span>
          </div>

          {/* Target - clickable to go to profile page */}
          <button
            onClick={handleTargetClick}
            className="flex items-center gap-1.5 mt-1 group"
          >
            <Target className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              targeting
            </span>
            <span className="text-sm text-cyan-400 font-medium group-hover:underline">
              @{targetInfo.name}
            </span>
            <span className="text-xs text-muted-foreground/60">
              ({targetInfo.platform === "x" ? "X" : "X-RAY"})
            </span>
          </button>

          {/* Content */}
          <p className="mt-2 text-foreground font-sans break-words whitespace-pre-wrap">
            {post.content}
          </p>

          {/* Footer: Bid + View TX */}
          <div className="flex items-center gap-3 mt-3">
            {/* Bid amount */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-sm font-medium text-amber-500">
                {formatSol(post.bid)} SOL
              </span>
            </div>

            {/* View TX link - only for own posts */}
            {isOwnPost && (
              <a
                href={`https://explorer.solana.com/address/${post.pubkey}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                view tx
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MainFeed() {
  const { isShadowMode } = useMode();
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const { registerRefreshCallback } = usePostModal();
  const { isUnlocked: isShadowUnlocked, wallets: shadowWallets } = useShadow();
  const [activeTab, setActiveTab] = useState<"for_you" | "following">("for_you");
  const [posts, setPosts] = useState<Post[]>([]);
  const [shadowPosts, setShadowPosts] = useState<TopPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nddList, setNddList] = useState<PremiumNdd[]>([]);
  const [selectedNdd, setSelectedNdd] = useState<PremiumNdd | null>(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (isShadowMode) {
        // Shadow mode: fetch from blockchain (cached)
        if (activeTab === "for_you") {
          const onChainPosts = await getRecentPosts(50);
          setShadowPosts(onChainPosts);
          // Queue authors for progressive loading (most recent first)
          queueAuthorsForLoading(onChainPosts.map(p => p.author));
        } else {
          // Premium feed: recent posts from premium wallets only
          // First show all posts, then filter as premium status loads
          const onChainPosts = await getRecentPosts(50);

          // Quick filter using cache (show what we know immediately)
          const knownPremiumPosts = onChainPosts.filter(p =>
            premiumCache.get(p.author)?.isPremium
          );
          setShadowPosts(knownPremiumPosts);

          // Load all premium statuses and update as we go
          const premiumPosts: TopPost[] = [];
          for (const post of onChainPosts) {
            const status = await checkPremiumStatus(post.author);
            if (status.isPremium) {
              premiumPosts.push(post);
              // Update state progressively
              setShadowPosts([...premiumPosts]);
            }
          }
        }
      } else {
        // Public mode: fetch from API
        try {
          const response = await api.getPosts({
            feed: activeTab === "following" ? "following" : "all",
            limit: 20,
          });
          if (response.success) {
            setPosts(response.posts || []);
          } else {
            // API returned success: false - show empty state instead of error
            setPosts([]);
          }
        } catch (apiErr) {
          // API call failed (network error, DB down, etc.) - show empty state
          console.error("API error:", apiErr);
          setPosts([]);
        }
      }
    } catch (err) {
      setError("Failed to load posts");
      console.error("Error fetching posts:", err);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, isShadowMode]);

  // Fetch posts when component mounts or tab changes
  useEffect(() => {
    fetchPosts();
  }, [fetchPosts, isAuthenticated]);

  // Register refresh callback for when a new post is created
  useEffect(() => {
    registerRefreshCallback(fetchPosts);
  }, [registerRefreshCallback, fetchPosts]);

  // Fetch NDD list for mobile inline recommendations (shadow mode only)
  useEffect(() => {
    if (isShadowMode) {
      api.getPremiumNddList(100).then(res => {
        setNddList(res.ndds || []);
      }).catch(() => {});
    }
  }, [isShadowMode]);

  const handleLike = async (postId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      alert("Please connect your wallet to like posts");
      return;
    }

    try {
      const response = await api.toggleLike(postId);
      if (response.success) {
        setPosts(posts.map(post => {
          if (post.id === postId) {
            return {
              ...post,
              has_liked: response.action === "liked",
              like_count: response.like_count,
            };
          }
          return post;
        }));
      }
    } catch (err) {
      console.error("Error toggling like:", err);
    }
  };

  const getAvatarUrl = (post: Post) => {
    const fallback = `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.username || post.user_id}`;
    return getImageUrl(post.profile_picture, fallback);
  };

  const getTruncatedWallet = (wallet: string | null) => {
    if (!wallet) return "";
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  };

  const handleShare = async (postId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/post/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied!");
    } catch (err) {
      console.error("Failed to copy:", err);
      showToast("Failed to copy link", "error");
    }
  };

  return (
    <div className="flex-1 xl:border-r border-border">
      {/* Header - sticky on desktop, scrolls on mobile */}
      <div className="md:sticky md:top-0 md:z-10 px-4 py-4 border-b border-border bg-background/80 backdrop-blur-sm">
        <h1 className="text-xl font-bold text-primary">
          {isShadowMode ? "// shadow_feed" : "// public_feed"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isShadowMode
            ? "You are browsing anonymously via Privacy Cash encryption"
            : "Your wallet identity is visible to others"}
        </p>
      </div>

      {/* Tabs - always sticky */}
      <div className="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border">
        <div className="flex">
          <button
            onClick={() => setActiveTab("for_you")}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "for_you"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Recently
            {activeTab === "for_you" && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("following")}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "following"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isShadowMode ? "Premium_feed" : "following"}
            {activeTab === "following" && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Posts */}
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{error}</p>
            <button
              onClick={fetchPosts}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm"
            >
              Try again
            </button>
          </div>
        ) : isShadowMode ? (
          // Shadow mode: Display on-chain posts
          shadowPosts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <EyeOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No shadow posts yet</p>
              <p className="text-sm mt-2">Be the first to post anonymously!</p>
            </div>
          ) : (
            shadowPosts.map((post, index) => (
              <div key={post.pubkey}>
                <ShadowPostCard
                  post={post}
                  isOwnPost={shadowWallets.some(w => w.publicKey === post.author)}
                />
                {/* Mobile NDD recommendation after every 10th post */}
                {nddList.length > 0 && (index + 1) % 10 === 0 && index < shadowPosts.length - 1 && (() => {
                  const ndd = nddList[Math.floor(Math.random() * nddList.length)];
                  return (
                    <div className="xl:hidden border-b border-border px-4 py-3 bg-card/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Globe className="w-3.5 h-3.5 text-pink-500" />
                        <span className="text-[11px] text-muted-foreground font-medium">premium identity</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <img
                            src={ndd.pfp ? getImageUrl(ndd.pfp, "") : `https://api.dicebear.com/7.x/shapes/svg?seed=${ndd.name}&backgroundColor=ec4899,a855f7,8b5cf6`}
                            alt={ndd.name}
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                          <div>
                            <p className="font-medium text-pink-500 text-sm">{ndd.name}</p>
                            <p className="text-xs text-muted-foreground">{ndd.cost} SOL</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setSelectedNdd(ndd); setIsPurchaseModalOpen(true); }}
                            className="px-3 py-1.5 text-xs font-medium bg-pink-500 text-white rounded-full hover:bg-pink-500/90 transition-colors"
                          >
                            buy
                          </button>
                          <a
                            href="/marketplace"
                            className="px-3 py-1.5 text-xs font-medium border border-pink-500/30 text-pink-500 rounded-full hover:bg-pink-500/10 transition-colors"
                          >
                            all
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))
          )
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No posts yet</p>
            {activeTab === "following" && (
              <p className="text-sm mt-2">Follow some users to see their posts here</p>
            )}
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="p-4 border-b border-primary/10 hover:bg-primary/5 transition-colors cursor-pointer"
              onClick={() => window.location.href = `/post/${post.id}`}
            >
              <div className="flex gap-3">
                <a
                  href={`/user/${post.username}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src={getAvatarUrl(post)}
                    alt={post.username}
                    className="w-10 h-10 rounded-full flex-shrink-0 ring-2 ring-primary/20 object-cover"
                  />
                </a>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <a
                      href={`/user/${post.username}`}
                      className="font-medium text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      @{post.username || "anon"}
                    </a>
                    <span className="text-muted-foreground text-sm">
                      {getTruncatedWallet(post.wallet_address)}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {post.time_ago}
                    </span>
                  </div>

                  <p className="mt-1 text-foreground font-sans">
                    {renderContentWithMentions(post.content)}
                  </p>

                  {/* Post image */}
                  {post.image && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-border">
                      <img src={getImageUrl(post.image, "")} alt="" className="w-full max-h-96 object-cover" />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-6 mt-3">
                    <button
                      onClick={(e) => handleLike(post.id, e)}
                      className={`flex items-center gap-1.5 transition-colors ${
                        post.has_liked
                          ? "text-red-500"
                          : "text-muted-foreground hover:text-red-500"
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 ${post.has_liked ? "fill-current" : ""}`}
                      />
                      <span className="text-sm">{post.like_count}</span>
                    </button>

                    <button className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors">
                      <MessageCircle className="w-4 h-4" />
                      <span className="text-sm">{post.comment_count}</span>
                    </button>

                    <button
                      onClick={(e) => handleShare(post.id, e)}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Share className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* NDD Purchase Modal */}
      {selectedNdd && (
        <NddPurchaseModal
          isOpen={isPurchaseModalOpen}
          onClose={() => { setIsPurchaseModalOpen(false); setSelectedNdd(null); }}
          ndd={selectedNdd}
        />
      )}
    </div>
  );
}
