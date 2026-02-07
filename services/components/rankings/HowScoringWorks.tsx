'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { HelpCircle, TrendingUp, Users, Trophy, Shield } from 'lucide-react'

export function HowScoringWorks() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <HelpCircle className="h-4 w-4 mr-2" />
          How Scoring Works
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">How Our Ranking System Works</DialogTitle>
          <DialogDescription>
            Transparent, auditable scoring that rewards accuracy and quality
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <TrendingUp className="h-6 w-6 text-primary mt-1" />
                <div className="space-y-2 flex-1">
                  <h3 className="font-semibold text-lg">Analyst Scoring</h3>
                  <p className="text-sm text-muted-foreground">
                    Points are awarded based on validated outcomes, not volume
                  </p>
                  <div className="space-y-2 mt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Create analysis</span>
                      <Badge variant="secondary">+5 points</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Target hit (per target)</span>
                      <Badge variant="default">+10 points</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Stop loss hit</span>
                      <Badge variant="destructive">-10 points</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    <strong>Note:</strong> All validations are system-generated based on real
                    market data. Manual edits are disabled after publication.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Users className="h-6 w-6 text-primary mt-1" />
                <div className="space-y-2 flex-1">
                  <h3 className="font-semibold text-lg">Trader Scoring</h3>
                  <p className="text-sm text-muted-foreground">
                    Rewards for quality engagement and accurate predictions
                  </p>
                  <div className="space-y-2 mt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Like analysis (unique)</span>
                      <Badge variant="secondary">+1 point</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Bookmark analysis (unique)</span>
                      <Badge variant="secondary">+2 points</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Repost analysis (unique)</span>
                      <Badge variant="default">+3 points</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Quality comment (25+ chars)</span>
                      <Badge variant="default">+3 points</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Rate closed analysis</span>
                      <Badge variant="default">+5 points</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    <strong>Quality rules:</strong> Comments must be at least 25 characters, not
                    repeated, and not only emojis or links.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Trophy className="h-6 w-6 text-primary mt-1" />
                <div className="space-y-2 flex-1">
                  <h3 className="font-semibold text-lg">Badges</h3>
                  <p className="text-sm text-muted-foreground">
                    Earned based on performance and engagement quality
                  </p>
                  <div className="space-y-3 mt-4">
                    <div>
                      <div className="font-medium text-sm mb-1">Analyst Badges</div>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-orange-100 text-orange-700">
                            Consistent
                          </Badge>
                          <span className="text-muted-foreground">
                            60-69% win rate, 20+ closed
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-gray-100 text-gray-600">
                            Professional
                          </Badge>
                          <span className="text-muted-foreground">
                            70-79% win rate, 40+ closed, 3+ targets/30d
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-700">
                            Elite
                          </Badge>
                          <span className="text-muted-foreground">
                            80-89% win rate, 60+ closed, max 2 consecutive stops
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-cyan-100 text-cyan-700">
                            Legend
                          </Badge>
                          <span className="text-muted-foreground">
                            90%+ win rate, 100+ closed, active in last 60 days
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="font-medium text-sm mb-1">Trader Badges</div>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-gray-100 text-gray-600">
                            Insightful Rater
                          </Badge>
                          <span className="text-muted-foreground">
                            50+ ratings, 60%+ accuracy
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-orange-100 text-orange-700">
                            Market Supporter
                          </Badge>
                          <span className="text-muted-foreground">
                            20+ reposts, 10+ successful
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-700">
                            Hybrid Trader
                          </Badge>
                          <span className="text-muted-foreground">
                            70%+ rating accuracy, 10+ analysts, 10+ symbols
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Shield className="h-6 w-6 text-primary mt-1" />
                <div className="space-y-2 flex-1">
                  <h3 className="font-semibold text-lg">Anti-Gaming Protection</h3>
                  <p className="text-sm text-muted-foreground">
                    Fair play enforced through multiple safeguards
                  </p>
                  <ul className="space-y-2 mt-4 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>
                        <strong>Account age:</strong> New accounts must be 7+ days old and email
                        verified
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>
                        <strong>Daily caps:</strong> Max 100 trader points/day, 10 analyses/day
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>
                        <strong>Uniqueness:</strong> Can't like/bookmark/repost same analysis
                        multiple times
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>
                        <strong>Quality checks:</strong> Comments analyzed for spam, emojis, and
                        repeated content
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>
                        <strong>Rate limits:</strong> Suspicious high-volume activity flagged
                        automatically
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-2">Transparency & Auditability</h3>
              <p className="text-sm text-muted-foreground">
                All points are logged in an immutable ledger. Every action that awards or deducts
                points is tracked with full context. Leaderboards are calculated from this ledger
                and updated regularly. No manual point adjustments are possible.
              </p>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
