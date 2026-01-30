"use client";

import { useState, useEffect, useRef } from "react";
import { X, Image, EyeOff, Target, Zap, Lock, Check, HelpCircle, ChevronDown, Plus, Loader2, Key, AlertCircle, Eye, ArrowDownToLine, Wallet, Crown, User } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as api from "@/lib/api";
import { getImageUrl } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { useShadow } from "@/contexts/shadow-context";
import { createShadowPost, buildTargetUrl, solToLamports, formatSol, transferToShadowWallet, getWalletBalance } from "@/lib/shadow/postService";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getBidPositionPreview, getTargetStats } from "@/lib/shadow/targetStats";
import { fetchXProfile, type TargetProfile } from "@/lib/shadow/targetProfile";

// X (Twitter) logo component
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
  userAvatar: string;
  username: string;
  isShadowMode?: boolean;
  onPostSuccess?: () => void;
}

const MAX_CHARS = 280;

// Boost tiers - SOL amount to estimated ranking position
// Higher SOL = lower position number (better ranking)
// More realistic values based on typical target audience size
const boostTiers = [
  { sol: 0.05, position: 1000 },
  { sol: 0.1, position: 500 },
  { sol: 0.25, position: 250 },
  { sol: 0.5, position: 100 },
  { sol: 1, position: 50 },
  { sol: 2.5, position: 20 },
  { sol: 5, position: 10 },
  { sol: 10, position: 5 },
  { sol: 25, position: 3 },
  { sol: 50, position: 2 },
  { sol: 100, position: 1 },
];

// Interpolate SOL to get any position (linear interpolation between tiers)
const getInterpolatedPosition = (sol: number): number => {
  // Below minimum
  if (sol <= boostTiers[0].sol) return boostTiers[0].position;
  // Above maximum
  if (sol >= boostTiers[boostTiers.length - 1].sol) return boostTiers[boostTiers.length - 1].position;

  // Find the two tiers we're between
  for (let i = 0; i < boostTiers.length - 1; i++) {
    const lower = boostTiers[i];
    const upper = boostTiers[i + 1];
    if (sol >= lower.sol && sol <= upper.sol) {
      // Linear interpolation
      const solRatio = (sol - lower.sol) / (upper.sol - lower.sol);
      const positionDiff = lower.position - upper.position; // Note: lower position number is better
      return Math.round(lower.position - solRatio * positionDiff);
    }
  }
  return boostTiers[0].position;
};

// Reverse lookup: position to SOL (with interpolation)
const getSOLForPosition = (targetPosition: number): number => {
  // Clamp position to valid range
  if (targetPosition >= boostTiers[0].position) return boostTiers[0].sol;
  if (targetPosition <= boostTiers[boostTiers.length - 1].position) return boostTiers[boostTiers.length - 1].sol;

  // Find the two tiers we're between
  for (let i = 0; i < boostTiers.length - 1; i++) {
    const lower = boostTiers[i];
    const upper = boostTiers[i + 1];
    if (targetPosition <= lower.position && targetPosition >= upper.position) {
      // Linear interpolation
      const positionRatio = (lower.position - targetPosition) / (lower.position - upper.position);
      const solDiff = upper.sol - lower.sol;
      return Math.round((lower.sol + positionRatio * solDiff) * 100) / 100; // Round to 2 decimals
    }
  }
  return boostTiers[0].sol;
};

// Get podium colors based on position
const getPositionStyle = (position: number) => {
  if (position === 1) return { bg: "bg-amber-400/20", text: "text-amber-500", border: "border-amber-400" }; // Gold
  if (position === 2) return { bg: "bg-slate-300/20", text: "text-slate-400", border: "border-slate-300" }; // Silver
  if (position === 3) return { bg: "bg-amber-600/20", text: "text-amber-700", border: "border-amber-600" }; // Bronze
  return { bg: "bg-primary/10", text: "text-primary", border: "border-primary/30" }; // Default
};

