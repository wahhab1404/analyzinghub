'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Upload, FileText } from 'lucide-react'

interface FollowUpAnalysisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentAnalysisId: string | null
  indexSymbol: string | null
  onComplete: () => void
}

export function FollowUpAnalysisDialog({
  open,
  onOpenChange,
  parentAnalysisId,
  indexSymbol,
  onComplete
}: FollowUpAnalysisDialogProps) {
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [chartImage, setChartImage] = useState<File | null>(null)
  const [chartImageUrl, setChartImageUrl] = useState<string>('')

  if (!parentAnalysisId || !indexSymbol) return null

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setChartImage(file)
      setChartImageUrl(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title || !body) {
      toast.error('Please fill in all required fields')
      return
    }

    if (!chartImage && !chartImageUrl) {
      toast.error('Please upload a chart image')
      return
    }

    setLoading(true)

    try {
      let uploadedChartUrl = chartImageUrl

      if (chartImage) {
        const formData = new FormData()
        formData.append('file', chartImage)

        const uploadResponse = await fetch('/api/upload-chart', {
          method: 'POST',
          body: formData,
        })

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload chart image')
        }

        const uploadData = await uploadResponse.json()
        uploadedChartUrl = uploadData.url
      }

      const response = await fetch('/api/indices/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          index_symbol: indexSymbol,
          title: `${title} (Follow-up)`,
          body: `Follow-up to previous analysis:\n\n${body}`,
          chart_image_url: uploadedChartUrl,
          parent_analysis_id: parentAnalysisId,
          status: 'published',
          visibility: 'public',
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create follow-up analysis')
      }

      toast.success('Follow-up analysis created successfully!')
      onComplete()
      onOpenChange(false)

      setTitle('')
      setBody('')
      setChartImage(null)
      setChartImageUrl('')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create follow-up analysis')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge className="text-sm px-3 py-1">{indexSymbol}</Badge>
            <DialogTitle>Create Follow-up Analysis</DialogTitle>
          </div>
          <DialogDescription>
            Add a follow-up chart analysis to track the evolution of this setup.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Update, Continuation, Reversal..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Analysis Description *</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the current state, changes, or new insights..."
              rows={6}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chart">Chart Image *</Label>
            <div className="border-2 border-dashed rounded-lg p-6">
              {chartImageUrl ? (
                <div className="space-y-3">
                  <img
                    src={chartImageUrl}
                    alt="Chart preview"
                    className="w-full h-auto rounded-lg"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setChartImage(null)
                      setChartImageUrl('')
                    }}
                  >
                    Change Image
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 cursor-pointer">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Click to upload chart image
                  </span>
                  <input
                    id="chart"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Create Follow-up
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
