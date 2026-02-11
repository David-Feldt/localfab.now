import React from "react"
import type { Metadata, Viewport } from 'next'
import { Inter, Space_Mono } from 'next/font/google'

import './globals.css'

const _inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const _spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
})

export const metadata: Metadata = {
  title: '3D Print Service — Toronto & San Francisco',
  description:
    'Professional 3D printing service. Upload your STL, OBJ, or 3MF file, pick your options, and get an instant quote. Available in Toronto and San Francisco.',
  keywords: ['3D printing', '3D print service', 'Toronto', 'San Francisco', 'STL', 'OBJ', '3MF', 'FDM printing'],
  authors: [{ name: '3E8 Robotics' }],
  openGraph: {
    title: '3D Print Service — Toronto & San Francisco',
    description: 'Professional 3D printing service. Upload your model and get an instant quote.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '3D Print Service — Toronto & San Francisco',
    description: 'Professional 3D printing service. Upload your model and get an instant quote.',
  },
  icons: {
    icon: '/icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${_inter.variable} ${_spaceMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
