"use client";

import { AppLayout } from "@/components/app-layout";
import { useMode } from "@/contexts/mode-context";
import { Heart, UserPlus, MessageCircle, AtSign, TrendingDown, EyeOff, Bell } from "lucide-react";

interface PublicNotification {
  id: number;
  type: "like" | "follow" | "comment" | "mention" | "shadow_mention";
  username: string;
  avatar: string;
  content: string;
  time: string;
  postPreview?: string;
  boost?: number;
}

interface ShadowNotification {
  id: number;
  targetAccount: string;
  oldPosition: number;
  newPosition: number;
  postPreview: string;
  time: string;
}

const publicNotifications: PublicNotification[] = [
  {
    id: 1,
    type: "shadow_mention",
    username: "anonymous",
    avatar: "",
    content: "mentioned you in a shadow post",
    time: "5m",
    postPreview: "alex_trader's calls have been pretty solid lately...",
    boost: 5.2,
  },
  {
    id: 2,
    type: "like",
    username: "solana_dev",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=solana",
    content: "liked your post",
    time: "12m",
    postPreview: "Just deployed my first Solana program...",
  },
  {
    id: 3,
    type: "follow",
    username: "crypto_whale",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=whale",
    content: "started following you",
    time: "25m",
  },
  {
    id: 4,
    type: "shadow_mention",
    username: "anonymous",
    avatar: "",
    content: "mentioned you in a shadow post",
    time: "1h",
    postPreview: "don't trust alex_trader blindly, he's been wrong...",
    boost: 3.8,
  },
  {
    id: 5,
    type: "comment",
    username: "defi_queen",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=queen",
    content: "commented on your post",
    time: "2h",
    postPreview: "The APY on this new protocol is insane...",
  },
  {
    id: 6,
    type: "mention",
    username: "nft_collector",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=nft",
    content: "mentioned you in a post",
    time: "3h",
    postPreview: "Big shoutout to @you for the alpha...",
  },
  {
    id: 7,
    type: "like",
    username: "phantom_ceo",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=phantom",
    content: "liked your post",
    time: "4h",
    postPreview: "Phantom wallet integration is seamless...",
  },
  {
    id: 8,
    type: "follow",
    username: "jupiter_og",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=jupiter",
    content: "started following you",
    time: "6h",
  },
  {
    id: 9,
    type: "shadow_mention",
    username: "anonymous",
    avatar: "",
    content: "mentioned you in a shadow post",
    time: "1d",
    postPreview: "alex_trader actually knows his stuff about Solana DeFi...",
    boost: 7.1,
  },
  {
    id: 10,
    type: "comment",
    username: "bonk_holder",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=bonk",
    content: "commented on your post",
    time: "1d",
    postPreview: "BONK to the moon!",
  },
];

const shadowNotifications: ShadowNotification[] = [
  {
    id: 1,
    targetAccount: "@alpha_leaker",
    oldPosition: 12,
    newPosition: 13,
    postPreview: "insider alpha on upcoming token launch...",
    time: "5m",
  },
  {
    id: 2,
    targetAccount: "@whale_insider",
    oldPosition: 5,
    newPosition: 8,
    postPreview: "whale wallet just moved 500k to...",
    time: "23m",
  },
  {
    id: 3,
    targetAccount: "@defi_alpha",
    oldPosition: 3,
    newPosition: 4,
    postPreview: "new yield farm with 500% APY...",
    time: "1h",
  },
  {
    id: 4,
    targetAccount: "@secret_dev",
    oldPosition: 45,
    newPosition: 67,
    postPreview: "leaked smart contract shows...",
    time: "2h",
  },
  {
    id: 5,
    targetAccount: "@token_hunter",
    oldPosition: 8,
    newPosition: 12,
    postPreview: "presale allocation strategy that...",
    time: "3h",
  },
  {
    id: 6,
    targetAccount: "@presale_info",
    oldPosition: 1,
    newPosition: 2,
    postPreview: "exclusive airdrop eligibility for...",
    time: "4h",
  },
];

function getNotificationIcon(type: PublicNotification["type"]) {
  switch (type) {
    case "like":
      return <Heart className="w-5 h-5 text-red-500" />;
    case "follow":
      return <UserPlus className="w-5 h-5 text-primary" />;
    case "comment":
      return <MessageCircle className="w-5 h-5 text-blue-500" />;
    case "mention":
      return <AtSign className="w-5 h-5 text-primary" />;
    case "shadow_mention":
      return <EyeOff className="w-5 h-5 text-violet-500" />;
  }
}

function NotificationsContent() {
  const { isShadowMode } = useMode();

  if (!isShadowMode) {
    return (
      <div className="border-x border-border min-h-screen">
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3">
          <h1 className="text-xl font-bold text-foreground">notifications</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <Bell className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium text-foreground">still building</p>
          <p className="text-sm text-muted-foreground mt-1">notifications are not available in alpha</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-x border-border min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3">
        <h1 className="text-xl font-bold text-foreground">notifications</h1>
        <p className="text-xs text-muted-foreground mt-1">
          // position updates
        </p>
      </div>

      {/* Notifications List */}
      <div className="divide-y divide-border">
        {shadowNotifications.map((notif) => (
            <div
              key={notif.id}
              className="px-4 py-4 hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-red-500/20">
                  <TrendingDown className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground">
                    your post on{" "}
                    <span className="text-primary font-medium">{notif.targetAccount}</span>
                    {" "}has been passed
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 truncate">
                    {notif.postPreview}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    #{notif.oldPosition} → #{notif.newPosition}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{notif.time}</span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <AppLayout>
      <NotificationsContent />
    </AppLayout>
  );
}
