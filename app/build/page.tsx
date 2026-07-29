'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'

const STEPS = [
  { label: '拉取模板代码', timeThreshold: 30 },
  { label: '替换配置', timeThreshold: 60 },
  { label: '编译打包', timeThreshold: 180 },
  { label: '签名中', timeThreshold: Infinity },
]

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

function getSimulatedStepIndex(elapsed: number): number {
  for (let i = STEPS.length - 1; i >= 0; i--) {
    if (elapsed >= STEPS[i].timeThreshold) {
      return i + 1
    }
  }
  return 0
}

function getProgressPercent(elapsed: number): number {
  if (elapsed >= 180) return 85
  if (elapsed >= 60) return 60
  if (elapsed >= 30) return 30
  return 10
}

function BuildContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const id = searchParams.get('id')

  const [buildData, setBuildData] = useState<BuildRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)

  const fetchBuildStatus = useCallback(async () => {
    if (!id) return
    try {
      const res = await fetch(`/api/build?id=${encodeURIComponent(id)}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '获取构建状态失败')
        setLoading(false)
        return
      }
      const data: BuildRecord = await res.json()
      setBuildData(data)
      setLoading(false)

      if (data.status === 'success') {
        router.push(`/download?id=${data.id}`)
      }
    } catch {
      setError('网络错误，请重试')
      setLoading(false)
    }
  }, [id, router])

  // Initial fetch
  useEffect(() => {
    fetchBuildStatus()
  }, [fetchBuildStatus])

  // Polling every 5 seconds when building
  useEffect(() => {
    if (!buildData || buildData.status !== 'building') return

    const interval = setInterval(() => {
      fetchBuildStatus()
    }, 5000)

    return () => clearInterval(interval)
  }, [buildData, fetchBuildStatus])

  // Elapsed time counter for progress simulation
  useEffect(() => {
    if (!buildData || buildData.status !== 'building') return

    const createdAt = new Date(buildData.createdAt).getTime()
    const updateElapsed = () => {
      setElapsed(Math.floor((Date.now() - createdAt) / 1000))
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)

    return () => clearInterval(interval)
  }, [buildData])

  if (!id) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-[500px] text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">缺少构建 ID</h2>
          <p className="text-gray-500 mb-6">未提供构建记录 ID，无法查看进度。</p>
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

  // Building in progress
  const currentStepIndex = getSimulatedStepIndex(elapsed)
  const progressPercent = getProgressPercent(elapsed)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-[500px]">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800">
            🔨 正在构建 APK...
          </h1>
          <p className="text-gray-500 mt-2">
            {buildData?.appName} 正在编译中，请耐心等待
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>进度</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-1000 ease-out relative"
              style={{ width: `${progressPercent}%` }}
            >
              {buildData?.status === 'building' && (
                <div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"
                />
              )}
            </div>
          </div>
          <style jsx>{`
            @keyframes shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
            .animate-shimmer {
              animation: shimmer 1.5s infinite;
            }
          `}</style>
        </div>

        {/* Step list */}
        <div className="space-y-4 mb-8">
          {STEPS.map((step, index) => {
            const isCompleted = index < currentStepIndex
            const isCurrent = index === currentStepIndex
            const isPending = index > currentStepIndex

            return (
              <div key={index} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full">
                  {isCompleted && (
                    <div className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm font-bold">
                      ✓
                    </div>
                  )}
                  {isCurrent && (
                    <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm animate-pulse">
                      ⏳
                    </div>
                  )}
                  {isPending && (
                    <div className="w-8 h-8 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center text-sm">
                      ○
                    </div>
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isCompleted
                      ? 'text-green-600'
                      : isCurrent
                        ? 'text-blue-600'
                        : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
                {isCurrent && (
                  <span className="ml-auto flex gap-1">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                )}
                {isCompleted && (
                  <span className="ml-auto text-xs text-green-500">完成</span>
                )}
              </div>
            )
          })}
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-400">
            已等待 {Math.floor(elapsed / 60)} 分 {elapsed % 60} 秒 · 预计总时长 3-5 分钟
          </p>
          <p className="text-xs text-gray-300 mt-1">
            页面会自动刷新，无需手动操作
          </p>
        </div>
      </div>
    </div>
  )
}

export default function BuildPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 flex items-center justify-center">
          <div className="text-white animate-pulse">加载中...</div>
        </div>
      }
    >
      <BuildContent />
    </Suspense>
  )
}
