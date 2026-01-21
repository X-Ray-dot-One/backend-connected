/**
 * X-RAY API Client
 * Handles all communication with the PHP backend
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

interface ApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  [key: string]: T | boolean | string | undefined;
}

async function apiCall<T>(action: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}/?action=${action}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Important for session cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!data.success && data.error) {
    throw new Error(data.error);
  }

  return data;
}

// ============================================
// AUTH
// ============================================

export async function walletAuth(walletAddress: string) {
  return apiCall<{
    success: boolean;
    user_id: number;
    wallet_address: string;
    is_new: boolean;
    user: User;
  }>('wallet-auth', {
    method: 'POST',
    body: JSON.stringify({ wallet_address: walletAddress }),
  });
}

export async function logout() {
  return apiCall<{ success: boolean }>('logout');
}

export async function getMe() {
  return apiCall<{
    success: boolean;
    user: User;
    shadow_mode: boolean;
  }>('me');
}

export async function toggleShadowMode() {
  return apiCall<{
    success: boolean;
    shadow_mode: boolean;
  }>('toggle-shadow-mode');
}

// ============================================
// PROFILE
// ============================================

export interface User {
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

export interface UserProfile {
  user: User;
  stats: {
    followers: number;
    following: number;
    posts: number;
  };
  is_following: boolean;
  is_own_profile: boolean;
}

export async function getProfile(username?: string, userId?: number) {
  const params = username ? `&username=${username}` : `&user_id=${userId}`;
  return apiCall<UserProfile>(`get-profile${params}`);
}

export async function getUserProfile(username: string) {
  return apiCall<UserProfile & { success: boolean }>(`user-profile&username=${encodeURIComponent(username)}`);
}

export async function updateProfile(data: Partial<User>) {
  return apiCall<{ success: boolean; user: User }>('update-profile', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============================================
// FOLLOW
// ============================================

export async function followUser(userId: number) {
  return apiCall<{ success: boolean; followers_count: number; my_following_count: number }>('follow', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function unfollowUser(userId: number) {
  return apiCall<{ success: boolean; followers_count: number; my_following_count: number }>('unfollow', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

export interface FollowUser {
  id: number;
  username: string | null;
  wallet_address: string;
  profile_picture: string | null;
  bio: string | null;
  followed_at: string;
  is_followed_by_me?: boolean;
}

export async function getFollowers(userId: number, limit = 50) {
  return apiCall<{ success: boolean; users: FollowUser[]; count: number }>(`get-followers&user_id=${userId}&limit=${limit}`);
}

export async function getFollowing(userId: number, limit = 50) {
  return apiCall<{ success: boolean; users: FollowUser[]; count: number }>(`get-following&user_id=${userId}&limit=${limit}`);
}

// ============================================
// POSTS
// ============================================

export interface Post {
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
}

export async function getPost(postId: number) {
  return apiCall<{ success: boolean; post: Post }>(`get-post&id=${postId}`);
}

export async function getPosts(options?: {
  page?: number;
  limit?: number;
  userId?: number;
  feed?: 'all' | 'following';
}) {
  const params = new URLSearchParams();
  if (options?.page) params.append('page', options.page.toString());
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.userId) params.append('user_id', options.userId.toString());
  if (options?.feed) params.append('feed', options.feed);

  const queryString = params.toString() ? `&${params.toString()}` : '';
  return apiCall<{ success: boolean; posts: Post[] }>(`get-posts${queryString}`);
}

export async function createPost(content: string, options?: {
  shadowMode?: boolean;
  targetUser?: string;
  targetPlatform?: 'xray' | 'twitter';
  boostAmount?: number;
  identity?: string;
}) {
  return apiCall<{ success: boolean; post_id: number }>('create-post', {
    method: 'POST',
    body: JSON.stringify({
      content,
      shadow_mode: options?.shadowMode,
      target_user: options?.targetUser,
      target_platform: options?.targetPlatform,
      boost_amount: options?.boostAmount,
      identity: options?.identity,
    }),
  });
}

export async function deletePost(postId: number) {
  return apiCall<{ success: boolean }>('delete-post', {
    method: 'POST',
    body: JSON.stringify({ post_id: postId }),
  });
}

export async function toggleLike(postId: number) {
  return apiCall<{ success: boolean; action: 'liked' | 'unliked'; like_count: number }>('toggle-like', {
    method: 'POST',
    body: JSON.stringify({ post_id: postId }),
  });
}

// ============================================
// COMMENTS
// ============================================

export interface Comment {
  id: number;
  content: string;
  user_id: number;
  username: string;
  profile_picture: string | null;
  time_ago: string;
  like_count: number;
  has_liked: boolean;
}

export async function getComments(postId: number) {
  return apiCall<{ success: boolean; comments: Comment[]; count: number }>(`get-comments&post_id=${postId}`);
}

export async function addComment(postId: number, content: string) {
  return apiCall<{ success: boolean; comment: Comment; comment_count: number }>('add-comment', {
    method: 'POST',
    body: JSON.stringify({ post_id: postId, content }),
  });
}

export async function deleteComment(commentId: number, postId: number) {
  return apiCall<{ success: boolean; comment_count: number }>('delete-comment', {
    method: 'POST',
    body: JSON.stringify({ comment_id: commentId, post_id: postId }),
  });
}

export async function toggleCommentLike(commentId: number) {
  return apiCall<{ success: boolean; action: 'liked' | 'unliked'; like_count: number }>('toggle-comment-like', {
    method: 'POST',
    body: JSON.stringify({ comment_id: commentId }),
  });
}

// ============================================
// SEARCH
// ============================================

export interface SearchUser {
  id: number;
  username: string;
  bio: string;
  profile_picture: string;
}

export async function searchUsers(query: string) {
  return apiCall<{ success: boolean; users: SearchUser[] }>(`search-users&q=${encodeURIComponent(query)}`);
}

export async function getSuggestedUsers() {
  return apiCall<{ success: boolean; users: SearchUser[] }>('suggested-users');
}

// ============================================
// X (TWITTER) PROFILE
// ============================================

export interface XProfile {
  success: boolean;
  username: string;
  name: string;
  description: string;
  followers_count: number;
  following_count: number;
  tweet_count: number;
  location: string;
  profile_image_url: string;
  profile_banner_url: string;
  created_at: string;
  user_id: string;
}

export async function getXProfile(username: string) {
  return apiCall<XProfile>(`x-profile&username=${encodeURIComponent(username)}`);
}

// ============================================
// SHADOW WALLETS
// ============================================

/**
 * Get wallet count for a user (by hashed userId)
 */
