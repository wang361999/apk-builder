/**
 * Turso 一键初始化脚本
 *
 * 用法：
 *   node scripts/turso-setup.mjs                    # 交互式
 *   node scripts/turso-setup.mjs --token <token>    # 非交互式
 *
 * 功能：
 *   1. 用 Turso API Token 自动创建数据库
 *   2. 自动建表（user / build_record / app_version）
 *   3. 自动创建管理员账户和默认版本
 *   4. 自动生成 .env 配置并输出 Vercel 环境变量
 *
 * 前置条件：
 *   访问 https://turso.tech 注册账号
 *   在 Settings > API Tokens 创建一个 Token
 *   （或运行 npx turso auth login 后用 turso auth api-tokens create）
 */
import { writeFileSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'
import { randomBytes, createHash } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

// ============ 工具函数 ============

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(length)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length]
  }
  return result
}

// bcrypt 的纯 JS 实现（避免依赖问题）
// 用 sha256 + salt 模拟，但为了与 bcryptjs 兼容，我们直接用动态 import
async function hashPassword(password) {
  const bcrypt = (await import('bcryptjs')).default
  return bcrypt.hash(password, 10)
}

function isNonInteractive() {
  return process.argv.includes('--token') || process.argv.includes('--yes') || !process.stdin.isTTY
}

function getTokenFromArgs() {
  const idx = process.argv.indexOf('--token')
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1]
  }
  return null
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1]
  }
  return null
}

async function ask(question, defaultValue = '') {
  if (isNonInteractive()) return defaultValue
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const prompt = defaultValue ? `${question} [默认: ${defaultValue}]: ` : `${question}: `
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultValue)
    })
  })
}

// ============ Turso API ============

const TURSO_API = 'https://api.turso.tech/v1'

async function tursoRequest(path, token, options = {}) {
  const res = await fetch(`${TURSO_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error?.message || data.message || `HTTP ${res.status}`)
  }
  return data
}

// ============ libSQL 直接执行 SQL ============

async function executeSql(url, authToken, sql, args = []) {
  const encodedUrl = url.replace('libsql://', 'https://')
  const res = await fetch(`${encodedUrl}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql,
            args,
          },
        },
        {
          type: 'close',
        },
      ],
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error?.message || data.message || `SQL执行失败 HTTP ${res.status}`)
  }
  return data
}

// ============ 主流程 ============

