'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'

interface RecordItem {
  id: number
  appName: string
  packageName: string
  status: string
  createdAt: string
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [totalBuilds, setTotalBuilds] = useState<number>(0)
  const [latestVersion, setLatestVersion] = useState<string>('--')
  const [monthBuilds, setMonthBuilds] = useState<number>(0)
  const [recentRecords, setRecentRecords] = useState<RecordItem[]>([])
  const [loading, setLoading] = useState(true)

  // 鉴权检查
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/admin/versions?page=1&pageSize=1')
        if (res.ok) {
          setAuthed(true)
        } else {
          router.replace('/admin/login')
        }
      } catch {
        router.replace('/admin/login')
      }
    }
    checkAuth()
  }, [router])

  // 加载仪表盘数据
  useEffect(() => {
    if (!authed) return

    const fetchData = async () => {
      try {
        // 并行请求：构建记录统计、版本信息、本月构建数
        const [recordsRes, versionsRes, allRecordsRes] = await Promise.all([
          fetch('/api/admin/records?page=1&pageSize=10'),
          fetch('/api/admin/versions?page=1&pageSize=1'),
          fetch('/api/admin/records?page=1&pageSize=100'),
        ])

        if (recordsRes.ok) {
          const recordsData = await recordsRes.json()
          setTotalBuilds(recordsData.total || 0)
          setRecentRecords(recordsData.list || [])
        }

        if (versionsRes.ok) {
          const versionsData = await versionsRes.json()
          if (versionsData.list && versionsData.list.length > 0) {
            setLatestVersion(versionsData.list[0].versionName)
          }
        }

        // 计算本月构建数
        if (allRecordsRes.ok) {
          const allRecordsData = await allRecordsRes.json()
          const now = new Date()
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
          const monthCount = (allRecordsData.list || []).filter((r: RecordItem) => {
            return new Date(r.createdAt) >= monthStart
          }).length
          setMonthBuilds(monthCount)
        }
      } catch (err) {
        console.error('加载仪表盘数据失败:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [authed])

  // 未鉴权时不渲染
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">验证身份中...</div>
      </div>
    )
  }

  // 状态 badge 渲染
  const StatusBadge = ({ status }: { status: string }) => {
    const config: Record<string, { color: string; label: string }> = {
      success: { color: 'bg-green-100 text-green-700', label: '成功' },
      failed: { color: 'bg-red-100 text-red-700', label: '失败' },
      building: { color: 'bg-yellow-100 text-yellow-700', label: '构建中' },
    }
    const c = config[status] || { color: 'bg-gray-100 text-gray-700', label: status }
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.color}`}>
        {c.label}
      </span>
    )
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

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800">仪表盘</h1>
          <p className="text-gray-500 mt-1 text-sm">系统概览与统计数据</p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {/* 总构建数 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">总构建数</p>
                <p className="text-3xl font-bold text-gray-800 mt-2">
                  {loading ? '...' : totalBuilds}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-2xl">
                🔨
              </div>
            </div>
          </div>

          {/* 最新版本号 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">最新版本</p>
                <p className="text-3xl font-bold text-gray-800 mt-2">
                  {loading ? '...' : latestVersion}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center text-2xl">
                📱
              </div>
            </div>
          </div>

          {/* 本月构建数 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">本月构建</p>
                <p className="text-3xl font-bold text-gray-800 mt-2">
                  {loading ? '...' : monthBuilds}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center text-2xl">
                📅
              </div>
            </div>
          </div>
        </div>

        {/* 最近构建记录 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800">
              最近构建记录
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">加载中...</div>
          ) : recentRecords.length === 0 ? (
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
                    <th className="px-6 py-3">状态</th>
                    <th className="px-6 py-3">创建时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentRecords.map((record) => (
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
                      <td className="px-6 py-4">
                        <StatusBadge status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatTime(record.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
