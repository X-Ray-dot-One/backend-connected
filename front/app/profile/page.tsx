"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { useMode } from "@/contexts/mode-context";
import { useAuth } from "@/contexts/auth-context";
import { useShadow } from "@/contexts/shadow-context";
import { useToast } from "@/components/toast";
import { FollowersModal } from "@/components/followers-modal";
import * as api from "@/lib/api";
import { formatSol } from "@/lib/shadow/postService";
import { getPostsForTarget, type TargetPost } from "@/lib/shadow/targetProfile";
import {
  Heart,
  MessageCircle,
  Share,
  MapPin,
  Link as LinkIcon,
  Edit3,
  EyeOff,
  X,
  Camera,
  Loader2,
  Wallet,
  Plus,
  Key,
  RefreshCw,
  ExternalLink,
  Zap,
  Target,
  Crown,
  LogOut,
} from "lucide-react";

import { getImageUrl, getDefaultAvatar, DEFAULT_BANNER } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

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

// Cache for shadow wallet names
const shadowNameCache = new Map<string, string>();
// Cache for premium status and profile picture
const premiumCache = new Map<string, { isPremium: boolean; profilePicture: string | null }>();

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

async function checkPremiumStatus(authorPubkey: string): Promise<{ isPremium: boolean; profilePicture: string | null }> {
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

function getTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Extract username from target URL
function extractTargetUsername(target: string): { name: string; platform: string } {
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

// Shadow post card component for posts targeting this user
function ShadowPostCard({ post, rank, total }: { post: TargetPost; rank: number; total: number }) {
  const [authorName, setAuthorName] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumPfp, setPremiumPfp] = useState<string | null>(null);

  useEffect(() => {
    getShadowName(post.author).then(setAuthorName);
    checkPremiumStatus(post.author).then((result) => {
      setIsPremium(result.isPremium);
      setPremiumPfp(result.profilePicture);
    });
  }, [post.author]);

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
          <div className="flex items-center gap-2 flex-wrap">
            {/* Shadow identity name - pink for premium */}
            <span className={`font-medium ${isPremium ? "text-pink-500" : "text-primary"}`}>
              {authorName || "anonymous"}
            </span>

            <span className="text-muted-foreground text-sm">
              {getTimeAgo(post.timestamp)}
            </span>
          </div>

          {/* Content */}
          <p className="mt-2 text-foreground font-sans text-base leading-relaxed">
            {post.content}
          </p>

          {/* Footer: Bid and Rank */}
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

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isShadowMode } = useMode();
  const { user, isAuthenticated, isLoading: authLoading, refreshUser, stats: authStats, logout } = useAuth();
  const {
    isUnlocked: isShadowUnlocked,
    wallets: shadowWallets,
    selectedWallet,
    selectedWalletIndex,
    stats: shadowStats,
    isLoading: shadowLoading,
    unlockShadowWallets,
    generateNewWallet,
    selectWallet,
    refreshStats: refreshShadowStats,
    refreshBalances,
  } = useShadow();
  const { showToast } = useToast();
  const initialTab = searchParams.get("tab") === "shadow" ? "shadow" : "posts";
  const [activeTab, setActiveTab] = useState<"posts" | "replies" | "likes" | "shadow">(initialTab);
  const [shadowTab, setShadowTab] = useState<"top" | "posts" | "history">("top");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFollowersModalOpen, setIsFollowersModalOpen] = useState(false);
  const [followersModalTab, setFollowersModalTab] = useState<"followers" | "following">("followers");
  const [posts, setPosts] = useState<api.Post[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [replies, setReplies] = useState<api.UserReply[]>([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const [likedPosts, setLikedPosts] = useState<api.Post[]>([]);
  const [isLoadingLikes, setIsLoadingLikes] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localPostsCount, setLocalPostsCount] = useState(0);
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Shadow posts targeting this user
  const [shadowPostsTargetingMe, setShadowPostsTargetingMe] = useState<TargetPost[]>([]);
  const [isLoadingShadowPosts, setIsLoadingShadowPosts] = useState(false);
  const [shadowSortBy, setShadowSortBy] = useState<"boost" | "recent">("boost");

  // Premium status and pfp for selected shadow wallet
  const [isSelectedWalletPremium, setIsSelectedWalletPremium] = useState(false);
  const [selectedWalletPremiumPfp, setSelectedWalletPremiumPfp] = useState<string | null>(null);

  // Combine auth stats with local posts count
  const stats = { ...authStats, posts: localPostsCount };

  // Edit form state
  const [editForm, setEditForm] = useState({
    username: "",
    bio: "",
    location: "",
    website: "",
  });
  const [websiteError, setWebsiteError] = useState<string | null>(null);

  // Image upload states
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [bannerPicture, setBannerPicture] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Load user posts
  useEffect(() => {
    if (user?.id) {
      loadPosts();
    }
  }, [user?.id]);

  // Load replies when tab is selected
  useEffect(() => {
    if (activeTab === "replies" && user?.id && replies.length === 0 && !isLoadingReplies) {
      setIsLoadingReplies(true);
      api.getUserReplies(user.id).then((res) => {
        if (res.success) setReplies(res.replies);
      }).catch(console.error).finally(() => setIsLoadingReplies(false));
    }
  }, [activeTab, user?.id]);

  // Load liked posts when tab is selected
  useEffect(() => {
    if (activeTab === "likes" && user?.id && likedPosts.length === 0 && !isLoadingLikes) {
      setIsLoadingLikes(true);
      api.getUserLikedPosts(user.id).then((res) => {
        if (res.success) setLikedPosts(res.posts);
      }).catch(console.error).finally(() => setIsLoadingLikes(false));
    }
  }, [activeTab, user?.id]);

  // Load shadow posts targeting me (load on mount to show count in tab)
  useEffect(() => {
    const loadShadowPosts = async () => {
      if (!user?.username) return;
      setIsLoadingShadowPosts(true);
      try {
        // The target URL format for X-RAY users
        const targetUrl = `https://xray.one/user/${user.username}`;
        const posts = await getPostsForTarget(targetUrl);
        setShadowPostsTargetingMe(posts);
      } catch (error) {
        console.error("Failed to load shadow posts:", error);
      } finally {
        setIsLoadingShadowPosts(false);
      }
    };

    if (user?.username) {
      loadShadowPosts();
    }
  }, [user?.username]);

  // Update edit form when user changes
  useEffect(() => {
    if (user) {
      setEditForm({
        username: user.username || "",
        bio: user.bio || "",
        location: user.location || "",
        website: user.website || "",
      });
    }
  }, [user]);

  // Check premium status when selected shadow wallet changes
  useEffect(() => {
    if (selectedWallet?.publicKey) {
      checkPremiumStatus(selectedWallet.publicKey).then((result) => {
        setIsSelectedWalletPremium(result.isPremium);
        setSelectedWalletPremiumPfp(result.profilePicture);
      });
    } else {
      setIsSelectedWalletPremium(false);
      setSelectedWalletPremiumPfp(null);
    }
  }, [selectedWallet?.publicKey]);

  const loadPosts = async () => {
    if (!user?.id) return;
    setIsLoadingPosts(true);
    try {
      const response = await api.getPosts({ userId: user.id });
      setPosts(response.posts || []);
      setLocalPostsCount(response.posts?.length || 0);
    } catch (error) {
      console.error("Failed to load posts:", error);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  const handleProfilePictureSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast("Please select a valid image (JPEG, PNG, GIF, or WebP)", "error");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast("Profile picture must be less than 20MB", "error");
      return;
    }

    setProfilePicture(file);
    setProfilePreview(URL.createObjectURL(file));
  };

  const handleBannerPictureSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast("Please select a valid image (JPEG, PNG, GIF, or WebP)", "error");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast("Banner must be less than 20MB", "error");
      return;
    }

    setBannerPicture(file);
    setBannerPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async () => {
    if (websiteError) return;
    setIsSaving(true);
    try {
      // Use FormData to support file upload
      const formData = new FormData();
      formData.append('username', editForm.username);
      formData.append('bio', editForm.bio);
      formData.append('location', editForm.location);
      formData.append('website', editForm.website);

      if (profilePicture) {
        formData.append('profile_picture', profilePicture);
      }
      if (bannerPicture) {
        formData.append('banner_picture', bannerPicture);
      }

      const response = await fetch(`${API_BASE}/?action=update-profile`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.errors?.[0] || 'Failed to update profile');
      }

      await refreshUser();
      setIsEditModalOpen(false);
      // Clear file states
      setProfilePicture(null);
      setBannerPicture(null);
      setProfilePreview(null);
      setBannerPreview(null);
    } catch (error) {
      console.error("Failed to update profile:", error);
      showToast(error instanceof Error ? error.message : "Failed to update profile", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleLike = async (postId: number) => {
    try {
      const response = await api.toggleLike(postId);
      const updater = (post: api.Post) =>
        post.id === postId
          ? { ...post, has_liked: response.action === 'liked', like_count: response.like_count }
          : post;
      setPosts(posts.map(updater));
      setLikedPosts(likedPosts.map(updater));
    } catch (error) {
      console.error("Failed to toggle like:", error);
    }
  };

  const handleShare = async (postId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/post/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied to clipboard!", "success");
    } catch (error) {
      console.error("Failed to copy link:", error);
      showToast("Failed to copy link", "error");
    }
  };

  const handlePostClick = (postId: number) => {
    router.push(`/post/${postId}`);
  };

  // Location options - Countries and major cities
  const locationOptions = [
    // Popular cities
    { label: "New York, USA", value: "New York, USA" },
    { label: "Los Angeles, USA", value: "Los Angeles, USA" },
    { label: "San Francisco, USA", value: "San Francisco, USA" },
    { label: "Miami, USA", value: "Miami, USA" },
    { label: "London, UK", value: "London, UK" },
    { label: "Paris, France", value: "Paris, France" },
    { label: "Berlin, Germany", value: "Berlin, Germany" },
    { label: "Amsterdam, Netherlands", value: "Amsterdam, Netherlands" },
    { label: "Dubai, UAE", value: "Dubai, UAE" },
    { label: "Singapore", value: "Singapore" },
    { label: "Hong Kong", value: "Hong Kong" },
    { label: "Tokyo, Japan", value: "Tokyo, Japan" },
    { label: "Seoul, South Korea", value: "Seoul, South Korea" },
    { label: "Sydney, Australia", value: "Sydney, Australia" },
    { label: "Toronto, Canada", value: "Toronto, Canada" },
    { label: "São Paulo, Brazil", value: "São Paulo, Brazil" },
    { label: "Mexico City, Mexico", value: "Mexico City, Mexico" },
    { label: "Mumbai, India", value: "Mumbai, India" },
    { label: "Lisbon, Portugal", value: "Lisbon, Portugal" },
    { label: "Zurich, Switzerland", value: "Zurich, Switzerland" },
    // Countries
    { label: "United States", value: "United States" },
    { label: "United Kingdom", value: "United Kingdom" },
    { label: "France", value: "France" },
    { label: "Germany", value: "Germany" },
    { label: "Spain", value: "Spain" },
    { label: "Italy", value: "Italy" },
    { label: "Netherlands", value: "Netherlands" },
    { label: "Switzerland", value: "Switzerland" },
    { label: "Portugal", value: "Portugal" },
    { label: "Canada", value: "Canada" },
    { label: "Australia", value: "Australia" },
    { label: "Japan", value: "Japan" },
    { label: "South Korea", value: "South Korea" },
    { label: "India", value: "India" },
    { label: "Brazil", value: "Brazil" },
    { label: "Mexico", value: "Mexico" },
    { label: "Argentina", value: "Argentina" },
    { label: "Indonesia", value: "Indonesia" },
    { label: "Thailand", value: "Thailand" },
    { label: "Vietnam", value: "Vietnam" },
  ];

  // Dangerous TLDs and patterns to check
  const validateWebsite = (url: string): string | null => {
    if (!url) return null;

    const lowercaseUrl = url.toLowerCase();

    // Dangerous TLDs often used for scams
    const dangerousTlds = [".ru", ".cn", ".tk", ".ml", ".ga", ".cf", ".gq", ".zip", ".mov"];
    for (const tld of dangerousTlds) {
      if (lowercaseUrl.endsWith(tld)) {
        return `Warning: ${tld} domains are often associated with scams`;
      }
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      { pattern: /metamask|phantom|ledger|trezor/i, message: "Warning: Impersonating wallet providers is prohibited" },
      { pattern: /binance|coinbase|kraken|ftx/i, message: "Warning: Impersonating exchanges is prohibited" },
      { pattern: /airdrop|freecrypto|freesol|giveaway/i, message: "Warning: Potential scam detected (airdrop/giveaway)" },
      { pattern: /login|signin|verify|security/i, message: "Warning: Potential phishing site detected" },
    ];

    for (const { pattern, message } of suspiciousPatterns) {
      if (pattern.test(lowercaseUrl)) {
        return message;
      }
    }

    // Check for IP addresses (often used in phishing)
    if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(lowercaseUrl)) {
      return "Warning: IP-based URLs are not allowed";
    }

    return null;
  };

  const handleWebsiteChange = (value: string) => {
    setEditForm({ ...editForm, website: value });
    const error = validateWebsite(value);
    setWebsiteError(error);
  };

  // Loading state
  if (authLoading && !isShadowMode) {
    return (
      <div className="border-x border-border min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // In shadow mode, skip the auth check - we'll handle it in the shadow section
  // Not authenticated state (only for public mode)
  if (!isShadowMode && (!isAuthenticated || !user)) {
    return (
      <div className="border-x border-border min-h-screen flex flex-col items-center justify-center p-8">
        <Wallet className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Connect your wallet</h2>
        <p className="text-muted-foreground text-center mb-4">
          Connect your Solana wallet to view your profile
        </p>
        <a
          href="/"
          className="px-6 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go to Home
        </a>
      </div>
    );
  }

  // Handle shadow wallet unlock
  const handleUnlockShadow = async () => {
    // Get connected wallet from Phantom directly
    const phantom = (window as unknown as { phantom?: { solana?: { publicKey?: { toString: () => string }, signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array }>, connect: () => Promise<{ publicKey: { toString: () => string } }> } } }).phantom?.solana;
    if (!phantom) {
      showToast("Please install Phantom wallet", "error");
      return;
    }

    // Try to get wallet address from Phantom
    let walletAddress: string;
    try {
      if (phantom.publicKey) {
        walletAddress = phantom.publicKey.toString();
      } else {
        const { publicKey } = await phantom.connect();
        walletAddress = publicKey.toString();
      }
    } catch {
      showToast("Please connect your Phantom wallet", "error");
      return;
    }

    if (!walletAddress) return;

    setIsUnlocking(true);
    try {
      await unlockShadowWallets(walletAddress, async (message: Uint8Array) => {
        const { signature } = await phantom.signMessage(message);
        return signature;
      });
      showToast("Shadow wallets unlocked!", "success");
    } catch (error) {
      console.error("Failed to unlock shadow wallets:", error);
      showToast("Failed to unlock shadow wallets", "error");
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleGenerateWallet = async () => {
    try {
      await generateNewWallet();
      showToast("New shadow wallet generated!", "success");
    } catch (error) {
      console.error("Failed to generate wallet:", error);
      showToast("Failed to generate wallet", "error");
    }
  };

  if (isShadowMode) {
    // Not unlocked yet - show unlock screen
    if (!isShadowUnlocked) {
      return (
        <div className="border-x border-border min-h-screen flex flex-col items-center justify-center p-8">
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-6">
            <Key className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Unlock Shadow Wallets</h2>
          <p className="text-muted-foreground text-center mb-6 max-w-md">
            Sign a message with your wallet to unlock your anonymous shadow identities.
            This signature is used to derive your shadow wallets deterministically.
          </p>
          <button
            onClick={handleUnlockShadow}
            disabled={isUnlocking}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isUnlocking ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Signing...
              </>
            ) : (
              <>
                <Key className="w-5 h-5" />
                Sign to Unlock
              </>
            )}
          </button>
        </div>
      );
    }

    // Unlocked - show shadow profile
    return (
      <div className="border-x border-border min-h-screen">
        {/* Selected Wallet Info */}
        {selectedWallet ? (
          <>
            {/* Banner */}
            <div className={`h-32 relative ${isSelectedWalletPremium ? "bg-gradient-to-r from-pink-500/30 to-purple-500/30" : "bg-gradient-to-r from-primary/20 to-primary/10"}`} />

            {/* Profile Info */}
            <div className="px-4 pb-4 relative">
              {/* Avatar + Actions row */}
              <div className="flex items-end justify-between -mt-12">
                <div className={`w-24 h-24 rounded-full border-4 border-background flex items-center justify-center overflow-hidden ${
                  isSelectedWalletPremium ? "bg-pink-500/20" : "bg-primary/20"
                }`}>
                  {selectedWalletPremiumPfp ? (
                    <img
                      src={getImageUrl(selectedWalletPremiumPfp, "")}
                      alt="Premium avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className={`text-3xl font-bold ${isSelectedWalletPremium ? "text-pink-500" : "text-primary"}`}>
                      {selectedWallet.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                {isSelectedWalletPremium && (
                  <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-pink-500/20 text-pink-500 rounded-full mb-1">
                    <Crown className="w-3 h-3" />
                    premium
                  </span>
                )}
              </div>

              {/* Name & Handle */}
              <div className="mt-3">
                <h1 className={`text-xl font-bold ${isSelectedWalletPremium ? "text-pink-500" : "text-primary"}`}>{selectedWallet.name}</h1>
                <p className="text-sm text-muted-foreground font-mono">
                  {selectedWallet.publicKey.slice(0, 8)}...{selectedWallet.publicKey.slice(-8)}
                </p>
                <a
                  href={`https://explorer.solana.com/address/${selectedWallet.publicKey}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                >
                  View on Explorer <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Shadow Stats */}
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{shadowStats?.totalPosts || 0}</p>
                  <p className="text-xs text-muted-foreground">total posts</p>
                </div>
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{shadowStats?.avgBoost.toFixed(3) || "0"} SOL</p>
                  <p className="text-xs text-muted-foreground">avg boost</p>
                </div>
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">#{shadowStats?.avgPosition.toFixed(1) || "0"}</p>
                  <p className="text-xs text-muted-foreground">avg position</p>
                </div>
              </div>

              {/* Total spent */}
              <div className="mt-4 flex items-center gap-3">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">total spent</span>
                <span className="text-xl font-bold text-amber-500">
                  {shadowStats ? formatSol(shadowStats.totalSpent) : "0"} SOL
                </span>
              </div>
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
              {shadowLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : !shadowStats?.posts || shadowStats.posts.length === 0 ? (
                <div className="p-8 text-center">
                  <EyeOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No shadow posts yet</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Create a shadow post to see it here
                  </p>
                </div>
              ) : (
                <>
                  {/* Filter posts based on tab */}
                  {(shadowTab === "top" ? shadowStats.posts.slice(0, 10) : shadowStats.posts).map((post) => {
                    const targetInfo = extractTargetUsername(post.target);
                    const handleTargetClick = () => {
                      if (targetInfo.platform === "X") {
                        router.push(`/user/x/${targetInfo.name}?tab=shadow`);
                      } else {
                        router.push(`/user/${targetInfo.name}?tab=shadow`);
                      }
                    };

                    return (
                      <div
                        key={post.pubkey}
                        className="p-4 border-b border-primary/10 hover:bg-primary/5 transition-colors group"
                      >
                        <div className="flex items-start gap-3">
                          {/* Avatar - custom pfp for premium, anonymous icon for others */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${
                            isSelectedWalletPremium ? "bg-pink-500/20" : "bg-primary/20"
                          }`}>
                            {selectedWalletPremiumPfp ? (
                              <img
                                src={getImageUrl(selectedWalletPremiumPfp, "")}
                                alt="Premium avatar"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <EyeOff className={`w-5 h-5 ${isSelectedWalletPremium ? "text-pink-500" : "text-primary"}`} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-medium ${isSelectedWalletPremium ? "text-pink-500" : "text-primary"}`}>{selectedWallet.name}</span>
                              <span className="text-muted-foreground/50">·</span>
                              <span className="text-muted-foreground text-sm">
                                {getTimeAgo(post.timestamp)}
                              </span>
                            </div>

                            {/* Target line - clickable */}
                            <div className="flex items-center gap-1 mt-1">
                              <Target className="w-3 h-3 text-muted-foreground" />
                              <span className="text-muted-foreground text-sm">targeting</span>
                              <button
                                onClick={handleTargetClick}
                                className="text-cyan-400 font-medium hover:underline"
                              >
                                @{targetInfo.name}
                              </button>
                              <span className="text-muted-foreground/60 text-xs">
                                ({targetInfo.platform})
                              </span>
                            </div>

                            {/* Post content */}
                            <p className="mt-2 text-foreground">{post.content}</p>

                            {/* Footer with SOL badge and rank */}
                            <div className="flex items-center gap-3 mt-3">
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-sm font-medium">
                                {formatSol(post.bid)} SOL
                              </span>
                              <span className="text-sm text-muted-foreground">
                                #{post.rank} of {post.totalForTarget}
                              </span>
                              <a
                                href={`https://explorer.solana.com/address/${post.pubkey}?cluster=devnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1 ml-auto"
                              >
                                Explorer <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="p-8 text-center">
            <EyeOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">select a shadow identity from the dropdown </p>
          </div>
        )}
      </div>
    );
  }

  // Public Mode Profile - user is guaranteed to exist here
  const avatarUrl = getImageUrl(user!.profile_picture, getDefaultAvatar(user!.wallet_address));
  const bannerUrl = getImageUrl(user!.banner_picture, DEFAULT_BANNER);

  // For edit modal - use preview if available, otherwise current image
  const editAvatarUrl = profilePreview || avatarUrl;
  const editBannerUrl = bannerPreview || bannerUrl;
  const displayName = user!.username ? `@${user!.username}` : "Anonymous";
  const truncatedWallet = `${user!.wallet_address.slice(0, 6)}...${user!.wallet_address.slice(-4)}`;

  return (
    <div className="border-x border-border min-h-screen">
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
          <div className="flex gap-2 mb-1">
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-foreground hover:bg-muted transition-colors text-xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              onClick={logout}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Name & Handle */}
        <div className="mt-3">
          <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
          <p className="text-sm text-muted-foreground">{truncatedWallet}</p>
        </div>

        {/* Bio */}
        {user?.bio && <p className="mt-3 text-foreground">{user.bio}</p>}

        {/* Meta Info */}
        <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
          {user?.location && (
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>{user.location}</span>
            </div>
          )}
          {user?.website && (
            <div className="flex items-center gap-1">
              <LinkIcon className="w-4 h-4" />
              <a href={`https://${user.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{user.website}</a>
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
          onClick={() => setActiveTab("likes")}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            activeTab === "likes" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Likes
          {activeTab === "likes" && (
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
            shadow
            <span className={`px-1.5 py-0.5 text-xs rounded-full min-w-[20px] ${
              shadowPostsTargetingMe.length > 0
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground"
            }`}>
              {shadowPostsTargetingMe.length}
            </span>
          </span>
          {activeTab === "shadow" && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-full" />
          )}
        </button>
      </div>

      {/* Content based on active tab */}
      <div>
        {/* Shadow posts targeting me */}
        {activeTab === "shadow" && (
          <>
            {/* Header with sort buttons */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary/5">
              <span className="text-sm text-muted-foreground">
                // anonymous posts mentioning <span className="text-primary">@{user?.username}</span>
              </span>
              <div className="flex gap-2">
                <span className="text-sm text-muted-foreground mr-2">sort:</span>
                <button
                  onClick={() => setShadowSortBy("boost")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    shadowSortBy === "boost"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  top boosted
                </button>
                <button
                  onClick={() => setShadowSortBy("recent")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    shadowSortBy === "recent"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  recent
                </button>
              </div>
            </div>

            {isLoadingShadowPosts ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : shadowPostsTargetingMe.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <EyeOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No shadow posts about you yet</p>
                <p className="text-sm mt-2">When someone posts anonymously about you, it will appear here</p>
              </div>
            ) : (
              [...shadowPostsTargetingMe]
                .sort((a, b) => shadowSortBy === "boost" ? Number(b.bid - a.bid) : b.timestamp - a.timestamp)
                .map((post, index) => (
                  <ShadowPostCard key={post.pubkey} post={post} rank={index + 1} total={shadowPostsTargetingMe.length} />
                ))
            )}
          </>
        )}

        {/* Regular posts */}
        {activeTab === "posts" && (isLoadingPosts ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No posts yet</p>
          </div>
        ) : posts.map((post) => (
          <div
            key={post.id}
            onClick={() => handlePostClick(post.id)}
            className="p-4 border-b border-primary/10 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <div className="flex gap-3">
              <a
                href={`/user/${user?.username}`}
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
                    href={`/user/${user?.username}`}
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
        )))}

        {/* Replies Tab */}
        {activeTab === "replies" && (isLoadingReplies ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : replies.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No replies yet</p>
          </div>
        ) : replies.map((reply) => (
          <div
            key={reply.comment_id}
            onClick={() => router.push(`/post/${reply.post_id}`)}
            className="p-4 border-b border-primary/10 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            {/* Replying to */}
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
              <MessageCircle className="w-3 h-3" />
              <span>Replying to</span>
              <a
                href={`/user/${reply.post_username}`}
                className="text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                @{reply.post_username}
              </a>
            </div>
            {/* Original post preview */}
            <div className="ml-4 pl-3 border-l-2 border-primary/20 mb-2">
              <p className="text-sm text-muted-foreground line-clamp-2">{reply.post_content}</p>
            </div>
            {/* Reply content */}
            <div className="flex gap-3">
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-10 h-10 rounded-full flex-shrink-0 ring-2 ring-primary/20 object-cover"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-primary">{displayName}</span>
                  <span className="text-muted-foreground text-sm">{reply.time_ago}</span>
                </div>
                <p className="mt-1 text-foreground font-sans">
                  {renderContentWithMentions(reply.comment_content)}
                </p>
              </div>
            </div>
          </div>
        )))}

        {/* Likes Tab */}
        {activeTab === "likes" && (isLoadingLikes ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : likedPosts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No liked posts yet</p>
          </div>
        ) : likedPosts.map((post) => (
          <div
            key={post.id}
            onClick={() => handlePostClick(post.id)}
            className="p-4 border-b border-primary/10 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <div className="flex gap-3">
              <a
                href={`/user/${post.username}`}
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={getImageUrl(post.profile_picture, getDefaultAvatar(post.wallet_address || post.username || "user"))}
                  alt={post.username || "User"}
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
                    {post.username || "Anonymous"}
                  </a>
                  <span className="text-muted-foreground text-sm">{post.time_ago}</span>
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
        )))}
      </div>

      {/* Edit Profile Modal */}
      {isEditModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setIsEditModalOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center md:p-4">
            <div className="bg-background border-0 md:border border-border md:rounded-2xl w-full max-w-lg shadow-xl h-full md:h-auto md:max-h-[90vh] overflow-y-auto pb-20 md:pb-0">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setIsEditModalOpen(false)}
                    className="p-1 rounded-full hover:bg-muted transition-colors"
                  >
                    <X className="w-5 h-5 text-foreground" />
                  </button>
                  <h2 className="text-lg font-bold text-foreground">Edit profile</h2>
                </div>
                <button
                  onClick={handleSaveProfile}
                  disabled={!!websiteError || isSaving}
                  className={`px-4 py-1.5 rounded-full font-medium text-sm transition-opacity flex items-center gap-2 ${
                    websiteError || isSaving
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-foreground text-background hover:opacity-90"
                  }`}
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save
                </button>
              </div>

              {/* Banner & Avatar */}
              <div className="relative">
                <div className="h-32 relative">
                  <img
                    src={editBannerUrl}
                    alt="Banner"
                    className="w-full h-full object-cover"
                  />
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={handleBannerPictureSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => bannerInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity"
                  >
                    <div className="p-2 rounded-full bg-black/50">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                  </button>
                </div>
                <div className="absolute -bottom-12 left-4">
                  <div className="relative">
                    <img
                      src={editAvatarUrl}
                      alt={displayName}
                      className="w-24 h-24 rounded-full border-4 border-background object-cover"
                    />
                    <input
                      ref={profileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      onChange={handleProfilePictureSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => profileInputRef.current?.click()}
                      className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full opacity-0 hover:opacity-100 transition-opacity"
                    >
                      <div className="p-2 rounded-full bg-black/50">
                        <Camera className="w-5 h-5 text-white" />
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Form Fields */}
              <div className="px-4 pt-16 pb-4 space-y-4">
                {/* Username */}
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Username</label>
                  <input
                    type="text"
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    placeholder="Enter username"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Bio</label>
                  <textarea
                    value={editForm.bio}
                    onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                    rows={3}
                    placeholder="Tell us about yourself"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>

                {/* Location */}
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Location</label>
                  <select
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                  >
                    <option value="">Select a location</option>
                    <optgroup label="Popular Cities">
                      {locationOptions.slice(0, 20).map((loc) => (
                        <option key={loc.value} value={loc.value}>
                          {loc.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Countries">
                      {locationOptions.slice(20).map((loc) => (
                        <option key={loc.value} value={loc.value}>
                          {loc.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Website */}
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Website</label>
                  <input
                    type="text"
                    value={editForm.website}
                    onChange={(e) => handleWebsiteChange(e.target.value)}
                    placeholder="your-website.com"
                    className={`w-full px-3 py-2 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 ${
                      websiteError
                        ? "border-red-500 focus:ring-red-500"
                        : "border-border focus:ring-primary"
                    }`}
                  />
                  {websiteError && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <span className="inline-block w-4 h-4">⚠️</span>
                      {websiteError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Followers/Following Modal */}
      {user && (
        <FollowersModal
          isOpen={isFollowersModalOpen}
          onClose={() => setIsFollowersModalOpen(false)}
          userId={user.id}
          username={user.username || user.wallet_address.slice(0, 8)}
          initialTab={followersModalTab}
          followersCount={stats.followers}
          followingCount={stats.following}
        />
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AppLayout>
      <ProfileContent />
    </AppLayout>
  );
}
