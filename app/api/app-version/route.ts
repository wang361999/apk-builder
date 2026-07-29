import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/app-version —— App 端检查更新
export async function GET() {
  try {
    // 1. 查找 isEnabled=true 的 AppVersion，按 versionCode 降序取第一个
    const latestVersion = await prisma.appVersion.findFirst({
      where: { isEnabled: true },
      orderBy: { versionCode: 'desc' },
    })

    // 3. 如果没有启用的版本，返回空对象 {}
    if (!latestVersion) {
      return NextResponse.json({})
    }

    // 2. 返回最新版本信息
    return NextResponse.json({
      versionCode: latestVersion.versionCode,
      versionName: latestVersion.versionName,
      updateLog: latestVersion.updateLog,
      downloadUrl: latestVersion.downloadUrl,
      forceUpdate: latestVersion.forceUpdate,
    })
  } catch (error) {
    console.error('GET /api/app-version 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}
