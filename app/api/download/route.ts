import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/download?id=xxx —— 重定向到 APK 下载链接
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

    const buildRecord = await prisma.buildRecord.findUnique({
      where: { id: buildId },
    })

    if (!buildRecord) {
      return NextResponse.json(
        { error: '构建记录不存在' },
        { status: 404 }
      )
    }

    if (buildRecord.status !== 'success' || !buildRecord.downloadUrl) {
      return NextResponse.json(
        { error: 'APK 尚未构建完成或下载链接不存在' },
        { status: 404 }
      )
    }

    // 如果 downloadUrl 已经是 GitHub Release 的直接下载链接，直接重定向
    if (buildRecord.downloadUrl.includes('github.com') && buildRecord.downloadUrl.includes('/releases/download/')) {
      return NextResponse.redirect(buildRecord.downloadUrl, 302)
    }

    // 兼容旧数据：如果 downloadUrl 指向本站 /download，说明是旧格式，无法重定向
    if (buildRecord.downloadUrl.includes('/download?id=')) {
      // 返回错误提示
      return NextResponse.json(
        { error: '下载链接格式异常，请联系管理员检查 GitHub Release' },
        { status: 500 }
      )
    }

    // 其他情况直接重定向
    return NextResponse.redirect(buildRecord.downloadUrl, 302)
  } catch (error) {
    console.error('GET /api/download 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}
