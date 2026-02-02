"use client";

import { useState, useRef, useEffect } from "react";
import {
  Camera, Loader2, Sparkles, ImagePlus, MapPin, Globe, FileText,
  EyeOff, Eye, Search, UserPlus, Check, ArrowRight, Send,
  Shield, Coins,
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
  const [shadowStep, setShadowStep] = useState<"toggle" | "feed">("toggle");
  const [toggleRect, setToggleRect] = useState<DOMRect | null>(null);
  const [isMobileToggle, setIsMobileToggle] = useState(false);
  const [feedRect, setFeedRect] = useState<DOMRect | null>(null);
  const [feedExplainStep, setFeedExplainStep] = useState(0);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);


  const defaultAvatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${walletAddress}`;

  const feedExplanations = [
    { icon: "eye", title: "Welcome to Shadow Mode", text: "This feed shows anonymous posts from shadow wallets. No one knows who posted what." },
    { icon: "coins", title: "Bid to be seen", text: "Pick a target (a user or topic), write your message, and set a SOL bid. Higher bids = higher ranking. It's a free market for attention." },
    { icon: "shield", title: "Fully anonymous", text: "Shadow wallets are derived locally. Your identity can never be traced back to your public wallet." },
  ];


  // Get toggle position when entering step 5
  useEffect(() => {
    if (step === 5 && shadowStep === "toggle") {
      const getToggle = () => {
        const mobile = window.innerWidth < 768;
        setIsMobileToggle(mobile);
        const sel = mobile ? '[data-onboarding="shadow-toggle-mobile"]' : '[data-onboarding="shadow-toggle-desktop"]';
        return document.querySelector(sel);
      };
      const el = getToggle();
      if (el) setToggleRect(el.getBoundingClientRect());
      const onResize = () => {
        const el2 = getToggle();
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
        scrollIntervalRef.current = setInterval(() => {
          feedEl.scrollBy({ top: 1, behavior: "auto" });
        }, 30);
        return () => {
          if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
          scrollIntervalRef.current = null;
        };
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
    // Reset to public mode after onboarding (user toggled shadow during tutorial)
    if (isShadowMode) toggleMode();
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
          isMobileToggle ? (
            <button
              onClick={toggleMode}
              className={`fixed z-[9999] rounded-full flex items-center gap-1.5 shadow-lg px-3 py-2.5 ring-4 ring-primary ring-offset-4 ring-offset-black animate-pulse ${
                isShadowMode ? "bg-card text-primary border border-primary/40" : "bg-card text-amber-500 border border-amber-500/40"
              }`}
              style={{ top: toggleRect.top, left: toggleRect.left }}
            >
              {isShadowMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="text-xs font-semibold">{isShadowMode ? "shadow" : "public"}</span>
            </button>
          ) : (
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
          )
        )}

        {/* Tooltip - above toggle on mobile, below on desktop */}
        {toggleRect && (
          <div
            className="fixed z-[9999] w-64 pointer-events-none"
            style={isMobileToggle
              ? { bottom: window.innerHeight - toggleRect.top + 16, right: 16 }
              : { top: toggleRect.bottom + 16, left: Math.min(toggleRect.left, window.innerWidth - 280) }
            }
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
                <ArrowRight className={`w-4 h-4 ${isMobileToggle ? "rotate-90" : "rotate-[-90deg]"}`} />
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
        if (scrollIntervalRef.current) { clearInterval(scrollIntervalRef.current); scrollIntervalRef.current = null; }
        handleComplete();
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
