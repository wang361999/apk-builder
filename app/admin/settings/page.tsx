'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'

interface ConfigData {
  github_token: string
  github_token_masked: string
  github_token_set: string
  github_repo: string
  github_branch: string
  vercel_url: string
  build_webhook_secret_set: string
  database_status: string
  database_message: string
}

interface CheckResult {
  item: string
  status: 'ok' | 'fail'
  message: string
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [testResults, setTestResults] = useState<CheckResult[] | null>(null)

  // 表单字段
  const [githubToken, setGithubToken] = useState('')
  const [githubRepo, setGithubRepo] = useState('')
  const [githubBranch, setGithubBranch] = useState('main')
  const [vercelUrl, setVercelUrl] = useState('')

  // 原始数据（用于显示状态）
  const [tokenSet, setTokenSet] = useState(false)
  const [tokenMasked, setTokenMasked] = useState('')
  const [webhookSet, setWebhookSet] = useState(false)
  const [dbStatus, setDbStatus] = useState('')
  const [dbMessage, setDbMessage] = useState('')

  // 是否显示明文 token
  const [showToken, setShowToken] = useState(false)

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

  // 加载配置
  useEffect(() => {
    if (!authed) return

    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/admin/config')
        if (res.ok) {
          const data: ConfigData = await res.json()
          setGithubRepo(data.github_repo || '')
          setGithubBranch(data.github_branch || 'main')
          setVercelUrl(data.vercel_url || '')
          setTokenSet(data.github_token_set === 'true')
          setTokenMasked(data.github_token_masked || '')
          setWebhookSet(data.build_webhook_secret_set === 'true')
          setDbStatus(data.database_status || '')
          setDbMessage(data.database_message || '')
        }
      } catch (err) {
        console.error('加载配置失败:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [authed])

  // 保存配置
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const body: Record<string, string> = {}

      if (githubToken) {
        body.github_token = githubToken
      }
      if (githubRepo !== undefined) {
        body.github_repo = githubRepo
      }
      if (githubBranch !== undefined) {
        body.github_branch = githubBranch
      }
      if (vercelUrl !== undefined) {
        body.vercel_url = vercelUrl
      }

      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: '配置保存成功！' })
        setGithubToken('')
        const refreshRes = await fetch('/api/admin/config')
        if (refreshRes.ok) {
          const newData: ConfigData = await refreshRes.json()
          setGithubRepo(newData.github_repo || '')
          setGithubBranch(newData.github_branch || 'main')
          setVercelUrl(newData.vercel_url || '')
          setTokenSet(newData.github_token_set === 'true')
          setTokenMasked(newData.github_token_masked || '')
          setWebhookSet(newData.build_webhook_secret_set === 'true')
          setDbStatus(newData.database_status || '')
          setDbMessage(newData.database_message || '')
        }
      } else {
        setMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setSaving(false)
    }
  }

  // 测试连接
  const handleTest = async () => {
    setTesting(true)
    setTestResults(null)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_connection' }),
      })

      const data = await res.json()

      if (res.ok) {
        setTestResults(data.checks || [])
        if (data.success) {
          setMessage({ type: 'success', text: '所有配置检查通过！' })
        } else {
          setMessage({ type: 'error', text: data.message || '部分配置有问题' })
        }
      } else {
        setMessage({ type: 'error', text: data.error || '测试失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setTesting(false)
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
      <div className="space-y-6">
        {/* 页面标题 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800">系统设置</h1>
          <p className="text-gray-500 mt-1 text-sm">
            配置 GitHub Actions 自动打包所需的参数，填写后保存即可生效
          </p>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 shadow-sm">
            加载中...
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* GitHub 配置 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <span>🔧</span> GitHub Actions 配置
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  用于触发 GitHub Actions 自动编译 APK
                </p>
              </div>

              <div className="p-6 space-y-5">
                {/* GitHub Token */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GitHub Token
                    {tokenSet && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                        已配置 {tokenMasked}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder={tokenSet ? '已设置，如需更换请输入新 Token' : '请输入 GitHub Personal Access Token（需 repo 权限）'}
                      className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                    >
                      {showToken ? '隐藏' : '显示'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    获取方式：GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → 勾选 repo 权限
                  </p>
                </div>

                {/* GitHub Repo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GitHub 仓库地址
                  </label>
                  <input
                    type="text"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="用户名/仓库名（如：myname/apk-builder）"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    存放了 Android 打包模板的 GitHub 仓库，格式为 用户名/仓库名
                  </p>
                </div>

                {/* GitHub Branch */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GitHub 分支名
                  </label>
                  <input
                    type="text"
                    value={githubBranch}
                    onChange={(e) => setGithubBranch(e.target.value)}
                    placeholder="main"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    打包仓库的分支名，默认为 main
                  </p>
                </div>
              </div>
            </div>

            {/* 站点配置 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <span>🌐</span> 站点地址
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  GitHub Actions 打包完成后，需要回调此地址通知构建结果
                </p>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    本站部署地址
                  </label>
                  <input
                    type="text"
                    value={vercelUrl}
                    onChange={(e) => setVercelUrl(e.target.value)}
                    placeholder="https://your-app.vercel.app"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    你在 Vercel 上部署的网站地址，用于 GitHub Actions 回调通知构建结果
                  </p>
                </div>
              </div>
            </div>

            {/* 自动配置状态 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <span>🔒</span> 自动配置项
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  以下配置由系统自动生成，无需手动填写
                </p>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Webhook 回调密钥</p>
                    <p className="text-xs text-gray-400 mt-0.5">用于 GitHub Actions 回调验证身份</p>
                  </div>
                  {webhookSet ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-green-100 text-green-700">
                      ✓ 已自动生成
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-yellow-100 text-yellow-700">
                      等待生成
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-700">APK 签名证书</p>
                    <p className="text-xs text-gray-400 mt-0.5">每次构建自动生成，无需配置</p>
                  </div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-green-100 text-green-700">
                    ✓ 自动生成
                  </span>
                </div>
              </div>
            </div>

            {/* 数据库状态 */}
            <div className={`rounded-xl border shadow-sm ${
              dbStatus === 'warning'
                ? 'bg-red-50 border-red-200'
                : dbStatus === 'turso'
                ? 'bg-white border-gray-200'
                : 'bg-white border-gray-200'
            }`}>
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <span>💾</span> 数据库状态
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  数据库持久化配置，影响数据是否会因重新部署而丢失
                </p>
              </div>

              <div className="p-6">
                {dbStatus === 'turso' && (
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-green-100 text-green-700">
                      ✓ Turso 云数据库
                    </span>
                    <p className="text-sm text-gray-600">{dbMessage}</p>
                  </div>
                )}
                {dbStatus === 'warning' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-red-100 text-red-700">
                        ✗ 数据不持久
                      </span>
                      <p className="text-sm text-red-600 font-medium">{dbMessage}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-red-200 p-4">
                      <p className="text-sm text-gray-700 font-medium mb-2">配置方法：</p>
                      <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                        <li>访问 <a href="https://turso.tech" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">turso.tech</a> 注册并创建数据库</li>
                        <li>获取 Database URL（格式：libsql://xxx.turso.io）和 Auth Token</li>
                        <li>在 Vercel 后台 Settings → Environment Variables 添加：
                          <br />
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded mt-1 inline-block">TURSO_DATABASE_URL</code>
                          <br />
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded mt-1 inline-block">TURSO_AUTH_TOKEN</code>
                        </li>
                        <li>重新部署即可，数据将永久保存</li>
                      </ol>
                    </div>
                  </div>
                )}
                {dbStatus === 'sqlite' && (
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                      本地 SQLite
                    </span>
                    <p className="text-sm text-gray-600">{dbMessage}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 测试结果 */}
            {testResults && testResults.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <span>🔍</span> 连接测试结果
                  </h2>
                </div>
                <div className="p-6 space-y-3">
                  {testResults.map((check, index) => (
                    <div key={index} className="flex items-start gap-3 py-2">
                      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        check.status === 'ok'
                          ? 'bg-green-100 text-green-600'
                          : 'bg-red-100 text-red-600'
                      }`}>
                        {check.status === 'ok' ? '✓' : '✗'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">{check.item}</p>
                        <p className={`text-xs mt-0.5 ${
                          check.status === 'ok' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {check.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 配置说明 */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                <span>📋</span> 你只需要做以下三步
              </h3>
              <ul className="text-sm text-blue-700 space-y-2">
                <li>1. 把代码推送到 GitHub 仓库</li>
                <li>2. 在 GitHub 创建 Personal Access Token（勾选 repo 权限）</li>
                <li>3. 在这里填写 GitHub Token、仓库地址、本站部署地址，保存</li>
              </ul>
              <p className="text-xs text-blue-600 mt-3 pt-3 border-t border-blue-200">
                签名证书、Webhook 密钥等全部自动处理，无需在 GitHub 配置任何 Secrets
              </p>
            </div>

            {/* 消息提示 */}
            {message && (
              <div
                className={`px-4 py-3 rounded-lg text-sm border ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-600 border-green-100'
                    : 'bg-red-50 text-red-600 border-red-100'
                }`}
              >
                {message.text}
              </div>
            )}

            {/* 按钮区域 */}
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="px-6 py-3 bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </form>
        )}
      </div>
    </AdminLayout>
  )
}
