'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AddTradeForm } from '@/components/indices/AddTradeForm'
import { ArrowLeft, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default function CreateIndexTradePage() {
  const router = useRouter()

  const handleSuccess = () => {
    router.push('/dashboard/indices')
  }

  const handleCancel = () => {
    router.push('/dashboard/indices')
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-6">
        <Link href="/dashboard/indices">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Indices Hub
          </Button>
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Create Index Trade</h1>
        </div>
        <p className="text-muted-foreground">
          Create a new standalone options trade for SPX or other indices
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Index Trade</CardTitle>
          <CardDescription>
            Search for an options contract and add it as a trade. Your trade will be tracked automatically and you can share updates with your subscribers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddTradeForm
            analysisId={null}
            indexSymbol="SPX"
            onComplete={handleSuccess}
            onCancel={handleCancel}
            standalone={true}
          />
        </CardContent>
      </Card>
    </div>
  )
}
