import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

// 模板列表
const TEMPLATES = [
  { id: 'standard', name: '标准模板', desc: '带标题栏、下拉刷新、广告、公告等完整功能' },
  { id: 'fullscreen', name: '全屏模板', desc: '无标题栏，全屏沉浸式，隐藏状态栏和导航栏' },
  { id: 'minimal', name: '极简模板', desc: '无标题栏但保留状态栏，仅 WebView + 进度条' },
  { id: 'immersive', name: '沉浸式模板', desc: '透明状态栏，内容延伸到状态栏下方' },
]

// 校验包名格式
function isValidPackageName(packageName: string): boolean {
  const segment = /^[a-z][a-z0-9]*$/
  const parts = packageName.split('.')
  if (parts.length < 2) return false
  return parts.every((p) => segment.test(p))
}

// 校验模板 ID
function isValidTemplate(template: string): boolean {
  return TEMPLATES.some((t) => t.id === template)
}

// 从数据库读取系统配置
async function getSystemConfig(): Promise<{
  githubToken: string
  githubRepo: string
  githubBranch: string
  webhookSecret: string
  vercelUrl: string
}> {
  const configs = await prisma.systemConfig.findMany()
  const configMap: Record<string, string> = {}
  for (const c of configs) {
    configMap[c.key] = c.value
  }

  return {
    githubToken: configMap['github_token'] || '',
    githubRepo: configMap['github_repo'] || '',
    githubBranch: configMap['github_branch'] || 'main',
    webhookSecret: configMap['build_webhook_secret'] || '',
    vercelUrl: configMap['vercel_url'] || '',
  }
}

// GET /api/build —— 获取模板列表 / 构建状态 / 构建历史
//   无参数            → 返回模板列表
//   ?id=xxx           → 查询某条构建记录
//   ?action=history   → 查询当前登录用户的构建历史
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const action = searchParams.get('action')

  // action=history → 查询当前用户的构建历史
  if (action === 'history') {
    try {
      const session = await getSession()
      if (!session.isLoggedIn || !session.userId) {
        return NextResponse.json(
          { error: '请先登录' },
          { status: 401 }
        )
      }

      const list = await prisma.buildRecord.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          appName: true,
          packageName: true,
          template: true,
          status: true,
          downloadUrl: true,
          createdAt: true,
        },
      })

      return NextResponse.json({ list })
    } catch (error) {
      console.error('GET /api/build?action=history 出错:', error)
      return NextResponse.json(
        { error: '服务器内部错误' },
        { status: 500 }
      )
    }
  }

  // 如果有 id 参数，查询构建状态
  if (id) {
    try {
      const buildId = Number(id)
      if (Number.isNaN(buildId)) {
        return NextResponse.json({ error: 'id 参数不正确' }, { status: 400 })
      }

      const buildRecord = await prisma.buildRecord.findUnique({
        where: { id: buildId },
        include: {
          user: { select: { id: true, username: true } },
        },
      })

      if (!buildRecord) {
        return NextResponse.json({ error: '构建记录不存在' }, { status: 404 })
      }

      return NextResponse.json(buildRecord)
    } catch (error) {
      console.error('GET /api/build 出错:', error)
      return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
    }
  }

  // 没有参数，返回模板列表
  return NextResponse.json({ templates: TEMPLATES })
}

