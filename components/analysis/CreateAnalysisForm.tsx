'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n/language-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Plus, X, Upload, Loader2, TrendingUp, TrendingDown, Target as TargetIcon, AlertTriangle, CalendarIcon, Search, Check, ChevronsUpDown, Newspaper, FileText, LineChart, Star, Clock, Globe, Users, Lock, UserCheck, Send, CheckSquare, Square } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'

type PostType = 'analysis' | 'news' | 'article'

interface Target {
  price: string
  expectedTime: string
}

interface SearchResult {
  symbol: string
  name: string
  type: string
  exchange: string
}

interface TelegramChannel {
  id: string
  channelId: string
  channelName: string
  audienceType: 'public' | 'followers' | 'subscribers'
  verified: boolean
  plan_id?: string | null
  plan_name?: string | null
}

function formatDateToDDMMYYYY(dateString: string): string {
  if (!dateString) return ''
  const [year, month, day] = dateString.split('-')
  return `${day}/${month}/${year}`
}

function parseDDMMYYYYToISO(dateString: string): string {
  if (!dateString) return ''
  const parts = dateString.split('/')
  if (parts.length !== 3) return ''
  const [day, month, year] = parts
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function parseDDMMYYYYToDate(dateString: string): Date | undefined {
  if (!dateString) return undefined
  const parts = dateString.split('/')
  if (parts.length !== 3) return undefined
  const [day, month, year] = parts
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  if (isNaN(date.getTime())) return undefined
  return date
}

function formatDateObjectToDDMMYYYY(date: Date | undefined): string {
  if (!date) return ''
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function validateDateFormat(value: string): boolean {
  if (!value) return false
  const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  const match = value.match(dateRegex)

  if (!match) return false

  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  const year = parseInt(match[3], 10)

  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  if (year < 2000 || year > 2100) return false

  const daysInMonth = new Date(year, month, 0).getDate()
  if (day > daysInMonth) return false

  return true
}

const POPULAR_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'BTC/USD', 'ETH/USD',
  'SPY', 'QQQ', 'JPM', 'V', 'WMT', 'DIS', 'NFLX', 'AMD', 'PYPL', 'INTC', 'BA'
]

export function CreateAnalysisForm() {
  const router = useRouter()
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [postType, setPostType] = useState<PostType>('analysis')

  const [symbol, setSymbol] = useState('')
  const [symbolName, setSymbolName] = useState('')
  const [direction, setDirection] = useState<'Long' | 'Short' | 'Neutral'>('Long')
  const [stopLoss, setStopLoss] = useState('')
  const [analysisType, setAnalysisType] = useState<'classic' | 'elliott_wave' | 'harmonics' | 'ict' | 'other'>('classic')
  const [chartFrame, setChartFrame] = useState('')
  const [chartImageUrl, setChartImageUrl] = useState('')
  const [targets, setTargets] = useState<Target[]>([{ price: '', expectedTime: '' }])

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'subscribers' | 'private'>('public')
  const [analyzerPlans, setAnalyzerPlans] = useState<Array<{id: string, name: string}>>([])
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([])

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>('')
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string>('')

  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [stockInfo, setStockInfo] = useState<{
    name: string
    price: number
    change: number
    changePercent: number
  } | null>(null)
  const [isLoadingStockInfo, setIsLoadingStockInfo] = useState(false)

  const [telegramChannels, setTelegramChannels] = useState<TelegramChannel[]>([])
  const [isLoadingChannels, setIsLoadingChannels] = useState(false)

  useEffect(() => {
    const loadPopularSymbols = async () => {
      if (!open) return

      setIsSearching(true)
      try {
        const response = await fetch('/api/search-symbols')
        if (response.ok) {
          const data = await response.json()
          setSearchResults(data.results || [])
        }
      } catch (err) {
        console.error('Error loading popular symbols:', err)
      } finally {
        setIsSearching(false)
      }
    }

    if (open && searchQuery.trim().length === 0) {
      loadPopularSymbols()
    }
  }, [open])

  useEffect(() => {
    const searchSymbols = async () => {
      if (searchQuery.trim().length < 1) {
        return
      }

      setIsSearching(true)
      try {
        const response = await fetch(`/api/search-symbols?q=${encodeURIComponent(searchQuery)}`)
        if (response.ok) {
          const data = await response.json()
          const results = data.results || []

          const sortedResults = results.sort((a: SearchResult, b: SearchResult) => {
            const aPopular = POPULAR_SYMBOLS.includes(a.symbol)
            const bPopular = POPULAR_SYMBOLS.includes(b.symbol)

            if (aPopular && !bPopular) return -1
            if (!aPopular && bPopular) return 1

            const aIndex = POPULAR_SYMBOLS.indexOf(a.symbol)
            const bIndex = POPULAR_SYMBOLS.indexOf(b.symbol)

            if (aIndex !== -1 && bIndex !== -1) {
              return aIndex - bIndex
            }

            return 0
          })

          setSearchResults(sortedResults)
        } else {
          setSearchResults([])
        }
      } catch (err) {
        console.error('Search error:', err)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }

    const timer = setTimeout(searchSymbols, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    const fetchStockInfo = async () => {
      if (!symbol) {
        setStockInfo(null)
        return
      }

      setIsLoadingStockInfo(true)
      try {
        const response = await fetch(`/api/stock-price?symbol=${encodeURIComponent(symbol)}`)
        if (response.ok) {
          const data = await response.json()
          setStockInfo({
            name: symbolName || symbol,
            price: data.price || 0,
            change: data.change || 0,
            changePercent: data.changePercent || 0,
          })
        } else {
          setStockInfo(null)
        }
      } catch (err) {
        console.error('Error fetching stock info:', err)
        setStockInfo(null)
      } finally {
        setIsLoadingStockInfo(false)
      }
    }

    fetchStockInfo()
  }, [symbol, symbolName])

  useEffect(() => {
    const fetchTelegramChannels = async () => {
      setIsLoadingChannels(true)
      try {
        const response = await fetch('/api/telegram/channels/list')
        if (response.ok) {
          const data = await response.json()
          setTelegramChannels(data.channels || [])
        }
      } catch (err) {
        console.error('Error fetching channels:', err)
      } finally {
        setIsLoadingChannels(false)
      }
    }

    fetchTelegramChannels()
  }, [])

  useEffect(() => {
    const fetchAnalyzerPlans = async () => {
      try {
        const response = await fetch('/api/plans')
        if (response.ok) {
          const data = await response.json()
          const activePlans = data.plans?.filter((p: any) => p.is_active) || []
          setAnalyzerPlans(activePlans)
        }
      } catch (err) {
        console.error('Error fetching plans:', err)
      }
    }

    fetchAnalyzerPlans()
  }, [])

  const addTarget = () => {
    setTargets([...targets, { price: '', expectedTime: '' }])
  }

  const removeTarget = (index: number) => {
    if (targets.length > 1) {
      setTargets(targets.filter((_, i) => i !== index))
    }
  }

  const updateTarget = (index: number, field: keyof Target, value: string) => {
    const newTargets = [...targets]
    newTargets[index][field] = value
    setTargets(newTargets)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5MB')
      return
    }

    setSelectedFile(file)
    setError(null)

    const reader = new FileReader()
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleUploadImage = async () => {
    if (!selectedFile) return

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await fetch('/api/upload-chart', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload image')
      }

      setUploadedImageUrl(data.url)
      setChartImageUrl(data.url)
    } catch (err: any) {
      setError(err.message || 'Failed to upload image')
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemoveImage = () => {
    setSelectedFile(null)
    setPreviewUrl('')
    setUploadedImageUrl('')
    setChartImageUrl('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      if (visibility === 'subscribers' && selectedPlanIds.length === 0) {
        throw new Error('Please select at least one subscription plan')
      }

      if (postType === 'analysis') {
        if (!symbol.trim()) {
          throw new Error('Symbol is required')
        }
        if (!stopLoss || isNaN(parseFloat(stopLoss))) {
          throw new Error('Valid stop loss is required')
        }
        if (targets.some(t => !t.price || isNaN(parseFloat(t.price)))) {
          throw new Error('All targets must have valid price')
        }
        if (targets.some(t => t.expectedTime && !validateDateFormat(t.expectedTime))) {
          throw new Error('All dates must be in dd/mm/yyyy format')
        }
      } else if (postType === 'news') {
        if (!title.trim()) {
          throw new Error('Title is required')
        }
        if (!summary.trim()) {
          throw new Error('Summary is required')
        }
        if (!symbol.trim()) {
          throw new Error('Related symbol is required')
        }
      } else if (postType === 'article') {
        if (!title.trim()) {
          throw new Error('Title is required')
        }
        if (!content.trim()) {
          throw new Error('Content is required')
        }
        if (!symbol.trim()) {
          throw new Error('Related symbol is required')
        }
      }

      let finalImageUrl = chartImageUrl

      if (selectedFile && !uploadedImageUrl) {
        const formData = new FormData()
        formData.append('file', selectedFile)

        const uploadRes = await fetch('/api/upload-chart', {
          method: 'POST',
          body: formData,
        })

        const uploadData = await uploadRes.json()

        if (!uploadRes.ok) {
          throw new Error(uploadData.error || 'Failed to upload image')
        }

        finalImageUrl = uploadData.url
      }

      const payload: any = {
        post_type: postType,
        symbol: symbol.trim(),
        chartImageUrl: finalImageUrl.trim(),
        description: description.trim(),
        visibility,
        planIds: visibility === 'subscribers' && selectedPlanIds.length > 0 ? selectedPlanIds : [],
      }

      if (postType === 'analysis') {
        const processedTargets = targets.map(t => ({
          price: t.price,
          expectedTime: t.expectedTime ? parseDDMMYYYYToISO(t.expectedTime) : '',
        }))
        payload.direction = direction
        payload.stopLoss = stopLoss
        payload.targets = processedTargets
        payload.analysisType = analysisType
        payload.chartFrame = chartFrame.trim()
      } else if (postType === 'news') {
        payload.title = title.trim()
        payload.summary = summary.trim()
        payload.sourceUrl = sourceUrl.trim()
      } else if (postType === 'article') {
        payload.title = title.trim()
        payload.content = content.trim()
      }

      const res = await fetch('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        console.error('CREATE_ANALYSIS_CLIENT_ERROR:', {
          status: res.status,
          statusText: res.statusText,
          error: data.error,
          data
        })
        throw new Error(data.error || 'Failed to create post')
      }

      router.push('/dashboard/feed')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to create post')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getTypeIcon = () => {
    if (postType === 'analysis') return <LineChart className="h-5 w-5" />
    if (postType === 'news') return <Newspaper className="h-5 w-5" />
    return <FileText className="h-5 w-5" />
  }

  const getTypeColor = () => {
    if (postType === 'analysis') return 'bg-blue-100 text-blue-600'
    if (postType === 'news') return 'bg-orange-100 text-orange-600'
    return 'bg-green-100 text-green-600'
  }

  const getTypeLabel = () => {
    if (postType === 'analysis') return t.dashboard.createForm.analysis
    if (postType === 'news') return t.dashboard.createForm.news
    return t.dashboard.createForm.article
  }

  const getTypeDescription = () => {
    if (postType === 'analysis') return t.dashboard.createForm.analysisDescription
    if (postType === 'news') return t.dashboard.createForm.newsDescription
    return t.dashboard.createForm.articleDescription
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="space-y-4 pb-6">
        <div>
          <CardTitle className="text-2xl mb-2">{t.dashboard.createForm.pageTitle}</CardTitle>
          <CardDescription>{t.dashboard.createForm.chooseType}</CardDescription>
        </div>

        <Tabs value={postType} onValueChange={(v) => setPostType(v as PostType)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="analysis" className="flex items-center gap-2">
              <LineChart className="h-4 w-4" />
              <span>{t.dashboard.createForm.analysis}</span>
            </TabsTrigger>
            <TabsTrigger value="news" className="flex items-center gap-2">
              <Newspaper className="h-4 w-4" />
              <span>{t.dashboard.createForm.news}</span>
            </TabsTrigger>
            <TabsTrigger value="article" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>{t.dashboard.createForm.article}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getTypeColor()}`}>
            {getTypeIcon()}
          </div>
          <div>
            <h3 className="font-semibold">{getTypeLabel()}</h3>
            <p className="text-sm text-muted-foreground">{getTypeDescription()}</p>
          </div>
        </div>

        <Separator />
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-2">
            <Label htmlFor="symbol" className="text-base font-semibold">
              {t.dashboard.createForm.relatedSymbol} <span className="text-red-500">*</span>
            </Label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full h-11 justify-between text-base font-normal"
                >
                  {symbol ? (
                    <span className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      {symbol}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t.dashboard.createForm.searchSymbol}</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder={t.dashboard.createForm.searchSymbol}
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {isSearching ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : searchQuery.trim() ? (
                        t.dashboard.createForm.noSymbolsFound
                      ) : (
                        t.dashboard.createForm.typeToSearch
                      )}
                    </CommandEmpty>
                    {searchResults.length > 0 && (
                      <CommandGroup heading={searchQuery.trim() ? t.common.search : t.dashboard.createForm.popular}>
                        {searchResults.map((result) => (
                          <CommandItem
                            key={result.symbol}
                            value={result.symbol}
                            onSelect={() => {
                              setSymbol(result.symbol)
                              setSymbolName(result.name)
                              setOpen(false)
                              setSearchQuery('')
                            }}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <Check
                                className={cn(
                                  'h-4 w-4',
                                  symbol === result.symbol ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <div className="flex items-center gap-1.5">
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-1">
                                    <span className="font-semibold">{result.symbol}</span>
                                    {POPULAR_SYMBOLS.includes(result.symbol) && (
                                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                    )}
                                  </div>
                                  <span className="text-xs text-muted-foreground">{result.name}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                'text-xs px-2 py-0.5 rounded-full',
                                result.type === 'Crypto' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                              )}>
                                {result.type}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">{t.dashboard.createForm.symbol}</p>
          </div>

          {symbol && (
            <div className="rounded-lg border-2 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 p-4">
              {isLoadingStockInfo ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">{t.dashboard.createForm.loadingPrice}</span>
                </div>
              ) : stockInfo ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-foreground">{symbol}</h3>
                      <p className="text-sm text-muted-foreground">{stockInfo.name}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-foreground">
                        ${stockInfo.price.toFixed(2)}
                      </div>
                      <div className={cn(
                        'flex items-center justify-end gap-1 text-sm font-semibold',
                        stockInfo.changePercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      )}>
                        {stockInfo.changePercent >= 0 ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        <span>{stockInfo.changePercent >= 0 ? '+' : ''}{stockInfo.changePercent.toFixed(2)}%</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          ({stockInfo.change >= 0 ? '+' : ''}{stockInfo.change.toFixed(2)})
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Live market data</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">Unable to fetch price data</p>
                </div>
              )}
            </div>
          )}

          {postType === 'analysis' && (
            <>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="direction" className="text-base font-semibold">
                    {t.dashboard.createForm.direction} <span className="text-red-500">*</span>
                  </Label>
                  <Select value={direction} onValueChange={(v) => setDirection(v as 'Long' | 'Short' | 'Neutral')}>
                    <SelectTrigger className="h-11 text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Long">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          {t.dashboard.createForm.long}
                        </div>
                      </SelectItem>
                      <SelectItem value="Short">
                        <div className="flex items-center gap-2">
                          <TrendingDown className="h-4 w-4 text-red-600" />
                          {t.dashboard.createForm.short}
                        </div>
                      </SelectItem>
                      <SelectItem value="Neutral">
                        <div className="flex items-center gap-2">
                          <TargetIcon className="h-4 w-4 text-blue-600" />
                          {t.dashboard.createForm.neutral}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t.dashboard.createForm.expectedDirection}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    <Label htmlFor="stopLoss" className="text-base font-semibold">
                      {t.dashboard.createForm.stopLoss} <span className="text-red-500">*</span>
                    </Label>
                  </div>
                  <Input
                    id="stopLoss"
                    type="number"
                    step="0.01"
                    placeholder="e.g., 150.50"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    required
                    className="h-11 text-base"
                  />
                  <p className="text-xs text-muted-foreground">{t.dashboard.createForm.stopLossRequired}</p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="analysisType" className="text-base font-semibold">
                    {t.dashboard.createForm.analysisType} <span className="text-red-500">*</span>
                  </Label>
                  <Select value={analysisType} onValueChange={(v) => setAnalysisType(v as 'classic' | 'elliott_wave' | 'harmonics' | 'ict' | 'other')}>
                    <SelectTrigger className="h-11 text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic">{t.dashboard.createForm.classicTechnical}</SelectItem>
                      <SelectItem value="elliott_wave">{t.dashboard.createForm.elliottWave}</SelectItem>
                      <SelectItem value="harmonics">{t.dashboard.createForm.harmonics}</SelectItem>
                      <SelectItem value="ict">{t.dashboard.createForm.ict}</SelectItem>
                      <SelectItem value="other">{t.dashboard.createForm.other}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t.dashboard.createForm.analysisType}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="chartFrame" className="text-base font-semibold">
                    {t.dashboard.createForm.chartTimeframe}
                  </Label>
                  <Select value={chartFrame} onValueChange={setChartFrame}>
                    <SelectTrigger className="h-11 text-base">
                      <SelectValue placeholder={t.dashboard.createForm.selectTimeframe} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1m">{t.dashboard.createForm.oneMinute}</SelectItem>
                      <SelectItem value="5m">{t.dashboard.createForm.fiveMinutes}</SelectItem>
                      <SelectItem value="15m">{t.dashboard.createForm.fifteenMinutes}</SelectItem>
                      <SelectItem value="30m">{t.dashboard.createForm.thirtyMinutes}</SelectItem>
                      <SelectItem value="1H">{t.dashboard.createForm.oneHour}</SelectItem>
                      <SelectItem value="4H">{t.dashboard.createForm.fourHours}</SelectItem>
                      <SelectItem value="1D">{t.dashboard.createForm.oneDay}</SelectItem>
                      <SelectItem value="1W">{t.dashboard.createForm.oneWeek}</SelectItem>
                      <SelectItem value="1M">{t.dashboard.createForm.oneMonth}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t.dashboard.createForm.chartTimeframeDesc}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TargetIcon className="h-5 w-5 text-green-600" />
                    <Label className="text-base font-semibold">
                      {t.dashboard.createForm.priceTargets} <span className="text-red-500">*</span>
                    </Label>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={addTarget}
                    variant="outline"
                    className="h-9"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t.dashboard.createForm.addTarget}
                  </Button>
                </div>

                <div className="space-y-4">
                  {targets.map((target, index) => (
                    <div
                      key={index}
                      className="p-4 border-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex gap-3 items-start">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary">
                          {index + 1}
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="space-y-1.5">
                            <Label htmlFor={`target-price-${index}`} className="text-sm font-medium">
                              {t.dashboard.createForm.targetPrice}
                            </Label>
                            <Input
                              id={`target-price-${index}`}
                              type="number"
                              step="0.01"
                              placeholder="e.g., 175.00"
                              value={target.price}
                              onChange={(e) => updateTarget(index, 'price', e.target.value)}
                              required
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`target-date-${index}`} className="text-sm font-medium flex items-center gap-2">
                              <CalendarIcon className="h-3.5 w-3.5" />
                              {t.dashboard.createForm.expectedDate} ({t.dashboard.createForm.optional})
                            </Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={cn(
                                    "w-full h-10 justify-start text-left font-normal",
                                    !target.expectedTime && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {target.expectedTime ? target.expectedTime : t.dashboard.createForm.pickDate}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={parseDDMMYYYYToDate(target.expectedTime)}
                                  onSelect={(date) => {
                                    updateTarget(index, 'expectedTime', formatDateObjectToDDMMYYYY(date))
                                  }}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <p className="text-xs text-muted-foreground">Format: dd/mm/yyyy</p>
                          </div>
                        </div>
                        {targets.length > 1 && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeTarget(index)}
                            className="flex-shrink-0 h-8 w-8 text-muted-foreground hover:text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="description" className="text-base font-semibold">
                  {t.dashboard.createForm.description} ({t.dashboard.createForm.optional})
                </Label>
                <Textarea
                  id="description"
                  placeholder={t.dashboard.createForm.descriptionPlaceholder}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[120px] text-base"
                />
                <p className="text-xs text-muted-foreground">
                  {t.dashboard.createForm.descriptionHelp}
                </p>
              </div>
            </>
          )}

          {postType === 'news' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="title" className="text-base font-semibold">
                  {t.dashboard.createForm.title} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  type="text"
                  placeholder={t.dashboard.createForm.titlePlaceholder}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="h-11 text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="summary" className="text-base font-semibold">
                  {t.dashboard.createForm.summary} <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="summary"
                  placeholder={t.dashboard.createForm.summaryPlaceholder}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  required
                  className="min-h-[120px] text-base"
                />
                <p className="text-xs text-muted-foreground">{t.dashboard.createForm.summaryRequired}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sourceUrl" className="text-base font-semibold">
                  {t.dashboard.createForm.sourceUrl} ({t.dashboard.createForm.optional})
                </Label>
                <Input
                  id="sourceUrl"
                  type="url"
                  placeholder={t.dashboard.createForm.sourceUrlPlaceholder}
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  className="h-11 text-base"
                />
                <p className="text-xs text-muted-foreground">{t.dashboard.createForm.sourceUrl}</p>
              </div>
            </>
          )}

          {postType === 'article' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="title" className="text-base font-semibold">
                  {t.dashboard.createForm.title} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  type="text"
                  placeholder={t.dashboard.createForm.titlePlaceholder}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="h-11 text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content" className="text-base font-semibold">
                  {t.dashboard.createForm.content} <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="content"
                  placeholder={t.dashboard.createForm.contentPlaceholder}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  className="min-h-[300px] text-base"
                />
                <p className="text-xs text-muted-foreground">{t.dashboard.createForm.contentRequired}</p>
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-4">
            <Label className="text-base font-semibold">{t.dashboard.createForm.image} ({t.dashboard.createForm.optional})</Label>

            {!previewUrl && !chartImageUrl && (
              <div className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                  <Input
                    id="imageFile"
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('imageFile')?.click()}
                    className="w-full h-11"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {t.dashboard.createForm.uploadImage}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-3">PNG, JPG up to 5MB</p>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-muted-foreground">{t.dashboard.createForm.chartImageUrl}</span>
                  </div>
                </div>

                <Input
                  type="url"
                  placeholder={t.dashboard.createForm.chartImageUrlPlaceholder}
                  value={chartImageUrl}
                  onChange={(e) => setChartImageUrl(e.target.value)}
                  className="h-11"
                />
              </div>
            )}

            {previewUrl && !uploadedImageUrl && (
              <div className="space-y-3">
                <div className="relative rounded-lg border-2 overflow-hidden bg-muted">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-64 object-contain"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleUploadImage}
                    disabled={isUploading}
                    className="flex-1 h-11"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t.dashboard.createForm.uploading}
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        {t.dashboard.createForm.confirmUpload}
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemoveImage}
                    disabled={isUploading}
                    className="h-11"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {(uploadedImageUrl || (chartImageUrl && !previewUrl)) && (
              <div className="space-y-3">
                <div className="relative rounded-lg border-2 overflow-hidden bg-muted">
                  <img
                    src={uploadedImageUrl || chartImageUrl}
                    alt="Image"
                    className="w-full h-64 object-contain"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRemoveImage}
                  className="h-10"
                >
                  <X className="h-4 w-4 mr-2" />
                  {t.dashboard.createForm.removeImage}
                </Button>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="visibility" className="text-base font-semibold flex items-center gap-2">
                <Globe className="h-5 w-5" />
                {t.dashboard.createForm.audienceVisibility}
              </Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as 'public' | 'followers' | 'subscribers' | 'private')}>
                <SelectTrigger className="h-11 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-600" />
                      <div>
                        <div className="font-medium">{t.dashboard.createForm.publicVisibility}</div>
                        <div className="text-xs text-muted-foreground">{t.dashboard.createForm.publicVisibilityDesc}</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="followers">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-green-600" />
                      <div>
                        <div className="font-medium">{t.dashboard.createForm.followersVisibility}</div>
                        <div className="text-xs text-muted-foreground">{t.dashboard.createForm.followersVisibilityDesc}</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="subscribers">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-orange-600" />
                      <div>
                        <div className="font-medium">{t.dashboard.createForm.subscribersVisibility}</div>
                        <div className="text-xs text-muted-foreground">{t.dashboard.createForm.subscribersVisibilityDesc}</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="private">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-gray-600" />
                      <div>
                        <div className="font-medium">{t.dashboard.createForm.privateVisibility}</div>
                        <div className="text-xs text-muted-foreground">{t.dashboard.createForm.privateVisibilityDesc}</div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t.dashboard.createForm.audienceVisibilityDesc}</p>
            </div>

            {visibility === 'subscribers' && analyzerPlans.length > 0 && (
              <div className="space-y-3">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Star className="h-5 w-5" />
                  Subscription Plans
                </Label>
                <div className="space-y-2 p-4 border rounded-lg">
                  {analyzerPlans.map((plan) => {
                    const planChannel = telegramChannels.find(ch => ch.plan_id === plan.id && ch.audienceType === 'subscribers')
                    return (
                      <div key={plan.id} className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-md transition-colors">
                        <Checkbox
                          id={`plan-${plan.id}`}
                          checked={selectedPlanIds.includes(plan.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedPlanIds([...selectedPlanIds, plan.id])
                            } else {
                              setSelectedPlanIds(selectedPlanIds.filter(id => id !== plan.id))
                            }
                          }}
                        />
                        <Label
                          htmlFor={`plan-${plan.id}`}
                          className="flex-1 flex items-col gap-2 cursor-pointer font-normal"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Star className="h-4 w-4 text-yellow-600" />
                              <span className="font-medium">{plan.name}</span>
                            </div>
                            {planChannel && planChannel.verified && (
                              <div className="flex items-center gap-1.5 mt-1 ml-6 text-xs text-green-600">
                                <Send className="h-3 w-3" />
                                <span>Will broadcast to: {planChannel.channelName}</span>
                              </div>
                            )}
                            {planChannel && !planChannel.verified && (
                              <div className="flex items-center gap-1.5 mt-1 ml-6 text-xs text-orange-600">
                                <AlertTriangle className="h-3 w-3" />
                                <span>Channel not verified: {planChannel.channelName}</span>
                              </div>
                            )}
                            {!planChannel && (
                              <div className="flex items-center gap-1.5 mt-1 ml-6 text-xs text-orange-600">
                                <AlertTriangle className="h-3 w-3" />
                                <span>No Telegram channel connected</span>
                              </div>
                            )}
                          </div>
                        </Label>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedPlanIds.length === 0
                    ? 'Select at least one plan to post to'
                    : (() => {
                        const selectedChannelsCount = selectedPlanIds.filter(planId =>
                          telegramChannels.some(ch => ch.plan_id === planId && ch.audienceType === 'subscribers' && ch.verified)
                        ).length
                        return `Will be posted to ${selectedPlanIds.length} plan${selectedPlanIds.length > 1 ? 's' : ''}${selectedChannelsCount > 0 ? ` and broadcast to ${selectedChannelsCount} verified Telegram channel${selectedChannelsCount > 1 ? 's' : ''}` : ''}`
                      })()
                  }
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-md">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            </div>
          )}

          <Separator />

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 text-base font-semibold"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                {t.dashboard.createForm.publishing}
              </>
            ) : (
              <>
                {getTypeIcon()}
                <span className="ml-2">{t.dashboard.createForm.publish} {getTypeLabel()}</span>
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
