import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // 生产环境（Vercel）：使用 Turso 云数据库（数据持久化）
  // Turso 环境变量需要在 Vercel 后台 Settings → Environment Variables 中配置
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  if (tursoUrl && tursoToken) {
    const libsqlClient = createClient({
      url: tursoUrl,
      authToken: tursoToken,
    })
    const adapter = new PrismaLibSQL(libsqlClient)
    console.log('[prisma] 使用 Turso 云数据库（数据持久化）')
    return new PrismaClient({ adapter })
  }

  // 本地开发：使用 SQLite 文件
  // 注意：SQLite 文件在 Vercel 上是临时的，每次部署后数据会丢失
  if (process.env.NODE_ENV === 'production') {
    console.warn('[prisma] 警告：生产环境未配置 Turso 数据库！')
    console.warn('[prisma] 请在 Vercel 后台配置 TURSO_DATABASE_URL 和 TURSO_AUTH_TOKEN 环境变量')
    console.warn('[prisma] 当前使用临时 SQLite，数据不会持久化！')
  } else {
    console.log('[prisma] 使用本地 SQLite 文件（开发环境）')
  }
  return new PrismaClient()
}

// 始终缓存 Prisma 客户端（包括生产环境），避免每次请求都新建连接
// 在 serverless 环境中，全局缓存可复用同一个数据库连接
export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// 生产环境也缓存，避免 Vercel serverless 函数重复创建连接
globalForPrisma.prisma = prisma
