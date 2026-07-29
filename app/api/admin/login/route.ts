import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
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

// POST /api/admin/login —— 管理员登录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body || {}

    // 1. 校验必填字段
    if (!username || !password) {
      return NextResponse.json(
        { error: '缺少必填字段：username、password' },
        { status: 400 }
      )
    }

    // 2. 查找用户
    const user = await prisma.user.findUnique({
      where: { username },
    })

    if (!user) {
      return NextResponse.json(
        { error: '用户名或密码不正确' },
        { status: 401 }
      )
    }

    // 3. bcryptjs.compare 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: '用户名或密码不正确' },
        { status: 401 }
      )
    }

    // 4. 校验角色为 admin
    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: '无管理员权限' },
        { status: 403 }
      )
    }

    // 5. 设置 session（使用 iron-session）
    const session = await getSession()
    session.userId = user.id
    session.username = user.username
    session.role = 'admin'
    session.isLoggedIn = true
    await session.save()

    // 6. 返回成功信息
    return NextResponse.json({
      message: '登录成功',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('POST /api/admin/login 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}

// PUT /api/admin/login —— 修改管理员密码
export async function PUT(request: NextRequest) {
  try {
    // 1. 鉴权
    const authResult = await checkAdmin()
    if (isUnauthorizedResponse(authResult)) {
      return authResult
    }
    const session = authResult as SessionData

    const body = await request.json()
    const { oldPassword, newPassword } = body || {}

    // 2. 校验必填字段
    if (!oldPassword || !newPassword) {
      return NextResponse.json(
        { error: '请输入旧密码和新密码' },
        { status: 400 }
      )
    }

    // 3. 校验新密码长度
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: '新密码至少 6 位' },
        { status: 400 }
      )
    }

    // 4. 查找当前用户
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    })

    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      )
    }

    // 5. 验证旧密码
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password)
    if (!isOldPasswordValid) {
      return NextResponse.json(
        { error: '旧密码不正确' },
        { status: 400 }
      )
    }

    // 6. 新密码不能与旧密码相同
    if (oldPassword === newPassword) {
      return NextResponse.json(
        { error: '新密码不能与旧密码相同' },
        { status: 400 }
      )
    }

    // 7. 加密并更新密码
    const hashedNewPassword = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword },
    })

    return NextResponse.json({ message: '密码修改成功' })
  } catch (error) {
    console.error('PUT /api/admin/login 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}
