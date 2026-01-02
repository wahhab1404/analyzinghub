'use client'

import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TrendingUp, Clock, Target, AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'

export function AnalysisCardPreview() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCount((prev) => (prev < 2456.78 ? prev + 12.34 : 2456.78))
    }, 50)

    return () => clearInterval(interval)
  }, [])

  return (
    <motion.div
      animate={{
        scale: [1, 1.02, 1]
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut'
      }}
      className="relative"
    >
      <Card className="border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-2xl font-bold text-foreground">AAPL</h3>
              <Badge className="bg-green-500/20 text-green-500">LONG</Badge>
            </div>
            <p className="text-sm text-muted-foreground">1D Timeframe</p>
          </div>
          <Badge className="bg-primary/20 text-primary">
            <Clock className="mr-1 h-3 w-3" />
            In Progress
          </Badge>
        </div>

        <div className="mb-4 rounded-lg bg-muted p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-1 w-full rounded-full bg-muted-foreground/20">
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '65%' }}
                transition={{ duration: 2, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500"
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Entry: $180.50</span>
            <span className="text-green-500 font-semibold">Current: ${count.toFixed(2)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
            <div className="mb-1 flex items-center gap-1 text-xs text-red-500">
              <AlertTriangle className="h-3 w-3" />
              Stop Loss
            </div>
            <p className="text-lg font-bold text-red-500">$175.00</p>
          </div>
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
            <div className="mb-1 flex items-center gap-1 text-xs text-green-500">
              <Target className="h-3 w-3" />
              Target
            </div>
            <p className="text-lg font-bold text-green-500">$195.00</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>ETA: 5 days</span>
          <span>Posted 2 days ago</span>
        </div>

        <div className="mt-4 flex items-center gap-2 pt-4 border-t border-border">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent" />
          <div>
            <p className="text-sm font-semibold text-foreground">@ProTrader_Mike</p>
            <p className="text-xs text-muted-foreground">Win-rate: 78.5%</p>
          </div>
        </div>
      </Card>

      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1, type: 'spring' }}
        className="absolute -right-4 -top-4 rounded-full bg-gradient-to-r from-primary to-accent p-3 shadow-lg"
      >
        <TrendingUp className="h-5 w-5 text-white" />
      </motion.div>
    </motion.div>
  )
}
