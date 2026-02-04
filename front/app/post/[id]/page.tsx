"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  ChevronDown,
  ChevronUp,
  X,
  Image as ImageIcon,
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

// Build comment tree from flat array
function buildCommentTree(comments: api.Comment[]): Map<number | null, api.Comment[]> {
  const tree = new Map<number | null, api.Comment[]>();

  comments.forEach(comment => {
    const parentId = comment.parent_comment_id;
    if (!tree.has(parentId)) {
      tree.set(parentId, []);
    }
    tree.get(parentId)!.push(comment);
  });

  return tree;
}

interface CommentItemProps {
  comment: api.Comment;
  commentTree: Map<number | null, api.Comment[]>;
  depth: number;
  postId: number;
  currentUserId: number | null;
  isAuthenticated: boolean;
  onReply: (comment: api.Comment) => void;
  onDelete: (commentId: number) => void;
  onLike: (commentId: number) => void;
  getAvatarUrl: (pic: string | null, username: string | null, seed: string | number) => string;
}

function CommentItem({
  comment,
  commentTree,
  depth,
  postId,
  currentUserId,
  isAuthenticated,
  onReply,
  onDelete,
  onLike,
  getAvatarUrl,
}: CommentItemProps) {
  const [showReplies, setShowReplies] = useState(depth < 2); // Auto-expand first 2 levels
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const replies = commentTree.get(comment.id) || [];
  const hasReplies = replies.length > 0;

  // Max visible depth before "Continue thread"
  const MAX_DEPTH = 5;

  return (
    <div className="relative">
      {/* Vertical thread line */}
      {depth > 0 && (
        <div
          className="absolute left-5 top-0 bottom-0 w-0.5 bg-border"
          style={{ marginLeft: `${(depth - 1) * 44}px` }}
        />
      )}

      <div
        className="relative flex gap-3 p-4 hover:bg-muted/50 transition-colors"
        style={{ paddingLeft: `${16 + depth * 44}px` }}
      >
        {/* Connect line to parent */}
        {depth > 0 && (
          <div
            className="absolute top-0 left-5 h-4 w-4 border-l-2 border-b-2 border-border rounded-bl-xl"
            style={{ marginLeft: `${(depth - 1) * 44}px` }}
          />
        )}

        <a href={`/user/${comment.username}`} className="flex-shrink-0">
          <img
            src={getAvatarUrl(comment.profile_picture, comment.username, comment.user_id)}
            alt={comment.username}
            className="w-10 h-10 rounded-full object-cover"
          />
        </a>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <a href={`/user/${comment.username}`} className="font-medium text-foreground hover:underline truncate">
                {comment.username || "Anonymous"}
              </a>
              <span className="text-muted-foreground text-sm flex-shrink-0">{comment.time_ago}</span>
            </div>

            {/* Menu for own comments */}
            {currentUserId && currentUserId === comment.user_id && (
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
                      onClick={() => {
                        onDelete(comment.id);
                        setOpenMenuId(null);
                      }}
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

          <p className="mt-1 text-foreground break-words">
            {renderContentWithMentions(comment.content)}
          </p>

          {/* Comment image */}
          {comment.image && (
            <div
              className="mt-2 rounded-xl overflow-hidden border border-border cursor-pointer max-w-md"
              onClick={() => window.open(getImageUrl(comment.image!, ""), "_blank")}
            >
              <img
                src={getImageUrl(comment.image, "")}
                alt=""
                className="w-full max-h-64 object-cover hover:opacity-90 transition-opacity"
              />
            </div>
          )}

          {/* Comment Actions */}
          <div className="flex items-center gap-4 mt-2">
            <button
              onClick={() => onLike(comment.id)}
              className={`flex items-center gap-1.5 transition-colors ${
                comment.has_liked
                  ? "text-red-500"
                  : "text-muted-foreground hover:text-red-500"
              }`}
            >
              <Heart className={`w-4 h-4 ${comment.has_liked ? "fill-current" : ""}`} />
              <span className="text-sm">{comment.like_count}</span>
            </button>

            <button
              onClick={() => {
                if (!isAuthenticated) {
                  alert("Please connect your wallet to reply");
                  return;
                }
                onReply(comment);
              }}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="text-sm">Reply</span>
            </button>

            {hasReplies && (
              <button
                onClick={() => setShowReplies(!showReplies)}
                className="flex items-center gap-1 text-primary hover:underline text-sm"
              >
                {showReplies ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Hide replies
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    {replies.length} {replies.length === 1 ? "reply" : "replies"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {hasReplies && showReplies && (
        <div>
          {depth >= MAX_DEPTH ? (
            // Show "Continue this thread" link
            <a
              href={`/post/${postId}?focus=${comment.id}`}
              className="block py-3 text-primary hover:underline text-sm"
              style={{ paddingLeft: `${16 + (depth + 1) * 44}px` }}
            >
              Continue this thread →
            </a>
          ) : (
            // Show nested replies
            replies.map(reply => (
              <CommentItem
                key={reply.id}
                comment={reply}
                commentTree={commentTree}
                depth={depth + 1}
                postId={postId}
                currentUserId={currentUserId}
                isAuthenticated={isAuthenticated}
                onReply={onReply}
                onDelete={onDelete}
                onLike={onLike}
                getAvatarUrl={getAvatarUrl}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
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
  const [replyModalComment, setReplyModalComment] = useState<api.Comment | null>(null);
  const [replyText, setReplyText] = useState("");
  const { showToast } = useToast();

  // Image upload states for main comment input
  const commentFileInputRef = useRef<HTMLInputElement>(null);
  const [commentImage, setCommentImage] = useState<File | null>(null);
  const [commentImagePreview, setCommentImagePreview] = useState<string | null>(null);

  // Image upload states for reply modal
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [replyImagePreview, setReplyImagePreview] = useState<string | null>(null);

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
      const response = await api.addComment(post.id, newComment.trim(), undefined, commentImage || undefined);
      if (response.success) {
        setComments(prev => [...prev, response.comment]);
        setPost({ ...post, comment_count: response.comment_count });
        setNewComment("");
        removeCommentImage();
      }
    } catch (err) {
      console.error("Failed to add comment:", err);
      alert("Failed to add comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitReply = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!replyModalComment || !replyText.trim() || !post) return;

    setIsSubmitting(true);
    try {
      const response = await api.addComment(post.id, replyText.trim(), replyModalComment.id, replyImage || undefined);
      if (response.success) {
        setComments(prev => [...prev, response.comment]);
        setPost({ ...post, comment_count: response.comment_count });
        // Update reply count of parent comment
        setComments(prev => prev.map(c =>
          c.id === replyModalComment.id
            ? { ...c, reply_count: c.reply_count + 1 }
            : c
        ));
        setReplyText("");
        removeReplyImage();
        setReplyModalComment(null);
      }
    } catch (err) {
      console.error("Failed to add reply:", err);
      alert("Failed to add reply");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!post) return;

    try {
      const response = await api.deleteComment(commentId, post.id);
      if (response.success) {
        // Remove comment and all its replies
        const idsToRemove = new Set<number>();
        const collectIds = (id: number) => {
          idsToRemove.add(id);
          comments.filter(c => c.parent_comment_id === id).forEach(c => collectIds(c.id));
        };
        collectIds(commentId);

        setComments(comments.filter(c => !idsToRemove.has(c.id)));
        setPost({ ...post, comment_count: response.comment_count });
      }
    } catch (err) {
      console.error("Failed to delete comment:", err);
      alert("Failed to delete comment");
    }
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

  const handleReply = useCallback((comment: api.Comment) => {
    setReplyModalComment(comment);
    setReplyText("");
    // Clear any previous reply image
    setReplyImage(null);
    if (replyImagePreview) URL.revokeObjectURL(replyImagePreview);
    setReplyImagePreview(null);
    if (replyFileInputRef.current) replyFileInputRef.current.value = "";
  }, [replyImagePreview]);

  const closeReplyModal = useCallback(() => {
    setReplyModalComment(null);
    setReplyText("");
    removeReplyImage();
  }, []);

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

  // Image handling for main comment input
  const handleCommentImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      showToast("Image must be less than 20MB", "error");
      return;
    }
    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file", "error");
      return;
    }
    setCommentImage(file);
    setCommentImagePreview(URL.createObjectURL(file));
  };

  const removeCommentImage = () => {
    setCommentImage(null);
    if (commentImagePreview) URL.revokeObjectURL(commentImagePreview);
    setCommentImagePreview(null);
    if (commentFileInputRef.current) commentFileInputRef.current.value = "";
  };

  // Image handling for reply modal
  const handleReplyImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      showToast("Image must be less than 20MB", "error");
      return;
    }
    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file", "error");
      return;
    }
    setReplyImage(file);
    setReplyImagePreview(URL.createObjectURL(file));
  };

  const removeReplyImage = () => {
    setReplyImage(null);
    if (replyImagePreview) URL.revokeObjectURL(replyImagePreview);
    setReplyImagePreview(null);
    if (replyFileInputRef.current) replyFileInputRef.current.value = "";
  };

  // Build comment tree
  const commentTree = buildCommentTree(comments);
  const rootComments = commentTree.get(null) || [];

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
                @{post.wallet_address ? `${post.wallet_address.slice(0, 6)}...${post.wallet_address.slice(-4)}` : post.username || "anon"}
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
            <div
              className="mt-3 rounded-xl overflow-hidden border border-border cursor-pointer"
              onClick={() => window.open(getImageUrl(post.image!, ""), "_blank")}
            >
              <img src={getImageUrl(post.image, "")} alt="" className="w-full max-h-[500px] object-cover hover:opacity-90 transition-opacity" />
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
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <textarea
                id="comment-input"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Post your reply..."
                className="w-full bg-muted rounded-xl px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none min-h-[44px]"
                disabled={isSubmitting}
                rows={1}
              />
              {/* Image preview */}
              {commentImagePreview && (
                <div className="relative mt-2 rounded-xl overflow-hidden border border-border">
                  <img src={commentImagePreview} alt="Preview" className="w-full max-h-48 object-cover" />
                  <button
                    type="button"
                    onClick={removeCommentImage}
                    className="absolute top-2 right-2 p-1 rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center">
                  <input
                    ref={commentFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleCommentImageSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => commentFileInputRef.current?.click()}
                    className="p-2 rounded-full text-primary hover:bg-primary/10 transition-colors"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={!newComment.trim() || isSubmitting}
                  className="px-4 py-1.5 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
          </div>
        </form>
      )}

      {/* Comments List */}
      <div>
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
          <div className="divide-y divide-border">
            {rootComments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                commentTree={commentTree}
                depth={0}
                postId={postId}
                currentUserId={user?.id || null}
                isAuthenticated={isAuthenticated}
                onReply={handleReply}
                onDelete={handleDeleteComment}
                onLike={handleLikeComment}
                getAvatarUrl={getAvatarUrl}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reply Modal */}
      {replyModalComment && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeReplyModal}
          />

          {/* Modal */}
          <div className="relative bg-background rounded-2xl w-full max-w-xl max-h-[80vh] overflow-hidden shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <button
                onClick={closeReplyModal}
                className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5 text-foreground" />
              </button>
              <span className="text-sm text-muted-foreground">Reply</span>
              <div className="w-9" /> {/* Spacer for centering */}
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto">
              {/* Original comment */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <img
                    src={getAvatarUrl(replyModalComment.profile_picture, replyModalComment.username, replyModalComment.user_id)}
                    alt={replyModalComment.username || "User"}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  {/* Vertical line connecting to reply */}
                  <div className="w-0.5 flex-1 bg-border mt-2 min-h-[40px]" />
                </div>
                <div className="flex-1 min-w-0 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {replyModalComment.username || "Anonymous"}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {replyModalComment.time_ago}
                    </span>
                  </div>
                  <p className="mt-1 text-foreground break-words">
                    {renderContentWithMentions(replyModalComment.content)}
                  </p>
                  {replyModalComment.image && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-border max-w-xs">
                      <img
                        src={getImageUrl(replyModalComment.image, "")}
                        alt=""
                        className="w-full max-h-32 object-cover"
                      />
                    </div>
                  )}
                  <p className="mt-3 text-sm text-muted-foreground">
                    Replying to <span className="text-primary">@{replyModalComment.username || "Anonymous"}</span>
                  </p>
                </div>
              </div>

              {/* Reply input */}
              <form onSubmit={handleSubmitReply} className="flex gap-3 mt-2">
                <img
                  src={getAvatarUrl(user?.profile_picture || null, user?.username || null, user?.id || "user")}
                  alt="You"
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div className="flex-1">
                  <textarea
                    autoFocus
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Post your reply"
                    className="w-full bg-transparent text-foreground text-lg placeholder:text-muted-foreground focus:outline-none resize-none min-h-[100px]"
                    disabled={isSubmitting}
                  />
                  {/* Reply image preview */}
                  {replyImagePreview && (
                    <div className="relative mt-2 rounded-xl overflow-hidden border border-border">
                      <img src={replyImagePreview} alt="Preview" className="w-full max-h-48 object-cover" />
                      <button
                        type="button"
                        onClick={removeReplyImage}
                        className="absolute top-2 right-2 p-1 rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="flex items-center">
                <input
                  ref={replyFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleReplyImageSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => replyFileInputRef.current?.click()}
                  className="p-2 rounded-full text-primary hover:bg-primary/10 transition-colors"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
              </div>
              <button
                onClick={() => handleSubmitReply()}
                disabled={!replyText.trim() || isSubmitting}
                className="px-5 py-2 bg-primary text-primary-foreground rounded-full font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Reply
              </button>
            </div>
          </div>
        </div>
      )}
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
