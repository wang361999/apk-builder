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

    // 302 重定向到实际下载链接
    return NextResponse.redirect(buildRecord.downloadUrl, 302)
  } catch (error) {
    console.error('GET /api/download 出错:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}
