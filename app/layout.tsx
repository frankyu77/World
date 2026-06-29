import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Orbitron, Rajdhani, Exo_2 } from 'next/font/google'
import './globals.css'

// Large command-center display headers
const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-display',
})

// Compact telemetry / UI labels
const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-heading',
})

// Body / sans
const exo2 = Exo_2({
  subsets: ['latin'],
  variable: '--font-sans',
})

// Monospace coordinate / data readouts
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'AEGIS // Global Intelligence Command Center',
  description:
    'Holographic geospatial intelligence command center with live tactical overlays, radar sweeps, and real-time telemetry.',
  keywords: ['command center', 'holographic', 'tactical', 'intelligence', 'radar', 'geospatial', 'HUD'],
  authors: [{ name: 'AEGIS Systems' }],
}

export const viewport: Viewport = {
  themeColor: '#00060e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${orbitron.variable} ${rajdhani.variable} ${exo2.variable} ${jetbrainsMono.variable} bg-jarvis-bg`}
    >
      <body className="font-sans antialiased overflow-hidden">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
