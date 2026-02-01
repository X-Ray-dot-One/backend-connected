"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import * as api from "@/lib/api";
import { clearShadowSession } from "./shadow-context";

interface User {
  id: number;
  username: string | null;
  wallet_address: string;
  profile_picture: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  banner_picture: string | null;
  created_at: string;
}

interface UserStats {
  followers: number;
  following: number;
  posts: number;
}

interface AuthContextType {
  user: User | null;
  stats: UserStats;
  isLoading: boolean;
  isAuthenticated: boolean;
  isNewUser: boolean;
  showProfileSetup: boolean;
  login: (walletAddress: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateFollowingCount: (count: number) => void;
  refreshStats: () => Promise<void>;
  closeProfileSetup: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<UserStats>({ followers: 0, following: 0, posts: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);

  // Check if user is already logged in on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Load stats when user changes
  useEffect(() => {
    if (user?.username) {
      loadStats();
    }
  }, [user?.id]);

  const checkAuth = async () => {
    try {
      const response = await api.getMe();
      if (response.success && response.user) {
        setUser(response.user);
        // Re-show profile setup if user never completed registration
        if (!response.user.username && !response.user.profile_picture) {
          setIsNewUser(true);
          setShowProfileSetup(true);
        }
      }
    } catch (error) {
      // Not logged in or API error, that's fine
      console.log("Auth check failed or timed out:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    if (!user?.username) return;
    try {
      const response = await api.getUserProfile(user.username);
      if (response.success) {
        setStats(response.stats);
      }
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  };

  const updateFollowingCount = (count: number) => {
    setStats(prev => ({ ...prev, following: count }));
  };

  const refreshStats = async () => {
    await loadStats();
  };

  const login = async (walletAddress: string) => {
    setIsLoading(true);
    // Clear any existing shadow session when switching wallets
    clearShadowSession();
    try {
      const response = await api.walletAuth(walletAddress);
      if (response.success && response.user) {
        setUser(response.user);
        // Show profile setup modal for new users
        if (response.is_new) {
          setIsNewUser(true);
          setShowProfileSetup(true);
        }
      } else {
        throw new Error("Login failed");
      }
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const closeProfileSetup = () => {
    setShowProfileSetup(false);
    setIsNewUser(false);
  };

  const logout = async () => {
    try {
      await api.logout();
      // Clear shadow session on logout
      clearShadowSession();
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const refreshUser = async () => {
    await checkAuth();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        stats,
        isLoading,
        isAuthenticated: !!user,
        isNewUser,
        showProfileSetup,
        login,
        logout,
        refreshUser,
        updateFollowingCount,
        refreshStats,
        closeProfileSetup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
