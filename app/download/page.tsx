'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'

interface BuildRecord {
  id: number
  url: string
  appName: string
  packageName: string
  status: 'building' | 'success' | 'failed'
  downloadUrl: string | null
  buildLog: string | null
  versionName: string | null
  fileSize: number | null
  createdAt: string
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '未知'
  const mb = bytes / (1024 * 1024)
  return mb.toFixed(2) + ' MB'
}

function DownloadContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const id = searchParams.get('id')

  const [buildData, setBuildData] = useState<BuildRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchBuildStatus = useCallback(async () => {
    if (!id) return
    try {
      const res = await fetch(`/api/build?id=${encodeURIComponent(id)}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '获取构建记录失败')
        setLoading(false)
        return
      }
      const data: BuildRecord = await res.json()
      setBuildData(data)
      setLoading(false)
    } catch {
      setError('网络错误，请重试')
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchBuildStatus()
  }, [fetchBuildStatus])

  if (!id) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-[500px] text-center">
          <div className="text-gray-400 text-6xl mb-4">🔍</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">缺少构建 ID</h2>
          <p className="text-gray-500 mb-6">未提供构建记录 ID。</p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition"
          >
            返回首页
          </a>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 flex items-center justify-center">
        <div className="text-white text-lg animate-pulse">加载中...</div>
      </div>
    )
  }

  if (error && !buildData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-[500px] text-center">
          <div className="text-red-500 text-6xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">出错了</h2>
          <p className="text-gray-500 mb-6">{error}</p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition"
          >
            返回首页
          </a>
        </div>
      </div>
    )
  }

  // Still building
  if (buildData && buildData.status === 'building') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-[500px] text-center">
          <div className="text-blue-500 text-6xl mb-4 animate-pulse">🔨</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">仍在构建中</h2>
          <p className="text-gray-500 mb-6">APK 还在编译中，请稍后再来查看。</p>
          <a
            href={`/build?id=${buildData.id}`}
            className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition"
          >
            查看构建进度
          </a>
        </div>
      </div>
    )
  }

  // Build failed
  if (buildData && buildData.status === 'failed') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-[500px] text-center">
          <div className="text-red-500 text-6xl mb-4">💥</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">构建失败</h2>
          <p className="text-gray-500 mb-4">很抱歉，构建过程中出现了错误。</p>
          {buildData.buildLog && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-6 text-left break-all max-h-32 overflow-y-auto">
              {buildData.buildLog}
            </div>
          )}
          <a
            href="/"
            className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition"
          >
            重新生成
          </a>
        </div>
      </div>
    )
  }

  // Success - show download
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-950 to-emerald-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-[500px]">
        <div className="text-center mb-8">
          <div className="text-green-500 text-6xl mb-3">✅</div>
          <h1 className="text-2xl font-bold text-gray-800">构建完成！</h1>
          <p className="text-gray-500 mt-2">您的 APK 已经生成完毕，可以下载了</p>
        </div>

        {/* App info card */}
        <div className="bg-gray-50 rounded-xl p-6 mb-6 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">应用名称</span>
            <span className="text-sm font-semibold text-gray-800">{buildData?.appName}</span>
          </div>
          <div className="h-px bg-gray-200" />
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">包名</span>
            <span className="text-sm font-mono text-gray-800 text-xs">{buildData?.packageName}</span>
          </div>
          <div className="h-px bg-gray-200" />
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">版本号</span>
            <span className="text-sm font-semibold text-gray-800">{buildData?.versionName || '1.0.0'}</span>
          </div>
          <div className="h-px bg-gray-200" />
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">文件大小</span>
            <span className="text-sm font-semibold text-gray-800">{formatFileSize(buildData?.fileSize ?? null)}</span>
          </div>
        </div>

        {/* Download button */}
        {buildData?.downloadUrl ? (
          <a
            href={buildData.downloadUrl}
            download
            className="block w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold text-lg rounded-xl transition text-center shadow-lg hover:shadow-xl"
          >
            ⬇️ 下载 APK
          </a>
        ) : (
          <div className="w-full py-4 bg-gray-200 text-gray-500 font-bold text-lg rounded-xl text-center">
            暂无下载链接
          </div>
        )}

        {/* Install tip */}
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <div className="flex gap-3">
            <span className="text-amber-500 text-lg flex-shrink-0">⚠️</span>
            <div>
              <p className="text-sm font-medium text-amber-800">安装提示</p>
              <p className="text-xs text-amber-600 mt-1">
                安装前请开启「允许安装未知来源应用」。
                设置 → 安全 → 允许安装未知应用。
              </p>
            </div>
          </div>
        </div>

        {/* Back to home */}
        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-sm text-gray-400 hover:text-gray-600 transition"
          >
            ← 返回首页，继续生成
          </a>
        </div>
      </div>
    </div>
  )
}

export default function DownloadPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-950 to-emerald-950 flex items-center justify-center">
          <div className="text-white animate-pulse">加载中...</div>
        </div>
      }
    >
      <DownloadContent />
    </Suspense>
  )
}
