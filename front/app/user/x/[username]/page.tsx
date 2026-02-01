"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import {
  ArrowLeft,
  Loader2,
  ExternalLink,
  Zap,
  EyeOff,
  Users,
  FileText,
  TrendingUp,
  Crown,
} from "lucide-react";
import { getImageUrl } from "@/lib/utils";
import {
  fetchXProfile,
  getDefaultProfile,
  getPostsForTarget,
  type TargetProfile,
  type TargetPost,
} from "@/lib/shadow/targetProfile";
import { formatSol } from "@/lib/shadow/postService";
import * as api from "@/lib/api";

// Cache for shadow wallet names
const shadowNameCache = new Map<string, string>();

async function getShadowName(authorPubkey: string): Promise<string> {
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

function getTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Premium cache for shadow post authors
const premiumCache = new Map<string, { isPremium: boolean; profilePicture: string | null }>();

async function checkPremiumStatus(pubkey: string) {
  if (premiumCache.has(pubkey)) return premiumCache.get(pubkey)!;
  try {
    const response = await api.isPremiumWallet(pubkey);
    const result = { isPremium: response.is_premium || false, profilePicture: response.profile_picture || null };
    premiumCache.set(pubkey, result);
    return result;
  } catch {
    const fallback = { isPremium: false, profilePicture: null };
    premiumCache.set(pubkey, fallback);
    return fallback;
  }
}

// Shadow post card for this page
function ShadowPostCard({ post, rank }: { post: TargetPost; rank: number }) {
  const [authorName, setAuthorName] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumPfp, setPremiumPfp] = useState<string | null>(null);

  useEffect(() => {
    getShadowName(post.author).then(setAuthorName);
    checkPremiumStatus(post.author).then((status) => {
      setIsPremium(status.isPremium);
      setPremiumPfp(status.profilePicture);
    });
  }, [post.author]);

  return (
    <div className="p-4 border-b border-primary/10 hover:bg-primary/5 transition-colors">
      <div className="flex gap-3">
        {/* Anonymous avatar */}
        <a href={authorName ? `/shadow/${encodeURIComponent(authorName)}` : "#"} className="flex-shrink-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ring-2 ${isPremium ? "bg-pink-500/20 ring-pink-500/30" : "bg-primary/20 ring-primary/30"}`}>
            {premiumPfp ? (
              <img src={getImageUrl(premiumPfp, "")} alt="" className="w-full h-full object-cover" />
            ) : (
              <EyeOff className={`w-5 h-5 ${isPremium ? "text-pink-500" : "text-primary"}`} />
            )}
          </div>
        </a>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Rank badge - only show for ranked posts */}
            {rank > 0 && (
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                rank === 1 ? "bg-amber-400/20 text-amber-500" :
                rank === 2 ? "bg-slate-300/20 text-slate-400" :
                rank === 3 ? "bg-amber-600/20 text-amber-700" :
                "bg-primary/10 text-primary"
              }`}>
                #{rank}
              </span>
            )}

            {/* Shadow identity name */}
            <a href={authorName ? `/shadow/${encodeURIComponent(authorName)}` : "#"} className={`font-medium hover:underline ${isPremium ? "text-pink-500" : "text-primary"}`}>
              {isPremium && <Crown className="w-3.5 h-3.5 inline mr-1" />}
              {authorName || "..."}
            </a>

            <span className="text-muted-foreground text-sm">
              {getTimeAgo(post.timestamp)}
            </span>
          </div>

          {/* Content */}
          <p className="mt-2 text-foreground font-sans text-base leading-relaxed">
            {post.content}
          </p>

          {/* Footer: Bid */}
          <div className="flex items-center mt-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-amber-500">
                {formatSol(post.bid)} SOL
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function XProfileContent() {
  const params = useParams();
  const username = params.username as string;

  const [profile, setProfile] = useState<TargetProfile | null>(null);
  const [posts, setPosts] = useState<TargetPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"boost" | "recent">("boost");

  const targetUrl = `https://x.com/${username}`;

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load X profile
        const xProfile = await fetchXProfile(targetUrl);
        setProfile(xProfile || getDefaultProfile(targetUrl));

        // Load posts for this target
        const targetPosts = await getPostsForTarget(targetUrl);
        setPosts(targetPosts);
      } catch (error) {
        console.error("Error loading data:", error);
        setProfile(getDefaultProfile(targetUrl));
      } finally {
        setIsLoading(false);
      }
    };

    if (username) {
      loadData();
    }
  }, [username, targetUrl]);

  // Sort posts
  const sortedPosts = [...posts].sort((a, b) => {
    if (sortBy === "boost") {
      return Number(b.bid - a.bid);
    }
    return b.timestamp - a.timestamp;
  });

  // Calculate stats
  const totalBoosted = posts.reduce((sum, p) => sum + Number(p.bid), 0) / 1e9;
  const avgBoost = posts.length > 0 ? totalBoosted / posts.length : 0;

  if (isLoading) {
    return (
      <div className="border-x border-border min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="border-x border-border min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-4 px-4 py-3">
          <a href="/" className="p-2 rounded-full hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </a>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">@{username}</h1>
            <p className="text-sm text-muted-foreground">X/Twitter Profile</p>
          </div>
        </div>
      </div>

      {/* Banner with View on X button */}
      <div className="h-48 relative">
        {/* View on X button - positioned on banner */}
        <a
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-4 right-4 z-10 flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors text-sm font-medium backdrop-blur-sm border border-white/20"
        >
          <ExternalLink className="w-4 h-4" />
          View on X
        </a>
        {profile?.bannerUrl ? (
          <img
            src={profile.bannerUrl}
            alt="Banner"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/30 via-primary/20 to-accent/30" />
        )}
      </div>

      {/* Profile Info */}
      <div className="px-6 pb-6 relative">
        {/* Avatar */}
        <div className="absolute -top-16 left-6">
          {profile?.profilePicUrl ? (
            <img
              src={profile.profilePicUrl}
              alt={profile.username}
              className="w-32 h-32 rounded-full border-4 border-background object-cover shadow-xl"
            />
          ) : (
            <div className="w-32 h-32 rounded-full border-4 border-background bg-primary/20 flex items-center justify-center shadow-xl">
              <span className="text-4xl font-bold text-primary">
                {username[0]?.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Spacer for avatar */}
        <div className="h-20" />

        {/* Name & Handle */}
        <div className="mt-2">
          <h1 className="text-2xl font-bold text-foreground">
            {profile?.name || username}
          </h1>
          <p className="text-muted-foreground text-lg">@{profile?.username || username}</p>
        </div>

        {/* Bio */}
        {profile?.description && (
          <p className="mt-4 text-foreground text-base leading-relaxed">
            {profile.description}
          </p>
        )}

        {/* X Stats */}
        {profile && (profile.followersCount > 0 || profile.followingCount > 0) && (
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-foreground">{profile.followingCount.toLocaleString()}</span>
              <span className="text-muted-foreground">Following</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-foreground">{profile.followersCount.toLocaleString()}</span>
              <span className="text-muted-foreground">Followers</span>
            </div>
            {profile.tweetCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-foreground">{profile.tweetCount.toLocaleString()}</span>
                <span className="text-muted-foreground">Posts</span>
              </div>
            )}
          </div>
        )}

        {/* Shadow Stats */}
        <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/10">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <EyeOff className="w-4 h-4" />
            Shadow Activity on X-RAY
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-primary">
                <FileText className="w-5 h-5" />
                {posts.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Shadow Posts</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-amber-500">
                <Zap className="w-5 h-5" />
                {totalBoosted < 0.01 ? totalBoosted.toFixed(4) : totalBoosted.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Total SOL</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-green-500">
                <TrendingUp className="w-5 h-5" />
                {avgBoost.toFixed(3)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Avg Boost</p>
            </div>
          </div>
        </div>
      </div>

      {/* Shadow Posts Section */}
      <div className="border-t border-border">
        {/* Tabs/Sort */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <EyeOff className="w-5 h-5 text-primary" />
            Shadow Posts
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy("boost")}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                sortBy === "boost"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Top Boosted
            </button>
            <button
              onClick={() => setSortBy("recent")}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                sortBy === "recent"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Recent
            </button>
          </div>
        </div>

        {/* Posts List */}
        {sortedPosts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <EyeOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No shadow posts yet</p>
            <p className="text-sm mt-2">Be the first to post anonymously about @{username}</p>
          </div>
        ) : (
          <div>
            {sortedPosts.map((post, index) => (
              <ShadowPostCard
                key={post.pubkey}
                post={post}
                rank={sortBy === "boost" ? index + 1 : 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function XProfilePage() {
  return (
    <AppLayout>
      <XProfileContent />
    </AppLayout>
  );
}
