import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 校验包名格式：至少两段，每段小写字母数字
function isValidPackageName(packageName: string): boolean {
  const segment = /^[a-z][a-z0-9]*$/
  const parts = packageName.split('.')
  if (parts.length < 2) return false
  return parts.every((p) => segment.test(p))
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

// POST /api/build —— 用户提交构建请求
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, appName, packageName, userId } = body || {}

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

    // 规范化 userId
    const resolvedUserId =
      userId === null || userId === undefined || userId === ''
        ? null
        : Number(userId)

    if (resolvedUserId !== null && Number.isNaN(resolvedUserId)) {
      return NextResponse.json(
        { error: 'userId 参数不正确' },
        { status: 400 }
      )
    }

    // 3. 在数据库创建 BuildRecord，状态为 "building"
    const buildRecord = await prisma.buildRecord.create({
      data: {
        url,
        appName,
        packageName,
        status: 'building',
        userId: resolvedUserId,
      },
    })

    // 4. 读取系统配置
    const { githubToken, githubRepo, githubBranch, webhookSecret, vercelUrl } = await getSystemConfig()

    // 检查配置是否齐全
    const missingConfigs: string[] = []
    if (!githubToken) missingConfigs.push('GitHub Token')
    if (!githubRepo) missingConfigs.push('GitHub 仓库地址')
    if (!vercelUrl) missingConfigs.push('本站部署地址')
    if (!webhookSecret) missingConfigs.push('Webhook 密钥')

    if (missingConfigs.length > 0) {
      // 配置不完整，直接标记为失败
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

    // 5. 触发 GitHub Actions
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
      // 触发失败，标记构建为失败
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

    // 6. 返回 buildRecord 的 id
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

// GET /api/build?id=xxx —— 查询构建状态
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: '缺少 id 参数' },
        { status: 400 }
      )
    }

    const buildId = Number(id)
    if (Number.isNaN(buildId)) {
      return NextResponse.json(
        { error: 'id 参数不正确' },
        { status: 400 }
      )
    }

    // 查询 BuildRecord
    const buildRecord = await prisma.buildRecord.findUnique({
      where: { id: buildId },
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
    })

    if (!buildRecord) {
      return NextResponse.json(
        { error: '构建记录不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json(buildRecord)
  } catch (error) {
    console.error('GET /api/build 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}

// PUT /api/build —— GitHub Actions 回调更新构建状态
export async function PUT(request: NextRequest) {
  try {
    // 1. API Key 验证（从数据库读取 webhook secret，对比 header x-webhook-secret）
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

    // 2. 校验 buildId 存在
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

    // 校验 status 值
    const validStatuses = ['building', 'success', 'failed']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status 取值不正确，可选值：${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    // 检查记录是否存在
    const existing = await prisma.buildRecord.findUnique({
      where: { id: numericBuildId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: '构建记录不存在' },
        { status: 404 }
      )
    }

    // 3. 更新 BuildRecord
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
