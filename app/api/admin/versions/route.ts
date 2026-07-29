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

// GET /api/admin/versions —— 分页查询 AppVersion 列表
// GET /api/admin/versions?id=xxx —— 查询单个版本详情
export async function GET(request: NextRequest) {
  try {
    // 1. 鉴权
    const authResult = await checkAdmin()
    if (isUnauthorizedResponse(authResult)) {
      return authResult
    }

    // 2. 解析查询参数
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    // 如果传了 id，查询单个版本详情
    if (id) {
      const numericId = Number(id)
      if (Number.isNaN(numericId)) {
        return NextResponse.json(
          { error: 'id 参数不正确' },
          { status: 400 }
        )
      }

      const version = await prisma.appVersion.findUnique({
        where: { id: numericId },
      })

      if (!version) {
        return NextResponse.json(
          { error: '版本记录不存在' },
          { status: 404 }
        )
      }

      return NextResponse.json(version)
    }

    // 否则分页查询列表
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize')) || 20))

    const [list, total] = await Promise.all([
      prisma.appVersion.findMany({
        orderBy: { versionCode: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.appVersion.count(),
    ])

    return NextResponse.json({
      list,
      total,
      page,
      pageSize,
    })
  } catch (error) {
    console.error('GET /api/admin/versions 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}

// POST /api/admin/versions —— 创建 AppVersion
export async function POST(request: NextRequest) {
  try {
    // 1. 鉴权
    const authResult = await checkAdmin()
    if (isUnauthorizedResponse(authResult)) {
      return authResult
    }

    const body = await request.json()
    const {
      versionCode,
      versionName,
      updateLog,
      downloadUrl,
      forceUpdate,
      isEnabled,
    } = body || {}

    // 2. 校验必填字段
    if (
      versionCode === undefined ||
      versionCode === null ||
      !versionName ||
      !downloadUrl
    ) {
      return NextResponse.json(
        { error: '缺少必填字段：versionCode、versionName、downloadUrl' },
        { status: 400 }
      )
    }

    const numericVersionCode = Number(versionCode)
    if (Number.isNaN(numericVersionCode)) {
      return NextResponse.json(
        { error: 'versionCode 参数不正确' },
        { status: 400 }
      )
    }

    // 3. 检查 versionCode 是否已存在
    const existing = await prisma.appVersion.findUnique({
      where: { versionCode: numericVersionCode },
    })

    if (existing) {
      return NextResponse.json(
        { error: `versionCode ${numericVersionCode} 已存在` },
        { status: 409 }
      )
    }

    // 4. 创建 AppVersion
    const appVersion = await prisma.appVersion.create({
      data: {
        versionCode: numericVersionCode,
        versionName,
        updateLog: updateLog || '',
        downloadUrl,
        forceUpdate: !!forceUpdate,
        isEnabled: isEnabled !== false,
      },
    })

    return NextResponse.json(appVersion, { status: 201 })
  } catch (error) {
    console.error('POST /api/admin/versions 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}

// PUT /api/admin/versions?id=xxx —— 更新版本信息
export async function PUT(request: NextRequest) {
  try {
    // 1. 鉴权
    const authResult = await checkAdmin()
    if (isUnauthorizedResponse(authResult)) {
      return authResult
    }

    // 2. 解析查询参数 id
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: '缺少 id 参数' },
        { status: 400 }
      )
    }

    const numericId = Number(id)
    if (Number.isNaN(numericId)) {
      return NextResponse.json(
        { error: 'id 参数不正确' },
        { status: 400 }
      )
    }

    // 3. 检查记录是否存在
    const existing = await prisma.appVersion.findUnique({
      where: { id: numericId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: '版本记录不存在' },
        { status: 404 }
      )
    }

    // 4. 解析 body
    const body = await request.json()
    const {
      versionCode,
      versionName,
      updateLog,
      downloadUrl,
      forceUpdate,
      isEnabled,
    } = body || {}

    // 如果修改了 versionCode，检查是否与其他版本冲突
    if (versionCode !== undefined && versionCode !== existing.versionCode) {
      const numericVersionCode = Number(versionCode)
      if (Number.isNaN(numericVersionCode)) {
        return NextResponse.json(
          { error: 'versionCode 参数不正确' },
          { status: 400 }
        )
      }

      const conflict = await prisma.appVersion.findUnique({
        where: { versionCode: numericVersionCode },
      })

      if (conflict) {
        return NextResponse.json(
          { error: `versionCode ${numericVersionCode} 已被其他版本使用` },
          { status: 409 }
        )
      }
    }

    // 5. 更新
    const updated = await prisma.appVersion.update({
      where: { id: numericId },
      data: {
        ...(versionCode !== undefined ? { versionCode: Number(versionCode) } : {}),
        ...(versionName !== undefined ? { versionName } : {}),
        ...(updateLog !== undefined ? { updateLog } : {}),
        ...(downloadUrl !== undefined ? { downloadUrl } : {}),
        ...(forceUpdate !== undefined ? { forceUpdate: !!forceUpdate } : {}),
        ...(isEnabled !== undefined ? { isEnabled } : {}),
      },
    })

    return NextResponse.json({
      message: '更新成功',
      data: updated,
    })
  } catch (error) {
    console.error('PUT /api/admin/versions 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/versions?id=xxx —— 删除版本
export async function DELETE(request: NextRequest) {
  try {
    // 1. 鉴权
    const authResult = await checkAdmin()
    if (isUnauthorizedResponse(authResult)) {
      return authResult
    }

    // 2. 解析查询参数 id
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: '缺少 id 参数' },
        { status: 400 }
      )
    }

    const numericId = Number(id)
    if (Number.isNaN(numericId)) {
      return NextResponse.json(
        { error: 'id 参数不正确' },
        { status: 400 }
      )
    }

    // 3. 检查记录是否存在
    const existing = await prisma.appVersion.findUnique({
      where: { id: numericId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: '版本记录不存在' },
        { status: 404 }
      )
    }

    // 4. 删除
    await prisma.appVersion.delete({
      where: { id: numericId },
    })

    return NextResponse.json({ message: '删除成功' })
  } catch (error) {
    console.error('DELETE /api/admin/versions 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}
