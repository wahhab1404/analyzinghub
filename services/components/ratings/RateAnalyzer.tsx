'use client'

import { useState, useEffect } from 'react'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface RateAnalyzerProps {
  analyzerId: string
  analyzerName: string
  currentRating?: {
    rating: number
    review_text?: string
  }
  onRatingSubmit?: () => void
}

export function RateAnalyzer({
  analyzerId,
  analyzerName,
  currentRating,
  onRatingSubmit
}: RateAnalyzerProps) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(currentRating?.rating || 0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [reviewText, setReviewText] = useState(currentRating?.review_text || '')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (currentRating) {
      setRating(currentRating.rating)
      setReviewText(currentRating.review_text || '')
    }
  }, [currentRating])

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error('Please select a rating')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/ratings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analyzer_id: analyzerId,
          rating,
          review_text: reviewText || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to submit rating')
      }

      toast.success('Rating submitted successfully')
      setOpen(false)
      if (onRatingSubmit) {
        onRatingSubmit()
      }
    } catch (error: any) {
      console.error('Error submitting rating:', error)
      toast.error(error.message || 'Failed to submit rating')
    } finally {
      setSubmitting(false)
    }
  }

  const displayRating = hoveredRating || rating

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Star className="w-4 h-4 mr-2" />
          {currentRating ? 'Update Rating' : 'Rate Analyzer'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Rate {analyzerName}</DialogTitle>
          <DialogDescription>
            Share your experience with this analyzer (1-10 stars)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-1">
              {Array.from({ length: 10 }).map((_, index) => {
                const starValue = index + 1
                const isFilled = starValue <= displayRating

                return (
                  <button
                    key={index}
                    type="button"
                    className="cursor-pointer transition-transform hover:scale-110 focus:outline-none"
                    onMouseEnter={() => setHoveredRating(starValue)}
                    onMouseLeave={() => setHoveredRating(0)}
                    onClick={() => setRating(starValue)}
                  >
                    <Star
                      className={cn(
                        'w-8 h-8',
                        isFilled
                          ? 'text-yellow-500 fill-yellow-500'
                          : 'text-neutral-300 dark:text-neutral-700'
                      )}
                    />
                  </button>
                )
              })}
            </div>
            {displayRating > 0 && (
              <span className="text-2xl font-semibold">
                {displayRating}/10
              </span>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              Review (Optional)
            </label>
            <Textarea
              placeholder="Share your thoughts about this analyzer..."
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || rating === 0}>
              {submitting ? 'Submitting...' : 'Submit Rating'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