// POST /api/build —— 用户提交构建请求（需登录）
export async function POST(request: NextRequest) {
  try {
    // 鉴权：必须登录才能生成
    const session = await getSession()
    if (!session.isLoggedIn) {
      return NextResponse.json(
        { error: '请先登录后再生成 APK' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { url, appName, packageName, template, userId } = body || {}

    // 1. 校验必填字段
    if (!url || !appName || !packageName) {
      return NextResponse.json(
        { error: '缺少必填字段：url、appName、packageName' },
        { status: 400 }
      )
    }

    if (typeof url !== 'string' || typeof appName !== 'string' || typeof packageName !== 'string') {
      return NextResponse.json(
        { error: '字段类型不正确' },
        { status: 400 }
      )
    }

    // 2. 校验 packageName 格式
    if (!isValidPackageName(packageName)) {
      return NextResponse.json(
        { error: '包名格式不正确，需至少两段，每段为小写字母数字（如 com.example.app）' },
        { status: 400 }
      )
    }

    // 3. 校验模板
    const resolvedTemplate = template || 'standard'
    if (!isValidTemplate(resolvedTemplate)) {
      return NextResponse.json(
        { error: '模板不存在，可选：standard、fullscreen、minimal、immersive' },
        { status: 400 }
      )
    }

    // 规范化 userId
    const resolvedUserId =
      userId === null || userId === undefined || userId === ''
        ? session.userId || null
        : Number(userId)

    if (resolvedUserId !== null && Number.isNaN(resolvedUserId)) {
      return NextResponse.json(
        { error: 'userId 参数不正确' },
        { status: 400 }
      )
    }

    // 4. 在数据库创建 BuildRecord，状态为 "building"
    const buildRecord = await prisma.buildRecord.create({
      data: {
        url,
        appName,
        packageName,
        template: resolvedTemplate,
        status: 'building',
        userId: resolvedUserId,
      },
    })

    // 5. 读取系统配置
    const { githubToken, githubRepo, githubBranch, webhookSecret, vercelUrl } = await getSystemConfig()

    // 检查配置是否齐全
    const missingConfigs: string[] = []
    if (!githubToken) missingConfigs.push('GitHub Token')
    if (!githubRepo) missingConfigs.push('GitHub 仓库地址')
    if (!vercelUrl) missingConfigs.push('本站部署地址')
    if (!webhookSecret) missingConfigs.push('Webhook 密钥')

    if (missingConfigs.length > 0) {
      await prisma.buildRecord.update({
        where: { id: buildRecord.id },
        data: {
          status: 'failed',
          buildLog: `系统配置不完整，缺少：${missingConfigs.join('、')}。请在后台系统设置中配置后重试。`,
        },
      })

      return NextResponse.json(
        {
          id: buildRecord.id,
          message: '构建已提交但配置不完整，已自动标记为失败',
          error: `系统配置不完整：${missingConfigs.join('、')}`,
        },
        { status: 201 }
      )
    }

    // 6. 触发 GitHub Actions（传入模板参数）
    let triggerError = ''
    try {
      const response = await fetch(`https://api.github.com/repos/${githubRepo}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          event_type: 'build_apk',
          client_payload: {
            build_id: String(buildRecord.id),
            url,
            app_name: appName,
            package_name: packageName,
            template: resolvedTemplate,
            webhook_secret: webhookSecret,
            vercel_url: vercelUrl,
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMsg = errorData?.message || `HTTP ${response.status}`
        triggerError = `GitHub API 返回错误：${errorMsg}`

        if (response.status === 401) {
          triggerError = 'GitHub Token 无效或已过期，请检查后台系统设置'
        } else if (response.status === 404) {
          triggerError = `GitHub 仓库 "${githubRepo}" 不存在或 Token 无访问权限`
        } else if (response.status === 422) {
          triggerError = `触发失败：仓库可能没有 .github/workflows/build-apk.yml 工作流文件，或分支名不正确`
        }
      }
    } catch (err) {
      triggerError = `网络错误：${err instanceof Error ? err.message : '未知错误'}`
    }

    if (triggerError) {
      await prisma.buildRecord.update({
        where: { id: buildRecord.id },
        data: {
          status: 'failed',
          buildLog: triggerError,
        },
      })

      return NextResponse.json(
        {
          id: buildRecord.id,
          message: '构建触发失败',
          error: triggerError,
        },
        { status: 201 }
      )
    }

    // 7. 返回 buildRecord 的 id
    return NextResponse.json(
      { id: buildRecord.id, message: '构建已提交，GitHub Actions 正在执行' },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/build 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}

// PUT /api/build —— GitHub Actions 回调更新构建状态
export async function PUT(request: NextRequest) {
  try {
    const { webhookSecret } = await getSystemConfig()
    const headerSecret = request.headers.get('x-webhook-secret')

    if (!webhookSecret) {
      return NextResponse.json(
        { error: '服务器未配置 Webhook Secret，请联系管理员' },
        { status: 500 }
      )
    }

    if (!headerSecret || headerSecret !== webhookSecret) {
      return NextResponse.json(
        { error: '未授权：webhook secret 不正确' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { buildId, status, downloadUrl, versionName, fileSize, buildLog } = body || {}

    if (buildId === undefined || buildId === null) {
      return NextResponse.json(
        { error: '缺少必填字段：buildId' },
        { status: 400 }
      )
    }

    const numericBuildId = Number(buildId)
    if (Number.isNaN(numericBuildId)) {
      return NextResponse.json(
        { error: 'buildId 参数不正确' },
        { status: 400 }
      )
    }

    const validStatuses = ['building', 'success', 'failed']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status 取值不正确，可选值：${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    const existing = await prisma.buildRecord.findUnique({
      where: { id: numericBuildId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: '构建记录不存在' },
        { status: 404 }
      )
    }

    const updated = await prisma.buildRecord.update({
      where: { id: numericBuildId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(downloadUrl !== undefined ? { downloadUrl } : {}),
        ...(versionName !== undefined ? { versionName } : {}),
        ...(fileSize !== undefined ? { fileSize: Number(fileSize) } : {}),
        ...(buildLog !== undefined ? { buildLog } : {}),
      },
    })

    return NextResponse.json({
      message: '更新成功',
      data: updated,
    })
  } catch (error) {
    console.error('PUT /api/build 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}
