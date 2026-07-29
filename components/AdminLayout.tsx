'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'

interface AdminLayoutProps {
  children: React.ReactNode
  username?: string
}

// 侧边导航项配置
const NAV_ITEMS = [
  { href: '/admin', label: '仪表盘', icon: '📊' },
  { href: '/admin/versions', label: '版本管理', icon: '📱' },
  { href: '/admin/operations', label: '运营管理', icon: '🎛️' },
  { href: '/admin/records', label: '构建记录', icon: '📋' },
  { href: '/admin/settings', label: '系统设置', icon: '⚙️' },
  { href: '/admin/change-password', label: '修改密码', icon: '🔑' },
]

// 判断导航项是否为当前激活项（支持精确匹配和子路径匹配）
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') {
    return pathname === '/admin'
  }
  return pathname === href || pathname.startsWith(href + '/')
}

export default function AdminLayout({ children, username }: AdminLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [loggingOut, setLoggingOut] = useState(false)

  // 退出登录：清除客户端 cookie 并跳转到登录页
  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      // 尝试调用 logout API（如果存在），失败也不影响流程
      await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {})
      // 直接清除客户端 cookie
      document.cookie =
        'apk_builder_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
    } finally {
      setLoggingOut(false)
      router.push('/admin/login')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* 左侧 logo + 标题 */}
            <div className="flex items-center space-x-2">
              <span className="text-2xl">📦</span>
              <span className="text-lg font-bold text-gray-800">
                APK 管理后台
              </span>
            </div>

            {/* 右侧用户信息 + 退出按钮 */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span className="hidden sm:inline">👤</span>
                <span className="font-medium">
                  {username || '管理员'}
                </span>
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loggingOut ? '退出中...' : '退出'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 主体区域 */}
      <div className="flex flex-1">
        {/* 桌面端侧边导航 */}
        <aside className="hidden md:block w-56 bg-white border-r border-gray-200">
          <nav className="p-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition ${
                    active
                      ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="mr-3 text-lg">{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* 内容区域 */}
        <main className="flex-1 min-w-0">
          {/* 移动端顶部水平导航 */}
          <div className="md:hidden bg-white border-b border-gray-200">
            <nav className="flex overflow-x-auto">
              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex-shrink-0 flex items-center px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                      active
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <span className="mr-1.5">{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
