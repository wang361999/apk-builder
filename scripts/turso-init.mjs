/**
 * Turso 数据库初始化脚本
 *
 * 在 Vercel 构建后执行，直接用 libSQL 客户端创建表结构和种子数据
 * 不依赖 prisma db push（因为 Turso 不兼容 prisma migrate）
 *
 * 环境变量要求：
 *   TURSO_DATABASE_URL - Turso 数据库地址
 *   TURSO_AUTH_TOKEN   - Turso 认证令牌
 *   ADMIN_USERNAME     - 管理员用户名（默认 admin）
 *   ADMIN_PASSWORD     - 管理员密码（默认 admin666）
 */
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

if (!url || !token) {
  console.log('[turso-init] 未配置 Turso 环境变量，跳过')
  process.exit(0)
}

const db = createClient({ url, authToken: token })

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(length)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length]
  }
  return result
}

async function init() {
  console.log('[turso-init] 开始初始化 Turso 数据库...')

  // 1. 创建表
  const tables = [
    `CREATE TABLE IF NOT EXISTS "user" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "build_record" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      app_name TEXT NOT NULL,
      package_name TEXT NOT NULL,
      download_url TEXT,
      status TEXT NOT NULL DEFAULT 'building',
      build_log TEXT,
      version_name TEXT,
      file_size INTEGER,
      user_id INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES "user"(id)
    )`,
    `CREATE INDEX IF NOT EXISTS "build_record_user_id_idx" ON "build_record"(user_id)`,
    `CREATE INDEX IF NOT EXISTS "build_record_status_idx" ON "build_record"(status)`,
    `CREATE INDEX IF NOT EXISTS "build_record_created_at_idx" ON "build_record"(created_at)`,
    `CREATE TABLE IF NOT EXISTS "app_version" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_code INTEGER NOT NULL UNIQUE,
      version_name TEXT NOT NULL,
      update_log TEXT NOT NULL,
      download_url TEXT NOT NULL,
      force_update BOOLEAN NOT NULL DEFAULT 0,
      is_enabled BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "app_version_version_code_idx" ON "app_version"(version_code)`,
    `CREATE TABLE IF NOT EXISTS "system_config" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ]

  for (const sql of tables) {
    try {
      await db.execute(sql)
    } catch (err) {
      // 表/索引已存在不算错误
      if (!err.message?.includes('already exists')) {
        console.log(`[turso-init] SQL 执行跳过: ${err.message?.split('\n')[0] || ''}`)
      }
    }
  }
  console.log('[turso-init] 表结构创建完成 ✓')

  // 2. 创建管理员账户
  const username = process.env.ADMIN_USERNAME || 'admin'
  const password = process.env.ADMIN_PASSWORD || 'admin666'
  const hashedPassword = await bcrypt.hash(password, 10)

  try {
    const existing = await db.execute({
      sql: 'SELECT id FROM "user" WHERE username = ?',
      args: [username],
    })

    if (existing.rows.length === 0) {
      await db.execute({
        sql: 'INSERT INTO "user" (username, password, role) VALUES (?, ?, ?)',
        args: [username, hashedPassword, 'admin'],
      })
      console.log(`[turso-init] 管理员账户创建: ${username} ✓`)
    } else {
      console.log(`[turso-init] 管理员账户已存在: ${username}（跳过）`)
    }
  } catch (err) {
    console.log(`[turso-init] 管理员创建跳过: ${err.message?.split('\n')[0] || ''}`)
  }

  // 3. 创建默认版本
  try {
    const existingVersion = await db.execute({
      sql: 'SELECT id FROM "app_version" WHERE version_code = 1',
      args: [],
    })

    if (existingVersion.rows.length === 0) {
      await db.execute({
        sql: `INSERT INTO "app_version" (version_code, version_name, update_log, download_url, force_update, is_enabled)
              VALUES (1, 'v1.0.0', '· 初始版本发布\n· 基础 WebView 功能', '', 0, 1)`,
        args: [],
      })
      console.log('[turso-init] 默认版本 v1.0.0 创建 ✓')
    } else {
      console.log('[turso-init] 默认版本已存在（跳过）')
    }
  } catch (err) {
    console.log(`[turso-init] 版本创建跳过: ${err.message?.split('\n')[0] || ''}`)
  }

  // 4. 自动生成 Webhook Secret（如果不存在）
  try {
    const existingSecret = await db.execute({
      sql: 'SELECT id FROM "system_config" WHERE key = ?',
      args: ['build_webhook_secret'],
    })

    if (existingSecret.rows.length === 0) {
      const webhookSecret = randomString(32)
      await db.execute({
        sql: 'INSERT INTO "system_config" (key, value) VALUES (?, ?)',
        args: ['build_webhook_secret', webhookSecret],
      })
      console.log('[turso-init] Webhook Secret 自动生成 ✓')
    } else {
      console.log('[turso-init] Webhook Secret 已存在（跳过）')
    }
  } catch (err) {
    console.log(`[turso-init] Webhook Secret 创建跳过: ${err.message?.split('\n')[0] || ''}`)
  }

  console.log('[turso-init] 初始化完成')
}

init()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[turso-init] 初始化失败（非致命）:', err.message)
    process.exit(0) // 非致命，不阻断构建
  })
