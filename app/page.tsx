'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// 模板类型定义
interface Template {
  id: string
  name: string
  desc: string
  icon: string
  features: string[]
}

// 预定义模板列表（与后端一致）
const TEMPLATES: Template[] = [
  {
    id: 'standard',
    name: '标准模板',
    desc: '带标题栏、下拉刷新、广告、公告等完整功能',
    icon: '📱',
    features: ['标题栏', '下拉刷新', '广告位', '公告栏', '进度条'],
  },
  {
    id: 'fullscreen',
    name: '全屏模板',
    desc: '无标题栏，全屏沉浸式，隐藏状态栏和导航栏',
    icon: '🖼️',
    features: ['全屏沉浸', '隐藏状态栏', '隐藏导航栏', '进度条'],
  },
  {
    id: 'minimal',
    name: '极简模板',
    desc: '无标题栏但保留状态栏，仅 WebView + 进度条',
    icon: '⚡',
    features: ['保留状态栏', '无标题栏', '进度条', '极简设计'],
  },
  {
    id: 'immersive',
    name: '沉浸式模板',
    desc: '透明状态栏，内容延伸到状态栏下方',
    icon: '🎨',
    features: ['透明状态栏', '内容延伸', '沉浸体验', '进度条'],
  },
]

// 用户信息
interface UserInfo {
  id: number
  username: string
  role: string
}

// 构建历史记录
interface BuildHistoryItem {
  id: number
  appName: string
  packageName: string
  template: string
  status: 'building' | 'success' | 'failed'
  downloadUrl: string | null
  createdAt: string
}

