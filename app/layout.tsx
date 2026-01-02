import './globals.css';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { LanguageProvider } from '@/lib/i18n/language-context';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://analyzhub.com'),
  title: 'AnalyzingHub - Where Trading Analysis Proves Itself',
  description: 'Auto-validated trading analysis platform. Track stock predictions, follow expert analysts, and see verified success rates. Join the community where trading analysis proves itself.',
  keywords: ['stock analysis', 'trading predictions', 'market analysis', 'stock trading', 'technical analysis', 'financial analysis', 'trading community'],
  authors: [{ name: 'AnalyzingHub' }],
  creator: 'AnalyzingHub',
  publisher: 'AnalyzingHub',
  icons: {
    icon: [
      { url: '/logo.png', sizes: 'any' },
      { url: '/logo.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [
      { url: '/logo.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['ar_SA'],
    url: 'https://analyzhub.com',
    siteName: 'AnalyzingHub',
    title: 'AnalyzingHub - Where Trading Analysis Proves Itself',
    description: 'Auto-validated trading analysis platform. Track stock predictions, follow expert analysts, and see verified success rates.',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'AnalyzingHub - Trading Analysis Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AnalyzingHub - Where Trading Analysis Proves Itself',
    description: 'Auto-validated trading analysis platform. Track stock predictions, follow expert analysts, and see verified success rates.',
    images: ['/logo.png'],
    creator: '@analyzinghub',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'your-google-verification-code',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#3b82f6" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AnalyzingHub" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <link rel="apple-touch-startup-image" href="/logo.png" />
      </head>
      <body className="font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider>
            {children}
            <Toaster />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
