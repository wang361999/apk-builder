import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'

function createPrismaClient(): PrismaClient {
  // 生产环境（Turso）
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    const libsqlClient = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    const adapter = new PrismaLibSQL(libsqlClient)
    return new PrismaClient({ adapter })
  }

  // 本地开发（SQLite）
  return new PrismaClient()
}

const prisma = createPrismaClient()

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin'
  const password = process.env.ADMIN_PASSWORD || 'admin666'

  const hashedPassword = await bcrypt.hash(password, 10)

  // Upsert admin user —— 首次创建用默认密码，已存在则不覆盖（用户可能已在后台改过密码）
  const admin = await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      password: hashedPassword,
      role: 'admin',
    },
  })

  console.log(`Admin user ready: ${admin.username} (password: ${password})`)

  // Create default version if not exists
  const existingVersion = await prisma.appVersion.findFirst({
    where: { versionCode: 1 },
  })

  if (!existingVersion) {
    await prisma.appVersion.create({
      data: {
        versionCode: 1,
        versionName: 'v1.0.0',
        updateLog: '· 初始版本发布\n· 基础 WebView 功能',
        downloadUrl: '',
        forceUpdate: false,
        isEnabled: true,
      },
    })
    console.log('Default version v1.0.0 created')
  }
}

main()
  .then(() => {
    console.log('Seed completed successfully')
  })
  .catch((err) => {
    console.error('Seed failed (non-fatal):', err.message)
  })
  .finally(() => prisma.$disconnect())
