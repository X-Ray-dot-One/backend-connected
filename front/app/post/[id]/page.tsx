"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { useAuth } from "@/contexts/auth-context";
import * as api from "@/lib/api";
import { getImageUrl } from "@/lib/utils";
import {
  Heart,
  MessageCircle,
  Share,
  ArrowLeft,
  Loader2,
  Send,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { useToast } from "@/components/toast";

// Helper function to render content with colored mentions
function renderContentWithMentions(content: string) {
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, index) => {
    if (part.startsWith("@")) {
      const username = part.slice(1);
      return (
        <a
          key={index}
          href={`/user/${username}`}
          className="text-primary hover:underline cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function PostDetailContent() {
  const params = useParams();
  const postId = parseInt(params.id as string);
  const { user, isAuthenticated } = useAuth();

  const [post, setPost] = useState<api.Post | null>(null);
  const [comments, setComments] = useState<api.Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const { showToast } = useToast();

  // Load post
  useEffect(() => {
    if (postId) {
      loadPost();
      loadComments();
    }
  }, [postId]);

  const loadPost = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.getPost(postId);
      if (response.success && response.post) {
        setPost(response.post);
      } else {
        setError("Post not found");
      }
    } catch (err) {
      console.error("Failed to load post:", err);
      setError("Failed to load post");
    } finally {
      setIsLoading(false);
    }
  };

  const loadComments = async () => {
    setIsLoadingComments(true);
    try {
      const response = await api.getComments(postId);
      if (response.success) {
        setComments(response.comments || []);
      }
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const handleLike = async () => {
    if (!isAuthenticated || !post) {
      alert("Please connect your wallet to like posts");
      return;
    }

    try {
      const response = await api.toggleLike(post.id);
      if (response.success) {
        setPost({
          ...post,
          has_liked: response.action === "liked",
          like_count: response.like_count,
        });
      }
    } catch (err) {
      console.error("Failed to toggle like:", err);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      alert("Please connect your wallet to comment");
      return;
    }
    if (!newComment.trim() || !post) return;

    setIsSubmitting(true);
    try {
      const response = await api.addComment(post.id, newComment.trim());
      if (response.success) {
        setComments([response.comment, ...comments]);
        setPost({ ...post, comment_count: response.comment_count });
        setNewComment("");
      }
    } catch (err) {
      console.error("Failed to add comment:", err);
      alert("Failed to add comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!post) return;

    try {
      const response = await api.deleteComment(commentId, post.id);
      if (response.success) {
        setComments(comments.filter(c => c.id !== commentId));
        setPost({ ...post, comment_count: response.comment_count });
      }
    } catch (err) {
      console.error("Failed to delete comment:", err);
      alert("Failed to delete comment");
    }
    setOpenMenuId(null);
  };

  const handleLikeComment = async (commentId: number) => {
    if (!isAuthenticated) {
      alert("Please connect your wallet to like comments");
      return;
    }

    try {
      const response = await api.toggleCommentLike(commentId);
      if (response.success) {
        setComments(comments.map(c =>
          c.id === commentId
            ? { ...c, has_liked: response.action === "liked", like_count: response.like_count }
            : c
        ));
      }
    } catch (err) {
      console.error("Failed to toggle comment like:", err);
    }
  };

  const getAvatarUrl = (profilePicture: string | null, username: string | null, fallbackSeed: string | number) => {
    const fallback = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username || fallbackSeed}`;
    return getImageUrl(profilePicture, fallback);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/post/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied!");
    } catch (err) {
      console.error("Failed to copy:", err);
      showToast("Failed to copy link", "error");
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="border-x border-border min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error || !post) {
    return (
      <div className="border-x border-border min-h-screen">
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="flex items-center gap-4 px-4 py-3">
            <a href="/" className="p-2 rounded-full hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </a>
            <h1 className="text-xl font-bold text-foreground">Post</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-8 mt-20">
          <p className="text-xl font-bold text-foreground mb-2">Post not found</p>
          <p className="text-muted-foreground text-center mb-4">
            This post doesn&apos;t exist or has been removed
          </p>
          <a
            href="/"
            className="px-6 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Go to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="border-x border-border min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-4 px-4 py-3">
          <a href="/" className="p-2 rounded-full hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </a>
          <h1 className="text-xl font-bold text-foreground">Post</h1>
        </div>
      </div>

      {/* Main Post */}
      <div className="p-4 border-b border-border">
        <div className="flex gap-3">
          <a href={`/user/${post.username}`}>
            <img
              src={getAvatarUrl(post.profile_picture, post.username, post.user_id)}
              alt={post.username || "User"}
              className="w-12 h-12 rounded-full ring-2 ring-primary/20 object-cover"
            />
          </a>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <a href={`/user/${post.username}`} className="font-bold text-foreground hover:underline">
                {post.username || "Anonymous"}
              </a>
              <a href={`/user/${post.username}`} className="text-muted-foreground hover:underline">
                @{post.username || "anon"}
              </a>
            </div>
          </div>
        </div>

        {/* Post Content */}
        <div className="mt-4">
          <p className="text-xl text-foreground leading-relaxed">
            {renderContentWithMentions(post.content)}
          </p>
          {post.image && (
            <div className="mt-3 rounded-xl overflow-hidden border border-border">
              <img src={getImageUrl(post.image, "")} alt="" className="w-full max-h-[500px] object-cover" />
            </div>
          )}
        </div>

        {/* Time */}
        <div className="mt-4 text-muted-foreground text-sm">
          {post.time_ago}
        </div>

        {/* Stats */}
        <div className="flex gap-6 mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-1">
            <span className="font-bold text-foreground">{post.like_count}</span>
            <span className="text-muted-foreground">Likes</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-bold text-foreground">{post.comment_count}</span>
            <span className="text-muted-foreground">Comments</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-around mt-4 pt-4 border-t border-border">
          <button
            onClick={handleLike}
            className={`flex items-center gap-2 p-2 rounded-full transition-colors ${
              post.has_liked
                ? "text-red-500"
                : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
            }`}
          >
            <Heart className={`w-5 h-5 ${post.has_liked ? "fill-current" : ""}`} />
          </button>
          <button className="flex items-center gap-2 p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
            <MessageCircle className="w-5 h-5" />
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-2 p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Share className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Comment Input */}
      {isAuthenticated && (
        <form onSubmit={handleSubmitComment} className="p-4 border-b border-border">
          <div className="flex gap-3">
            <img
              src={getAvatarUrl(user?.profile_picture || null, user?.username || null, user?.id || "user")}
              alt="You"
              className="w-10 h-10 rounded-full object-cover"
            />
            <div className="flex-1 flex gap-2 min-w-0">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Post your reply..."
                className="flex-1 min-w-0 bg-muted rounded-full px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isSubmitting}
              />
              <button
                type="submit"
                disabled={!newComment.trim() || isSubmitting}
                className="flex-shrink-0 px-4 py-2 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Reply</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Comments List */}
      <div className="divide-y divide-border">
        {isLoadingComments ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : comments.length === 0 ? (
          <div className="p-8 text-center">
            <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No comments yet</p>
            <p className="text-sm text-muted-foreground mt-1">Be the first to reply!</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="p-4 hover:bg-muted/50 transition-colors">
              <div className="flex gap-3">
                <a href={`/user/${comment.username}`}>
                  <img
                    src={getAvatarUrl(comment.profile_picture, comment.username, comment.user_id)}
                    alt={comment.username}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                </a>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <a href={`/user/${comment.username}`} className="font-medium text-foreground hover:underline">
                        {comment.username || "Anonymous"}
                      </a>
                      <a href={`/user/${comment.username}`} className="text-muted-foreground text-sm hover:underline">
                        @{comment.username || "anon"}
                      </a>
                      <span className="text-muted-foreground text-sm">{comment.time_ago}</span>
                    </div>

                    {/* Menu for own comments */}
                    {user && user.id === comment.user_id && (
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === comment.id ? null : comment.id)}
                          className="p-1 rounded-full hover:bg-muted transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                        </button>
                        {openMenuId === comment.id && (
                          <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg py-1 z-10">
                            <button
                              onClick={() => handleDeleteComment(comment.id)}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-muted w-full"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="mt-1 text-foreground">
                    {renderContentWithMentions(comment.content)}
                  </p>

                  {/* Comment Actions */}
                  <div className="flex items-center gap-4 mt-2">
                    <button
                      onClick={() => handleLikeComment(comment.id)}
                      className={`flex items-center gap-1.5 transition-colors ${
                        comment.has_liked
                          ? "text-red-500"
                          : "text-muted-foreground hover:text-red-500"
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${comment.has_liked ? "fill-current" : ""}`} />
                      <span className="text-sm">{comment.like_count}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function PostDetailPage() {
  return (
    <AppLayout>
      <PostDetailContent />
    </AppLayout>
  );
}
