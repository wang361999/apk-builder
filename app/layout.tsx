import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'APK Builder',
  description: 'APK 构建与管理平台',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
