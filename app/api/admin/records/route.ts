import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, SessionData } from '@/lib/session'

// 鉴权中间件逻辑（内联函数）
async function checkAdmin(): Promise<SessionData | NextResponse> {
  const session = await getSession()
  if (!session.isLoggedIn || session.role !== 'admin') {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  return session
}

// 判断返回值是否为鉴权失败响应（NextResponse）
function isUnauthorizedResponse(
  result: SessionData | NextResponse
): result is NextResponse {
  return result instanceof NextResponse
}

// GET /api/admin/records —— 分页查询构建记录
export async function GET(request: NextRequest) {
  try {
    // 1. 鉴权
    const authResult = await checkAdmin()
    if (isUnauthorizedResponse(authResult)) {
      return authResult
    }

    // 2. 解析查询参数
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize')) || 20))
    const status = searchParams.get('status') || undefined

    // 构建过滤条件
    const where: Record<string, unknown> = {}
    if (status) {
      where.status = status
    }

    // 3. 分页查询 BuildRecord，按 createdAt 降序，关联 User 信息
    const [list, total] = await Promise.all([
      prisma.buildRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          url: true,
          appName: true,
          packageName: true,
          downloadUrl: true,
          status: true,
          buildLog: true,
          versionName: true,
          fileSize: true,
          userId: true,
          createdAt: true,
          user: {
            select: { username: true },
          },
        },
      }),
      prisma.buildRecord.count({ where }),
    ])

    // 4. 返回列表 + 总数
    return NextResponse.json({
      list,
      total,
      page,
      pageSize,
    })
  } catch (error) {
    console.error('GET /api/admin/records 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}
