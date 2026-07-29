'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'

function EditVersionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  const [versionCode, setVersionCode] = useState<number>(0)
  const [versionName, setVersionName] = useState('')
  const [updateLog, setUpdateLog] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [forceUpdate, setForceUpdate] = useState(false)
  const [isEnabled, setIsEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')

  // 加载版本数据并预填充表单
  useEffect(() => {
    if (!id) {
      setError('缺少版本 ID 参数')
      setFetching(false)
      return
    }

    const fetchVersion = async () => {
      try {
        // 直接通过 id 查询单个版本
        const res = await fetch(`/api/admin/versions?id=${id}`)
        if (res.status === 401) {
          router.replace('/admin/login')
          return
        }
        if (res.ok) {
          const version = await res.json()
          setVersionCode(version.versionCode)
          setVersionName(version.versionName)
          setUpdateLog(version.updateLog || '')
          setDownloadUrl(version.downloadUrl)
          setForceUpdate(version.forceUpdate)
          setIsEnabled(version.isEnabled)
        } else if (res.status === 404) {
          setError('未找到该版本记录')
        } else {
          setError('加载版本数据失败')
        }
      } catch {
        setError('网络错误，请重试')
      } finally {
        setFetching(false)
      }
    }

    fetchVersion()
  }, [id, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!versionCode || !versionName || !downloadUrl) {
      setError('请填写所有必填字段')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/admin/versions?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionCode,
          versionName,
          updateLog,
          downloadUrl,
          forceUpdate,
          isEnabled,
        }),
      })
      const data = await res.json()

      if (res.ok) {
        router.push('/admin/versions')
      } else {
        setError(data.error || '更新失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">编辑版本</h1>
          <p className="text-gray-500 mt-1 text-sm">
            修改版本信息 (ID: {id})
          </p>
        </div>

        {/* 表单 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          {fetching ? (
            <div className="py-12 text-center text-gray-400">加载中...</div>
          ) : error && !versionName ? (
            <div className="py-12">
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm border border-red-100 mb-4">
                {error}
              </div>
              <div className="text-center">
                <button
                  onClick={() => router.push('/admin/versions')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition cursor-pointer"
                >
                  返回版本列表
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 版本号 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  版本号 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={versionCode || ''}
                  onChange={(e) => setVersionCode(Number(e.target.value))}
                  placeholder="例如：1"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  整数，例如 1, 2, 3...用于版本比较
                </p>
              </div>

              {/* 版本名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  版本名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="例如：1.0.0"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  展示给用户的版本名称
                </p>
              </div>

              {/* 更新日志 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  更新日志
                </label>
                <textarea
                  value={updateLog}
                  onChange={(e) => setUpdateLog(e.target.value)}
                  rows={4}
                  placeholder="请输入本次版本的更新内容..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none resize-y"
                />
              </div>

              {/* APK 下载地址 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  APK 下载地址 <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={downloadUrl}
                  onChange={(e) => setDownloadUrl(e.target.value)}
                  placeholder="https://example.com/app.apk"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                />
              </div>

              {/* 是否强制更新 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  是否强制更新
                </label>
                <div className="flex space-x-6">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="forceUpdate"
                      checked={forceUpdate}
                      onChange={() => setForceUpdate(true)}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">是</span>
                  </label>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="forceUpdate"
                      checked={!forceUpdate}
                      onChange={() => setForceUpdate(false)}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">否</span>
                  </label>
                </div>
              </div>

              {/* 是否启用 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  是否启用
                </label>
                <div className="flex space-x-6">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="isEnabled"
                      checked={isEnabled}
                      onChange={() => setIsEnabled(true)}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">启用</span>
                  </label>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="isEnabled"
                      checked={!isEnabled}
                      onChange={() => setIsEnabled(false)}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">停用</span>
                  </label>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm border border-red-100">
                  {error}
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => router.push('/admin/versions')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? '保存中...' : '保存修改'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

export default function EditVersionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-gray-400">加载中...</div>
        </div>
      }
    >
      <EditVersionContent />
    </Suspense>
  )
}
