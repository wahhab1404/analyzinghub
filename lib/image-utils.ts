const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

const isIOSDevice = () => {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export async function downloadImageWithWatermark(
  imageUrl: string,
  analyzerName: string,
  symbol: string,
  filename: string
): Promise<void> {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = imageUrl
    })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('Could not get canvas context')
    }

    canvas.width = img.width
    canvas.height = img.height

    ctx.drawImage(img, 0, 0)

    const padding = 20
    const watermarkHeight = 60
    const watermarkY = canvas.height - watermarkHeight - padding

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.fillRect(0, watermarkY, canvas.width, watermarkHeight + padding)

    ctx.fillStyle = 'white'
    ctx.font = 'bold 18px sans-serif'
    ctx.fillText(`${symbol} - ${analyzerName}`, padding, watermarkY + 25)

    ctx.font = '14px sans-serif'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.fillText('AnalyzingHub.com', padding, watermarkY + 48)

    canvas.toBlob(async (blob) => {
      if (!blob) {
        throw new Error('Failed to create image blob')
      }

      if (isMobileDevice()) {
        if (navigator.share && navigator.canShare({ files: [new File([blob], filename, { type: 'image/png' })] })) {
          const file = new File([blob], filename, { type: 'image/png' })
          await navigator.share({
            files: [file],
            title: `${symbol} Analysis`,
            text: `Analysis by ${analyzerName}`
          })
        } else {
          const dataUrl = canvas.toDataURL('image/png')
          const newWindow = window.open()
          if (newWindow) {
            newWindow.document.write(`
              <html>
                <head>
                  <title>${filename}</title>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                  <style>
                    body {
                      margin: 0;
                      padding: 20px;
                      background: #000;
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                      justify-content: center;
                      min-height: 100vh;
                    }
                    img {
                      max-width: 100%;
                      height: auto;
                      display: block;
                      border-radius: 8px;
                    }
                    p {
                      color: #fff;
                      font-family: system-ui, -apple-system, sans-serif;
                      text-align: center;
                      margin: 20px 0;
                      padding: 0 20px;
                    }
                  </style>
                </head>
                <body>
                  <img src="${dataUrl}" alt="${filename}" />
                  <p>Long press the image and select "Save Image" or "Add to Photos" to save to your device</p>
                </body>
              </html>
            `)
          }
        }
      } else {
        const dataUrl = canvas.toDataURL('image/png')
        const link = document.createElement('a')
        link.download = filename
        link.href = dataUrl
        link.click()
      }
    }, 'image/png')
  } catch (error) {
    console.error('Error downloading image with watermark:', error)
    throw error
  }
}

export async function generatePostSnapshot(
  postId: string,
  analyzerName: string,
  symbol: string,
  postType: string,
  content: {
    title?: string
    summary?: string
    direction?: string
    stopLoss?: number
    targets?: Array<{ price: number }>
    analysisType?: string
    chartFrame?: string | null
  }
): Promise<string> {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('Could not get canvas context')
    }

    canvas.width = 800
    canvas.height = 600

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, '#1a1a2e')
    gradient.addColorStop(1, '#0f0f1e')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = 'white'
    ctx.font = 'bold 32px sans-serif'
    ctx.fillText(symbol, 40, 60)

    ctx.font = '18px sans-serif'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.fillText(analyzerName, 40, 90)

    let yPosition = 140

    if (postType === 'analysis' && (content.analysisType || content.chartFrame)) {
      const getAnalysisTypeLabel = (type?: string) => {
        if (!type) return 'Classic'
        const labels: Record<string, string> = {
          classic: 'Classic Technical Analysis',
          elliott_wave: 'Elliott Wave',
          harmonics: 'Harmonics',
          ict: 'ICT',
          other: 'Other',
        }
        return labels[type] || type
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.font = '14px sans-serif'
      if (content.analysisType) {
        ctx.fillText(`Type: ${getAnalysisTypeLabel(content.analysisType)}`, 40, yPosition)
        yPosition += 25
      }
      if (content.chartFrame) {
        ctx.fillText(`Timeframe: ${content.chartFrame}`, 40, yPosition)
        yPosition += 25
      }
      yPosition += 10
    }

    if (postType === 'analysis' && content.direction) {
      const directionColor = content.direction === 'Long' ? '#22c55e' : content.direction === 'Short' ? '#ef4444' : '#3b82f6'
      ctx.fillStyle = directionColor
      ctx.font = 'bold 24px sans-serif'
      ctx.fillText(`${content.direction} Position`, 40, yPosition)
      yPosition += 50

      if (content.stopLoss) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.font = '20px sans-serif'
        ctx.fillText(`Stop Loss: $${content.stopLoss.toFixed(2)}`, 40, yPosition)
        yPosition += 40
      }

      if (content.targets && content.targets.length > 0) {
        ctx.fillText('Targets:', 40, yPosition)
        yPosition += 35
        content.targets.forEach((target, index) => {
          ctx.font = '18px sans-serif'
          ctx.fillText(`  TP${index + 1}: $${target.price.toFixed(2)}`, 40, yPosition)
          yPosition += 30
        })
      }
    } else if (postType === 'news' && content.title) {
      ctx.fillStyle = 'white'
      ctx.font = 'bold 24px sans-serif'
      const titleLines = wrapText(ctx, content.title, 720)
      titleLines.forEach(line => {
        ctx.fillText(line, 40, yPosition)
        yPosition += 35
      })

      if (content.summary) {
        yPosition += 20
        ctx.font = '18px sans-serif'
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
        const summaryLines = wrapText(ctx, content.summary, 720)
        summaryLines.slice(0, 3).forEach(line => {
          ctx.fillText(line, 40, yPosition)
          yPosition += 30
        })
      }
    } else if (postType === 'article' && content.title) {
      ctx.fillStyle = 'white'
      ctx.font = 'bold 24px sans-serif'
      const titleLines = wrapText(ctx, content.title, 720)
      titleLines.forEach(line => {
        ctx.fillText(line, 40, yPosition)
        yPosition += 35
      })
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.fillRect(40, canvas.height - 80, canvas.width - 80, 1)

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.font = '16px sans-serif'
    ctx.fillText('AnalyzingHub.com', 40, canvas.height - 40)

    const postTypeLabel = postType === 'analysis' ? 'Analysis' : postType === 'news' ? 'News' : 'Article'
    ctx.fillText(postTypeLabel, canvas.width - 200, canvas.height - 40)

    return canvas.toDataURL('image/png')
  } catch (error) {
    console.error('Error generating post snapshot:', error)
    throw error
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  words.forEach(word => {
    const testLine = currentLine + (currentLine ? ' ' : '') + word
    const metrics = ctx.measureText(testLine)

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}