// Preview component showing how post will appear
function PostPreview({
  targetUser,
  targetPlatform,
  content,
  boostAmount,
  position,
  walletName,
}: {
  targetUser: string;
  targetPlatform: "xray" | "twitter";
  content: string;
  boostAmount: number;
  position: number;
  walletName: string;
}) {
  const [profile, setProfile] = useState<TargetProfile | null>(null);
  const [xrayProfile, setXrayProfile] = useState<api.UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const positionStyle = getPositionStyle(position);

  // Fetch profile data when target changes
  useEffect(() => {
    if (!targetUser) return;

    const loadProfile = async () => {
      setIsLoadingProfile(true);
      try {
        if (targetPlatform === "twitter") {
          // Fetch X/Twitter profile
          const targetUrl = `https://x.com/${targetUser}`;
          const xProfile = await fetchXProfile(targetUrl);
          setProfile(xProfile);
          setXrayProfile(null);
        } else {
          // Fetch X-RAY profile
          const response = await api.getUserProfile(targetUser);
          if (response.success) {
            setXrayProfile(response);
          }
          setProfile(null);
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadProfile();
  }, [targetUser, targetPlatform]);

  // Get display values
  const displayName = targetPlatform === "twitter"
    ? (profile?.name || targetUser)
    : (xrayProfile?.user?.username || targetUser);

  const profilePic = targetPlatform === "twitter"
    ? profile?.profilePicUrl
    : getImageUrl(xrayProfile?.user?.profile_picture, "");

  const bannerPic = targetPlatform === "twitter"
    ? profile?.bannerUrl
    : getImageUrl(xrayProfile?.user?.banner_picture, "");

  return (
    <div className="h-full flex flex-col bg-background rounded-xl border border-border overflow-hidden">
      {/* Mini header */}
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground font-medium">preview</span>
      </div>

      {/* Mini profile header */}
      <div className="relative">
        {/* Banner */}
        {bannerPic ? (
          <img src={bannerPic} alt="Banner" className="h-16 w-full object-cover" />
        ) : (
          <div className="h-16 bg-gradient-to-br from-primary/30 via-primary/20 to-accent/30" />
        )}

        {/* Profile pic + Username on banner */}
        <div className="absolute -bottom-4 left-3 flex items-end gap-2">
          {profilePic ? (
            <img src={profilePic} alt={targetUser} className="w-10 h-10 rounded-full border-2 border-background object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full border-2 border-background bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">{targetUser[0]?.toUpperCase()}</span>
            </div>
          )}
          <span className="px-2 py-1 rounded-full bg-black/60 text-white text-xs font-medium backdrop-blur-sm mb-1">
            @{targetUser}
          </span>
        </div>
      </div>

      {/* Shadow posts section */}
      <div className="flex-1 overflow-auto pt-5">
        <div className="px-3 py-2 border-y border-border bg-muted/20">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <EyeOff className="w-3 h-3" />
            Shadow Posts
          </p>
        </div>

        {/* The preview post */}
        <div className="p-3 border-b border-primary/20 bg-primary/5">
          <div className="flex gap-2">
            {/* Anonymous avatar */}
            <div className="w-8 h-8 rounded-full flex-shrink-0 bg-primary/20 flex items-center justify-center ring-1 ring-primary/30">
              <EyeOff className="w-4 h-4 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Rank badge */}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${positionStyle.bg} ${positionStyle.text}`}>
                  #{position}
                </span>

                {/* Shadow identity name */}
                <span className="text-xs font-medium text-primary">
                  {walletName || "shadow_id"}
                </span>

                <span className="text-muted-foreground text-[10px]">
                  now
                </span>
              </div>

              {/* Content */}
              <p className="mt-1.5 text-foreground text-xs leading-relaxed break-words">
                {content || <span className="text-muted-foreground italic">Your message will appear here...</span>}
              </p>

              {/* Footer: Bid */}
              <div className="flex items-center mt-2">
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10">
                  <Zap className="w-3 h-3 text-amber-500" />
                  <span className="text-[10px] font-semibold text-amber-500">
                    {boostAmount.toFixed(3)} SOL
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Placeholder existing posts */}
        <div className="p-3 border-b border-border/50 opacity-40">
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2 w-20 bg-muted rounded" />
              <div className="h-2 w-full bg-muted rounded" />
              <div className="h-2 w-3/4 bg-muted rounded" />
            </div>
          </div>
        </div>
        <div className="p-3 opacity-30">
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2 w-16 bg-muted rounded" />
              <div className="h-2 w-full bg-muted rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PostModal({ isOpen, onClose, userAvatar, username, isShadowMode = false, onPostSuccess }: PostModalProps) {
  const [content, setContent] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postingStep, setPostingStep] = useState<string | null>(null); // Current step message
  const { showToast } = useToast();
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(0);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Shadow context
  const {
    isUnlocked: isShadowUnlocked,
    wallets: shadowWallets,
    selectedWallet,
    selectedWalletIndex,
    selectWallet,
    getSelectedKeypair,
    refreshStats,
    refreshBalances,
  } = useShadow();

  // Shadow mode specific states
  const [targetUser, setTargetUser] = useState("");
  const [targetPlatform, setTargetPlatform] = useState<"xray" | "twitter">("xray");
  const [boostAmount, setBoostAmount] = useState(0.007); // SOL - minimum bid (0.007 SOL bid + ~0.008 SOL fees = 0.015 SOL total for Privacy Cash)
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);
  const [targetQuery, setTargetQuery] = useState("");
  const [isTargetLocked, setIsTargetLocked] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [manualBoostInput, setManualBoostInput] = useState("");
  const [manualPositionInput, setManualPositionInput] = useState("");
  const [showBoostHelp, setShowBoostHelp] = useState(false);
  const [isIdentityDropdownOpen, setIsIdentityDropdownOpen] = useState(false);
  const [bidPreview, setBidPreview] = useState<{ position: number; totalPosts: number } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [bidRange, setBidRange] = useState<{ min: number; max: number }>({ min: 0.007, max: 1 });
  const [isLockingTarget, setIsLockingTarget] = useState(false);
  const [targetBids, setTargetBids] = useState<bigint[]>([]); // Store existing bids for local position calculation
  const [lockedTargetInfo, setLockedTargetInfo] = useState<{ name: string; avatar: string; followers?: number } | null>(null);

  // Fund wallet states
  const [showFundModal, setShowFundModal] = useState(false);
  const [fundAmount, setFundAmount] = useState("0.5");
  const [isFunding, setIsFunding] = useState(false);

  // User suggestions from API
  const [suggestedUsers, setSuggestedUsers] = useState<api.SearchUser[]>([]);
  const [searchResults, setSearchResults] = useState<api.SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Premium status for shadow wallets
  const [premiumWallets, setPremiumWallets] = useState<Map<string, { isPremium: boolean; profilePicture: string | null }>>(new Map());

  // Load suggested users when modal opens
  useEffect(() => {
    if (isOpen) {
      loadSuggestedUsers();
    }
  }, [isOpen]);

  // Load premium status for shadow wallets
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

  const loadSuggestedUsers = async () => {
    try {
      const response = await api.getSuggestedUsers();
      if (response.success && response.users) {
        setSuggestedUsers(response.users);
      }
    } catch (err) {
      console.error("Failed to load suggested users:", err);
    }
  };

  // Search users with debounce
  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await api.searchUsers(query);
      if (response.success && response.users) {
        setSearchResults(response.users);
      }
    } catch (err) {
      console.error("Failed to search users:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search for mentions
  useEffect(() => {
    if (mentionQuery !== null && mentionQuery.length > 0) {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        searchUsers(mentionQuery);
      }, 300);
    } else {
      setSearchResults([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [mentionQuery]);

  // Debounced search for target user
  useEffect(() => {
    if (targetQuery && targetPlatform === "xray" && !isTargetLocked) {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        searchUsers(targetQuery);
      }, 300);
    }
  }, [targetQuery, targetPlatform, isTargetLocked]);

  // Load target stats and bid range when target is locked
  useEffect(() => {
    if (!isTargetLocked || !targetUser) {
      setBidPreview(null);
      setBidRange({ min: 0.007, max: 1 });
      setTargetBids([]);
      return;
    }

    let isCancelled = false;

    const loadTargetStats = async () => {
      setIsLoadingPreview(true);

      // Set a timeout - if it takes too long, just use defaults
      const timeout = setTimeout(() => {
        if (!isCancelled) {
          console.log("Target stats loading timed out, using defaults");
          setIsLoadingPreview(false);
          setBidPreview({ position: 1, totalPosts: 1 });
        }
      }, 5000);

      try {
        const targetUrl = buildTargetUrl(targetUser, targetPlatform);
        const stats = await getTargetStats(targetUrl);

        clearTimeout(timeout);
        if (isCancelled) return;

        // Store bids for local position calculation
        setTargetBids(stats.bids);

        // Calculate bid range from existing posts
        const MIN_BID_SOL = 0.007; // Minimum possible bid (0.007 SOL bid + ~0.008 SOL fees = 0.015 SOL total for Privacy Cash)
        let maxBidSol = 1; // Default max

        if (stats.bids.length > 0) {
          // Max bid from existing posts (last in sorted array) + 1 SOL
          const highestBidLamports = stats.bids[stats.bids.length - 1];
          const highestBidSol = Number(highestBidLamports) / 1_000_000_000;
          maxBidSol = Math.max(highestBidSol + 1, 1);
        }

        setBidRange({ min: MIN_BID_SOL, max: maxBidSol });

        // Set initial preview
        const bidLamports = solToLamports(boostAmount);
        const higherBids = stats.bids.filter(b => b >= bidLamports).length;
        setBidPreview({
          position: higherBids + 1,
          totalPosts: stats.bids.length + 1
        });

        // Also set initial boost amount to minimum if it's below
        if (boostAmount < MIN_BID_SOL) {
          setBoostAmount(MIN_BID_SOL);
        }
      } catch (error) {
        console.error("Failed to load target stats:", error);
        clearTimeout(timeout);
        if (!isCancelled) {
          // Use defaults on error
          setBidPreview({ position: 1, totalPosts: 1 });
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingPreview(false);
        }
      }
    };

    loadTargetStats();

    return () => {
      isCancelled = true;
    };
  }, [isTargetLocked, targetUser, targetPlatform]);

  // Calculate position locally when boost amount changes (instant feedback)
  useEffect(() => {
    if (!isTargetLocked || targetBids.length === 0) {
      return;
    }

    // Calculate position locally from stored bids
    const bidLamports = solToLamports(boostAmount);
    const higherBids = targetBids.filter(b => b >= bidLamports).length;
    setBidPreview({
      position: higherBids + 1,
      totalPosts: targetBids.length + 1
    });
  }, [boostAmount, targetBids, isTargetLocked]);

  // Get users to display (search results or suggested)
  const filteredTargetUsers = targetQuery && searchResults.length > 0
    ? searchResults.slice(0, 5)
    : suggestedUsers.slice(0, 5);

  // Get users for mention suggestions
  const filteredUsers = mentionQuery !== null && mentionQuery.length > 0 && searchResults.length > 0
    ? searchResults.slice(0, 5)
    : suggestedUsers.slice(0, 5);

  // Get ranking position based on boost amount (using interpolation)
  const getRankingPosition = (sol: number) => getInterpolatedPosition(sol);

  const charsRemaining = MAX_CHARS - content.length;
  const isOverLimit = charsRemaining < 0;
  const isNearLimit = charsRemaining <= 20 && charsRemaining >= 0;

  // Detect @ mentions while typing
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPos = e.target.selectionStart;
    setContent(newContent);

    // Find if we're in a mention
    const textBeforeCursor = newContent.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // Check if there's a space after @ (mention completed) or if @ is at start or after space
      const charBeforeAt = lastAtIndex > 0 ? newContent[lastAtIndex - 1] : " ";
      if (!textAfterAt.includes(" ") && (charBeforeAt === " " || charBeforeAt === "\n" || lastAtIndex === 0)) {
        setMentionQuery(textAfterAt);
        setMentionStartIndex(lastAtIndex);
        setSelectedSuggestionIndex(0);
        return;
      }
    }
    setMentionQuery(null);
  };

  // Handle keyboard navigation in suggestions
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredUsers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev + 1) % filteredUsers.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev - 1 + filteredUsers.length) % filteredUsers.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredUsers[selectedSuggestionIndex].username);
      } else if (e.key === "Escape") {
        setMentionQuery(null);
      }
    }
  };

  // Insert selected mention
  const insertMention = (mentionUsername: string) => {
    const before = content.slice(0, mentionStartIndex);
    const after = content.slice(mentionStartIndex + 1 + (mentionQuery?.length || 0));
    const newContent = `${before}@${mentionUsername} ${after}`;
    setContent(newContent);
    setMentionQuery(null);

    // Focus back and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = mentionStartIndex + mentionUsername.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image must be less than 5MB", "error");
      return;
    }
    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file", "error");
      return;
    }
    setSelectedImage(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  };

  const removeImage = () => {
    setSelectedImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  const canPost = () => {
    if (!content.trim() || isOverLimit) return false;
    if (isShadowMode) {
      if (!targetUser.trim()) return false;
      if (!isShadowUnlocked || !selectedWallet) return false;
      if (!isTargetLocked) return false;
    }
    return true;
  };

  const handlePost = async () => {
    if (!canPost() || isPosting) return;

    setIsPosting(true);
    setPostingStep(null);
    try {
      if (isShadowMode) {
        // Shadow mode: create on-chain post
        if (!isShadowUnlocked || !selectedWallet) {
          showToast("Please unlock your shadow wallets first", "error");
          return;
        }

        setPostingStep("preparing wallet...");
        const keypair = await getSelectedKeypair();
        if (!keypair) {
          showToast("Failed to get shadow wallet keypair", "error");
          return;
        }

        const requiredLamports = solToLamports(boostAmount + 0.01); // bid + fees buffer
        const currentBalance = BigInt(selectedWallet.balance);

        // Check if shadow wallet has enough funds - auto-fund if needed
        if (currentBalance < requiredLamports) {
          const needed = Number(requiredLamports - currentBalance) / 1_000_000_000;
          const fundAmountSol = needed + 0.01; // Add small buffer

          setPostingStep("funding wallet...");

          try {
            // Get wallet provider
            const provider = (window as any).phantom?.solana || (window as any).solana;
            if (!provider) {
              showToast("No wallet found. Please connect your wallet.", "error");
              setIsPosting(false);
              setPostingStep(null);
              return;
            }

            // Make sure wallet is connected
            if (!provider.isConnected) {
              await provider.connect();
            }

            const fromPublicKey = provider.publicKey;
            if (!fromPublicKey) {
              showToast("Could not get public key from wallet", "error");
              setIsPosting(false);
              setPostingStep(null);
              return;
            }

            const toPublicKey = new PublicKey(selectedWallet.publicKey);
            const lamportsToFund = solToLamports(fundAmountSol);

            // Check if public wallet has enough balance (including tx fee ~0.000005 SOL)
            const publicWalletBalance = await getWalletBalance(fromPublicKey);
            const totalNeeded = Number(lamportsToFund) + 10000; // Add buffer for tx fee
            if (publicWalletBalance < totalNeeded) {
              const publicBalanceSol = publicWalletBalance / 1_000_000_000;
              showToast(`Insufficient funds in public wallet. You have ${publicBalanceSol.toFixed(4)} SOL but need ${fundAmountSol.toFixed(4)} SOL`, "error");
              setIsPosting(false);
              setPostingStep(null);
              return;
            }

            await transferToShadowWallet(
              fromPublicKey,
              toPublicKey,
              lamportsToFund,
              async (tx: Transaction) => {
                return await provider.signTransaction(tx);
              }
            );

            showToast(`Funded ${fundAmountSol.toFixed(4)} SOL to shadow wallet`);

            // Wait for balance to be available on shadow wallet
            setPostingStep("confirming funding...");
            let retries = 0;
            const maxRetries = 10;
            while (retries < maxRetries) {
              const newBalance = await getWalletBalance(toPublicKey);
              if (newBalance >= Number(requiredLamports)) {
                break;
              }
              await new Promise(resolve => setTimeout(resolve, 1000));
              retries++;
            }

            // Refresh balances
            await refreshBalances();
          } catch (fundError) {
            console.error("Failed to fund wallet:", fundError);
            const errorMsg = fundError instanceof Error ? fundError.message : "Failed to fund wallet";
            if (errorMsg.includes("rejected") || errorMsg.includes("User rejected")) {
              showToast("Funding cancelled", "error");
            } else {
              showToast(errorMsg, "error");
            }
            setIsPosting(false);
            setPostingStep(null);
            return;
          }
        }

        const targetUrl = buildTargetUrl(targetUser, targetPlatform);
        const bidLamports = solToLamports(boostAmount);

        setPostingStep("creating post on-chain...");
        const signature = await createShadowPost(keypair, targetUrl, content, bidLamports);

        setPostingStep("confirming transaction...");
        showToast("Shadow post published on-chain!");
        console.log("Transaction signature:", signature);

        // Refresh stats and balances
        setPostingStep("updating balances...");
        await refreshStats();
        await refreshBalances();
      } else {
        // Public mode: use API
        setPostingStep("publishing...");
        const response = await api.createPost(content, {
          image: selectedImage || undefined,
        });

        if (response.success) {
          showToast("Post published!");
        }
      }

      // Reset form
      setContent("");
      setTargetUser("");
      setTargetQuery("");
      setBoostAmount(0.007);
      setIsTargetLocked(false);
      setLockedTargetInfo(null);
      setManualBoostInput("");
      setManualPositionInput("");
      setBidPreview(null);
      setBidRange({ min: 0.007, max: 1 });
      removeImage();
      onClose();
      onPostSuccess?.();
    } catch (err) {
      console.error("Failed to create post:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to publish post";
      // Check if user rejected the wallet transaction
      if (errorMessage.includes("rejected") || errorMessage.includes("User rejected")) {
        showToast("Transaction cancelled", "error");
      } else {
        showToast(errorMessage, "error");
      }
    } finally {
      setIsPosting(false);
      setPostingStep(null);
    }
  };

  const handleLockTarget = async () => {
    if (!targetUser.trim()) return;

    setIsLockingTarget(true);
    setTargetError(null);

    try {
      if (targetPlatform === "twitter") {
        // Verify X/Twitter profile exists
        const targetUrl = `https://x.com/${targetUser}`;
        const xProfile = await fetchXProfile(targetUrl);

        if (!xProfile) {
          setTargetError(`@${targetUser} not found on X`);
          setIsLockingTarget(false);
          return;
        }
        setLockedTargetInfo({
          name: xProfile.name || targetUser,
          avatar: xProfile.profilePicUrl || "",
          followers: xProfile.followersCount,
        });
      } else {
        // Verify X-RAY profile exists
        try {
          const response = await api.getUserProfile(targetUser);

          if (!response.success) {
            setTargetError(`@${targetUser} not found on X-RAY`);
            setIsLockingTarget(false);
            return;
          }
          setLockedTargetInfo({
            name: response.user?.username || targetUser,
            avatar: response.user?.profile_picture ? getImageUrl(response.user.profile_picture, "") : "",
            followers: response.stats?.followers,
          });
        } catch {
          // User not found throws an error
          setTargetError(`@${targetUser} not found on X-RAY`);
          setIsLockingTarget(false);
          return;
        }
      }

      // Profile exists, lock the target
      setIsTargetLocked(true);
    } catch (error) {
      console.error("Failed to verify target:", error);
      setTargetError(`Could not verify @${targetUser}`);
    } finally {
      setIsLockingTarget(false);
    }
  };

  const handleUnlockTarget = () => {
    setIsTargetLocked(false);
    setBidRange({ min: 0.007, max: 1 });
    setTargetBids([]);
    setBidPreview(null);
    setLockedTargetInfo(null);
  };

  const handleManualBoostChange = (value: string) => {
    setManualBoostInput(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0.1 && numValue <= 10) {
      setBoostAmount(numValue);
    }
  };

  // Fund shadow wallet from public wallet
  const handleFundWallet = async () => {
    if (!selectedWallet || isFunding) return;

    const amount = parseFloat(fundAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast("Please enter a valid amount", "error");
      return;
    }

    setIsFunding(true);
    try {
      // Get wallet provider
      const provider = (window as any).phantom?.solana || (window as any).solana;
      if (!provider) {
        showToast("No wallet found. Please connect your wallet.", "error");
        return;
      }

      // Make sure wallet is connected
      if (!provider.isConnected) {
        await provider.connect();
      }

      const fromPublicKey = provider.publicKey;
      if (!fromPublicKey) {
        showToast("Could not get public key from wallet", "error");
        return;
      }

      const toPublicKey = new PublicKey(selectedWallet.publicKey);
      const lamports = solToLamports(amount);

      await transferToShadowWallet(
        fromPublicKey,
        toPublicKey,
        lamports,
        async (tx: Transaction) => {
          return await provider.signTransaction(tx);
        }
      );

      showToast(`Funded ${amount} SOL to shadow wallet!`);
      setShowFundModal(false);
      setFundAmount("0.5");

      // Refresh balances
      await refreshBalances();
    } catch (error) {
      console.error("Failed to fund wallet:", error);
      showToast(error instanceof Error ? error.message : "Failed to fund wallet", "error");
    } finally {
      setIsFunding(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{ backgroundColor: "var(--card)" }}
            className={`fixed left-1/2 -translate-x-1/2 top-4 md:top-1/2 md:-translate-y-1/2 w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border shadow-2xl z-50 flex flex-col md:flex-row max-h-[85vh] md:max-h-[90vh] overflow-hidden ${
              isShadowMode && isTargetLocked ? "md:max-w-4xl" : "md:max-w-lg"
            }`}
          >
            {/* Main form section */}
            <div className={`flex-1 overflow-y-auto overflow-x-hidden ${isShadowMode && isTargetLocked ? "md:border-r border-border" : ""}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5 text-foreground" />
              </button>
              <button
                onClick={handlePost}
                disabled={!canPost() || isPosting}
                className={`px-4 py-1.5 rounded-full font-medium text-sm transition-all flex items-center gap-2 min-w-[120px] justify-center ${
                  canPost() && !isPosting
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-primary/50 text-primary-foreground/50 cursor-not-allowed"
                }`}
              >
                {isPosting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs">{postingStep || "posting..."}</span>
                  </>
                ) : (
                  isShadowMode ? "shadow post" : "post"
                )}
              </button>
            </div>

            {/* Shadow Mode - Post as header with dropdown + help tooltip */}
            {isShadowMode && (
              <div className="px-4 py-2 border-b border-border bg-primary/5">
                {/* Not unlocked warning */}
                {!isShadowUnlocked && (
                  <div className="flex items-center gap-2 p-2 mb-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm text-amber-500">Unlock your shadow wallets in Profile to post</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <EyeOff className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-sm text-muted-foreground flex-shrink-0">post as</span>

                    {/* Identity Dropdown - Real shadow wallets */}
                    <div className="relative">
                      {(() => {
                        const isSelectedPremium = selectedWallet ? premiumWallets.get(selectedWallet.publicKey)?.isPremium : false;
                        return (
                          <button
                            onClick={() => setIsIdentityDropdownOpen(!isIdentityDropdownOpen)}
                            disabled={!isShadowUnlocked || shadowWallets.length === 0}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              isSelectedPremium
                                ? "bg-pink-500/10 hover:bg-pink-500/20"
                                : "bg-primary/10 hover:bg-primary/20"
                            }`}
                          >
                            {isSelectedPremium && <Crown className="w-3.5 h-3.5 text-pink-500" />}
                            <span className={`text-sm font-medium truncate max-w-[100px] ${isSelectedPremium ? "text-pink-500" : "text-primary"}`}>
                              {selectedWallet?.name || "No wallet"}
                            </span>
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isSelectedPremium ? "text-pink-500" : "text-primary"} ${isIdentityDropdownOpen ? "rotate-180" : ""}`} />
                          </button>
                        );
                      })()}

                      {isIdentityDropdownOpen && shadowWallets.length > 0 && (
                        <div className="absolute left-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
                          {shadowWallets.map((wallet, index) => {
                            const isPremium = premiumWallets.get(wallet.publicKey)?.isPremium || false;
                            return (
                              <button
                                key={wallet.publicKey}
                                onClick={() => {
                                  selectWallet(index);
                                  setIsIdentityDropdownOpen(false);
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
                        </div>
                      )}
                    </div>

                    {/* Balance display only - funding happens automatically on post */}
                    {selectedWallet && (
                      <span className="text-xs text-muted-foreground">
                        {formatSol(selectedWallet.balance)} SOL
                      </span>
                    )}
                  </div>

                  {/* Help tooltip */}
                  <div
                    className="relative"
                    onMouseEnter={() => setShowBoostHelp(true)}
                    onMouseLeave={() => setShowBoostHelp(false)}
                  >
                    <button
                      onClick={() => setShowBoostHelp(!showBoostHelp)}
                      className="p-1 rounded-full bg-muted/50 text-muted-foreground hover:text-primary hover:bg-primary/20 transition-colors"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                    <AnimatePresence>
                      {showBoostHelp && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 5 }}
                          className="absolute right-0 top-full mt-1 w-64 p-3 bg-card border border-border rounded-lg shadow-xl z-50"
                        >
                          <p className="text-xs text-foreground font-medium mb-2">how does it work?</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            in shadow mode, you post anonymously on a target's wall.
                            the boost determines your position: more SOL = higher visibility.
                          </p>
                          <div className="mt-2 pt-2 border-t border-border">
                            <a
                              href="/how-it-works"
                              className="text-xs text-primary hover:underline"
                            >
                              see more →
                            </a>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            )}

            {/* Shadow Mode Target Selector */}
            {isShadowMode && (
              <div className="px-4 py-3 border-b border-border">
                {isTargetLocked && lockedTargetInfo ? (
                  /* Locked state - show profile card */
                  <div className="flex items-center gap-3">
                    {lockedTargetInfo.avatar ? (
                      <img src={lockedTargetInfo.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <EyeOff className="w-5 h-5 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{lockedTargetInfo.name}</p>
                      <p className="text-xs text-muted-foreground">@{targetUser} · {targetPlatform === "twitter" ? "X" : "x-ray"}{lockedTargetInfo.followers !== undefined ? ` · ${lockedTargetInfo.followers.toLocaleString()} followers` : ""}</p>
                    </div>
                    <button
                      onClick={handleUnlockTarget}
                      className="p-1.5 rounded-full hover:bg-red-500/10 transition-colors flex-shrink-0"
                      title="Change target"
                    >
                      <X className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                ) : (
                  /* Unlocked state - show search UI */
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="w-4 h-4 text-primary" />
                      <span className="text-sm text-muted-foreground">who are you talking about?</span>
                    </div>

                    {/* Platform Toggle */}
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => setTargetPlatform("xray")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                          targetPlatform === "xray"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        x-ray
                      </button>
                      <button
                        onClick={() => setTargetPlatform("twitter")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                          targetPlatform === "twitter"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        <XLogo className="w-3.5 h-3.5" />
                        X
                      </button>
                    </div>

                    {/* Target User Input with Lock Button */}
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <div className={`flex items-center rounded-lg bg-muted ${targetError ? "ring-2 ring-red-500" : "focus-within:ring-2 focus-within:ring-primary/50"}`}>
                          <span className="pl-3 text-sm text-primary font-medium">@</span>
                          <input
                            type="text"
                            value={targetQuery}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value.startsWith("@")) {
                                setTargetError("Don't add @ - it's already included");
                                setTargetQuery(value.slice(1));
                                setTargetUser(value.slice(1));
                              } else if (value.includes("@")) {
                                setTargetError("Username cannot contain @");
                              } else {
                                setTargetError(null);
                                setTargetQuery(value);
                                setTargetUser(value);
                              }
                              setShowTargetDropdown(true);
                            }}
                            onFocus={() => setShowTargetDropdown(true)}
                            onBlur={() => setTimeout(() => setShowTargetDropdown(false), 150)}
                            placeholder={targetPlatform === "xray" ? "username" : "twitter_handle"}
                            className="flex-1 px-1 py-2 bg-transparent text-foreground placeholder:text-muted-foreground text-sm focus:outline-none"
                          />
                        </div>
                        {/* Target User Dropdown (X-RAY only) */}
                        {showTargetDropdown && targetPlatform === "xray" && filteredTargetUsers.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-[200px] overflow-y-auto">
                            {isSearching && (
                              <div className="flex items-center justify-center py-3">
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                              </div>
                            )}
                            {!isSearching && filteredTargetUsers.map((user) => (
                              <button
                                key={user.id}
                                onClick={() => {
                                  setTargetUser(user.username);
                                  setTargetQuery(user.username);
                                  setShowTargetDropdown(false);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted transition-colors"
                              >
                                <img
                                  src={getImageUrl(user.profile_picture, `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`)}
                                  alt={user.username}
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                                <div>
                                  <p className="text-sm font-medium text-foreground">@{user.username}</p>
                                  {user.bio && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{user.bio}</p>}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Lock Button */}
                      <button
                        onClick={handleLockTarget}
                        disabled={!targetUser.trim() || isLockingTarget}
                        className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0 ${
                          targetUser.trim() && !isLockingTarget
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "bg-muted text-muted-foreground cursor-not-allowed"
                        }`}
                      >
                        {isLockingTarget ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Lock className="w-4 h-4" />
                        )}
                        <span className="text-sm">{isLockingTarget ? "..." : "lock"}</span>
                      </button>
                    </div>

                    {/* Error message */}
                    {targetError && (
                      <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        {targetError}
                      </p>
                    )}
                  </>
                )}

                {/* SOL Boost Slider - Only shown after target is locked */}
                <AnimatePresence>
                  {isTargetLocked && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 overflow-hidden"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <span className="text-sm text-muted-foreground">boost</span>
                      </div>

                      {/* SOL Input + Position Preview */}
                      {(() => {
                        const position = bidPreview?.position || getRankingPosition(boostAmount);
                        const style = getPositionStyle(position);
                        return (
                          <div className="flex items-center gap-3 mb-3">
                            <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={manualBoostInput !== "" ? manualBoostInput : boostAmount}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (value === "" || /^\d*\.?\d*$/.test(value)) {
                                    setManualBoostInput(value);
                                    const numVal = parseFloat(value);
                                    if (!isNaN(numVal) && numVal > 0) {
                                      setBoostAmount(numVal);
                                    }
                                  }
                                }}
                                onBlur={() => {
                                  setManualBoostInput("");
                                  if (boostAmount < 0.007) setBoostAmount(0.007);
                                }}
                                placeholder="0.01"
                                className="w-16 bg-transparent text-base font-medium text-primary text-right focus:outline-none"
                              />
                              <span className="text-sm font-medium text-muted-foreground">SOL</span>
                            </div>
                            <span className="text-muted-foreground">=</span>
                            <div className={`flex items-center gap-1 rounded-lg px-3 py-2 border ${style.bg} ${style.border}`}>
                              {isLoadingPreview ? (
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                              ) : bidPreview && bidPreview.totalPosts === 1 ? (
                                <span className={`text-sm font-bold ${style.text}`}>first post!</span>
                              ) : (
                                <>
                                  <span className={`text-base font-bold ${style.text}`}>#{position}</span>
                                  {bidPreview && (
                                    <span className="text-xs text-muted-foreground">
                                      /{bidPreview.totalPosts}
                                    </span>
                                  )}
                                  {position <= 3 && (
                                    <span className="text-sm ml-1">
                                      {position === 1 && "🥇"}
                                      {position === 2 && "🥈"}
                                      {position === 3 && "🥉"}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Slider */}
                      <input
                        type="range"
                        min={bidRange.min}
                        max={bidRange.max}
                        step="0.001"
                        value={Math.min(Math.max(boostAmount, bidRange.min), bidRange.max)}
                        onChange={(e) => {
                          setBoostAmount(parseFloat(e.target.value));
                          setManualBoostInput("");
                        }}
                        className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
                      />

                      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                        <span>{bidRange.min} SOL</span>
                        <span className="text-amber-500">{bidRange.max} SOL</span>
                      </div>

                      {/* Total with fees */}
                      <div className="mt-4 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <span>total</span>
                          <div className="relative group">
                            <HelpCircle className="w-3 h-3 cursor-help" />
                            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-56 p-2.5 bg-popover border border-border rounded-lg shadow-lg z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all text-xs">
                              <p className="text-muted-foreground mb-1.5">Includes protocol fees:</p>
                              <p className="text-muted-foreground">• Privacy Cash: 0.35% + 0.006 SOL</p>
                              <p className="text-muted-foreground">• Solana rent: ~0.003 SOL</p>
                              <p className="text-primary/80 mt-2 text-[10px]">The cost of true anonymity.</p>
                            </div>
                          </div>
                        </div>
                        <span className="font-semibold text-foreground">
                          {((boostAmount + 0.01) * 1.0035).toFixed(4)} SOL
                        </span>
                      </div>

                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Content - hidden on mobile until target is locked in shadow mode */}
            <div className={`p-4 ${isShadowMode && !isTargetLocked ? "hidden md:block" : ""}`}>
              <div className="flex gap-3">
                {/* Avatar - only in public mode */}
                {!isShadowMode && (
                  <img
                    src={userAvatar}
                    alt={username}
                    className="w-10 h-10 rounded-full flex-shrink-0 ring-2 ring-primary/20"
                  />
                )}

                {/* Input area */}
                <div className="flex-1 relative">
                  {/* Lock target message overlay - hidden on mobile */}
                  {isShadowMode && !isTargetLocked && (
                    <div className="hidden md:flex absolute inset-0 items-center justify-center z-20 bg-background/50 rounded-lg border-2 border-dashed border-primary/30">
                      <div className="text-center">
                        <Lock className="w-8 h-8 text-primary/50 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Lock a target to start writing</p>
                      </div>
                    </div>
                  )}
                  <div
                    className={`relative min-h-[120px] md:max-h-[200px] ${isShadowMode && !isTargetLocked ? "opacity-30" : "cursor-text"}`}
                    onClick={() => {
                      if (!isShadowMode || isTargetLocked) {
                        textareaRef.current?.focus();
                      }
                    }}
                  >
                    {/* Textarea for input */}
                    <textarea
                      ref={textareaRef}
                      value={content}
                      onChange={handleContentChange}
                      onKeyDown={handleKeyDown}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setTimeout(() => setIsFocused(false), 150)}
                      placeholder={isShadowMode && !isTargetLocked ? "" : "What's happening?"}
                      disabled={isShadowMode && !isTargetLocked}
                      className="absolute inset-0 w-full h-full bg-transparent text-transparent text-lg placeholder:text-muted-foreground resize-none focus:outline-none overflow-y-auto z-10 disabled:cursor-not-allowed"
                      style={{
                        caretColor: "var(--foreground)",
                      }}
                      autoFocus={!isShadowMode}
                    />
                    {/* Highlighted text display */}
                    <div
                      className="w-full min-h-[120px] md:max-h-[200px] text-lg whitespace-pre-wrap break-words overflow-y-auto pointer-events-none"
                      style={{ wordBreak: "break-word" }}
                    >
                      {content ? (
                        content.split(/((?:^|(?<=\s))@\w*)/g).map((part, index) => {
                          if (part.match(/^@\w*$/)) {
                            return (
                              <span key={index} className="text-primary font-medium">
                                {part}
                              </span>
                            );
                          }
                          return <span key={index} className="text-foreground">{part}</span>;
                        })
                      ) : (
                        <span className="text-transparent">.</span>
                      )}
                    </div>
                  </div>

                  {/* Mention suggestions dropdown - positioned outside modal */}
                  <AnimatePresence>
                    {mentionQuery !== null && (filteredUsers.length > 0 || isSearching) && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute left-0 w-[calc(100vw-4rem)] max-w-[350px] border border-border rounded-xl shadow-2xl z-[100] max-h-[300px] overflow-y-auto"
                        style={{
                          backgroundColor: "var(--card)",
                          top: "calc(100% + 8px)",
                        }}
                      >
                        {isSearching ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                          </div>
                        ) : filteredUsers.length > 0 ? (
                          filteredUsers.map((user, index) => (
                            <button
                              key={user.id}
                              onClick={() => insertMention(user.username)}
                              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                                index === selectedSuggestionIndex
                                  ? "bg-primary/10"
                                  : "hover:bg-muted"
                              }`}
                            >
                              <img
                                src={getImageUrl(user.profile_picture, `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`)}
                                alt={user.username}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground">@{user.username}</p>
                                {user.bio && <p className="text-sm text-muted-foreground truncate">{user.bio}</p>}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="py-4 text-center text-muted-foreground text-sm">
                            No users found
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Image preview */}
                  {imagePreview && (
                    <div className="relative mt-2 rounded-xl overflow-hidden border border-border">
                      <img src={imagePreview} alt="Preview" className="w-full max-h-64 object-cover" />
                      <button
                        onClick={removeImage}
                        className="absolute top-2 right-2 p-1 rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Divider with animation */}
                  <motion.div
                    className="h-px bg-border mt-2"
                    animate={{
                      backgroundColor: isFocused ? "var(--primary)" : "var(--border)",
                    }}
                    transition={{ duration: 0.2 }}
                  />

                  {/* Bottom actions */}
                  <div className="flex items-center justify-between mt-3">
                    {/* Action buttons - only in public mode */}
                    <div className="flex items-center gap-1">
                      {!isShadowMode && (
                        <>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            onChange={handleImageSelect}
                            className="hidden"
                          />
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 rounded-full text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Image className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Character counter */}
                    <div className="flex items-center gap-3">
                      {content.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-2"
                        >
                          {/* Circular progress */}
                          <svg className="w-6 h-6 -rotate-90">
                            <circle
                              cx="12"
                              cy="12"
                              r="10"
                              fill="none"
                              stroke="var(--border)"
                              strokeWidth="2"
                            />
                            <circle
                              cx="12"
                              cy="12"
                              r="10"
                              fill="none"
                              stroke={isOverLimit ? "#ef4444" : isNearLimit ? "#f59e0b" : "var(--primary)"}
                              strokeWidth="2"
                              strokeDasharray={`${Math.min(content.length / MAX_CHARS, 1) * 62.83} 62.83`}
                              className="transition-all duration-150"
                            />
                          </svg>

                          {/* Number counter when near limit */}
                          {(isNearLimit || isOverLimit) && (
                            <span
                              className={`text-sm font-medium ${
                                isOverLimit ? "text-red-500" : "text-amber-500"
                              }`}
                            >
                              {isOverLimit ? "too many characters" : charsRemaining}
                            </span>
                          )}
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>

            {/* Preview panel - only in shadow mode when target is locked, hidden on mobile */}
            {isShadowMode && isTargetLocked && (
              <div className="hidden md:block w-80 p-3 flex-shrink-0">
                <PostPreview
                  targetUser={targetUser}
                  targetPlatform={targetPlatform}
                  content={content}
                  boostAmount={boostAmount}
                  position={bidPreview?.position || getRankingPosition(boostAmount)}
                  walletName={selectedWallet?.name || "shadow_id"}
                />
              </div>
            )}
          </motion.div>

          {/* Fund Wallet Modal */}
          <AnimatePresence>
            {showFundModal && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/70 z-[60]"
                  onClick={() => !isFunding && setShowFundModal(false)}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-card border border-border rounded-xl shadow-2xl z-[60] overflow-hidden"
                >
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-primary" />
                      <span className="font-medium text-foreground">Fund Shadow Wallet</span>
                    </div>
                    <button
                      onClick={() => !isFunding && setShowFundModal(false)}
                      disabled={isFunding}
                      className="p-1 rounded-full hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>

                  <div className="p-4 space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">To wallet</p>
                      <p className="text-sm font-medium text-primary">{selectedWallet?.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {selectedWallet?.publicKey.slice(0, 8)}...{selectedWallet?.publicKey.slice(-8)}
                      </p>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Amount (SOL)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={fundAmount}
                          onChange={(e) => setFundAmount(e.target.value)}
                          min="0.01"
                          step="0.1"
                          disabled={isFunding}
                          className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                        />
                        <div className="flex gap-1">
                          {[0.25, 0.5, 1].map((amount) => (
                            <button
                              key={amount}
                              onClick={() => setFundAmount(amount.toString())}
                              disabled={isFunding}
                              className="px-2 py-1 text-xs rounded bg-muted hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                            >
                              {amount}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleFundWallet}
                      disabled={isFunding || !fundAmount || parseFloat(fundAmount) <= 0}
                      className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isFunding ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Transferring...
                        </>
                      ) : (
                        <>
                          <ArrowDownToLine className="w-4 h-4" />
                          Fund {fundAmount} SOL
                        </>
                      )}
                    </button>

                    <p className="text-[10px] text-muted-foreground text-center">
                      Transfer from your connected wallet to your shadow wallet
                    </p>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
