"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { useAuth } from "@/contexts/auth-context";
import * as api from "@/lib/api";
import { getImageUrl, getDefaultAvatar, DEFAULT_BANNER } from "@/lib/utils";

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
import {
  Heart,
  MessageCircle,
  Share,
  MapPin,
  Link as LinkIcon,
  ArrowLeft,
  Loader2,
  UserPlus,
  UserMinus,
  UserX,
  EyeOff,
  Zap,
} from "lucide-react";
import { getPostsForTarget, type TargetPost } from "@/lib/shadow/targetProfile";
import { formatSol } from "@/lib/shadow/postService";
import { useToast } from "@/components/toast";
import { FollowersModal } from "@/components/followers-modal";

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

// Shadow post card component
function ShadowPostCard({ post, rank, total }: { post: TargetPost; rank: number; total: number }) {
  const [authorName, setAuthorName] = useState<string | null>(null);

  useEffect(() => {
    getShadowName(post.author).then(setAuthorName);
  }, [post.author]);

  return (
    <div className="p-4 border-b border-primary/10 hover:bg-primary/5 transition-colors">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full flex-shrink-0 bg-primary/20 flex items-center justify-center ring-2 ring-primary/30">
          <EyeOff className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-primary">
              {authorName || "anonymous"}
            </span>
            <span className="text-muted-foreground text-sm">
              {getTimeAgo(post.timestamp)}
            </span>
          </div>
          <p className="mt-2 text-foreground font-sans break-words whitespace-pre-wrap">
            {post.content}
          </p>
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-amber-500">
                {formatSol(post.bid)} SOL
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              #{rank} of {total}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ProfileUser {
  id: number;
  username: string | null;
  wallet_address: string;
  profile_picture: string | null;
  banner_picture: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  created_at: string;
}

function UserProfileContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const username = params.username as string;
  const { user: currentUser, isAuthenticated, updateFollowingCount } = useAuth();

  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [stats, setStats] = useState({ followers: 0, following: 0, posts: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [posts, setPosts] = useState<api.Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialTab = searchParams.get("tab") === "shadow" ? "shadow" : "posts";
  const [activeTab, setActiveTab] = useState<"posts" | "replies" | "likes" | "shadow">(initialTab);
  const { showToast } = useToast();
  const [isFollowersModalOpen, setIsFollowersModalOpen] = useState(false);
  const [followersModalTab, setFollowersModalTab] = useState<"followers" | "following">("followers");

  // Shadow posts targeting this user
  const [shadowPosts, setShadowPosts] = useState<TargetPost[]>([]);
  const [isLoadingShadowPosts, setIsLoadingShadowPosts] = useState(false);

  // Load user profile
  useEffect(() => {
    if (username) {
      loadProfile();
    }
  }, [username]);

  // Load posts when profile is loaded
  useEffect(() => {
    if (profileUser?.id) {
      loadPosts();
    }
  }, [profileUser?.id]);

  // Load shadow posts targeting this user
  useEffect(() => {
    const loadShadowPosts = async () => {
      if (!profileUser?.username) return;
      setIsLoadingShadowPosts(true);
      try {
        const targetUrl = `https://xray.one/user/${profileUser.username}`;
        const posts = await getPostsForTarget(targetUrl);
        setShadowPosts(posts);
      } catch (error) {
        console.error("Failed to load shadow posts:", error);
      } finally {
        setIsLoadingShadowPosts(false);
      }
    };

    if (profileUser?.username) {
      loadShadowPosts();
    }
  }, [profileUser?.username]);

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.getUserProfile(username);
      setProfileUser(response.user);
      setStats(response.stats);
      setIsFollowing(response.is_following);
      setIsOwnProfile(response.is_own_profile);
    } catch (err) {
      console.error("Failed to load profile:", err);
      setError(err instanceof Error ? err.message : "User not found");
    } finally {
      setIsLoading(false);
    }
  };

  const loadPosts = async () => {
    if (!profileUser?.id) return;
    setIsLoadingPosts(true);
    try {
      const response = await api.getPosts({ userId: profileUser.id });
      setPosts(response.posts || []);
    } catch (err) {
      console.error("Failed to load posts:", err);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  const handleFollow = async () => {
    if (!profileUser || !isAuthenticated) return;
    setIsFollowLoading(true);
    try {
      if (isFollowing) {
        const response = await api.unfollowUser(profileUser.id);
        setIsFollowing(false);
        setStats(prev => ({ ...prev, followers: prev.followers - 1 }));
        // Update current user's following count in auth context
        if (response.my_following_count !== undefined) {
          updateFollowingCount(response.my_following_count);
        }
      } else {
        const response = await api.followUser(profileUser.id);
        setIsFollowing(true);
        setStats(prev => ({ ...prev, followers: prev.followers + 1 }));
        // Update current user's following count in auth context
        if (response.my_following_count !== undefined) {
          updateFollowingCount(response.my_following_count);
        }
      }
    } catch (err) {
      console.error("Failed to follow/unfollow:", err);
    } finally {
      setIsFollowLoading(false);
    }
  };

  const handleToggleLike = async (postId: number) => {
    try {
      const response = await api.toggleLike(postId);
      setPosts(posts.map(post =>
        post.id === postId
          ? { ...post, has_liked: response.action === 'liked', like_count: response.like_count }
          : post
      ));
    } catch (err) {
      console.error("Failed to toggle like:", err);
    }
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

  const handlePostClick = (postId: number) => {
    router.push(`/post/${postId}`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="border-x border-border min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state - user not found
  if (error || !profileUser) {
    return (
      <div className="border-x border-border min-h-screen">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="flex items-center gap-4 px-4 py-3">
            <a href="/" className="p-2 rounded-full hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </a>
            <h1 className="text-xl font-bold text-foreground">Profile</h1>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center p-8 mt-20">
          <UserX className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">User not found</h2>
          <p className="text-muted-foreground text-center mb-4">
            @{username} doesn&apos;t exist or has been removed
          </p>
          <a
            href="/"
            className="px-6 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Go to Home
          </a>
        </div>
      </div>
    );
  }

  const avatarUrl = getImageUrl(profileUser.profile_picture, getDefaultAvatar(profileUser.wallet_address));
  const bannerUrl = getImageUrl(profileUser.banner_picture, DEFAULT_BANNER);
  const displayName = profileUser.username ? `@${profileUser.username}` : "Anonymous";
  const handle = profileUser.username ? `@${profileUser.username}` : `${profileUser.wallet_address.slice(0, 4)}...${profileUser.wallet_address.slice(-4)}`;
  const truncatedWallet = `${profileUser.wallet_address.slice(0, 6)}...${profileUser.wallet_address.slice(-4)}`;

  return (
    <div className="border-x border-border min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-4 px-4 py-3">
          <a href="/" className="p-2 rounded-full hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </a>
          <div>
            <h1 className="text-xl font-bold text-foreground">{profileUser.username || "Profile"}</h1>
            <p className="text-sm text-muted-foreground">{stats.posts} posts</p>
          </div>
        </div>
      </div>

      {/* Banner */}
      <div className="h-32 relative">
        <img
          src={bannerUrl}
          alt="Banner"
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_BANNER; }}
        />
      </div>

      {/* Profile Info */}
      <div className="px-4 pb-4 relative">
        {/* Avatar + Actions row */}
        <div className="flex items-end justify-between -mt-12">
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-24 h-24 rounded-full border-4 border-background object-cover"
          />
          <div className="mb-1">
            {isOwnProfile ? (
              <a
                href="/profile"
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-border text-foreground hover:bg-muted transition-colors"
              >
                <span className="text-sm">Edit Profile</span>
              </a>
            ) : isAuthenticated ? (
              <button
                onClick={handleFollow}
                disabled={isFollowLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-colors ${
                  isFollowing
                    ? "border border-border text-foreground hover:border-red-500 hover:text-red-500 hover:bg-red-500/10"
                    : "bg-foreground text-background hover:bg-foreground/90"
                }`}
              >
                {isFollowLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isFollowing ? (
                  <>
                    <UserMinus className="w-4 h-4" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Follow</span>
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>

        {/* Name & Handle */}
        <div className="mt-3">
          <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
          <p className="text-muted-foreground">{truncatedWallet}</p>
        </div>

        {/* Bio */}
        {profileUser.bio && <p className="mt-3 text-foreground">{profileUser.bio}</p>}

        {/* Meta Info */}
        <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
          {profileUser.location && (
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>{profileUser.location}</span>
            </div>
          )}
          {profileUser.website && (
            <div className="flex items-center gap-1">
              <LinkIcon className="w-4 h-4" />
              <a href={`https://${profileUser.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {profileUser.website}
              </a>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-4 mt-4">
          <button
            onClick={() => {
              setFollowersModalTab("following");
              setIsFollowersModalOpen(true);
            }}
            className="flex items-center gap-1 hover:underline"
          >
            <span className="font-bold text-foreground">{stats.following.toLocaleString()}</span>
            <span className="text-muted-foreground">Following</span>
          </button>
          <button
            onClick={() => {
              setFollowersModalTab("followers");
              setIsFollowersModalOpen(true);
            }}
            className="flex items-center gap-1 hover:underline"
          >
            <span className="font-bold text-foreground">{stats.followers.toLocaleString()}</span>
            <span className="text-muted-foreground">Followers</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("posts")}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            activeTab === "posts" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Posts
          {activeTab === "posts" && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("replies")}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            activeTab === "replies" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Replies
          {activeTab === "replies" && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("shadow")}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            activeTab === "shadow" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <EyeOff className="w-4 h-4" />
            Shadow
            <span className={`px-1.5 py-0.5 text-xs rounded-full min-w-[20px] ${
              shadowPosts.length > 0
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground"
            }`}>
              {shadowPosts.length}
            </span>
          </span>
          {activeTab === "shadow" && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-full" />
          )}
        </button>
      </div>

      {/* Content */}
      <div>
        {activeTab === "shadow" ? (
          // Shadow posts tab
          isLoadingShadowPosts ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : shadowPosts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <EyeOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No shadow posts targeting {displayName}</p>
            </div>
          ) : (
            shadowPosts.map((post, index) => (
              <ShadowPostCard
                key={post.pubkey}
                post={post}
                rank={index + 1}
                total={shadowPosts.length}
              />
            ))
          )
        ) : isLoadingPosts ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No posts yet</p>
          </div>
        ) : activeTab === "posts" && posts.map((post) => (
          <div
            key={post.id}
            onClick={() => handlePostClick(post.id)}
            className="p-4 border-b border-primary/10 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <div className="flex gap-3">
              <a
                href={`/user/${profileUser.username}`}
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-10 h-10 rounded-full flex-shrink-0 ring-2 ring-primary/20 object-cover"
                />
              </a>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <a
                    href={`/user/${profileUser.username}`}
                    className="font-medium text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {displayName}
                  </a>
                  <span className="text-muted-foreground text-sm">
                    {truncatedWallet}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {post.time_ago}
                  </span>
                </div>
                <p className="mt-1 text-foreground font-sans">
                  {renderContentWithMentions(post.content)}
                </p>
                <div className="flex items-center gap-6 mt-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleLike(post.id);
                    }}
                    className={`flex items-center gap-1.5 transition-colors ${
                      post.has_liked ? "text-red-500" : "text-muted-foreground hover:text-red-500"
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${post.has_liked ? "fill-current" : ""}`} />
                    <span className="text-sm">{post.like_count}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/post/${post.id}`);
                    }}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
                  >
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
        ))}
      </div>

      {/* Followers/Following Modal */}
      {profileUser && (
        <FollowersModal
          isOpen={isFollowersModalOpen}
          onClose={() => setIsFollowersModalOpen(false)}
          userId={profileUser.id}
          username={profileUser.username || "user"}
          initialTab={followersModalTab}
          followersCount={stats.followers}
          followingCount={stats.following}
        />
      )}
    </div>
  );
}

export default function UserProfilePage() {
  return (
    <AppLayout>
      <UserProfileContent />
    </AppLayout>
  );
}
