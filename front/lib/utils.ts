import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * Get full URL for an image stored on the server
 * Handles relative paths from API and external URLs
 */
export function getImageUrl(path: string | null | undefined, fallback: string): string {
  if (!path) return fallback;
  // If it's already a full URL, return as-is
  if (path.startsWith('http')) return path;
  // If it's a relative path from API (uploaded files), prepend the API base
  if (path.startsWith('public/')) return `${API_BASE}/${path}`;
  if (path.startsWith('uploads/')) return `${API_BASE}/public/${path}`;
  return path;
}

/**
 * Generate default avatar URL based on a seed
 */
export function getDefaultAvatar(seed: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
}

/**
 * Default banner image URL
 */
export const DEFAULT_BANNER = "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&h=200&fit=crop";