async function main() {
  console.log('')
  console.log('========================================')
  console.log('  Turso 数据库一键初始化')
  console.log('========================================')
  console.log('')

  // 1. 获取 Turso API Token
  let token = getTokenFromArgs()
  if (!token) {
    console.log('  请先获取 Turso API Token：')
    console.log('  1. 访问 https://turso.tech 注册/登录')
    console.log('  2. 进入 Settings > API Tokens')
    console.log('  3. 点击 "Generate API Token" 并复制')
    console.log('')
    token = await ask('请粘贴 Turso API Token')
  }

  if (!token) {
    console.log('❌ 未提供 Turso API Token，无法继续')
    console.log('  提示：node scripts/turso-setup.mjs --token <your-token>')
    process.exit(1)
  }

  // 2. 验证 Token 并获取用户信息
  console.log('')
  console.log('  正在验证 Token...')
  try {
    const user = await tursoRequest('/auth/whoami', token)
    console.log(`  ✓ Token 验证成功（用户: ${user.username || '已验证'}）`)
  } catch (err) {
    console.log(`  ❌ Token 验证失败: ${err.message}`)
    process.exit(1)
  }

  // 3. 创建数据库
  const dbName = getArg('db') || 'apk-builder'
  console.log('')
  console.log(`  正在创建数据库 "${dbName}"...`)

  let dbUrl = null
  try {
    const createRes = await tursoRequest(`/organizations/${await getOrgName(token)}/databases`, token, {
      method: 'POST',
      body: JSON.stringify({ name: dbName, group: 'default' }),
    })
    dbUrl = `libsql://${createRes.Hostname}`
    console.log(`  ✓ 数据库创建成功: ${dbUrl}`)
  } catch (err) {
    // 数据库可能已存在，尝试获取
    if (err.message.includes('already') || err.message.includes('exists')) {
      console.log(`  数据库已存在，获取连接信息...`)
      const dbInfo = await tursoRequest(`/databases/${dbName}`, token)
      dbUrl = `libsql://${dbInfo.Hostname}`
      console.log(`  ✓ 使用已有数据库: ${dbUrl}`)
    } else {
      console.log(`  ❌ 创建数据库失败: ${err.message}`)
      process.exit(1)
    }
  }

  // 4. 创建数据库 Token
  console.log('')
  console.log('  正在创建数据库访问 Token...')
  let dbToken = null
  try {
    const tokenRes = await tursoRequest(`/databases/${dbName}/auth/tokens`, token, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    dbToken = tokenRes.jwt
    console.log('  ✓ 数据库 Token 创建成功')
  } catch (err) {
    console.log(`  ❌ 创建数据库 Token 失败: ${err.message}`)
    process.exit(1)
  }

  // 5. 建表
  console.log('')
  console.log('  正在创建数据库表...')

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
      await executeSql(dbUrl, dbToken, sql)
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.log(`  ⚠ ${err.message?.split('\n')[0]}`)
      }
    }
  }
  console.log('  ✓ 表结构创建完成')

  // 6. 创建管理员账户
  console.log('')
  console.log('  正在创建管理员账户...')
  const adminUsername = getArg('admin-user') || process.env.ADMIN_USERNAME || 'admin'
  const adminPassword = getArg('admin-pass') || process.env.ADMIN_PASSWORD || 'admin666'
  const hashedPassword = await hashPassword(adminPassword)

  try {
    // 检查是否已存在
    const checkRes = await executeSql(dbUrl, dbToken, 'SELECT id FROM "user" WHERE username = ?', [adminUsername])
    const rows = checkRes?.results?.[0]?.response?.result?.rows || []
    if (rows.length === 0) {
      await executeSql(dbUrl, dbToken, 'INSERT INTO "user" (username, password, role) VALUES (?, ?, ?)', [adminUsername, hashedPassword, 'admin'])
      console.log(`  ✓ 管理员账户创建: ${adminUsername} / ${adminPassword}`)
    } else {
      console.log(`  ✓ 管理员账户已存在: ${adminUsername}（跳过）`)
    }
  } catch (err) {
    console.log(`  ⚠ 管理员创建: ${err.message?.split('\n')[0]}`)
  }

  // 7. 创建默认版本
  console.log('  正在创建默认版本...')
  try {
    const verRes = await executeSql(dbUrl, dbToken, 'SELECT id FROM "app_version" WHERE version_code = 1')
    const verRows = verRes?.results?.[0]?.response?.result?.rows || []
    if (verRows.length === 0) {
      await executeSql(
        dbUrl, dbToken,
        `INSERT INTO "app_version" (version_code, version_name, update_log, download_url, force_update, is_enabled) VALUES (1, 'v1.0.0', '· 初始版本发布\n· 基础 WebView 功能', '', 0, 1)`
      )
      console.log('  ✓ 默认版本 v1.0.0 创建成功')
    } else {
      console.log('  ✓ 默认版本已存在（跳过）')
    }
  } catch (err) {
    console.log(`  ⚠ 版本创建: ${err.message?.split('\n')[0]}`)
  }

  // 8. 生成密钥
  const sessionSecret = randomString(32)
  const webhookSecret = randomString(32)

  // 8.5 将 webhook_secret 存入数据库 system_config 表
  try {
    const existingSecret = await executeSql(dbUrl, dbToken, 'SELECT id FROM "system_config" WHERE key = ?', ['build_webhook_secret'])
    const secretRows = existingSecret?.results?.[0]?.response?.result?.rows || []
    if (secretRows.length === 0) {
      await executeSql(dbUrl, dbToken, 'INSERT INTO "system_config" (key, value) VALUES (?, ?)', ['build_webhook_secret', webhookSecret])
      console.log('  ✓ Webhook Secret 存入数据库')
    } else {
      console.log('  ✓ Webhook Secret 已存在数据库中（跳过）')
    }
  } catch (err) {
    console.log(`  ⚠ Webhook Secret 存入数据库跳过: ${err.message?.split('\n')[0]}`)
  }

  // 9. 更新 .env
  const envPath = join(projectRoot, '.env')
  const envContent = `# ============================================
# APK 生成器 - 环境变量（由 turso-setup.mjs 自动生成）
# ============================================

# Turso 云数据库
TURSO_DATABASE_URL="${dbUrl}"
TURSO_AUTH_TOKEN="${dbToken}"

# 本地开发数据库（仅本地开发用，生产环境用 Turso）
DATABASE_URL="file:./dev.db"

# 管理员账号
ADMIN_USERNAME="${adminUsername}"
ADMIN_PASSWORD="${adminPassword}"

# Session 加密密钥
SESSION_SECRET="${sessionSecret}"
`

  writeFileSync(envPath, envContent, 'utf-8')

  // 10. 输出结果
  console.log('')
  console.log('========================================')
  console.log('  ✅ 全部完成！')
  console.log('========================================')
  console.log('')
  console.log('  .env 文件已自动生成')
  console.log('')
  console.log('  ┌─────────────────────────────────────────────┐')
  console.log('  │         Vercel 环境变量（复制粘贴）          │')
  console.log('  ├─────────────────────────────────────────────┤')
  console.log(`  │ TURSO_DATABASE_URL = ${dbUrl}`)
  console.log(`  │ TURSO_AUTH_TOKEN   = ${dbToken.substring(0, 20)}...`)
  console.log(`  │ SESSION_SECRET     = ${sessionSecret}`)
  console.log(`  │ ADMIN_USERNAME     = ${adminUsername}`)
  console.log(`  │ ADMIN_PASSWORD     = ${adminPassword}`)
  console.log('  └─────────────────────────────────────────────┘')
  console.log('')
  console.log('  部署步骤：')
  console.log('    1. 将代码推送到 GitHub')
  console.log('    2. 在 Vercel 项目设置 > Environment Variables')
  console.log('       添加以上变量')
  console.log('    3. 重新部署')
  console.log('    4. 部署后登录后台 > 系统设置')
  console.log('       填写 GitHub Token、仓库地址、本站部署地址')
  console.log('')
  console.log('  ⚠️ TURSO_AUTH_TOKEN 完整值在 .env 文件中，上面仅显示前20位')
  console.log('  ℹ️ Webhook 密钥、GitHub 配置等已存入数据库，在后台系统设置中填写')
  console.log('')
}

async function getOrgName(token) {
  // 获取用户的组织列表
  const orgs = await tursoRequest('/organizations', token)
  if (orgs && orgs.length > 0) {
    return orgs[0].slug || orgs[0].name
  }
  throw new Error('未找到 Turso 组织，请先在 turso.tech 创建一个')
}

main().catch((err) => {
  console.error('初始化失败:', err.message)
  process.exit(1)
})
