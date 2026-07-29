'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [appName, setAppName] = useState('')
  const [packageName, setPackageName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!url || !appName || !packageName) {
      setError('请填写所有必填字段')
      return
    }

    const packageRegex = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/
    if (!packageRegex.test(packageName)) {
      setError('包名格式不正确，应为 com.example.myapp')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, appName, packageName }),
      })
      const data = await res.json()
      if (res.ok) {
        router.push(`/build?id=${data.id}`)
      } else {
        setError(data.error || '提交失败，请重试')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-[500px]">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">
            <span className="mr-2">📱</span>APK 生成器
          </h1>
          <p className="text-gray-500 mt-2">输入网址，一键生成原生 Android APK</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">网站地址 *</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">应用名称 *</label>
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="我的应用"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">应用包名 *</label>
            <input
              type="text"
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              placeholder="com.example.myapp"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">格式：com.example.myapp</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? '生成中...' : '🔨 生成 APK'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            ⏱️ 约需 3-5 分钟，请耐心等待。生成后自动提供下载链接。
          </p>
        </div>

        <div className="mt-4 text-center">
          <a href="/admin/login" className="text-xs text-gray-300 hover:text-gray-500 transition">
            管理员入口
          </a>
        </div>
      </div>
    </div>
  )
}