export async function getShadowWalletCount(userId: string) {
  return apiCall<{ count: number }>(`api-wallets-count&userId=${encodeURIComponent(userId)}`);
}

/**
 * Increment wallet count for a user (+1)
 */
export async function incrementShadowWalletCount(userId: string) {
  return apiCall<{ count: number }>('api-wallets-increment', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

/**
 * Register a new shadow wallet with its name
 */
export async function createShadowWallet(shadowPubkey: string, name: string) {
  return apiCall<{ success: boolean }>('api-wallets-create', {
    method: 'POST',
    body: JSON.stringify({ shadowPubkey, name }),
  });
}

/**
 * Check if a shadow wallet name already exists
 */
export async function shadowWalletNameExists(name: string) {
  return apiCall<{ exists: boolean }>(`api-wallets-name-exists&name=${encodeURIComponent(name)}`);
}

/**
 * Get the name of a shadow wallet by its public key
 */
export async function getShadowWalletName(shadowPubkey: string) {
  return apiCall<{ name: string | null }>(`api-wallets-name&shadowPubkey=${encodeURIComponent(shadowPubkey)}`);
}

/**
 * Check if a wallet address is premium and get profile picture
 */
export async function isPremiumWallet(walletAddress: string) {
  return apiCall<{ is_premium: boolean; profile_picture: string | null }>(`api-wallets-is-premium&walletAddress=${encodeURIComponent(walletAddress)}`);
}

/**
 * Set premium status for a wallet address
 */
export async function setPremiumWallet(walletAddress: string, isPremium: boolean) {
  return apiCall<{ success: boolean; is_premium: boolean }>('api-wallets-set-premium', {
    method: 'POST',
    body: JSON.stringify({ walletAddress, is_premium: isPremium }),
  });
}

/**
 * Search shadow wallets by name
 */
export interface ShadowWalletSearchResult {
  shadow_pubkey: string;
  name: string;
  created_at: string;
}

export async function searchShadowWallets(query: string) {
  return apiCall<{ success: boolean; wallets: ShadowWalletSearchResult[] }>(`api-wallets-search&q=${encodeURIComponent(query)}`);
}

/**
 * Get a shadow wallet by its name
 */
export async function getShadowWalletByName(name: string) {
  return apiCall<{ success: boolean; wallet: ShadowWalletSearchResult }>(`api-wallets-by-name&name=${encodeURIComponent(name)}`);
}

// ============================================
// PREMIUM NDD
// ============================================

export interface PremiumNdd {
  name: string;
  pfp: string | null;
  cost: number;
}

/**
 * Get list of premium NDD for sale
 */
export async function getPremiumNddList(limit = 20) {
  return apiCall<{ success: boolean; ndds: PremiumNdd[] }>(`api-ndd-list&limit=${limit}`);
}

/**
 * Get a single NDD by name
 */
export async function getPremiumNdd(name: string) {
  return apiCall<{ success: boolean; ndd: PremiumNdd }>(`api-ndd-get&name=${encodeURIComponent(name)}`);
}

/**
 * Verify NDD purchase transaction and assign NDD to shadow wallet
 */
export async function verifyNddPurchase(data: {
  signature: string;
  ndd_name: string;
  shadow_pubkey: string;
  expected_amount: number;
}) {
  return apiCall<{ success: boolean; message?: string; new_name?: string; error?: string }>('api-ndd-purchase', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
