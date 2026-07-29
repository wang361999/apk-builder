import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/app-config —— App 端获取所有配置（一次性返回）
export async function GET() {
  try {
    // 1. 版本信息
    const latestVersion = await prisma.appVersion.findFirst({
      where: { isEnabled: true },
      orderBy: { versionCode: 'desc' },
    })

    // 2. 广告配置
    const ads = await prisma.adConfig.findMany()
    const adMap: Record<string, any> = {}
    for (const ad of ads) {
      adMap[ad.type] = ad
    }

    // 3. 功能开关
    const features = await prisma.featureFlag.findMany()
    const featureMap: Record<string, boolean> = {}
    for (const f of features) {
      featureMap[f.key] = f.value === 'true'
    }

    // 4. 样式配置
    const styles = await prisma.styleConfig.findMany()
    const styleMap: Record<string, string> = {}
    for (const s of styles) {
      styleMap[s.key] = s.value
    }

    // 5. 公告
    const announcement = await prisma.announcement.findFirst()

    // 组装返回数据
    const result = {
      version: latestVersion
        ? {
            code: latestVersion.versionCode,
            name: latestVersion.versionName,
            updateLog: latestVersion.updateLog,
            downloadUrl: latestVersion.downloadUrl,
            forceUpdate: latestVersion.forceUpdate,
          }
        : null,

      splash: {
        enabled: adMap.splash?.enabled ?? false,
        imageUrl: adMap.splash?.imageUrl ?? '',
        duration: adMap.splash?.duration ?? 3,
        skipable: true,
        linkUrl: adMap.splash?.linkUrl ?? '',
      },

      popup: {
        enabled: adMap.popup?.enabled ?? false,
        imageUrl: adMap.popup?.imageUrl ?? '',
        linkUrl: adMap.popup?.linkUrl ?? '',
        showTimesPerDay: adMap.popup?.showTimesPerDay ?? 1,
      },

      banner: {
        enabled: adMap.banner?.enabled ?? false,
        imageUrl: adMap.banner?.imageUrl ?? '',
        linkUrl: adMap.banner?.linkUrl ?? '',
      },

      features: {
        enablePullToRefresh: featureMap.enablePullToRefresh ?? true,
        enableShare: featureMap.enableShare ?? true,
        enableDarkMode: featureMap.enableDarkMode ?? false,
        enableFileDownload: featureMap.enableFileDownload ?? true,
        enableExitConfirm: featureMap.enableExitConfirm ?? false,
      },

      style: {
        themeColor: styleMap.themeColor ?? '#3B82F6',
        statusBarColor: styleMap.statusBarColor ?? '#1A1A2E',
        appName: styleMap.appName ?? '我的应用',
        loadingText: styleMap.loadingText ?? '加载中...',
      },

      announcement: {
        enabled: announcement?.enabled ?? false,
        text: announcement?.text ?? '',
        linkUrl: announcement?.linkUrl ?? '',
      },
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/app-config 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}
