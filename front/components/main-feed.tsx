"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Users,
} from "lucide-react";
import { useMode } from "@/contexts/mode-context";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/components/toast";
import { usePostModal } from "@/components/app-layout";
import { useShadow } from "@/contexts/shadow-context";
import * as api from "@/lib/api";
import { getImageUrl } from "@/lib/utils";
import { getTop20Posts, getRecentPosts, invalidatePostsCache, type TopPost } from "@/lib/shadow/topPosts";
import { formatSol } from "@/lib/shadow/postService";
import { extractXUsername, extractXrayUsername } from "@/lib/shadow/targetProfile";
import { NddPurchaseModal } from "@/components/ndd-purchase-modal";
import type { PremiumNdd } from "@/lib/api";

// Cache for author info (name + premium status + profile picture)
const authorInfoCache = new Map<string, { name: string; isPremium: boolean; profilePicture: string | null }>();
let isBatchLoading = false;

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
 * Batch load author info for multiple wallets in a single API call
 */
async function queueAuthorsForLoading(authorPubkeys: string[]) {
  // Get unique authors not yet in cache
  const uniqueAuthors = [...new Set(authorPubkeys)];
  const uncachedAuthors = uniqueAuthors.filter(pubkey => !authorInfoCache.has(pubkey));

  // Notify for already cached authors immediately
  for (const pubkey of uniqueAuthors) {
    if (authorInfoCache.has(pubkey)) {
      const info = authorInfoCache.get(pubkey)!;
      notifyAuthorInfoUpdate(pubkey, info.name, info.isPremium, info.profilePicture);
    }
  }

  // If all are cached or already loading, skip
  if (uncachedAuthors.length === 0 || isBatchLoading) return;

  isBatchLoading = true;

  try {
    // Single batch API call for all uncached authors
    const response = await api.getShadowWalletsBatch(uncachedAuthors);

    if (response.success && response.results) {
      for (const [pubkey, info] of Object.entries(response.results)) {
        const authorInfo = {
          name: info.name || "unknown",
          isPremium: info.is_premium || false,
          profilePicture: info.profile_picture || null
        };

        // Update cache
        authorInfoCache.set(pubkey, authorInfo);

        // Notify listeners
        notifyAuthorInfoUpdate(pubkey, authorInfo.name, authorInfo.isPremium, authorInfo.profilePicture);
      }
    }
  } catch (err) {
    console.error("Batch load failed:", err);
    // Set default values for failed authors
    for (const pubkey of uncachedAuthors) {
      if (!authorInfoCache.has(pubkey)) {
        authorInfoCache.set(pubkey, { name: "unknown", isPremium: false, profilePicture: null });
        notifyAuthorInfoUpdate(pubkey, "unknown", false, null);
      }
    }
  } finally {
    isBatchLoading = false;
  }
}

