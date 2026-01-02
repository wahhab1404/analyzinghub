'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2, Send, MessageCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import Link from 'next/link'
import { useAnalytics } from '@/hooks/use-analytics'
import { useTranslation } from '@/lib/i18n/language-context'

interface Comment {
  id: string
  content: string
  created_at: string
  user_id: string
  parent_comment_id: string | null
  profiles: {
    id: string
    full_name: string
    avatar_url: string | null
  }
  replies?: Comment[]
}

interface CommentSectionProps {
  analysisId: string
  onCommentAdded?: () => void
  showReplies?: boolean
}

interface CommentItemProps {
  comment: Comment
  analysisId: string
  onReplyAdded: () => void
  showReplies?: boolean
  level?: number
}

function CommentItem({ comment, analysisId, onReplyAdded, showReplies = false, level = 0 }: CommentItemProps) {
  const { t } = useTranslation()
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const analytics = useAnalytics()

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!replyContent.trim()) {
      toast.error(t.forms.comments.replyCannotBeEmpty)
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/analyses/${analysisId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: replyContent,
          parent_comment_id: comment.id,
        }),
      })

      if (response.ok) {
        setReplyContent('')
        setShowReplyForm(false)
        toast.success(t.forms.comments.replyAdded)
        analytics.trackAnalysisComment(analysisId)
        onReplyAdded()
      } else {
        const data = await response.json()
        toast.error(data.error || t.forms.comments.failedToAddReply)
      }
    } catch (error) {
      console.error('Error submitting reply:', error)
      toast.error(t.forms.comments.failedToAddReply)
    } finally {
      setIsSubmitting(false)
    }
  }

  const maxNestingLevel = 3

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <Link href={`/dashboard/profile/${comment.user_id}`}>
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage src={comment.profiles?.avatar_url || undefined} />
            <AvatarFallback>
              {comment.profiles?.full_name?.slice(0, 2).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/dashboard/profile/${comment.user_id}`}
              className="font-semibold text-sm hover:underline"
            >
              {comment.profiles?.full_name || 'Anonymous'}
            </Link>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm break-words">{comment.content}</p>
          {showReplies && level < maxNestingLevel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReplyForm(!showReplyForm)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <MessageCircle className="h-3 w-3 mr-1" />
              {t.analysis.reply}
            </Button>
          )}

          {showReplyForm && (
            <form onSubmit={handleReplySubmit} className="space-y-2 mt-2">
              <Textarea
                placeholder={t.forms.comments.writeReply}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                disabled={isSubmitting}
                rows={2}
                className="resize-none text-sm"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowReplyForm(false)
                    setReplyContent('')
                  }}
                  disabled={isSubmitting}
                >
                  {t.common.cancel}
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting || !replyContent.trim()}>
                  {isSubmitting ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Send className="h-3 w-3 mr-1" />
                  )}
                  {t.analysis.reply}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {showReplies && comment.replies && comment.replies.length > 0 && (
        <div className="ml-11 space-y-3 border-l-2 border-muted pl-4">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              analysisId={analysisId}
              onReplyAdded={onReplyAdded}
              showReplies={showReplies}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function CommentSection({ analysisId, onCommentAdded, showReplies = false }: CommentSectionProps) {
  const { t } = useTranslation()
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const analytics = useAnalytics()

  useEffect(() => {
    fetchComments()
  }, [analysisId])

  const fetchComments = async () => {
    setIsLoading(true)
    try {
      console.log('[CommentSection] Fetching comments for analysis:', analysisId)
      const response = await fetch(`/api/analyses/${analysisId}/comments`)
      console.log('[CommentSection] Response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        const allComments = data.comments || []
        console.log('[CommentSection] Received comments:', allComments.length)

        if (showReplies) {
          const commentMap = new Map<string, Comment>()
          const rootComments: Comment[] = []

          allComments.forEach((comment: Comment) => {
            commentMap.set(comment.id, { ...comment, replies: [] })
          })

          allComments.forEach((comment: Comment) => {
            const commentWithReplies = commentMap.get(comment.id)!
            if (comment.parent_comment_id) {
              const parent = commentMap.get(comment.parent_comment_id)
              if (parent) {
                parent.replies = parent.replies || []
                parent.replies.push(commentWithReplies)
              }
            } else {
              rootComments.push(commentWithReplies)
            }
          })

          console.log('[CommentSection] Root comments after nesting:', rootComments.length)
          setComments(rootComments)
        } else {
          const filteredComments = allComments.filter((c: Comment) => !c.parent_comment_id)
          console.log('[CommentSection] Root comments (no nesting):', filteredComments.length)
          setComments(filteredComments)
        }
      } else {
        console.error('[CommentSection] Failed to fetch comments:', response.status, response.statusText)
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[CommentSection] Error data:', errorData)
      }
    } catch (error) {
      console.error('[CommentSection] Error fetching comments:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newComment.trim()) {
      toast.error(t.forms.comments.commentCannotBeEmpty)
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/analyses/${analysisId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: newComment }),
      })

      if (response.ok) {
        setNewComment('')
        toast.success(t.forms.comments.commentAdded)
        analytics.trackAnalysisComment(analysisId)
        onCommentAdded?.()
        fetchComments()
      } else {
        const data = await response.json()
        toast.error(data.error || t.forms.comments.failedToAddComment)
      }
    } catch (error) {
      console.error('Error submitting comment:', error)
      toast.error(t.forms.comments.failedToAddComment)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          placeholder={t.analysis.writeComment}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          disabled={isSubmitting}
          rows={3}
          className="resize-none"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={isSubmitting || !newComment.trim()}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {t.analysis.postComment}
          </Button>
        </div>
      </form>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">{t.forms.comments.noCommentsYet}</p>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              analysisId={analysisId}
              onReplyAdded={fetchComments}
              showReplies={showReplies}
            />
          ))
        )}
      </div>
    </div>
  )
}
