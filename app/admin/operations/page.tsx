'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'

// ========== 类型定义 ==========
interface AdConfig {
  type: string
  enabled: boolean
  imageUrl: string
  linkUrl: string
  duration: number
  showTimesPerDay: number
}

interface FeatureFlag {
  key: string
  value: string
  description: string
}

interface StyleConfig {
  key: string
  value: string
}

interface Announcement {
  enabled: boolean
  text: string
  linkUrl: string
}

interface OperationsData {
  ads: AdConfig[]
  features: FeatureFlag[]
  styles: StyleConfig[]
  announcement: Announcement | null
}

const AD_LABELS: Record<string, string> = {
  splash: '启动页广告',
  popup: '弹窗广告',
  banner: '底部横幅广告',
}

const FEATURE_LABELS: Record<string, string> = {
  enablePullToRefresh: '下拉刷新',
  enableShare: '分享功能',
  enableDarkMode: '深色模式',
  enableFileDownload: '文件下载',
  enableExitConfirm: '返回键退出确认',
}

const STYLE_LABELS: Record<string, string> = {
  themeColor: '主题色',
  statusBarColor: '状态栏颜色',
  appName: 'App 名称',
  loadingText: '加载提示文字',
}

type TabKey = 'ads' | 'features' | 'styles' | 'announcement'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'ads', label: '广告管理', icon: '📢' },
  { key: 'features', label: '功能开关', icon: '⚙️' },
  { key: 'styles', label: '样式配置', icon: '🎨' },
  { key: 'announcement', label: '公告管理', icon: '📝' },
]

