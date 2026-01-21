"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { getShadowWalletByName, isPremiumWallet } from "@/lib/api";
import { getShadowProfileStats, type ShadowProfileStats, type TopPostWithRank } from "@/lib/shadow/topPosts";
import { useShadow } from "@/contexts/shadow-context";
import {
  ArrowLeft,
  Loader2,
  EyeOff,
  Zap,
  ExternalLink,
} from "lucide-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getImageUrl } from "@/lib/utils";

function formatSol(lamports: bigint): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL;
  if (sol === 0) return "0";
  if (sol < 0.001) return "<0.001";
  if (sol < 0.01) return sol.toFixed(3);
  return sol.toFixed(2);
}

function getTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Extract username from target URL
function extractTarget(target: string): { name: string; platform: string } {
  if (target.includes("x.com/") || target.includes("twitter.com/")) {
    const match = target.match(/(?:x\.com|twitter\.com)\/([^/?]+)/);
    return { name: match?.[1] || "unknown", platform: "X" };
  }
  if (target.includes("xray.one/user/")) {
    const match = target.match(/xray\.one\/user\/([^/?]+)/);
    return { name: match?.[1] || "unknown", platform: "X-RAY" };
  }
  return { name: target, platform: "?" };
}

// Shadow post card component
function ShadowPostCard({ post, walletName, isOwnPost, isPremium, premiumPfp }: { post: TopPostWithRank; walletName: string; isOwnPost: boolean; isPremium: boolean; premiumPfp: string | null }) {
  const target = extractTarget(post.target);

  return (
    <div className="p-4 border-b border-primary/10 hover:bg-primary/5 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${
          isPremium ? "bg-pink-500/20" : "bg-primary/20"
        }`}>
          {premiumPfp ? (
            <img
              src={getImageUrl(premiumPfp, "")}
              alt="Premium avatar"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className={`text-sm font-bold ${isPremium ? "text-pink-500" : "text-primary"}`}>
              {walletName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium ${isPremium ? "text-pink-500" : "text-primary"}`}>{walletName}</span>
            <span className="text-muted-foreground text-sm">→</span>
            <span className="text-sm text-foreground">
              @{target.name}
              <span className="text-muted-foreground/60 text-xs ml-1">({target.platform})</span>
            </span>
            <span className="text-muted-foreground text-sm">
              {getTimeAgo(post.timestamp)}
            </span>
          </div>
          <p className="mt-1 text-foreground font-sans break-words whitespace-pre-wrap">
            {post.content}
          </p>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-sm text-amber-500 font-medium flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" />
              {formatSol(post.bid)} SOL
            </span>
            <span className="text-sm text-muted-foreground">
              Rank #{post.rank}/{post.totalForTarget}
            </span>
            {/* Only show explorer link for own posts */}
            {isOwnPost && (
              <a
                href={`https://explorer.solana.com/address/${post.pubkey}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShadowProfileContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const name = decodeURIComponent(params.name as string);
  const { wallets: myWallets, refreshWalletNames } = useShadow();
  const shouldRefresh = searchParams.get("refresh") === "1";

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [walletPubkey, setWalletPubkey] = useState<string | null>(null);
  const [stats, setStats] = useState<ShadowProfileStats | null>(null);
  const [shadowTab, setShadowTab] = useState<"top" | "posts" | "history">("top");
  const [isPremium, setIsPremium] = useState(false);
  const [premiumPfp, setPremiumPfp] = useState<string | null>(null);

  // Check if this is our own wallet
  const isOwnWallet = walletPubkey ? myWallets.some(w => w.publicKey === walletPubkey) : false;

  // Handle refresh flag from NDD purchase
  useEffect(() => {
    if (shouldRefresh) {
      // Remove the refresh param from URL
      router.replace(`/shadow/${encodeURIComponent(name)}`);
      // Refresh wallet names to get updated data
      refreshWalletNames();
    }
  }, [shouldRefresh, name, router, refreshWalletNames]);

  // Load wallet info by name
  useEffect(() => {
    const loadWallet = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getShadowWalletByName(name);
        if (response.success && response.wallet) {
          setWalletPubkey(response.wallet.shadow_pubkey);
        } else {
          setError("Shadow wallet not found");
        }
      } catch (err) {
        console.error("Failed to load wallet:", err);
        setError("Failed to load shadow wallet");
      } finally {
        setIsLoading(false);
      }
    };

    if (name) {
      loadWallet();
    }
  }, [name]);

  // Load stats and premium status when we have the pubkey
  useEffect(() => {
    const loadData = async () => {
      if (!walletPubkey) return;

      try {
        const [profileStats, premiumResponse] = await Promise.all([
          getShadowProfileStats(walletPubkey),
          isPremiumWallet(walletPubkey),
        ]);
        setStats(profileStats);
        setIsPremium(premiumResponse.is_premium || false);
        setPremiumPfp(premiumResponse.profile_picture || null);
      } catch (err) {
        console.error("Failed to load stats:", err);
      }
    };

    if (walletPubkey) {
      loadData();
    }
  }, [walletPubkey]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <EyeOff className="w-16 h-16 text-muted-foreground" />
        <p className="text-xl text-muted-foreground">{error}</p>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Go back
        </button>
      </div>
    );
  }

  // Get posts based on active tab
  const getFilteredPosts = () => {
    if (!stats?.posts) return [];

    switch (shadowTab) {
      case "top":
        // Top 10 by bid
        return [...stats.posts].sort((a, b) => Number(b.bid - a.bid)).slice(0, 10);
      case "posts":
        // All posts sorted by timestamp
        return [...stats.posts].sort((a, b) => b.timestamp - a.timestamp);
      case "history":
        // Same as posts for now (could show tx history in future)
        return [...stats.posts].sort((a, b) => b.timestamp - a.timestamp);
      default:
        return stats.posts;
    }
  };

  return (
    <div className="border-x border-border min-h-screen">
      {/* Header with back button */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-4 px-4 py-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">{name}</h1>
            <p className="text-xs text-muted-foreground">{stats?.totalPosts || 0} posts</p>
          </div>
        </div>
      </div>

      {/* Shadow Profile Header */}
      <div className="px-6 py-6 border-b border-border">
        <div className="flex items-center gap-4">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center overflow-hidden ${
            isPremium ? "bg-pink-500/20" : "bg-primary/20"
          }`}>
            {premiumPfp ? (
              <img
                src={getImageUrl(premiumPfp, "")}
                alt="Premium avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${
                isPremium ? "bg-pink-500/30 text-pink-500" : "bg-primary/30 text-primary"
              }`}>
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1">
            <h1 className={`text-2xl font-bold ${isPremium ? "text-pink-500" : "text-primary"}`}>{name}</h1>
            {/* Only show wallet address and explorer link for own wallets */}
            {walletPubkey && isOwnWallet && (
              <>
                <p className="text-sm text-muted-foreground font-mono">
                  {walletPubkey.slice(0, 8)}...{walletPubkey.slice(-8)}
                </p>
                <a
                  href={`https://explorer.solana.com/address/${walletPubkey}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                >
                  View on Explorer <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}
          </div>
        </div>

        {/* Shadow Stats */}
        {stats && (
          <>
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="bg-primary/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-primary">{stats.totalPosts}</p>
                <p className="text-xs text-muted-foreground">total posts</p>
              </div>
              <div className="bg-primary/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-primary">{stats.avgBoost.toFixed(3)} SOL</p>
                <p className="text-xs text-muted-foreground">avg boost</p>
              </div>
              <div className="bg-primary/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-primary">#{stats.avgPosition.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">avg position</p>
              </div>
            </div>

            {/* Total spent */}
            <div className="mt-5 flex items-center gap-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">total spent</span>
              <span className="text-xl font-bold text-amber-500">
                {formatSol(stats.totalSpent)} SOL
              </span>
            </div>
          </>
        )}
      </div>

      {/* Shadow Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setShadowTab("top")}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            shadowTab === "top" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          top_10
          {shadowTab === "top" && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-full" />
          )}
        </button>
        <button
          onClick={() => setShadowTab("posts")}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            shadowTab === "posts" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          all_posts
          {shadowTab === "posts" && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-full" />
          )}
        </button>
        <button
          onClick={() => setShadowTab("history")}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            shadowTab === "history" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          history
          {shadowTab === "history" && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-full" />
          )}
        </button>
      </div>

      {/* Shadow Posts */}
      <div>
        {!stats ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : stats.posts.length === 0 ? (
          <div className="p-8 text-center">
            <EyeOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No shadow posts yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              This identity hasn&apos;t posted anything yet
            </p>
          </div>
        ) : (
          getFilteredPosts().map((post) => (
            <ShadowPostCard key={post.pubkey} post={post} walletName={name} isOwnPost={isOwnWallet} isPremium={isPremium} premiumPfp={premiumPfp} />
          ))
        )}
      </div>
    </div>
  );
}

export default function ShadowProfilePage() {
  return (
    <AppLayout>
      <ShadowProfileContent />
    </AppLayout>
  );
}
