'use client'

import { useEffect, useState } from 'react'
import { X, Download, ZoomIn, ZoomOut, Share2 } from 'lucide-react'
import { Button } from './button'
import { Dialog, DialogContent } from './dialog'

interface ImageViewerProps {
  src: string
  alt: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDownload?: () => void
}

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

export function ImageViewer({ src, alt, open, onOpenChange, onDownload }: ImageViewerProps) {
  const [zoom, setZoom] = useState(1)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(isMobileDevice())
  }, [])

  useEffect(() => {
    if (open) {
      setZoom(1)
    }
  }, [open])

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.5))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden bg-black/95">
        <div className="relative w-full h-[95vh] flex items-center justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </Button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full p-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 rounded-full h-10 w-10"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
            >
              <ZoomOut className="h-5 w-5" />
            </Button>

            <span className="text-white text-sm font-medium min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 rounded-full h-10 w-10"
              onClick={handleZoomIn}
              disabled={zoom >= 3}
            >
              <ZoomIn className="h-5 w-5" />
            </Button>

            {onDownload && (
              <>
                <div className="w-px h-6 bg-white/20 mx-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 rounded-full h-10 w-10"
                  onClick={onDownload}
                  title={isMobile ? "Share or Download Image" : "Download Image"}
                >
                  {isMobile ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
                </Button>
              </>
            )}
          </div>

          <div className="overflow-auto w-full h-full flex items-center justify-center p-4">
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{ transform: `scale(${zoom})` }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
