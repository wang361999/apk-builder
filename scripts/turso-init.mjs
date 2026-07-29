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

async function execute(sql, args = []) {
  try {
    return await db.execute({ sql, args })
  } catch (err) {
    if (!err.message?.includes('already exists')) {
      console.log(`[turso-init] SQL 执行跳过: ${err.message?.split('\n')[0] || ''}`)
    }
    return null
  }
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
    // 广告配置表
    `CREATE TABLE IF NOT EXISTS "ad_config" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL UNIQUE,
      enabled BOOLEAN NOT NULL DEFAULT 0,
      image_url TEXT NOT NULL DEFAULT '',
      link_url TEXT NOT NULL DEFAULT '',
      duration INTEGER NOT NULL DEFAULT 3,
      show_times_per_day INTEGER NOT NULL DEFAULT 1,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    // 功能开关表
    `CREATE TABLE IF NOT EXISTS "feature_flag" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT 'true',
      description TEXT NOT NULL DEFAULT '',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    // 样式配置表
    `CREATE TABLE IF NOT EXISTS "style_config" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT '',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    // 公告表
    `CREATE TABLE IF NOT EXISTS "announcement" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enabled BOOLEAN NOT NULL DEFAULT 0,
      text TEXT NOT NULL DEFAULT '',
      link_url TEXT NOT NULL DEFAULT '',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ]

  for (const sql of tables) {
    try {
      await db.execute(sql)
    } catch (err) {
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

  // 4. 自动生成 Webhook Secret
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

  // 5. 初始化广告配置（3 种类型，默认关闭）
  const adTypes = [
    { type: 'splash', desc: '启动页广告' },
    { type: 'popup', desc: '弹窗广告' },
    { type: 'banner', desc: '底部横幅广告' },
  ]
  for (const ad of adTypes) {
    try {
      const existing = await db.execute({
        sql: 'SELECT id FROM "ad_config" WHERE type = ?',
        args: [ad.type],
      })
      if (existing.rows.length === 0) {
        await db.execute({
          sql: 'INSERT INTO "ad_config" (type, enabled, image_url, link_url, duration, show_times_per_day) VALUES (?, 0, ?, ?, 3, 1)',
          args: [ad.type, '', ''],
        })
        console.log(`[turso-init] 广告配置 ${ad.desc} 创建 ✓`)
      }
    } catch (err) {
      console.log(`[turso-init] 广告 ${ad.type} 跳过: ${err.message?.split('\n')[0] || ''}`)
    }
  }

  // 6. 初始化功能开关
  const features = [
    { key: 'enablePullToRefresh', value: 'true', desc: '下拉刷新' },
    { key: 'enableShare', value: 'true', desc: '分享功能' },
    { key: 'enableDarkMode', value: 'false', desc: '深色模式' },
    { key: 'enableFileDownload', value: 'true', desc: '文件下载' },
    { key: 'enableExitConfirm', value: 'false', desc: '返回键退出确认' },
  ]
  for (const f of features) {
    try {
      const existing = await db.execute({
        sql: 'SELECT id FROM "feature_flag" WHERE key = ?',
        args: [f.key],
      })
      if (existing.rows.length === 0) {
        await db.execute({
          sql: 'INSERT INTO "feature_flag" (key, value, description) VALUES (?, ?, ?)',
          args: [f.key, f.value, f.desc],
        })
        console.log(`[turso-init] 功能开关 ${f.key} 创建 ✓`)
      }
    } catch (err) {
      console.log(`[turso-init] 功能开关 ${f.key} 跳过: ${err.message?.split('\n')[0] || ''}`)
    }
  }

  // 7. 初始化样式配置
  const styles = [
    { key: 'themeColor', value: '#3B82F6' },
    { key: 'statusBarColor', value: '#1A1A2E' },
    { key: 'appName', value: '我的应用' },
    { key: 'loadingText', value: '加载中...' },
  ]
  for (const s of styles) {
    try {
      const existing = await db.execute({
        sql: 'SELECT id FROM "style_config" WHERE key = ?',
        args: [s.key],
      })
      if (existing.rows.length === 0) {
        await db.execute({
          sql: 'INSERT INTO "style_config" (key, value) VALUES (?, ?)',
          args: [s.key, s.value],
        })
        console.log(`[turso-init] 样式配置 ${s.key} 创建 ✓`)
      }
    } catch (err) {
      console.log(`[turso-init] 样式 ${s.key} 跳过: ${err.message?.split('\n')[0] || ''}`)
    }
  }

  // 8. 初始化公告
  try {
    const existing = await db.execute({
      sql: 'SELECT id FROM "announcement" LIMIT 1',
      args: [],
    })
    if (existing.rows.length === 0) {
      await db.execute({
        sql: 'INSERT INTO "announcement" (enabled, text, link_url) VALUES (0, ?, ?)',
        args: ['欢迎使用本应用', ''],
      })
      console.log('[turso-init] 默认公告创建 ✓')
    }
  } catch (err) {
    console.log(`[turso-init] 公告创建跳过: ${err.message?.split('\n')[0] || ''}`)
  }

  console.log('[turso-init] 初始化完成')
}

init()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[turso-init] 初始化失败（非致命）:', err.message)
    process.exit(0) // 非致命，不阻断构建
  })
