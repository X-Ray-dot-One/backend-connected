"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera, Loader2, Sparkles, ImagePlus, MapPin, Globe, FileText,
  EyeOff, Eye, Search, UserPlus, Check, ArrowRight, Send,
  Shield, Coins, TrendingUp, Target, Zap,
} from "lucide-react";
import { useMode } from "@/contexts/mode-context";

interface ProfileSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  walletAddress: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
const MOCK_MODE = false;
const TOTAL_STEPS = 5;

const locationOptions = [
  "New York, USA", "Los Angeles, USA", "San Francisco, USA", "Miami, USA",
  "London, UK", "Paris, France", "Berlin, Germany", "Amsterdam, Netherlands",
  "Dubai, UAE", "Singapore", "Hong Kong", "Tokyo, Japan",
  "Seoul, South Korea", "Sydney, Australia", "Toronto, Canada",
  "Lisbon, Portugal", "Zurich, Switzerland",
];

interface SuggestedUser {
  id: number;
  username: string;
  profile_picture: string | null;
  bio: string | null;
  wallet_address?: string;
}

export function ProfileSetupModal({
  isOpen,
  onClose,
  onComplete,
  walletAddress,
}: ProfileSetupModalProps) {
  const { isShadowMode, toggleMode } = useMode();
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Images
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const pfpInputRef = useRef<HTMLInputElement>(null);
  const [bannerPicture, setBannerPicture] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Follow
  const [followedUsers, setFollowedUsers] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SuggestedUser[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);

  // First post
  const [firstPost, setFirstPost] = useState("");

  // Shadow tutorial sub-steps
  const [shadowStep, setShadowStep] = useState<"toggle" | "feed" | "intro-post" | "post">("toggle");
  const [toggleRect, setToggleRect] = useState<DOMRect | null>(null);
  const [feedRect, setFeedRect] = useState<DOMRect | null>(null);
  const [feedExplainStep, setFeedExplainStep] = useState(0);

  // Post tutorial sub-steps
  const [postExplainStep, setPostExplainStep] = useState(0);

  const defaultAvatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${walletAddress}`;

  const feedExplanations = [
    { icon: "eye", title: "Welcome to Shadow Mode", text: "This feed shows anonymous posts from shadow wallets. No one knows who posted what." },
    { icon: "coins", title: "Bid to be seen", text: "Pick a target (a user or topic), write your message, and set a SOL bid. Higher bids = higher ranking. It's a free market for attention." },
    { icon: "shield", title: "Fully anonymous", text: "Shadow wallets are derived locally. Your identity can never be traced back to your public wallet." },
  ];

  const postExplanations = [
    { icon: "eyeoff", title: "Your Shadow Identity", text: "This is your anonymous shadow wallet. No one can trace it back to your public wallet. You can create multiple identities." },
    { icon: "target", title: "Select a Target", text: "Pick someone on X (Twitter) or X-RAY to post about. Your anonymous message will appear on their profile wall." },
    { icon: "coins", title: "Set Your Bid", text: "After locking a target, set your SOL bid. Higher bids = higher ranking on the target's wall. Minimum bid is 0.007 SOL." },
    { icon: "send", title: "Write Your Message", text: "Write your anonymous message here. Up to 280 characters. Say what you really think - no one will know it's you." },
  ];

  // Get toggle position when entering step 5
  useEffect(() => {
    if (step === 5 && shadowStep === "toggle") {
      const el = document.querySelector('[data-onboarding="shadow-toggle"]');
      if (el) setToggleRect(el.getBoundingClientRect());
      const onResize = () => {
        const el2 = document.querySelector('[data-onboarding="shadow-toggle"]');
        if (el2) setToggleRect(el2.getBoundingClientRect());
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }
  }, [step, shadowStep]);

  // Get feed rect, reset explain step, and auto-scroll
  useEffect(() => {
    if (step === 5 && shadowStep === "feed") {
      setFeedExplainStep(0);
      const feedEl = document.querySelector('[data-onboarding="feed"]') as HTMLElement | null;
      if (feedEl) {
        setFeedRect(feedEl.getBoundingClientRect());
        const scrollInterval = setInterval(() => {
          feedEl.scrollBy({ top: 1, behavior: "auto" });
        }, 30);
        return () => clearInterval(scrollInterval);
      }
    }
  }, [step, shadowStep]);

  // Load suggested users when reaching step 3
  useEffect(() => {
    if (step === 3 && suggestedUsers.length === 0) {
      const gringo: SuggestedUser = {
        id: 4,
        username: "gringo",
        profile_picture: "public/uploads/profile_pictures/profile_4_1769835697.jpeg",
        bio: "web3 kidzzz | Founder of this app",
      };

      (async () => {
        try {
          const res = await fetch(`${API_BASE}/?action=suggested-users&limit=10`, { credentials: "include" });
          const data = await res.json();
          const final: SuggestedUser[] = [gringo];
          if (data.success && data.users) {
            const others = data.users.filter((u: SuggestedUser) => u.username !== "gringo");
            final.push(...others.sort(() => Math.random() - 0.5).slice(0, 2));
          }
          setSuggestedUsers(final);
        } catch {
          setSuggestedUsers([gringo]);
        }
      })();
    }
  }, [step]);

  // Track highlighted section in post tutorial
  useEffect(() => {
    if (step === 5 && shadowStep === "post") {
      setPostExplainStep(0);
    }
  }, [step, shadowStep]);

  // Detect when user actually toggles shadow mode
  useEffect(() => {
    if (step === 5 && shadowStep === "toggle" && isShadowMode) {
      setFeedExplainStep(0);
      setTimeout(() => setShadowStep("feed"), 500);
    }
  }, [isShadowMode, step, shadowStep]);

  const validateUsername = (value: string): string | null => {
    if (!value) return null;
    if (value.length < 3) return "Username must be at least 3 characters";
    if (value.length > 20) return "Username must be 20 characters or less";
    if (!/^[a-zA-Z0-9_]+$/.test(value)) return "Only letters, numbers, and underscores";
    return null;
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setError(validateUsername(value));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>, type: "pfp" | "banner") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) { setError("Please select a valid image (JPEG, PNG, GIF, or WebP)"); return; }
    if (file.size > 7 * 1024 * 1024) { setError("Image must be less than 7MB"); return; }
    setError(null);
    const url = URL.createObjectURL(file);
    if (type === "pfp") { setProfilePicture(file); setProfilePreview(url); }
    else { setBannerPicture(file); setBannerPreview(url); }
  };

  const handleNextStep1 = () => {
    if (!username) { setError("Username is required"); return; }
    const err = validateUsername(username);
    if (err) { setError(err); return; }
    setError(null);
    setStep(2);
  };

  const toggleFollow = (userId: number) => {
    setFollowedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) { setSearchResults([]); return; }
    try {
      const res = await fetch(`${API_BASE}/?action=search-users&q=${encodeURIComponent(query)}`, { credentials: "include" });
      const data = await res.json();
      if (data.success && data.users) {
        setSearchResults(data.users);
      }
    } catch {
      setSearchResults([]);
    }
  };

  const handleComplete = async () => {
    setIsSaving(true);
    try {
      if (MOCK_MODE) {
        await new Promise((r) => setTimeout(r, 1000));
        console.log("[MOCK] Profile saved:", { username, bio, website, location, followedUsers: Array.from(followedUsers), firstPost: firstPost || null });
        onComplete();
        return;
      }

      const formData = new FormData();
      formData.append("username", username);
      formData.append("bio", bio);
      formData.append("website", website);
      formData.append("location", location);
      if (profilePicture) formData.append("profile_picture", profilePicture);
      if (bannerPicture) formData.append("banner_picture", bannerPicture);

      const response = await fetch(`${API_BASE}/?action=update-profile`, { method: "POST", credentials: "include", body: formData });
      const data = await response.json();
      if (!data.success) { setError(data.errors?.[0] || "Failed to save profile"); return; }

      for (const userId of followedUsers) {
        try { await fetch(`${API_BASE}/?action=follow`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId }) }); } catch {}
      }

      if (firstPost.trim()) {
        try { await fetch(`${API_BASE}/?action=create-post`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: firstPost }) }); } catch {}
      }

      onComplete();
    } catch (err) {
      console.error("Failed to save profile:", err);
      setError("Failed to save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const stepTitle = () => {
    switch (step) {
      case 1: return "Welcome to X-RAY";
      case 2: return "About you";
      case 3: return "Follow people";
      case 4: return "Your first post";
      case 5: return "Shadow Mode";
      default: return "";
    }
  };

  if (!isOpen) return null;

  const usersToShow = searchQuery.trim() ? searchResults : suggestedUsers;

  // Step 5 "toggle" sub-step: full black overlay with cloned toggle at real position
  if (step === 5 && shadowStep === "toggle") {
    return (
      <>
        <div className="fixed inset-0 z-[9999] bg-black/90" />

        {/* Clone toggle at exact position of the real one */}
        {toggleRect && (
          <button
            onClick={toggleMode}
            className="fixed z-[9999] flex items-center gap-2 p-1 rounded-full bg-muted/50 transition-colors ring-4 ring-primary ring-offset-4 ring-offset-black animate-pulse"
            style={{ top: toggleRect.top, left: toggleRect.left }}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${!isShadowMode ? "bg-amber-500 text-white" : "text-muted-foreground"}`}>
              <Eye className="w-4 h-4" />
            </div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isShadowMode ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              <EyeOff className="w-4 h-4" />
            </div>
          </button>
        )}

        {/* Tooltip next to the toggle */}
        {toggleRect && (
          <div
            className="fixed z-[9999] w-64 pointer-events-none"
            style={{ top: toggleRect.bottom + 16, left: Math.min(toggleRect.left, window.innerWidth - 280) }}
          >
            <div className="bg-background border border-primary/30 rounded-xl p-4 shadow-2xl">
              <div className="flex items-center gap-2 mb-2">
                <EyeOff className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground text-sm">Enter Shadow Mode</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Tap the toggle to switch to shadow mode. Post anonymously with SOL bids.
              </p>
              <div className="flex items-center gap-2 text-primary animate-bounce">
                <ArrowRight className="w-4 h-4 rotate-[-90deg]" />
                <span className="text-xs font-medium">Tap the toggle</span>
              </div>
            </div>
          </div>
        )}

        {/* Fallback if toggle not found */}
        {!toggleRect && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="flex flex-col items-center gap-6">
              <h3 className="text-lg font-bold text-white">Enter Shadow Mode</h3>
              <button onClick={toggleMode} className="flex items-center gap-2 p-1.5 rounded-full bg-muted/50 ring-4 ring-primary ring-offset-4 ring-offset-black animate-pulse">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${!isShadowMode ? "bg-amber-500 text-white" : "text-muted-foreground"}`}><Eye className="w-5 h-5" /></div>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isShadowMode ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><EyeOff className="w-5 h-5" /></div>
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Step 5 "feed" sub-step: black overlay with feed visible + auto-scroll + manual explanations
  if (step === 5 && shadowStep === "feed") {
    const explain = feedExplanations[feedExplainStep];
    const isLastExplain = feedExplainStep >= feedExplanations.length - 1;
    const clipPath = feedRect
      ? `polygon(
          0% 0%, 0% 100%, ${feedRect.left}px 100%, ${feedRect.left}px ${feedRect.top}px,
          ${feedRect.right}px ${feedRect.top}px, ${feedRect.right}px ${feedRect.bottom}px,
          ${feedRect.left}px ${feedRect.bottom}px, ${feedRect.left}px 100%, 100% 100%, 100% 0%
        )`
      : undefined;

    const handleFeedNext = () => {
      if (isLastExplain) {
        setShadowStep("intro-post");
      } else {
        setFeedExplainStep(prev => prev + 1);
      }
    };

    return (
      <>
        {/* Black overlay with hole for feed */}
        <div
          className="fixed inset-0 z-[9999] bg-black/85 pointer-events-none"
          style={clipPath ? { clipPath } : undefined}
        />

        {/* Explanation card floating over the feed */}
        <div className="fixed z-[9999]" style={{
          top: feedRect ? feedRect.top + 20 : "20%",
          left: feedRect ? feedRect.left + 16 : "10%",
          right: feedRect ? `calc(100% - ${feedRect.right - 16}px)` : "10%",
        }}>
          <div className="bg-background/95 border border-primary/30 rounded-xl p-4 shadow-2xl backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              {feedExplainStep === 0 && <EyeOff className="w-5 h-5 text-primary" />}
              {feedExplainStep === 1 && <Coins className="w-5 h-5 text-primary" />}
              {feedExplainStep === 2 && <Shield className="w-5 h-5 text-green-500" />}
              <h3 className="font-bold text-foreground text-sm">{explain.title}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{explain.text}</p>
            <div className="flex gap-1.5 mb-4">
              {feedExplanations.map((_, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= feedExplainStep ? "bg-primary" : "bg-muted"}`} />
              ))}
            </div>
            <button
              onClick={handleFeedNext}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              {isLastExplain ? "Got it" : "Next"} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </>
    );
  }

  // Step 5 "intro-post" sub-step: transition card before post tutorial
  if (step === 5 && shadowStep === "intro-post") {
    return (
      <>
        <div className="fixed inset-0 z-[9999] bg-black/90" />
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="bg-background border border-border rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
            <div className="px-6 pt-8 pb-6 text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">How to post anonymously</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Let&apos;s walk you through creating a shadow post. Pick a target, write your message, set your bid - and no one will ever know it was you.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={handleComplete} disabled={isSaving} className="flex-1 py-3 rounded-xl border border-border text-foreground hover:bg-muted transition-colors font-medium text-sm disabled:opacity-50">
                {isSaving ? (<><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>) : "Skip"}
              </button>
              <button onClick={() => setShadowStep("post")} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium text-sm flex items-center justify-center gap-2">
                Show me <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Step 5 "post" sub-step: static mockup of post modal with guided explanations
  if (step === 5 && shadowStep === "post") {
    const currentPostExplain = postExplanations[postExplainStep];
    const isLastPostExplain = postExplainStep >= postExplanations.length - 1;

    const handlePostNext = () => {
      if (isLastPostExplain) {
        handleComplete();
      } else {
        setPostExplainStep(prev => prev + 1);
      }
    };

    // Dim non-highlighted sections
    const sectionStyle = (index: number) =>
      postExplainStep === index
        ? "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg relative z-10"
        : "opacity-30";

    return (
      <>
        <div className="fixed inset-0 z-[9999] bg-black/90" />
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-background border border-border rounded-2xl w-full max-w-md shadow-xl overflow-y-auto max-h-[90vh] pointer-events-auto">

            {/* Mock post modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border opacity-30">
              <div className="p-1.5 rounded-full bg-muted"><span className="text-foreground text-xs">X</span></div>
              <div className="px-4 py-1.5 rounded-full bg-primary/50 text-primary-foreground/50 text-sm font-medium">shadow post</div>
            </div>

            {/* Section 1: Identity */}
            <div className={`px-4 py-2 border-b border-border bg-primary/5 ${sectionStyle(0)}`}>
              <div className="flex items-center gap-2">
                <EyeOff className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm text-muted-foreground">post as</span>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10">
                  <span className="text-sm font-medium text-primary">shadow_anon42</span>
                </div>
                <span className="text-xs text-muted-foreground">0.50 SOL</span>
              </div>
            </div>

            {/* Section 2: Target */}
            <div className={`px-4 py-3 border-b border-border ${sectionStyle(1)}`}>
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">who are you talking about?</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-primary text-primary-foreground">
                  <EyeOff className="w-3.5 h-3.5" /> x-ray
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-muted text-muted-foreground">
                  X
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center rounded-lg bg-muted px-3 py-2">
                  <span className="text-sm text-primary font-medium">@</span>
                  <span className="text-sm text-muted-foreground ml-1">username</span>
                </div>
                <div className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm flex items-center gap-1.5">
                  <span>lock</span>
                </div>
              </div>
            </div>

            {/* Section 3: Boost */}
            <div className={`px-4 py-3 border-b border-border ${sectionStyle(2)}`}>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-muted-foreground">boost</span>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                  <span className="text-base font-medium text-primary">0.05</span>
                  <span className="text-sm font-medium text-muted-foreground">SOL</span>
                </div>
                <span className="text-muted-foreground">=</span>
                <div className="flex items-center gap-1 rounded-lg px-3 py-2 border bg-amber-400/20 border-amber-400">
                  <span className="text-base font-bold text-amber-500">#1</span>
                </div>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div className="w-1/4 h-full bg-primary rounded-full" />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">0.007 SOL</span>
                <span className="text-[10px] text-amber-500">1.0 SOL</span>
              </div>
            </div>

            {/* Section 4: Content */}
            <div className={`p-4 ${sectionStyle(3)}`}>
              <div className="min-h-[60px]">
                <p className="text-lg text-muted-foreground italic">What&apos;s happening?</p>
              </div>
            </div>

            {/* Explanation card + navigation */}
            <div className="px-4 py-4 border-t border-primary/30 bg-primary/5">
              <div className="flex items-center gap-2 mb-2">
                {currentPostExplain.icon === "eyeoff" && <EyeOff className="w-5 h-5 text-primary" />}
                {currentPostExplain.icon === "target" && <Target className="w-5 h-5 text-primary" />}
                {currentPostExplain.icon === "send" && <Send className="w-5 h-5 text-primary" />}
                {currentPostExplain.icon === "coins" && <Coins className="w-5 h-5 text-amber-500" />}
                <h3 className="font-bold text-foreground text-sm">{currentPostExplain.title}</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{currentPostExplain.text}</p>
              <div className="flex gap-1.5 mb-4">
                {postExplanations.map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= postExplainStep ? "bg-primary" : "bg-muted"}`} />
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (postExplainStep === 0) setShadowStep("intro-post");
                    else setPostExplainStep(prev => prev - 1);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted transition-colors font-medium text-sm"
                >
                  Back
                </button>
                <button
                  onClick={handlePostNext}
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                  {isLastPostExplain ? (
                    isSaving ? (<><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>) : "Let's go!"
                  ) : (
                    <>Next <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      </>
    );
  }

  // Steps 1-4 and step 5 feed/post sub-steps: normal modal
  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-50" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-background border border-border rounded-2xl w-full max-w-md shadow-xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-center px-4 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">{stepTitle()}</h2>
            </div>
          </div>

          {/* Progress */}
          <div className="px-4 pt-4">
            <div className="flex gap-1.5">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div key={i} className={`flex-1 h-1 rounded-full transition-colors ${step >= i + 1 ? "bg-primary" : "bg-muted"}`} />
              ))}
            </div>
          </div>

          {/* ==================== STEP 1: Profile ==================== */}
          {step === 1 && (
            <>
              <div className="relative mt-4">
                <input ref={bannerInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" onChange={(e) => handleImageSelect(e, "banner")} className="hidden" />
                <div onClick={() => bannerInputRef.current?.click()} className="mx-4 h-28 rounded-xl cursor-pointer relative group overflow-hidden">
                  {bannerPreview ? (
                    <img src={bannerPreview} alt="Banner" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-r from-primary/20 to-primary/5 border-2 border-dashed border-border rounded-xl">
                      <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-foreground transition-colors">
                        <ImagePlus className="w-6 h-6" /><span className="text-xs">Add a banner</span>
                      </div>
                    </div>
                  )}
                  {bannerPreview && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                </div>
                <input ref={pfpInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" onChange={(e) => handleImageSelect(e, "pfp")} className="hidden" />
                <div className="ml-4 -mt-10">
                  <div onClick={() => pfpInputRef.current?.click()} className="relative cursor-pointer group w-fit">
                    <img src={profilePreview || defaultAvatarUrl} alt="Avatar" className="w-20 h-20 rounded-full border-4 border-background object-cover group-hover:brightness-90 transition-all" />
                    <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {!profilePreview && (
                      <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-primary text-primary-foreground"><Camera className="w-3 h-3" /></div>
                    )}
                  </div>
                </div>
              </div>
              <div className="px-6 pt-4 pb-6">
                <p className="text-sm text-muted-foreground text-center mb-4">Choose a username to get started</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                  <input type="text" value={username} onChange={(e) => handleUsernameChange(e.target.value)} placeholder="satoshi" className={`w-full pl-8 pr-4 py-3 rounded-xl border bg-background text-foreground focus:outline-none focus:ring-2 ${error ? "border-red-500 focus:ring-red-500" : "border-border focus:ring-primary"}`} />
                </div>
                {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
              </div>
              <div className="px-6 pb-6">
                <button onClick={handleNextStep1} disabled={!username || !!error} className="w-full py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* ==================== STEP 2: About ==================== */}
          {step === 2 && (
            <>
              <div className="px-6 pt-6 pb-6">
                <p className="text-sm text-muted-foreground text-center mb-5">Tell us a bit about yourself (optional)</p>
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2"><FileText className="w-4 h-4 text-muted-foreground" /> Bio</label>
                    <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Web3 enthusiast, builder, degen..." className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2"><Globe className="w-4 h-4 text-muted-foreground" /> Website</label>
                    <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://mysite.com" className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2"><MapPin className="w-4 h-4 text-muted-foreground" /> Location</label>
                    <select value={location} onChange={(e) => setLocation(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer">
                      <option value="">Select a location</option>
                      {locationOptions.map((loc) => (<option key={loc} value={loc}>{loc}</option>))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => { setStep(1); setError(null); }} className="flex-1 py-3 rounded-xl border border-border text-foreground hover:bg-muted transition-colors font-medium">Back</button>
                <button onClick={() => { setError(null); setStep(3); }} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium flex items-center justify-center gap-2">Next <ArrowRight className="w-4 h-4" /></button>
              </div>
            </>
          )}

          {/* ==================== STEP 3: Follow ==================== */}
          {step === 3 && (
            <>
              <div className="px-6 pt-6 pb-6">
                <p className="text-sm text-muted-foreground text-center mb-5">Follow at least 1 account to build your feed</p>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={searchQuery} onChange={(e) => handleSearch(e.target.value)} placeholder="Search users..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {usersToShow.map((user) => {
                    const isFollowed = followedUsers.has(user.id);
                    return (
                      <div key={user.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors">
                        <img src={user.profile_picture ? (user.profile_picture.startsWith("http") ? user.profile_picture : `${API_BASE}/${user.profile_picture}`) : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} alt={user.username} className="w-10 h-10 rounded-full object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">@{user.username}</p>
                          {user.bio && <p className="text-xs text-muted-foreground truncate">{user.bio}</p>}
                        </div>
                        <button onClick={() => toggleFollow(user.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isFollowed ? "bg-primary/10 text-primary border border-primary/30" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>
                          {isFollowed ? (<><Check className="w-3 h-3" /> Following</>) : (<><UserPlus className="w-3 h-3" /> Follow</>)}
                        </button>
                      </div>
                    );
                  })}
                  {searchQuery.trim() && searchResults.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
                  )}
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-xl border border-border text-foreground hover:bg-muted transition-colors font-medium">Back</button>
                <button onClick={() => setStep(4)} disabled={followedUsers.size === 0} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">Next <ArrowRight className="w-4 h-4" /></button>
              </div>
            </>
          )}

          {/* ==================== STEP 4: First Post ==================== */}
          {step === 4 && (
            <>
              <div className="px-6 pt-6 pb-6">
                <p className="text-sm text-muted-foreground text-center mb-5">Write your first post (optional)</p>
                <div className="border border-border rounded-xl p-4">
                  <div className="flex gap-3">
                    <img src={profilePreview || defaultAvatarUrl} alt="You" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground mb-1">@{username}</p>
                      <textarea value={firstPost} onChange={(e) => setFirstPost(e.target.value)} rows={3} maxLength={280} placeholder="What's on your mind?" className="w-full bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none text-sm" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground">{firstPost.length}/280</span>
                    {firstPost.trim() && (<div className="flex items-center gap-1 text-xs text-primary"><Send className="w-3 h-3" /> Ready to post</div>)}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4 p-3 rounded-xl bg-muted/50">
                  <Eye className="w-4 h-4 text-primary flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">This post will be public, visible on your profile with your username.</p>
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl border border-border text-foreground hover:bg-muted transition-colors font-medium">Back</button>
                <button onClick={() => setStep(5)} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium flex items-center justify-center gap-2">
                  {firstPost.trim() ? "Next" : "Skip"} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* Step 5 feed/post are handled as early returns above */}

        </div>
      </div>
    </>
  );
}
