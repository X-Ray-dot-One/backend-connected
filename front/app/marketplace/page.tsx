"use client";

import { useState, useEffect } from "react";
import { Globe, Loader2, Crown, EyeOff, ArrowLeft, Search } from "lucide-react";
import { getPremiumNddList, PremiumNdd } from "@/lib/api";
import { getImageUrl } from "@/lib/utils";
import { NddPurchaseModal } from "@/components/ndd-purchase-modal";
import { AppLayout } from "@/components/app-layout";

function MarketplaceContent() {
  const [nddList, setNddList] = useState<PremiumNdd[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNdd, setSelectedNdd] = useState<PremiumNdd | null>(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    getPremiumNddList(100)
      .then((res) => {
        setNddList(res.ndds || []);
      })
      .catch((error) => {
        console.error("Failed to fetch NDD list:", error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const filteredNdds = nddList.filter((ndd) =>
    ndd.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="border-x border-border min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-4 px-4 py-3">
          <a href="/" className="p-2 rounded-full hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </a>
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">premium_ndd</h1>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="search identities..."
            className="w-full pl-10 pr-4 py-2.5 bg-muted rounded-full text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredNdds.length === 0 ? (
        <div className="px-4 py-20 text-center">
          <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">
            {searchQuery ? "no results" : "no premium identities available"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
          {filteredNdds.map((ndd) => (
            <button
              key={ndd.name}
              onClick={() => {
                setSelectedNdd(ndd);
                setIsPurchaseModalOpen(true);
              }}
              className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-pink-500/30 hover:bg-pink-500/5 transition-all text-left group"
            >
              {/* Avatar */}
              <div className="w-14 h-14 rounded-xl bg-pink-500/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                {ndd.pfp ? (
                  <img
                    src={getImageUrl(ndd.pfp, "")}
                    alt={ndd.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={`https://api.dicebear.com/7.x/shapes/svg?seed=${ndd.name}&backgroundColor=ec4899,a855f7,8b5cf6`}
                    alt={ndd.name}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-pink-500" />
                  <span className="font-bold text-pink-500 truncate">{ndd.name}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">premium identity</p>
              </div>

              {/* Price */}
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold text-foreground">{ndd.cost}</p>
                <p className="text-xs text-muted-foreground">SOL</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Purchase Modal */}
      {selectedNdd && (
        <NddPurchaseModal
          isOpen={isPurchaseModalOpen}
          onClose={() => {
            setIsPurchaseModalOpen(false);
            setSelectedNdd(null);
          }}
          ndd={selectedNdd}
          onSuccess={() => {
            setNddList((prev) => prev.filter((n) => n.name !== selectedNdd.name));
          }}
        />
      )}
    </div>
  );
}

export default function MarketplacePage() {
  return (
    <AppLayout>
      <MarketplaceContent />
    </AppLayout>
  );
}
