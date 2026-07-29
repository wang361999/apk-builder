import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, SessionData } from '@/lib/session'

// 鉴权
async function checkAdmin(): Promise<SessionData | NextResponse> {
  const session = await getSession()
  if (!session.isLoggedIn || session.role !== 'admin') {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  return session
}

function isUnauthorized(result: SessionData | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}

// GET /api/admin/operations —— 获取所有运营配置
export async function GET() {
  try {
    const authResult = await checkAdmin()
    if (isUnauthorized(authResult)) return authResult

    const [ads, features, styles, announcement] = await Promise.all([
      prisma.adConfig.findMany(),
      prisma.featureFlag.findMany(),
      prisma.styleConfig.findMany(),
      prisma.announcement.findFirst(),
    ])

    return NextResponse.json({
      ads,
      features,
      styles,
      announcement,
    })
  } catch (error) {
    console.error('GET /api/admin/operations 出错:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

// PUT /api/admin/operations —— 批量更新配置
export async function PUT(request: NextRequest) {
  try {
    const authResult = await checkAdmin()
    if (isUnauthorized(authResult)) return authResult

    const body = await request.json()
    const { ads, features, styles, announcement } = body || {}

    // 1. 更新广告配置
    if (ads && Array.isArray(ads)) {
      for (const ad of ads) {
        if (!ad.type) continue
        await prisma.adConfig.upsert({
          where: { type: ad.type },
          update: {
            enabled: Boolean(ad.enabled),
            imageUrl: String(ad.imageUrl || ''),
            linkUrl: String(ad.linkUrl || ''),
            duration: Number(ad.duration) || 3,
            showTimesPerDay: Number(ad.showTimesPerDay) || 1,
          },
          create: {
            type: ad.type,
            enabled: Boolean(ad.enabled),
            imageUrl: String(ad.imageUrl || ''),
            linkUrl: String(ad.linkUrl || ''),
            duration: Number(ad.duration) || 3,
            showTimesPerDay: Number(ad.showTimesPerDay) || 1,
          },
        })
      }
    }

    // 2. 更新功能开关
    if (features && Array.isArray(features)) {
      for (const f of features) {
        if (!f.key) continue
        await prisma.featureFlag.upsert({
          where: { key: f.key },
          update: {
            value: String(f.value),
            description: String(f.description || ''),
          },
          create: {
            key: f.key,
            value: String(f.value),
            description: String(f.description || ''),
          },
        })
      }
    }

    // 3. 更新样式配置
    if (styles && Array.isArray(styles)) {
      for (const s of styles) {
        if (!s.key) continue
        await prisma.styleConfig.upsert({
          where: { key: s.key },
          update: { value: String(s.value || '') },
          create: { key: s.key, value: String(s.value || '') },
        })
      }
    }

    // 4. 更新公告
    if (announcement) {
      const existing = await prisma.announcement.findFirst()
      if (existing) {
        await prisma.announcement.update({
          where: { id: existing.id },
          data: {
            enabled: Boolean(announcement.enabled),
            text: String(announcement.text || ''),
            linkUrl: String(announcement.linkUrl || ''),
          },
        })
      } else {
        await prisma.announcement.create({
          data: {
            enabled: Boolean(announcement.enabled),
            text: String(announcement.text || ''),
            linkUrl: String(announcement.linkUrl || ''),
          },
        })
      }
    }

    // 5. 更新配置版本号（每次保存配置自动刷新，App 检测到变化后强制刷新网页）
    await prisma.systemConfig.upsert({
      where: { key: 'config_version' },
      update: { value: String(Date.now()) },
      create: { key: 'config_version', value: String(Date.now()) },
    })

    return NextResponse.json({ message: '保存成功' })
  } catch (error) {
    console.error('PUT /api/admin/operations 出错:', error)
    return NextResponse.json(
      { error: '保存失败: ' + (error instanceof Error ? error.message : '未知错误') },
      { status: 500 }
    )
  }
}
