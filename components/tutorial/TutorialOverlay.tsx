'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/language-context'

interface TutorialStep {
  target?: string
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

interface TutorialOverlayProps {
  onComplete: () => void
  onSkip: () => void
}

export function TutorialOverlay({ onComplete, onSkip }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const { t } = useLanguage()

  const steps = t.tutorial.steps as TutorialStep[]

  useEffect(() => {
    const step = steps[currentStep]
    if (step.target) {
      const element = document.querySelector(step.target) as HTMLElement
      setTargetElement(element)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } else {
      setTargetElement(null)
    }
  }, [currentStep, steps])

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      onComplete()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const getTooltipPosition = () => {
    const padding = 16
    const maxHeight = window.innerHeight - (padding * 2)

    if (!targetElement) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxHeight: `${maxHeight}px`,
        maxWidth: `calc(100vw - ${padding * 2}px)`
      }
    }

    const rect = targetElement.getBoundingClientRect()
    const step = steps[currentStep]
    const position = step.position || 'bottom'

    const isMobile = window.innerWidth < 768
    const tooltipWidth = isMobile ? Math.min(350, window.innerWidth - (padding * 2)) : 400

    let style: React.CSSProperties = {
      position: 'fixed' as const,
      zIndex: 10002,
      maxHeight: `${maxHeight}px`,
      maxWidth: `calc(100vw - ${padding * 2}px)`
    }

    if (isMobile) {
      const targetBottom = rect.bottom
      const spaceBelow = window.innerHeight - targetBottom - padding
      const spaceAbove = rect.top - padding

      if (spaceBelow >= 200) {
        style.top = Math.min(targetBottom + padding, window.innerHeight - 200 - padding)
        style.maxHeight = `${spaceBelow - padding}px`
      } else if (spaceAbove >= 200) {
        style.bottom = Math.max(padding, window.innerHeight - rect.top + padding)
        style.maxHeight = `${spaceAbove - padding}px`
      } else {
        style.top = padding
        style.maxHeight = `${maxHeight}px`
      }

      style.left = padding
      style.right = padding
      style.width = 'auto'
      return style
    }

    switch (position) {
      case 'top':
        style.left = Math.max(padding, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding))
        style.bottom = Math.max(padding, window.innerHeight - rect.top + padding)
        style.maxHeight = `${rect.top - padding * 2}px`
        break
      case 'bottom':
        style.left = Math.max(padding, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding))
        style.top = Math.max(padding, Math.min(rect.bottom + padding, window.innerHeight - 300))
        style.maxHeight = `${window.innerHeight - rect.bottom - padding * 2}px`
        break
      case 'left':
        style.right = Math.max(padding, window.innerWidth - rect.left + padding)
        style.top = Math.max(padding, Math.min(rect.top, window.innerHeight - 300))
        style.maxHeight = `${maxHeight}px`
        break
      case 'right':
        style.left = Math.min(rect.right + padding, window.innerWidth - tooltipWidth - padding)
        style.top = Math.max(padding, Math.min(rect.top, window.innerHeight - 300))
        style.maxHeight = `${maxHeight}px`
        break
      case 'center':
      default:
        style.top = '50%'
        style.left = '50%'
        style.transform = 'translate(-50%, -50%)'
        break
    }

    return style
  }

  const getHighlightPosition = () => {
    if (!targetElement) return null

    const rect = targetElement.getBoundingClientRect()
    return {
      top: rect.top - 4,
      left: rect.left - 4,
      width: rect.width + 8,
      height: rect.height + 8,
    }
  }

  const highlightPosition = getHighlightPosition()

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[10000] transition-opacity"
        style={{ animation: 'fadeIn 0.3s ease-in' }}
      />

      {highlightPosition && (
        <>
          <div
            className="fixed z-[10001] rounded-lg bg-background"
            style={{
              top: `${highlightPosition.top}px`,
              left: `${highlightPosition.left}px`,
              width: `${highlightPosition.width}px`,
              height: `${highlightPosition.height}px`,
              pointerEvents: 'none',
              transition: 'all 0.3s ease-in-out',
            }}
          />
          <div
            className="fixed z-[10001] rounded-lg border-4 border-blue-500"
            style={{
              top: `${highlightPosition.top}px`,
              left: `${highlightPosition.left}px`,
              width: `${highlightPosition.width}px`,
              height: `${highlightPosition.height}px`,
              boxShadow: '0 0 20px rgba(59, 130, 246, 0.6), 0 0 0 9999px rgba(0, 0, 0, 0.75)',
              pointerEvents: 'none',
              transition: 'all 0.3s ease-in-out',
            }}
          />
        </>
      )}

      <Card
        className="w-full max-w-md z-[10002] overflow-y-auto overflow-x-hidden"
        style={getTooltipPosition()}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded whitespace-nowrap">
                  {currentStep + 1} / {steps.length}
                </span>
              </div>
              <h3 className="text-base font-bold break-words">{steps[currentStep].title}</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="h-7 w-7 p-0 shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed break-words">
            {steps[currentStep].description}
          </p>

          <div className="flex items-center justify-between pt-1 gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="shrink-0"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">{t.common.back}</span>
            </Button>

            <div className="flex gap-1">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-1 rounded-full transition-all ${
                    index === currentStep
                      ? 'w-6 bg-primary'
                      : index < currentStep
                      ? 'w-1 bg-primary/50'
                      : 'w-1 bg-muted'
                  }`}
                />
              ))}
            </div>

            <Button size="sm" onClick={handleNext} className="shrink-0">
              <span className="hidden sm:inline">
                {currentStep === steps.length - 1 ? t.tutorial.finish : t.common.next}
              </span>
              <span className="sm:hidden">
                {currentStep === steps.length - 1 ? t.tutorial.finish : 'Next'}
              </span>
              {currentStep < steps.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </>
  )
}
