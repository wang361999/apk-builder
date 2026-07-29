import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // 生产环境（Vercel）：使用 Turso 云数据库
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    const libsqlClient = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    const adapter = new PrismaLibSQL(libsqlClient)
    return new PrismaClient({ adapter })
  }

  // 本地开发：使用 SQLite 文件
  return new PrismaClient()
}

// 始终缓存 Prisma 客户端（包括生产环境），避免每次请求都新建连接
export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
} else {
  // 生产环境也缓存，避免 Vercel serverless 函数重复创建连接
  globalForPrisma.prisma = prisma
}
