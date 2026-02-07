'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Eye, Trash2, CheckCircle, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface Analysis {
  id: string
  symbol: {
    symbol: string
  }
  direction: string
  content: string
  analyzer: {
    id: string
    full_name: string
    email: string
  }
  created_at: string
  likes_count: number
  comments_count: number
}

export default function ContentModeration() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    loadAnalyses()
  }, [filter])

  const loadAnalyses = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/admin/content?filter=${filter}`)
      if (response.ok) {
        const data = await response.json()
        setAnalyses(data.analyses)
      }
    } catch (error) {
      console.error('Failed to load analyses:', error)
      toast.error('Failed to load content')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAnalysis = async (id: string) => {
    if (!confirm('Are you sure you want to delete this analysis?')) return

    try {
      const response = await fetch(`/api/admin/content/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success('Analysis deleted successfully')
        loadAnalyses()
      } else {
        toast.error('Failed to delete analysis')
      }
    } catch (error) {
      console.error('Failed to delete analysis:', error)
      toast.error('Failed to delete analysis')
    }
  }

  const handleApproveAnalysis = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/content/${id}/approve`, {
        method: 'POST',
      })

      if (response.ok) {
        toast.success('Analysis approved')
        loadAnalyses()
      } else {
        toast.error('Failed to approve analysis')
      }
    } catch (error) {
      console.error('Failed to approve analysis:', error)
      toast.error('Failed to approve analysis')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Content Moderation</CardTitle>
        <CardDescription>Review and moderate user-generated content</CardDescription>
        <div className="flex gap-4 mt-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter content" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Content</SelectItem>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="reported">Reported</SelectItem>
              <SelectItem value="popular">Popular</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Engagement</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading content...
                  </TableCell>
                </TableRow>
              ) : analyses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    No content found
                  </TableCell>
                </TableRow>
              ) : (
                analyses.map((analysis) => (
                  <TableRow key={analysis.id}>
                    <TableCell className="font-medium">
                      {analysis.symbol?.symbol || 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={analysis.direction === 'BULLISH' ? 'default' : 'destructive'}
                      >
                        {analysis.direction}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{analysis.analyzer?.full_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {analysis.analyzer?.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {analysis.likes_count} likes, {analysis.comments_count} comments
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(analysis.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Link href={`/dashboard/analysis/${analysis.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleApproveAnalysis(analysis.id)}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteAnalysis(analysis.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
