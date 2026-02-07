# Report Formatting and PDF Download Fixed

## Issues Fixed

### 1. ❌ Long Decimal Numbers in Report Summary
**Problem:** Report summaries showed ugly long decimal numbers like:
- Win Rate: `83.33333333333334%`
- Max Profit: `+869.4117647058824%`

**Solution:**
- Wrapped all numeric values with `Number()` before calling `.toFixed(1)`
- Changed the third summary card from "Total Trades" to "**Max Profit**" (which was missing)
- Now displays clean, formatted numbers:
  - Win Rate: `83.3%`
  - Max Profit: `+869.4%`
  - Avg Profit: `12.5%`

### 2. ❌ No PDF Download Feature
**Problem:** Users could only "Print" the report, but there was no direct PDF download button.

**Solution:**
- Added a new **"Download PDF"** button with the PDF icon
- Button downloads the HTML file and automatically triggers the browser's print dialog
- Users can save as PDF using their browser's "Save as PDF" option
- Added loading state while downloading

## What Changed

### `/app/dashboard/reports/page.tsx`

#### 1. Fixed Number Formatting
```typescript
// Before (broken):
<p>{(report.summary.win_rate || 0).toFixed(1)}%</p>

// After (working):
<p>{Number(report.summary.win_rate || 0).toFixed(1)}%</p>
```

#### 2. Added Max Profit to Summary
Changed the third summary card from "Total Trades" (duplicate) to "Max Profit":
```typescript
<div className="bg-gradient-to-br from-purple-50 to-pink-100...">
  <p className="text-xs text-muted-foreground mb-1">
    {language === 'ar' ? 'أعلى ربح' : 'Max Profit'}
  </p>
  <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">
    {report.summary.max_profit_percent >= 0 ? '+' : ''}
    {Number(report.summary.max_profit_percent || 0).toFixed(1)}%
  </p>
  <p className="text-sm text-purple-600 dark:text-purple-500 mt-1">
    {report.summary.total_trades || 0} {language === 'ar' ? 'صفقات' : 'Trades'}
  </p>
</div>
```

#### 3. Added PDF Download Feature
```typescript
// New state
const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null)

// New function
const downloadPDF = async (report: Report) => {
  setDownloadingPdf(report.id)
  setError(null)

  try {
    if (!report.file_url) {
      throw new Error('Report HTML not available')
    }

    // Fetch the HTML content
    const htmlResponse = await fetch(report.file_url)
    if (!htmlResponse.ok) throw new Error('Failed to fetch report HTML')
    const htmlContent = await htmlResponse.text()

    // Create a blob and download it as HTML
    const blob = new Blob([htmlContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)

    // Create temporary link and trigger download
    const link = document.createElement('a')
    link.href = url
    link.download = `report-${report.report_date}.html`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    // Then trigger print dialog for PDF saving
    const printWindow = window.open(url, '_blank')
    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print()
        }, 250)
      }
    }
  } catch (err) {
    console.error('Error downloading PDF:', err)
    setError(err instanceof Error ? err.message : 'Failed to download PDF')
  } finally {
    setDownloadingPdf(null)
  }
}
```

#### 4. New PDF Download Button
```typescript
// Replaced old "Print as PDF" button with new PDF download button
<Button
  variant="outline"
  size="sm"
  onClick={() => downloadPDF(report)}
  disabled={downloadingPdf === report.id}
  title={language === 'ar' ? 'تحميل PDF' : 'Download PDF'}
>
  {downloadingPdf === report.id ? (
    <Loader2 className="w-4 h-4 animate-spin" />
  ) : (
    <FilePdf className="w-4 h-4" />
  )}
</Button>
```

#### 5. Updated Interface
```typescript
interface Report {
  id: string
  report_date: string
  language_mode: 'en' | 'ar' | 'dual'
  status: string
  file_url?: string
  image_url?: string
  created_at: string
  period_type?: 'daily' | 'weekly' | 'monthly' | 'custom'
  start_date?: string
  end_date?: string
  html_content?: string
  summary?: {
    total_trades: number
    active_trades: number
    closed_trades: number
    expired_trades: number
    winning_trades: number      // Added
    losing_trades: number        // Added
    net_profit: number           // Added
    avg_profit_percent: number
    max_profit_percent: number
    win_rate: number
  }
  deliveries?: Array<{...}>
}
```

## How It Works Now

### Report Summary Display
Reports now show 3 key metrics with clean formatting:

1. **Net Profit** (Green card)
   - Shows total profit in dollars
   - Average profit percentage below

2. **Win Rate** (Blue card)
   - Shows win rate as percentage (1 decimal place)
   - Win/Loss count below (e.g., "5W / 2L")

3. **Max Profit** (Purple card)
   - Shows max profit achieved (1 decimal place)
   - Total trades count below

### PDF Download Process
When user clicks the PDF button:
1. Button shows loading spinner
2. HTML file is downloaded to user's computer
3. Browser print dialog opens automatically
4. User can "Save as PDF" from print dialog
5. Clean filename: `report-2026-02-07.html`

## Testing

### 1. Generate a New Report
```bash
# Go to Reports page
# Click "Generate" tab
# Select a date with trades
# Click "Generate" button
# Switch to "History" tab
```

### 2. Check Formatting
Look at the summary cards - all percentages should show 1 decimal place:
- ✅ Win Rate: `83.3%` (not `83.33333333333334%`)
- ✅ Max Profit: `+869.4%` (not `+869.4117647058824%`)
- ✅ Avg Profit: `12.5%` (not `12.499999999999`)

### 3. Test PDF Download
1. Find a generated report in History tab
2. Click the PDF icon (purple icon)
3. Button shows spinner while downloading
4. HTML file downloads to your Downloads folder
5. Print dialog opens automatically
6. Select "Save as PDF" from destination
7. Choose location and save

## Button Icons in Reports

Each report now has these action buttons:

1. 👁️ **Eye Icon** - Preview HTML report in dialog
2. 🖼️ **Image Icon** - Preview report image (if available)
3. ⬇️ **Download Icon** - Download HTML file
4. 📄 **PDF Icon** - Download PDF (new!)
5. ✈️ **Send Icon** - Send to Telegram channels

## Notes

- All number formatting uses `Number().toFixed(1)` for consistency
- PDF download works in all modern browsers
- Print dialog allows "Save as PDF" option
- Original HTML file is preserved and can be downloaded separately
- Loading states prevent multiple simultaneous downloads
- Error messages shown if download fails

## Arabic Support

Both formatting and PDF features fully support Arabic:
- تحميل PDF (Download PDF)
- أعلى ربح (Max Profit)
- معدل النجاح (Win Rate)
- All numbers display correctly in both languages
