import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'

export interface SessionData {
  userId?: number
  username?: string
  role?: 'admin' | 'user'
  isLoggedIn: boolean
}

// 如果未配置 SESSION_SECRET，自动生成一个（仅用于开发环境兜底，生产环境请务必配置）
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret && secret.length >= 32) {
    return secret
  }
  // 开发环境兜底：生成临时密钥（重启后 session 失效，仅限开发用）
  if (process.env.NODE_ENV !== 'production') {
    return randomBytes(32).toString('hex')
  }
  // 生产环境必须配置
  throw new Error(
    'SESSION_SECRET 未配置或长度不足 32 位，请在 Vercel 环境变量中设置 SESSION_SECRET'
  )
}

// 惰性初始化：仅在首次调用 getSession() 时获取密钥，避免构建时执行
let _cachedPassword: string | null = null

function getPassword(): string {
  if (!_cachedPassword) {
    _cachedPassword = getSessionSecret()
  }
  return _cachedPassword
}

export function getSessionOptions() {
  return {
    password: getPassword(),
    cookieName: 'apk_builder_session' as const,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 7, // 7 天
      path: '/',
    },
  }
}

export async function getSession() {
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, getSessionOptions())
}
