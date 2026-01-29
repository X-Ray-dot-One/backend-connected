"use client";

import { useState, useRef } from "react";
import { Camera, Loader2, Sparkles } from "lucide-react";

interface ProfileSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  walletAddress: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export function ProfileSetupModal({
  isOpen,
  onClose,
  onComplete,
  walletAddress,
}: ProfileSetupModalProps) {
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    username: "",
    bio: "",
    location: "",
  });
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultAvatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${walletAddress}`;
  const avatarUrl = previewUrl || defaultAvatarUrl;

  const locationOptions = [
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
    { label: "Lisbon, Portugal", value: "Lisbon, Portugal" },
    { label: "Zurich, Switzerland", value: "Zurich, Switzerland" },
  ];

  const validateUsername = (username: string): string | null => {
    if (!username) return null;
    if (username.length < 3) return "Username must be at least 3 characters";
    if (username.length > 20) return "Username must be 20 characters or less";
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return "Username can only contain letters, numbers, and underscores";
    }
    return null;
  };

  const handleUsernameChange = (value: string) => {
    setForm({ ...form, username: value });
    setUsernameError(validateUsername(value));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setUsernameError("Please select a valid image (JPEG, PNG, GIF, or WebP)");
      return;
    }

    // Validate file size (max 7MB)
    if (file.size > 7 * 1024 * 1024) {
      setUsernameError("Image must be less than 7MB");
      return;
    }

    setProfilePicture(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUsernameError(null);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!form.username) {
        setUsernameError("Username is required");
        return;
      }
      if (usernameError) return;
      setStep(2);
    }
  };

  const handleComplete = async () => {
    setIsSaving(true);
    try {
      // Use FormData to support file upload
      const formData = new FormData();
      formData.append('username', form.username);
      formData.append('bio', form.bio);
      formData.append('location', form.location);

      if (profilePicture) {
        formData.append('profile_picture', profilePicture);
      }

      const response = await fetch(`${API_BASE}/?action=update-profile`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        const errorMsg = data.errors?.[0] || 'Failed to save profile';
        setUsernameError(errorMsg);
        return;
      }

      onComplete();
    } catch (error) {
      console.error("Failed to save profile:", error);
      setUsernameError("Failed to save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 z-50" />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-background border border-border rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-center px-4 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">
                {step === 1 ? "Welcome to X-RAY" : "Almost done!"}
              </h2>
            </div>
          </div>

          {/* Progress */}
          <div className="px-4 pt-4">
            <div className="flex gap-2">
              <div className={`flex-1 h-1 rounded-full ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
              <div className={`flex-1 h-1 rounded-full ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {step === 1 ? (
              <>
                {/* Step 1: Avatar & Username */}
                <div className="flex flex-col items-center mb-6">
                  <div className="relative mb-4">
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="w-24 h-24 rounded-full border-4 border-primary/20 object-cover"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-0 right-0 p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    {previewUrl ? "Looking good! Now choose a username" : "Add a profile picture and choose a username"}
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Username
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        @
                      </span>
                      <input
                        type="text"
                        value={form.username}
                        onChange={(e) => handleUsernameChange(e.target.value)}
                        placeholder="satoshi"
                        className={`w-full pl-8 pr-4 py-3 rounded-xl border bg-background text-foreground focus:outline-none focus:ring-2 ${
                          usernameError
                            ? "border-red-500 focus:ring-red-500"
                            : "border-border focus:ring-primary"
                        }`}
                      />
                    </div>
                    {usernameError && (
                      <p className="text-xs text-red-500 mt-2">{usernameError}</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Step 2: Bio & Location */}
                <p className="text-sm text-muted-foreground text-center mb-6">
                  Tell us a bit about yourself (optional)
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Bio
                    </label>
                    <textarea
                      value={form.bio}
                      onChange={(e) => setForm({ ...form, bio: e.target.value })}
                      rows={3}
                      placeholder="Web3 enthusiast, builder, degen..."
                      className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Location
                    </label>
                    <select
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                    >
                      <option value="">Select a location</option>
                      {locationOptions.map((loc) => (
                        <option key={loc.value} value={loc.value}>
                          {loc.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex gap-3">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 rounded-xl border border-border text-foreground hover:bg-muted transition-colors font-medium"
              >
                Back
              </button>
            )}
            <button
              onClick={step === 1 ? handleNext : handleComplete}
              disabled={isSaving || (step === 1 && (!form.username || !!usernameError))}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : step === 1 ? (
                "Next"
              ) : (
                "Complete Setup"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