export default function OperationsPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('ads')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 表单数据
  const [ads, setAds] = useState<AdConfig[]>([])
  const [features, setFeatures] = useState<FeatureFlag[]>([])
  const [styles, setStyles] = useState<StyleConfig[]>([])
  const [announcement, setAnnouncement] = useState<Announcement>({
    enabled: false,
    text: '',
    linkUrl: '',
  })

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

    const fetchData = async () => {
      try {
        const res = await fetch('/api/admin/operations')
        if (res.ok) {
          const data: OperationsData = await res.json()
          setAds(data.ads || [])
          setFeatures(data.features || [])
          setStyles(data.styles || [])
          if (data.announcement) {
            setAnnouncement(data.announcement)
          }
        }
      } catch (err) {
        console.error('加载运营配置失败:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [authed])

  // 保存所有配置
  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/operations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ads,
          features,
          styles,
          announcement,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: '保存成功！App 端将自动获取最新配置' })
      } else {
        setMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setSaving(false)
    }
  }

  // 更新广告配置
  const updateAd = (type: string, field: keyof AdConfig, value: string | number | boolean) => {
    setAds((prev) =>
      prev.map((ad) => (ad.type === type ? { ...ad, [field]: value } : ad))
    )
  }

  // 更新功能开关
  const updateFeature = (key: string, value: string) => {
    setFeatures((prev) =>
      prev.map((f) => (f.key === key ? { ...f, value } : f))
    )
  }

  // 更新样式配置
  const updateStyle = (key: string, value: string) => {
    setStyles((prev) =>
      prev.map((s) => (s.key === key ? { ...s, value } : s))
    )
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
          <h1 className="text-2xl font-bold text-gray-800">App 运营管理</h1>
          <p className="text-gray-500 mt-1 text-sm">
            所有配置保存后，App 下次启动时自动拉取最新配置并生效，无需重新打包
          </p>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 shadow-sm">
            加载中...
          </div>
        ) : (
          <>
            {/* Tab 导航 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-200 overflow-x-auto">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-shrink-0 flex items-center px-6 py-4 text-sm font-medium transition border-b-2 whitespace-nowrap ${
                      activeTab === tab.key
                        ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <span className="mr-2">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {/* 广告管理 */}
                {activeTab === 'ads' && (
                  <div className="space-y-6">
                    {ads.map((ad) => (
                      <div
                        key={ad.type}
                        className="border border-gray-200 rounded-lg p-5 space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-gray-800">
                            {AD_LABELS[ad.type] || ad.type}
                          </h3>
                          <label className="flex items-center cursor-pointer">
                            <span className="text-sm text-gray-600 mr-3">
                              {ad.enabled ? '已启用' : '已关闭'}
                            </span>
                            <div className="relative">
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={ad.enabled}
                                onChange={(e) => updateAd(ad.type, 'enabled', e.target.checked)}
                              />
                              <div
                                className={`w-11 h-6 rounded-full transition ${
                                  ad.enabled ? 'bg-blue-600' : 'bg-gray-300'
                                }`}
                              >
                                <div
                                  className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${
                                    ad.enabled ? 'translate-x-5' : 'translate-x-0.5'
                                  }`}
                                />
                              </div>
                            </div>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              图片地址
                            </label>
                            <input
                              type="text"
                              value={ad.imageUrl}
                              onChange={(e) => updateAd(ad.type, 'imageUrl', e.target.value)}
                              placeholder="https://example.com/ad.jpg"
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              跳转链接
                            </label>
                            <input
                              type="text"
                              value={ad.linkUrl}
                              onChange={(e) => updateAd(ad.type, 'linkUrl', e.target.value)}
                              placeholder="https://example.com"
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                          </div>
                        </div>

                        {ad.type === 'splash' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              显示时长（秒）
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={ad.duration}
                              onChange={(e) => updateAd(ad.type, 'duration', parseInt(e.target.value) || 3)}
                              className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                          </div>
                        )}

                        {ad.type === 'popup' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              每天显示次数
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={ad.showTimesPerDay}
                              onChange={(e) => updateAd(ad.type, 'showTimesPerDay', parseInt(e.target.value) || 1)}
                              className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                          </div>
                        )}

                        {ad.imageUrl && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-400 mb-1">图片预览：</p>
                            <div className="inline-block border border-gray-200 rounded-lg overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={ad.imageUrl}
                                alt={ad.type}
                                className="max-h-32 object-contain"
                                onError={(e) => {
                                  ;(e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 功能开关 */}
                {activeTab === 'features' && (
                  <div className="space-y-4">
                    {features.map((f) => (
                      <div
                        key={f.key}
                        className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {FEATURE_LABELS[f.key] || f.key}
                          </p>
                          {f.description && (
                            <p className="text-xs text-gray-400 mt-0.5">{f.description}</p>
                          )}
                        </div>
                        <label className="flex items-center cursor-pointer">
                          <div className="relative">
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={f.value === 'true'}
                              onChange={(e) => updateFeature(f.key, e.target.checked ? 'true' : 'false')}
                            />
                            <div
                              className={`w-11 h-6 rounded-full transition ${
                                f.value === 'true' ? 'bg-blue-600' : 'bg-gray-300'
                              }`}
                            >
                              <div
                                className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${
                                  f.value === 'true' ? 'translate-x-5' : 'translate-x-0.5'
                                }`}
                              />
                            </div>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                )}

                {/* 样式配置 */}
                {activeTab === 'styles' && (
                  <div className="space-y-5">
                    {styles.map((s) => (
                      <div key={s.key} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            {STYLE_LABELS[s.key] || s.key}
                          </label>
                        </div>
                        <div className="md:col-span-2">
                          {(s.key === 'themeColor' || s.key === 'statusBarColor') ? (
                            <div className="flex items-center gap-3">
                              <input
                                type="color"
                                value={s.value}
                                onChange={(e) => updateStyle(s.key, e.target.value)}
                                className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
                              />
                              <input
                                type="text"
                                value={s.value}
                                onChange={(e) => updateStyle(s.key, e.target.value)}
                                placeholder="#3B82F6"
                                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                              />
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={s.value}
                              onChange={(e) => updateStyle(s.key, e.target.value)}
                              placeholder={
                                s.key === 'appName' ? '我的应用' : '加载中...'
                              }
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                          )}
                        </div>
                      </div>
                    ))}

                    {/* 实时预览 */}
                    <div className="mt-6 pt-6 border-t border-gray-100">
                      <p className="text-sm font-medium text-gray-700 mb-3">效果预览</p>
                      <div
                        className="rounded-lg overflow-hidden shadow-lg"
                        style={{ maxWidth: '300px' }}
                      >
                        {/* 状态栏 */}
                        <div
                          className="h-8 flex items-center justify-center text-white text-xs"
                          style={{ backgroundColor: styles.find((s) => s.key === 'statusBarColor')?.value || '#1A1A2E' }}
                        >
                          {styles.find((s) => s.key === 'appName')?.value || '我的应用'}
                        </div>
                        {/* 标题栏 */}
                        <div
                          className="py-3 px-4 text-white text-sm font-semibold text-center"
                          style={{ backgroundColor: styles.find((s) => s.key === 'themeColor')?.value || '#3B82F6' }}
                        >
                          {styles.find((s) => s.key === 'appName')?.value || '我的应用'}
                        </div>
                        {/* 内容区 */}
                        <div className="bg-gray-50 p-4 text-center text-gray-400 text-xs">
                          {styles.find((s) => s.key === 'loadingText')?.value || '加载中...'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 公告管理 */}
                {activeTab === 'announcement' && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">启用公告</p>
                        <p className="text-xs text-gray-400 mt-0.5">开启后 App 内将显示滚动公告栏</p>
                      </div>
                      <label className="flex items-center cursor-pointer">
                        <div className="relative">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={announcement.enabled}
                            onChange={(e) =>
                              setAnnouncement({ ...announcement, enabled: e.target.checked })
                            }
                          />
                          <div
                            className={`w-11 h-6 rounded-full transition ${
                              announcement.enabled ? 'bg-blue-600' : 'bg-gray-300'
                            }`}
                          >
                            <div
                              className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${
                                announcement.enabled ? 'translate-x-5' : 'translate-x-0.5'
                              }`}
                            />
                          </div>
                        </div>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        公告内容
                      </label>
                      <textarea
                        value={announcement.text}
                        onChange={(e) =>
                          setAnnouncement({ ...announcement, text: e.target.value })
                        }
                        rows={3}
                        placeholder="请输入公告内容，将在 App 内滚动显示"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        跳转链接（可选）
                      </label>
                      <input
                        type="text"
                        value={announcement.linkUrl}
                        onChange={(e) =>
                          setAnnouncement({ ...announcement, linkUrl: e.target.value })
                        }
                        placeholder="https://example.com（用户点击公告时跳转）"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>

                    {announcement.enabled && announcement.text && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-xs text-gray-400 mb-2">预览效果：</p>
                        <div className="bg-white rounded px-3 py-2 overflow-hidden">
                          <p className="text-sm text-blue-600 whitespace-nowrap">
                            📢 {announcement.text}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
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

            {/* 保存按钮 */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
