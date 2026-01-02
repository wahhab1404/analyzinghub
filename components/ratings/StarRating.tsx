'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  rating: number
  maxRating?: number
  size?: 'sm' | 'md' | 'lg'
  showValue?: boolean
  interactive?: boolean
  onChange?: (rating: number) => void
}

export function StarRating({
  rating,
  maxRating = 10,
  size = 'md',
  showValue = true,
  interactive = false,
  onChange
}: StarRatingProps) {
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  }

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  }

  const percentage = (rating / maxRating) * 100

  const handleClick = (index: number) => {
    if (interactive && onChange) {
      onChange(index + 1)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: maxRating }).map((_, index) => {
          const isFilled = index < Math.floor(rating)
          const isPartial = index === Math.floor(rating) && rating % 1 !== 0
          const partialPercentage = isPartial ? (rating % 1) * 100 : 0

          return (
            <div
              key={index}
              className={cn(
                'relative',
                interactive && 'cursor-pointer transition-transform hover:scale-110'
              )}
              onClick={() => handleClick(index)}
            >
              <Star
                className={cn(
                  sizeClasses[size],
                  'text-neutral-300 dark:text-neutral-700'
                )}
              />
              {isFilled && (
                <Star
                  className={cn(
                    sizeClasses[size],
                    'absolute top-0 left-0 text-yellow-500 fill-yellow-500'
                  )}
                />
              )}
              {isPartial && (
                <div
                  className="absolute top-0 left-0 overflow-hidden"
                  style={{ width: `${partialPercentage}%` }}
                >
                  <Star
                    className={cn(
                      sizeClasses[size],
                      'text-yellow-500 fill-yellow-500'
                    )}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      {showValue && (
        <span className={cn('font-medium text-neutral-700 dark:text-neutral-300', textSizeClasses[size])}>
          {rating.toFixed(1)}/{maxRating}
        </span>
      )}
    </div>
  )
}
