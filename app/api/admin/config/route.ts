import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, SessionData } from '@/lib/session'

// 鉴权中间件
async function checkAdmin(): Promise<SessionData | NextResponse> {
  const session = await getSession()
  if (!session.isLoggedIn || session.role !== 'admin') {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  return session
}

function isUnauthorizedResponse(
  result: SessionData | NextResponse
): result is NextResponse {
  return result instanceof NextResponse
}

// 用户可编辑的配置项（build_webhook_secret 由系统自动生成，不需要用户填写）
const EDITABLE_KEYS = [
  'github_token',
  'github_repo',
  'github_branch',
  'vercel_url',
] as const

// 所有配置项（含只读的）
const ALL_KEYS = [
  ...EDITABLE_KEYS,
  'build_webhook_secret',
] as const

// GET /api/admin/config —— 获取所有系统配置
export async function GET() {
  try {
    const authResult = await checkAdmin()
    if (isUnauthorizedResponse(authResult)) {
      return authResult
    }

    const configs = await prisma.systemConfig.findMany()

    // 转为 key-value 对象
    const result: Record<string, string> = {}
    for (const key of ALL_KEYS) {
      const config = configs.find((c) => c.key === key)
      result[key] = config?.value || ''
    }

    // github_token 做脱敏处理：只返回是否已设置和前后4位
    if (result.github_token) {
      const token = result.github_token
      if (token.length > 12) {
        result.github_token_masked = `${token.slice(0, 4)}****${token.slice(-4)}`
      } else {
        result.github_token_masked = '****'
      }
      result.github_token_set = 'true'
    } else {
      result.github_token_masked = ''
      result.github_token_set = 'false'
    }

    // build_webhook_secret 只返回是否已设置（系统自动生成）
    result.build_webhook_secret_set = result.build_webhook_secret ? 'true' : 'false'

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/admin/config 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}

// PUT /api/admin/config —— 批量更新系统配置
export async function PUT(request: NextRequest) {
  try {
    const authResult = await checkAdmin()
    if (isUnauthorizedResponse(authResult)) {
      return authResult
    }

    const body = await request.json()

    // 校验并过滤只允许的 key
    const updates: { key: string; value: string }[] = []

    for (const key of EDITABLE_KEYS) {
      if (body[key] !== undefined) {
        const value = String(body[key]).trim()
        updates.push({ key, value })
      }
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: '没有需要更新的配置项' },
        { status: 400 }
      )
    }

    // 批量 upsert
    for (const { key, value } of updates) {
      await prisma.systemConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    }

    return NextResponse.json({
      message: '配置保存成功',
      updatedCount: updates.length,
    })
  } catch (error) {
    console.error('PUT /api/admin/config 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}

// POST /api/admin/config —— 测试 GitHub 连接
export async function POST(request: NextRequest) {
  try {
    const authResult = await checkAdmin()
    if (isUnauthorizedResponse(authResult)) {
      return authResult
    }

    const body = await request.json().catch(() => ({}))
    const { action } = body || {}

    if (action !== 'test_connection') {
      return NextResponse.json(
        { error: '未知操作' },
        { status: 400 }
      )
    }

    // 读取当前配置
    const configs = await prisma.systemConfig.findMany()
    const configMap: Record<string, string> = {}
    for (const c of configs) {
      configMap[c.key] = c.value
    }

    const githubToken = configMap['github_token'] || ''
    const githubRepo = configMap['github_repo'] || ''
    const githubBranch = configMap['github_branch'] || 'main'
    const vercelUrl = configMap['vercel_url'] || ''
    const webhookSecret = configMap['build_webhook_secret'] || ''

    // 逐项检查
    const checks: { item: string; status: 'ok' | 'fail'; message: string }[] = []

    // 1. 检查 GitHub Token
    if (!githubToken) {
      checks.push({ item: 'GitHub Token', status: 'fail', message: '未配置' })
    } else {
      checks.push({ item: 'GitHub Token', status: 'ok', message: '已配置' })
    }

    // 2. 检查 GitHub 仓库地址
    if (!githubRepo) {
      checks.push({ item: 'GitHub 仓库地址', status: 'fail', message: '未配置' })
    } else {
      checks.push({ item: 'GitHub 仓库地址', status: 'ok', message: githubRepo })
    }

    // 3. 检查 Vercel 地址
    if (!vercelUrl) {
      checks.push({ item: '本站部署地址', status: 'fail', message: '未配置' })
    } else {
      checks.push({ item: '本站部署地址', status: 'ok', message: vercelUrl })
    }

    // 4. 检查 Webhook Secret
    if (!webhookSecret) {
      checks.push({ item: 'Webhook 密钥', status: 'fail', message: '未生成' })
    } else {
      checks.push({ item: 'Webhook 密钥', status: 'ok', message: '已自动生成' })
    }

    // 5. 如果 Token 和仓库地址都有，尝试验证 GitHub API 连接
    if (githubToken && githubRepo) {
      try {
        const response = await fetch(`https://api.github.com/repos/${githubRepo}`, {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        })

        if (response.ok) {
          const repoData = await response.json()
          checks.push({
            item: 'GitHub API 连接',
            status: 'ok',
            message: `连接成功，仓库：${repoData.full_name}`
          })

          // 6. 检查仓库是否有 workflow 文件
          const workflowResponse = await fetch(
            `https://api.github.com/repos/${githubRepo}/contents/.github/workflows/build-apk.yml?ref=${githubBranch}`,
            {
              headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: 'application/vnd.github.v3+json',
              },
            }
          )

          if (workflowResponse.ok) {
            checks.push({
              item: '打包工作流文件',
              status: 'ok',
              message: 'build-apk.yml 存在'
            })
          } else {
            checks.push({
              item: '打包工作流文件',
              status: 'fail',
              message: `.github/workflows/build-apk.yml 不存在于 ${githubBranch} 分支`
            })
          }
        } else if (response.status === 401) {
          checks.push({
            item: 'GitHub API 连接',
            status: 'fail',
            message: 'Token 无效或已过期'
          })
        } else if (response.status === 404) {
          checks.push({
            item: 'GitHub API 连接',
            status: 'fail',
            message: `仓库 "${githubRepo}" 不存在或 Token 无访问权限`
          })
        } else {
          checks.push({
            item: 'GitHub API 连接',
            status: 'fail',
            message: `HTTP ${response.status}`
          })
        }
      } catch (err) {
        checks.push({
          item: 'GitHub API 连接',
          status: 'fail',
          message: `网络错误：${err instanceof Error ? err.message : '未知错误'}`
        })
      }
    }

    const allOk = checks.every((c) => c.status === 'ok')

    return NextResponse.json({
      success: allOk,
      message: allOk ? '所有配置检查通过，可以正常打包' : '部分配置有问题，请按提示修复',
      checks,
    })
  } catch (error) {
    console.error('POST /api/admin/config 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}
