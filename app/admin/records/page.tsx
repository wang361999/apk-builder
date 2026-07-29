'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'

interface RecordItem {
  id: number
  url: string
  appName: string
  packageName: string
  downloadUrl: string | null
  status: string
  createdAt: string
}

const STATUS_TABS = [
  { value: '', label: '全部' },
  { value: 'building', label: '构建中' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
]

const STATUS_BADGE: Record<string, { color: string; label: string }> = {
  success: { color: 'bg-green-100 text-green-700', label: '成功' },
  failed: { color: 'bg-red-100 text-red-700', label: '失败' },
  building: { color: 'bg-yellow-100 text-yellow-700', label: '构建中' },
}

export default function RecordsListPage() {
  const router = useRouter()
  const [records, setRecords] = useState<RecordItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const pageSize = 10

  // 加载构建记录
  const fetchRecords = useCallback(
    async (p: number, s: string) => {
      setLoading(true)
      try {
        const url = s
          ? `/api/admin/records?page=${p}&pageSize=${pageSize}&status=${s}`
          : `/api/admin/records?page=${p}&pageSize=${pageSize}`
        const res = await fetch(url)
        if (res.status === 401) {
          router.replace('/admin/login')
          return
        }
        if (res.ok) {
          const data = await res.json()
          setRecords(data.list || [])
          setTotal(data.total || 0)
        }
      } catch (err) {
        console.error('加载构建记录失败:', err)
      } finally {
        setLoading(false)
      }
    },
    [router]
  )

  useEffect(() => {
    fetchRecords(page, status)
  }, [page, status, fetchRecords])

  // 切换状态过滤
  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus)
    setPage(1)
  }

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 计算总页数
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800">构建记录</h1>
          <p className="text-gray-500 mt-1 text-sm">
            共 {total} 条构建记录
          </p>
        </div>

        {/* 状态过滤 tab */}
        <div className="flex space-x-2 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusChange(tab.value)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap cursor-pointer ${
                status === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 构建记录表格 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-gray-400">加载中...</div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              暂无构建记录
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3">应用名称</th>
                    <th className="px-6 py-3 hidden sm:table-cell">包名</th>
                    <th className="px-6 py-3 hidden lg:table-cell">网址</th>
                    <th className="px-6 py-3">状态</th>
                    <th className="px-6 py-3">创建时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map((record) => {
                    const badge =
                      STATUS_BADGE[record.status] || {
                        color: 'bg-gray-100 text-gray-700',
                        label: record.status,
                      }
                    return (
                      <tr
                        key={record.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-6 py-4 text-sm font-medium text-gray-800">
                          {record.appName}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 hidden sm:table-cell">
                          {record.packageName}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 hidden lg:table-cell max-w-xs">
                          <a
                            href={record.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700 hover:underline truncate inline-block max-w-full"
                            title={record.url}
                          >
                            {record.url}
                          </a>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                          {formatTime(record.createdAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                第 {page} / {totalPages} 页
              </p>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
