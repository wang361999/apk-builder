'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'

interface VersionItem {
  id: number
  versionCode: number
  versionName: string
  updateLog: string
  downloadUrl: string
  forceUpdate: boolean
  isEnabled: boolean
  createdAt: string
}

export default function VersionsListPage() {
  const router = useRouter()
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const pageSize = 10

  // 加载版本列表
  const fetchVersions = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/versions?page=${p}&pageSize=${pageSize}`)
      if (res.status === 401) {
        router.replace('/admin/login')
        return
      }
      if (res.ok) {
        const data = await res.json()
        setVersions(data.list || [])
        setTotal(data.total || 0)
      }
    } catch (err) {
      console.error('加载版本列表失败:', err)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchVersions(page)
  }, [page, fetchVersions])

  // 删除版本
  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除该版本吗？此操作不可恢复。')) return

    try {
      const res = await fetch(`/api/admin/versions?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        // 如果删除后当前页没有数据了，回到上一页
        const remaining = total - 1
        if (remaining <= (page - 1) * pageSize && page > 1) {
          setPage(page - 1)
        } else {
          fetchVersions(page)
        }
      } else {
        const data = await res.json()
        alert(data.error || '删除失败')
      }
    } catch {
      alert('网络错误，请重试')
    }
  }

  // 计算总页数
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* 页面标题 + 操作按钮 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">版本管理</h1>
            <p className="text-gray-500 mt-1 text-sm">
              共 {total} 个版本
            </p>
          </div>
          <button
            onClick={() => router.push('/admin/versions/new')}
            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition cursor-pointer"
          >
            <span className="mr-1.5">+</span>
            发布新版本
          </button>
        </div>

        {/* 版本列表表格 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-gray-400">加载中...</div>
          ) : versions.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              暂无版本记录，点击上方按钮发布新版本
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3">版本号</th>
                    <th className="px-6 py-3">版本名称</th>
                    <th className="px-6 py-3 hidden lg:table-cell">更新日志</th>
                    <th className="px-6 py-3">强制更新</th>
                    <th className="px-6 py-3">状态</th>
                    <th className="px-6 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {versions.map((v) => (
                    <tr
                      key={v.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">
                        {v.versionCode}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {v.versionName}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 hidden lg:table-cell max-w-xs">
                        <p className="truncate" title={v.updateLog}>
                          {v.updateLog || '--'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        {v.forceUpdate ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            是
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            否
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {v.isEnabled ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            启用
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            停用
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() =>
                            router.push(`/admin/versions/edit?id=${v.id}`)
                          }
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md transition cursor-pointer"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(v.id)}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-md transition cursor-pointer"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
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