// Helper to check premium status from cache (used by premium feed filter)
async function checkPremiumStatus(authorPubkey: string): Promise<{ isPremium: boolean; profilePicture: string | null }> {
  if (authorInfoCache.has(authorPubkey)) {
    const info = authorInfoCache.get(authorPubkey)!;
    return { isPremium: info.isPremium, profilePicture: info.profilePicture };
  }

  try {
    const response = await api.isPremiumWallet(authorPubkey);
    return {
      isPremium: response.is_premium || false,
      profilePicture: response.profile_picture || null
    };
  } catch {
    return { isPremium: false, profilePicture: null };
  }
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

// Preview comment to show under a post in the feed
interface PreviewComment {
  id: number;
  content: string;
  username: string;
  profile_picture: string | null;
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
  const cachedInfo = authorInfoCache.get(post.author);
  const [authorName, setAuthorName] = useState<string | null>(
    cachedInfo?.name || null
  );
  const [isPremium, setIsPremium] = useState(
    cachedInfo?.isPremium || false
  );
  const [premiumPfp, setPremiumPfp] = useState<string | null>(
    cachedInfo?.profilePicture || null
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
  const { isAuthenticated, user } = useAuth();
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

  // Preview comments state (postId -> comment)
  const [previewComments, setPreviewComments] = useState<Map<number, PreviewComment>>(new Map());

  // Suggested users for "Who to follow" on mobile
  const [suggestedUsers, setSuggestedUsers] = useState<api.SearchUser[]>([]);

  // Pagination state (public feed only)
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(1); // To avoid stale closures

  // Pull-to-refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullDistanceRef = useRef(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  const PULL_THRESHOLD = 80;

  const fetchPosts = useCallback(async (loadMore = false) => {
    if (loadMore) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setPage(1);
      pageRef.current = 1;
      setHasMore(true);
    }
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
            authorInfoCache.get(p.author)?.isPremium
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
        // Public mode: fetch from API with pagination
        try {
          const currentPage = loadMore ? pageRef.current + 1 : 1;
          const response = await api.getPosts({
            feed: activeTab === "following" ? "following" : "all",
            limit: 40,
            page: currentPage,
          });
          if (response.success) {
            if (loadMore) {
              setPosts(prev => [...prev, ...(response.posts || [])]);
            } else {
              setPosts(response.posts || []);
            }
            setHasMore(response.hasMore ?? false);
            setPage(currentPage);
            pageRef.current = currentPage;
          } else {
            // API returned success: false - show empty state instead of error
            if (!loadMore) setPosts([]);
            setHasMore(false);
          }
        } catch (apiErr) {
          // API call failed (network error, DB down, etc.) - show empty state
          console.error("API error:", apiErr);
          if (!loadMore) setPosts([]);
          setHasMore(false);
        }
      }
    } catch (err) {
      setError("Failed to load posts");
      console.error("Error fetching posts:", err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeTab, isShadowMode]);

  // Fetch posts when component mounts or tab changes
  useEffect(() => {
    fetchPosts(false);
  }, [fetchPosts, isAuthenticated]);

  // Ref to track which post sets we've already fetched preview comments for
  const fetchedPreviewsRef = useRef<string>("");

  // Fetch preview comments for ~25% of posts with comments (public feed only)
  useEffect(() => {
    if (isShadowMode || posts.length === 0) return;

    // Create a key based on post IDs to avoid refetching for the same posts
    const postKey = posts.map(p => p.id).join(",");
    if (fetchedPreviewsRef.current === postKey) return;
    fetchedPreviewsRef.current = postKey;

    const fetchPreviewComments = async () => {
      // Get posts with at least 1 comment
      const postsWithComments = posts.filter(p => p.comment_count >= 1);
      if (postsWithComments.length === 0) {
        setPreviewComments(new Map());
        return;
      }

      // Randomly select ~25% of posts (at least 1 if any have comments)
      const numToShow = Math.max(1, Math.floor(postsWithComments.length * 0.25));
      const shuffled = [...postsWithComments].sort(() => Math.random() - 0.5);
      const selectedPosts = shuffled.slice(0, numToShow);

      // Fetch first comment for each selected post
      const newPreviewComments = new Map<number, PreviewComment>();

      for (const post of selectedPosts) {
        try {
          const response = await api.getComments(post.id);
          if (response.success && response.comments && response.comments.length > 0) {
            // Get the first root-level comment (no parent)
            const firstComment = response.comments.find(c => !c.parent_comment_id) || response.comments[0];
            newPreviewComments.set(post.id, {
              id: firstComment.id,
              content: firstComment.content,
              username: firstComment.username,
              profile_picture: firstComment.profile_picture,
              image: firstComment.image,
            });
          }
        } catch (err) {
          console.error(`Failed to fetch comments for post ${post.id}:`, err);
        }
      }

      setPreviewComments(newPreviewComments);
    };

    fetchPreviewComments();
  }, [posts, isShadowMode]);

  // Register refresh callback for when a new post is created
  useEffect(() => {
    registerRefreshCallback(() => fetchPosts(false));
  }, [registerRefreshCallback, fetchPosts]);

  // Infinite scroll observer (public feed only)
  useEffect(() => {
    if (isShadowMode || !loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          fetchPosts(true);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [isShadowMode, hasMore, isLoadingMore, isLoading, fetchPosts]);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    if (isShadowMode) {
      invalidatePostsCache();
    }
    await fetchPosts(false);
    setIsRefreshing(false);
  }, [isShadowMode, fetchPosts]);

  // Touch handlers for pull-to-refresh
  useEffect(() => {
    const mainEl = document.querySelector("main");
    if (!mainEl) return;

    const onTouchStart = (e: TouchEvent) => {
      if (mainEl.scrollTop <= 0) {
        touchStartY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPulling.current) return;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy > 0 && mainEl.scrollTop <= 0) {
        const dist = Math.min(dy * 0.5, PULL_THRESHOLD * 1.5);
        pullDistanceRef.current = dist;
        setPullDistance(dist);
        if (dy > 10) e.preventDefault();
      } else {
        isPulling.current = false;
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    const onTouchEnd = () => {
      if (isPulling.current && pullDistanceRef.current >= PULL_THRESHOLD && !isRefreshing) {
        handleRefresh();
      }
      isPulling.current = false;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    mainEl.addEventListener("touchstart", onTouchStart, { passive: true });
    mainEl.addEventListener("touchmove", onTouchMove, { passive: false });
    mainEl.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      mainEl.removeEventListener("touchstart", onTouchStart);
      mainEl.removeEventListener("touchmove", onTouchMove);
      mainEl.removeEventListener("touchend", onTouchEnd);
    };
  }, [isRefreshing, handleRefresh]);

  // Fetch NDD list for mobile inline recommendations (shadow mode only)
  useEffect(() => {
    if (isShadowMode) {
      api.getPremiumNddList(100).then(res => {
        setNddList(res.ndds || []);
      }).catch(() => {});
    }
  }, [isShadowMode]);

  // Fetch suggested users for "Who to follow" on mobile (public mode only)
  useEffect(() => {
    if (!isShadowMode) {
      api.getSuggestedUsers().then(res => {
        setSuggestedUsers(res.users || []);
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
      {/* Pull-to-refresh indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200 md:hidden"
        style={{ height: isRefreshing ? 48 : pullDistance > 0 ? pullDistance : 0 }}
      >
        <Loader2
          className={`w-5 h-5 text-primary transition-transform ${isRefreshing ? "animate-spin" : ""}`}
          style={{ opacity: Math.min(pullDistance / PULL_THRESHOLD, 1), transform: `rotate(${pullDistance * 3}deg)` }}
        />
      </div>

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
              onClick={() => fetchPosts()}
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
          <>
            {posts.map((post, index) => (
              <div key={post.id}>
                <div
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

                    {/* Preview comment (shown for ~25% of posts with comments) */}
                    {previewComments.has(post.id) && (() => {
                      const comment = previewComments.get(post.id)!;
                      return (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <div className="flex gap-2">
                            <img
                              src={getImageUrl(comment.profile_picture, `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.username}`)}
                              alt={comment.username}
                              className="w-6 h-6 rounded-full flex-shrink-0 object-cover"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-primary">
                                  @{comment.username || "anon"}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {comment.content}
                              </p>
                              {comment.image && (
                                <div className="mt-1 rounded-lg overflow-hidden border border-border max-w-[200px]">
                                  <img src={getImageUrl(comment.image, "")} alt="" className="w-full max-h-24 object-cover" />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

                {/* Who to follow - mobile only, after every 20th post */}
                {suggestedUsers.length > 0 && (index + 1) % 20 === 0 && index < posts.length - 1 && (() => {
                  // Filter out current user from suggestions
                  const filteredUsers = suggestedUsers.filter(u => u.id !== user?.id);
                  if (filteredUsers.length === 0) return null;

                  const startIdx = (Math.floor(index / 20) * 2) % filteredUsers.length;
                  const usersToShow = filteredUsers.slice(startIdx, startIdx + 2);
                  // If we don't have 2 users, wrap around
                  if (usersToShow.length < 2 && filteredUsers.length >= 2) {
                    usersToShow.push(...filteredUsers.slice(0, 2 - usersToShow.length));
                  }

                  return (
                  <div className="xl:hidden border-b border-border px-4 py-3 bg-card/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">Who to follow</span>
                    </div>
                    <div className="space-y-3">
                      {usersToShow.map((suggestedUser) => (
                        <a
                          key={suggestedUser.id}
                          href={`/user/${suggestedUser.username}`}
                          className="flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={suggestedUser.profile_picture ? getImageUrl(suggestedUser.profile_picture, "") : `https://api.dicebear.com/7.x/avataaars/svg?seed=${suggestedUser.username}`}
                              alt={suggestedUser.username}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                            <div>
                              <p className="font-medium text-foreground text-sm group-hover:underline">
                                @{suggestedUser.username}
                              </p>
                              {suggestedUser.bio && (
                                <p className="text-xs text-muted-foreground line-clamp-1 max-w-[180px]">
                                  {suggestedUser.bio}
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.location.href = `/user/${suggestedUser.username}`;
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
                          >
                            View
                          </button>
                        </a>
                      ))}
                    </div>
                  </div>
                  );
                })()}
              </div>
            ))}
            {/* Infinite scroll trigger */}
            <div ref={loadMoreRef} className="py-4 flex justify-center">
              {isLoadingMore && (
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              )}
              {!hasMore && posts.length > 0 && (
                <p className="text-muted-foreground text-sm">No more posts</p>
              )}
            </div>
          </>
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
