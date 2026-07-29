'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // 前端校验
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('请填写所有字段')
      return
    }

    if (newPassword.length < 6) {
      setError('新密码至少 6 位')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }

    if (oldPassword === newPassword) {
      setError('新密码不能与旧密码相同')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      const data = await res.json()

      if (res.ok) {
        setSuccess('密码修改成功！请使用新密码重新登录')
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
        // 3 秒后跳转到登录页
        setTimeout(() => {
          document.cookie =
            'apk_builder_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
          router.push('/admin/login')
        }, 3000)
      } else {
        setError(data.error || '修改失败，请重试')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">验证身份中...</div>
      </div>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-lg">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">修改密码</h1>
          <p className="text-gray-500 mt-1 text-sm">修改管理员登录密码</p>
        </div>

        {/* 表单卡片 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 旧密码 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                旧密码 *
              </label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="请输入当前密码"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                autoComplete="current-password"
              />
            </div>

            {/* 新密码 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                新密码 *
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 6 位"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                autoComplete="new-password"
              />
              <p className="text-xs text-gray-400 mt-1">至少 6 位字符</p>
            </div>

            {/* 确认新密码 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                确认新密码 *
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入新密码"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                autoComplete="new-password"
              />
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-2.5 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* 成功提示 */}
            {success && (
              <div className="bg-green-50 text-green-600 px-4 py-2.5 rounded-lg text-sm">
                {success}
              </div>
            )}

            {/* 按钮组 */}
            <div className="flex space-x-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? '提交中...' : '确认修改'}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition cursor-pointer"
              >
                返回
              </button>
            </div>
          </form>
        </div>

        {/* 安全提示 */}
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-700">
            ⚠️ 修改密码后将自动退出登录，需要使用新密码重新登录。
          </p>
        </div>
      </div>
    </AdminLayout>
  )
}
