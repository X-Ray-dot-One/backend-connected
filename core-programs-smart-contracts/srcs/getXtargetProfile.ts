import { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("6Suaf5mvzmogRtVXdckv7Ace8615Fnbu4rNBcnXprAj5");
const connection = new Connection("https://api.devnet.solana.com");

/**
 * CDN API endpoint for X profile data
 * Requires specific headers to work (origin/referer from snaplytics.io)
 */
const X_PROFILE_CDN = "https://twittermedia.b-cdn.net/profile-pic/";

export interface XProfile {
    username: string;
    name: string;
    description: string;
    followersCount: number;
    followingCount: number;
    tweetCount: number;
    profilePicUrl: string;
    bannerUrl: string;
    profileUrl: string;
}

/**
 * Fetch X/Twitter profile data from CDN
 * NOTE: This requires specific headers that browsers cannot spoof (CORS)
 * Use this in Node.js backend only, not in browser
 */
export async function fetchXProfile(username: string): Promise<XProfile | null> {
    try {
        const response = await fetch(
            `${X_PROFILE_CDN}?username=${username}`,
            {
                headers: {
                    "origin": "https://snaplytics.io",
                    "referer": "https://snaplytics.io/",
                    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
                }
            }
        );

        if (!response.ok) return null;

        const data = await response.json();

        return {
            username: data.username || username,
            name: data.name || username,
            description: data.description || "",
            followersCount: data.followers_count || 0,
            followingCount: data.following_count || 0,
            tweetCount: data.tweet_count || 0,
            profilePicUrl: data.profile_image_url || "",
            bannerUrl: data.profile_banner_url || "",
            profileUrl: `https://x.com/${username}`
        };
    } catch (error) {
        console.error("Error fetching X profile:", error);
        return null;
    }
}

/**
 * Extract username from target URL
 * Supports: https://x.com/username, https://twitter.com/username, @username
 */
export function extractXUsername(target: string): string | null {
    // Direct @username
    if (target.startsWith("@")) {
        return target.slice(1);
    }

    // URL patterns
    const patterns = [
        /(?:https?:\/\/)?(?:www\.)?x\.com\/([a-zA-Z0-9_]+)/,
        /(?:https?:\/\/)?(?:www\.)?twitter\.com\/([a-zA-Z0-9_]+)/
    ];

    for (const pattern of patterns) {
        const match = target.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

/**
 * Check if target is an X/Twitter profile
 */
export function isXProfile(target: string): boolean {
    return extractXUsername(target) !== null;
}

export interface TargetPost {
    pubkey: string;
    author: string;
    content: string;
    bid: bigint;
    timestamp: number;
}

/**
 * Fetch all on-chain posts for a specific target
 */
export async function getPostsForTarget(target: string): Promise<TargetPost[]> {
    const accounts = await connection.getProgramAccounts(PROGRAM_ID);
    const posts: TargetPost[] = [];

    for (const { pubkey, account } of accounts) {
        const data = account.data;

        if (data.length < 65) continue;

        let offset = 8; // Skip discriminator

        // Author (32 bytes)
        const author = new PublicKey(data.subarray(offset, offset + 32));
        offset += 32;

        // Target (4 bytes len + string)
        const targetLen = data.readUInt32LE(offset);
        if (targetLen > 64 || offset + 4 + targetLen > data.length) continue;
        offset += 4;
        const postTarget = data.subarray(offset, offset + targetLen).toString("utf-8");
        offset += targetLen;

        if (postTarget !== target) continue;

        // Content (4 bytes len + string)
        const contentLen = data.readUInt32LE(offset);
        if (contentLen > 512 || offset + 4 + contentLen > data.length) continue;
        offset += 4;
        const content = data.subarray(offset, offset + contentLen).toString("utf-8");
        offset += contentLen;

        // Bid (8 bytes u64)
        const bid = data.readBigUInt64LE(offset);
        offset += 8;

        // Timestamp (8 bytes i64)
        const timestamp = Number(data.readBigInt64LE(offset));

        posts.push({
            pubkey: pubkey.toBase58(),
            author: author.toBase58(),
            content,
            bid,
            timestamp
        });
    }

    // Sort by bid descending
    return posts.sort((a, b) => Number(b.bid - a.bid));
}