export default function HomePage() {
  const router = useRouter()

  // 登录状态
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // 登录表单
  const [loginMode, setLoginMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  // 构建表单
  const [url, setUrl] = useState('')
  const [appName, setAppName] = useState('')
  const [packageName, setPackageName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('standard')
  const [buildLoading, setBuildLoading] = useState(false)
  const [buildError, setBuildError] = useState('')

  // 构建历史
  const [buildHistory, setBuildHistory] = useState<BuildHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // 检查登录状态
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/login')
      if (res.ok) {
        const data = await res.json()
        if (data.isLoggedIn) {
          setIsLoggedIn(true)
          setUser(data.user)
          // 加载构建历史
          loadBuildHistory()
        }
      }
    } catch {
      // 忽略错误
    } finally {
      setAuthLoading(false)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // 加载构建历史
  const loadBuildHistory = async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/build?action=history')
      if (res.ok) {
        const data = await res.json()
        setBuildHistory(data.list || [])
      }
    } catch {
      // 忽略错误
    } finally {
      setHistoryLoading(false)
    }
  }

  // 登录/注册
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')

    if (!username || !password) {
      setLoginError('请输入用户名和密码')
      return
    }

    if (password.length < 6) {
      setLoginError('密码至少 6 位')
      return
    }

    setLoginLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()

      if (res.ok) {
        setIsLoggedIn(true)
        setUser(data.user)
        setUsername('')
        setPassword('')
        loadBuildHistory()
      } else {
        setLoginError(data.error || '操作失败')
      }
    } catch {
      setLoginError('网络错误，请重试')
    } finally {
      setLoginLoading(false)
    }
  }

  // 退出登录
  const handleLogout = async () => {
    try {
      await fetch('/api/login', { method: 'DELETE' })
      setIsLoggedIn(false)
      setUser(null)
      setBuildHistory([])
    } catch {
      // 忽略错误
    }
  }

  // 提交构建
  const handleBuild = async (e: React.FormEvent) => {
    e.preventDefault()
    setBuildError('')

    if (!url || !appName || !packageName) {
      setBuildError('请填写所有必填字段')
      return
    }

    const packageRegex = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/
    if (!packageRegex.test(packageName)) {
      setBuildError('包名格式不正确，应为 com.example.myapp')
      return
    }

    setBuildLoading(true)
    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          appName,
          packageName,
          template: selectedTemplate,
        }),
      })
      const data = await res.json()
      if (res.ok || data.id) {
        router.push(`/build?id=${data.id}`)
      } else {
        setBuildError(data.error || '提交失败，请重试')
      }
    } catch {
      setBuildError('网络错误，请重试')
    } finally {
      setBuildLoading(false)
    }
  }

  // 获取模板名称
  const getTemplateName = (id: string) => {
    const t = TEMPLATES.find((t) => t.id === id)
    return t ? t.name : id
  }

  // 获取模板图标
  const getTemplateIcon = (id: string) => {
    const t = TEMPLATES.find((t) => t.id === id)
    return t ? t.icon : '📱'
  }

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hour = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${month}-${day} ${hour}:${min}`
  }

  // ===== 加载中 =====
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 flex items-center justify-center">
        <div className="text-white/80 text-lg animate-pulse">加载中...</div>
      </div>
    )
  }

  // ===== 未登录：显示登录/注册页 =====
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 flex items-center justify-center p-4">
        <div className="w-full max-w-[460px]">
          {/* Logo / 标题 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg shadow-blue-500/30 mb-4">
              <span className="text-3xl">📱</span>
            </div>
            <h1 className="text-3xl font-bold text-white">APK 生成器</h1>
            <p className="text-gray-400 mt-2 text-sm">输入网址，一键生成原生 Android APK</p>
          </div>

          {/* 登录卡片 */}
          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8">
            {/* 切换标签 */}
            <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => { setLoginMode('login'); setLoginError('') }}
                className={`flex-1 py-2.5 rounded-md text-sm font-medium transition ${
                  loginMode === 'login'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                登录
              </button>
              <button
                onClick={() => { setLoginMode('register'); setLoginError('') }}
                className={`flex-1 py-2.5 rounded-md text-sm font-medium transition ${
                  loginMode === 'register'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                注册
              </button>
            </div>

            {/* 提示 */}
            <div className="mb-5 px-3 py-2.5 bg-blue-50 rounded-lg text-xs text-blue-600">
              {loginMode === 'login'
                ? '💡 输入账号密码登录，新用户会自动注册'
                : '💡 输入用户名和密码即可注册，注册后自动登录'}
            </div>

            {/* 表单 */}
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                  autoComplete="username"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码（至少 6 位）"
                  autoComplete={loginMode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                />
              </div>

              {loginError && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm border border-red-100">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loginLoading
                  ? '处理中...'
                  : loginMode === 'login'
                    ? '登 录'
                    : '注册并登录'}
              </button>
            </form>
          </div>

          {/* 底部 */}
          <div className="mt-6 text-center">
            <a href="/admin/login" className="text-sm text-gray-400 hover:text-gray-300 transition">
              管理员入口
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ===== 已登录：显示生成页面 =====
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-900/80 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <span className="text-xl">📱</span>
            </div>
            <span className="text-white font-bold text-lg">APK 生成器</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-gray-300 text-sm hidden sm:block">
              👤 {user?.username}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-white/10"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* 欢迎区 */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">
            欢迎回来，{user?.username} 👋
          </h1>
          <p className="text-gray-400">选择模板，填写信息，一键生成你的原生 Android APK</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* 左侧：模板选择 + 表单 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 模板选择 */}
            <section className="bg-white/95 backdrop-blur rounded-2xl shadow-xl p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                <span>🎯</span> 选择模板
              </h2>
              <p className="text-sm text-gray-500 mb-5">选择你喜欢的 Android 应用模板风格</p>

              <div className="grid sm:grid-cols-2 gap-4">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => setSelectedTemplate(tpl.id)}
                    className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                      selectedTemplate === tpl.id
                        ? 'border-blue-500 bg-blue-50 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    {/* 选中标识 */}
                    {selectedTemplate === tpl.id && (
                      <div className="absolute top-3 right-3 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        ✓
                      </div>
                    )}

                    <div className="flex items-start gap-3 mb-3">
                      <span className="text-2xl">{tpl.icon}</span>
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm">{tpl.name}</h3>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 mb-3 leading-relaxed">{tpl.desc}</p>

                    <div className="flex flex-wrap gap-1.5">
                      {tpl.features.map((f, i) => (
                        <span
                          key={i}
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            selectedTemplate === tpl.id
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* APK 生成表单 */}
            <section className="bg-white/95 backdrop-blur rounded-2xl shadow-xl p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                <span>📝</span> 填写应用信息
              </h2>
              <p className="text-sm text-gray-500 mb-5">输入你的网站和应用信息</p>

              <form onSubmit={handleBuild} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    网站地址 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    应用名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder="我的应用"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    应用包名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={packageName}
                    onChange={(e) => setPackageName(e.target.value)}
                    placeholder="com.example.myapp"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">格式：com.example.myapp（至少两段，小写字母数字）</p>
                </div>

                {/* 已选模板展示 */}
                <div className="px-4 py-3 bg-blue-50 rounded-lg flex items-center gap-3">
                  <span className="text-xl">{getTemplateIcon(selectedTemplate)}</span>
                  <div>
                    <p className="text-xs text-blue-500">已选模板</p>
                    <p className="text-sm font-medium text-blue-700">{getTemplateName(selectedTemplate)}</p>
                  </div>
                </div>

                {buildError && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm border border-red-100">
                    {buildError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={buildLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                >
                  {buildLoading ? (
                    <>
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      提交中...
                    </>
                  ) : (
                    <>🔨 生成 APK</>
                  )}
                </button>
              </form>

              <div className="mt-5 text-center">
                <p className="text-xs text-gray-400">
                  ⏱️ 约需 3-5 分钟，生成后自动跳转到下载页面
                </p>
              </div>
            </section>
          </div>

          {/* 右侧：构建历史 */}
          <aside className="lg:col-span-1">
            <section className="bg-white/95 backdrop-blur rounded-2xl shadow-xl p-6 sticky top-20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <span>📋</span> 构建历史
                </h2>
                <button
                  onClick={loadBuildHistory}
                  className="text-xs text-blue-500 hover:text-blue-600 transition"
                >
                  刷新
                </button>
              </div>

              {historyLoading ? (
                <div className="py-8 text-center text-gray-400 text-sm animate-pulse">
                  加载中...
                </div>
              ) : buildHistory.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  <div className="text-3xl mb-2">📭</div>
                  暂无构建记录
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {buildHistory.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition cursor-pointer"
                      onClick={() => {
                        if (item.status === 'success' && item.downloadUrl) {
                          router.push(`/download?id=${item.id}`)
                        } else if (item.status === 'building') {
                          router.push(`/build?id=${item.id}`)
                        } else {
                          router.push(`/build?id=${item.id}`)
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {getTemplateIcon(item.template)} {item.appName}
                        </span>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="text-xs text-gray-400 truncate">{item.packageName}</p>
                      <p className="text-xs text-gray-300 mt-1">{formatTime(item.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </main>

      {/* 底部 */}
      <footer className="border-t border-white/10 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center">
          <p className="text-gray-500 text-xs">
            APK 生成器 · 基于 Next.js + GitHub Actions · 自动构建原生 Android 应用
          </p>
        </div>
      </footer>
    </div>
  )
}

// 状态徽章组件
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    building: { label: '构建中', color: 'bg-yellow-100 text-yellow-700' },
    success: { label: '成功', color: 'bg-green-100 text-green-700' },
    failed: { label: '失败', color: 'bg-red-100 text-red-700' },
  }
  const c = config[status] || { label: status, color: 'bg-gray-100 text-gray-600' }

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.color}`}>
      {c.label}
    </span>
  )
}