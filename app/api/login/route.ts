import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

// POST /api/login —— 用户登录（支持自动注册）
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

    // 2. 校验密码长度
    if (password.length < 6) {
      return NextResponse.json(
        { error: '密码至少 6 位' },
        { status: 400 }
      )
    }

    // 3. 查找用户
    let user = await prisma.user.findUnique({
      where: { username },
    })

    // 4. 如果用户不存在，自动注册
    if (!user) {
      const hashedPassword = await bcrypt.hash(password, 10)
      user = await prisma.user.create({
        data: {
          username,
          password: hashedPassword,
          role: 'user',
        },
      })
    } else {
      // 5. 验证密码
      const isPasswordValid = await bcrypt.compare(password, user.password)
      if (!isPasswordValid) {
        return NextResponse.json(
          { error: '用户名或密码不正确' },
          { status: 401 }
        )
      }

      // 6. 检查是否是管理员（管理员应通过 /api/admin/login 登录）
      if (user.role === 'admin') {
        return NextResponse.json(
          { error: '管理员请从 /admin/login 登录' },
          { status: 403 }
        )
      }
    }

    // 7. 设置 session
    const session = await getSession()
    session.userId = user.id
    session.username = user.username
    session.role = 'user'
    session.isLoggedIn = true
    await session.save()

    // 8. 返回成功信息
    return NextResponse.json({
      message: user ? '登录成功' : '注册并登录成功',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('POST /api/login 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}

// GET /api/login —— 检查登录状态
export async function GET() {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) {
      return NextResponse.json({ isLoggedIn: false, user: null })
    }

    return NextResponse.json({
      isLoggedIn: true,
      user: {
        id: session.userId,
        username: session.username,
        role: session.role,
      },
    })
  } catch (error) {
    console.error('GET /api/login 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}

// DELETE /api/login —— 退出登录
export async function DELETE() {
  try {
    const session = await getSession()
    session.destroy()

    return NextResponse.json({ message: '退出登录成功' })
  } catch (error) {
    console.error('DELETE /api/login 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}