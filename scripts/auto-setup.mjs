/**
 * Turso + Vercel 一键全自动配置脚本
 *
 * 用法：
 *   node scripts/auto-setup.mjs                          # 交互式
 *   node scripts/auto-setup.mjs --turso-token <token>    # 指定 Turso Token
 *   node scripts/auto-setup.mjs --turso-token <token> --vercel  # 同时自动写入 Vercel
 *
 * 功能：
 *   1. 自动创建 Turso 数据库（已存在则跳过）
 *   2. 自动建表 + 种子数据（已存在则跳过）
 *   3. 自动生成 .env 文件
 *   4. 自动检测并写入 Vercel 环境变量（需要已安装 vercel CLI 并登录）
 *   5. 全程不覆盖已有数据
 */
import { writeFileSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'
import { randomBytes } from 'crypto'
import { execSync } from 'child_process'

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

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1]
  }
  return null
}

function isNonInteractive() {
  return process.argv.includes('--yes') || !process.stdin.isTTY
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

// 检查 vercel CLI 是否可用
function checkVercelCLI() {
  try {
    execSync('vercel --version', { stdio: 'pipe', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

// 用 vercel CLI 添加环境变量（如果不存在）
function addVercelEnv(key, value, targets = ['production', 'preview', 'development']) {
  for (const target of targets) {
    try {
      // 先检查是否已存在
      const existing = execSync(`vercel env ls ${target} 2>/dev/null`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 10000,
      })
      if (existing.includes(key)) {
        console.log(`  ✓ ${key} 已存在于 Vercel (${target})，跳过`)
        continue
      }
    } catch {
      // 忽略检查错误，继续尝试添加
    }

    try {
      // 用 echo 管道方式写入值，避免交互式输入
      execSync(`echo "${value}" | vercel env add ${key} ${target} 2>/dev/null`, {
        stdio: 'pipe',
        timeout: 15000,
      })
      console.log(`  ✓ ${key} 已写入 Vercel (${target})`)
    } catch (err) {
      console.log(`  ⚠ ${key} 写入 Vercel (${target}) 失败: ${err.message?.split('\n')[0]}`)
    }
  }
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

async function getOrgName(token) {
  const orgs = await tursoRequest('/organizations', token)
  if (orgs && orgs.length > 0) {
    return orgs[0].slug || orgs[0].name
  }
  throw new Error('未找到 Turso 组织，请先在 turso.tech 创建一个')
}

// ============ libSQL 执行 SQL ============

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
        { type: 'execute', stmt: { sql, args } },
        { type: 'close' },
      ],
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error?.message || data.message || `SQL执行失败 HTTP ${res.status}`)
  }
  return data
}

// 检查记录是否存在（返回行数）
async function countRows(url, authToken, sql, args = []) {
  const result = await executeSql(url, authToken, sql, args)
  const rows = result?.results?.[0]?.response?.result?.rows || []
  return rows.length
}

// ============ 主流程 ============

async function main() {
  console.log('')
  console.log('========================================')
  console.log('  Turso + Vercel 一键全自动配置')
  console.log('========================================')
  console.log('')

  // ---------- 1. 获取 Turso API Token ----------
  let tursoToken = getArg('turso-token')
  if (!tursoToken) {
    console.log('  需要 Turso API Token 来创建数据库')
    console.log('  获取方式：https://turso.tech → Settings → API Tokens')
    console.log('')
    tursoToken = await ask('请粘贴 Turso API Token')
  }
  if (!tursoToken) {
    console.log('❌ 未提供 Turso API Token，无法继续')
    process.exit(1)
  }

  // ---------- 2. 验证 Token ----------
  console.log('  正在验证 Turso Token...')
  try {
    const user = await tursoRequest('/auth/whoami', tursoToken)
    console.log(`  ✓ Token 验证成功（用户: ${user.username || '已验证'}）`)
  } catch (err) {
    console.log(`  ❌ Token 验证失败: ${err.message}`)
    process.exit(1)
  }

  // ---------- 3. 创建数据库 ----------
  const dbName = getArg('db') || 'apk-builder'
  console.log(`  正在创建/获取数据库 "${dbName}"...`)

  let dbUrl = null
  const orgName = await getOrgName(tursoToken)

  try {
    const createRes = await tursoRequest(`/organizations/${orgName}/databases`, tursoToken, {
      method: 'POST',
      body: JSON.stringify({ name: dbName, group: 'default' }),
    })
    dbUrl = `libsql://${createRes.Hostname}`
    console.log(`  ✓ 数据库创建成功: ${dbUrl}`)
  } catch (err) {
    if (err.message.includes('already') || err.message.includes('exists')) {
      const dbInfo = await tursoRequest(`/databases/${dbName}`, tursoToken)
      dbUrl = `libsql://${dbInfo.Hostname}`
      console.log(`  ✓ 使用已有数据库: ${dbUrl}`)
    } else {
      console.log(`  ❌ 创建数据库失败: ${err.message}`)
      process.exit(1)
    }
  }

  // ---------- 4. 创建数据库访问 Token ----------
  console.log('  正在创建数据库访问 Token...')
  let dbToken = null
  try {
    const tokenRes = await tursoRequest(`/databases/${dbName}/auth/tokens`, tursoToken, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    dbToken = tokenRes.jwt
    console.log('  ✓ 数据库 Token 创建成功')
  } catch (err) {
    console.log(`  ❌ 创建数据库 Token 失败: ${err.message}`)
    process.exit(1)
  }

  // ---------- 5. 建表（已存在则跳过） ----------
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
    `CREATE TABLE IF NOT EXISTS "feature_flag" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT 'true',
      description TEXT NOT NULL DEFAULT '',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "style_config" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT '',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
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
      await executeSql(dbUrl, dbToken, sql)
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.log(`  ⚠ ${err.message?.split('\n')[0]}`)
      }
    }
  }
  console.log('  ✓ 表结构就绪')

  // ---------- 6. 种子数据（已存在则跳过） ----------
  console.log('  正在初始化种子数据...')

  const adminUsername = getArg('admin-user') || process.env.ADMIN_USERNAME || 'admin'
  const adminPassword = getArg('admin-pass') || process.env.ADMIN_PASSWORD || 'admin666'
  const bcrypt = (await import('bcryptjs')).default
  const hashedPassword = await bcrypt.hash(adminPassword, 10)

  // 管理员
  if ((await countRows(dbUrl, dbToken, 'SELECT id FROM "user" WHERE username = ?', [adminUsername])) === 0) {
    await executeSql(dbUrl, dbToken, 'INSERT INTO "user" (username, password, role) VALUES (?, ?, ?)', [adminUsername, hashedPassword, 'admin'])
    console.log(`  ✓ 管理员账户创建: ${adminUsername}`)
  } else {
    console.log(`  ✓ 管理员已存在，跳过`)
  }

  // 默认版本
  if ((await countRows(dbUrl, dbToken, 'SELECT id FROM "app_version" WHERE version_code = 1')) === 0) {
    await executeSql(dbUrl, dbToken, `INSERT INTO "app_version" (version_code, version_name, update_log, download_url, force_update, is_enabled) VALUES (1, 'v1.0.0', '· 初始版本发布', '', 0, 1)`)
    console.log('  ✓ 默认版本 v1.0.0 创建')
  } else {
    console.log('  ✓ 默认版本已存在，跳过')
  }

  // Webhook Secret
  const webhookSecret = randomString(32)
  if ((await countRows(dbUrl, dbToken, 'SELECT id FROM "system_config" WHERE key = ?', ['build_webhook_secret'])) === 0) {
    await executeSql(dbUrl, dbToken, 'INSERT INTO "system_config" (key, value) VALUES (?, ?)', ['build_webhook_secret', webhookSecret])
    console.log('  ✓ Webhook Secret 生成')
  } else {
    console.log('  ✓ Webhook Secret 已存在，跳过')
  }

  // 配置版本号（用于 App 强制刷新检测）
  if ((await countRows(dbUrl, dbToken, 'SELECT id FROM "system_config" WHERE key = ?', ['config_version'])) === 0) {
    await executeSql(dbUrl, dbToken, 'INSERT INTO "system_config" (key, value) VALUES (?, ?)', ['config_version', String(Date.now())])
    console.log('  ✓ 配置版本号初始化')
  }

  // 广告配置
  for (const ad of [{ type: 'splash' }, { type: 'popup' }, { type: 'banner' }]) {
    if ((await countRows(dbUrl, dbToken, 'SELECT id FROM "ad_config" WHERE type = ?', [ad.type])) === 0) {
      await executeSql(dbUrl, dbToken, 'INSERT INTO "ad_config" (type, enabled, image_url, link_url, duration, show_times_per_day) VALUES (?, 0, ?, ?, 3, 1)', [ad.type, '', ''])
    }
  }
  console.log('  ✓ 广告配置初始化')

  // 功能开关
  for (const f of [
    { key: 'enablePullToRefresh', value: 'true', desc: '下拉刷新' },
    { key: 'enableShare', value: 'true', desc: '分享功能' },
    { key: 'enableDarkMode', value: 'false', desc: '深色模式' },
    { key: 'enableFileDownload', value: 'true', desc: '文件下载' },
    { key: 'enableExitConfirm', value: 'false', desc: '返回键退出确认' },
  ]) {
    if ((await countRows(dbUrl, dbToken, 'SELECT id FROM "feature_flag" WHERE key = ?', [f.key])) === 0) {
      await executeSql(dbUrl, dbToken, 'INSERT INTO "feature_flag" (key, value, description) VALUES (?, ?, ?)', [f.key, f.value, f.desc])
    }
  }
  console.log('  ✓ 功能开关初始化')

  // 样式配置
  for (const s of [
    { key: 'themeColor', value: '#3B82F6' },
    { key: 'statusBarColor', value: '#1A1A2E' },
    { key: 'appName', value: '我的应用' },
    { key: 'loadingText', value: '加载中...' },
    { key: 'webScale', value: '0.4' },
  ]) {
    if ((await countRows(dbUrl, dbToken, 'SELECT id FROM "style_config" WHERE key = ?', [s.key])) === 0) {
      await executeSql(dbUrl, dbToken, 'INSERT INTO "style_config" (key, value) VALUES (?, ?)', [s.key, s.value])
    }
  }
  console.log('  ✓ 样式配置初始化')

  // 公告
  if ((await countRows(dbUrl, dbToken, 'SELECT id FROM "announcement" LIMIT 1')) === 0) {
    await executeSql(dbUrl, dbToken, 'INSERT INTO "announcement" (enabled, text, link_url) VALUES (0, ?, ?)', ['欢迎使用本应用', ''])
  }
  console.log('  ✓ 公告初始化')

  // ---------- 7. 生成 Session Secret ----------
  const sessionSecret = randomString(32)

  // ---------- 8. 写入 .env ----------
  const envPath = join(projectRoot, '.env')
  const envContent = `# ============================================
# APK 生成器 - 环境变量（由 auto-setup.mjs 自动生成）
# ============================================

# Turso 云数据库
TURSO_DATABASE_URL="${dbUrl}"
TURSO_AUTH_TOKEN="${dbToken}"

# 本地开发数据库（仅本地开发用）
DATABASE_URL="file:./dev.db"

# 管理员账号
ADMIN_USERNAME="${adminUsername}"
ADMIN_PASSWORD="${adminPassword}"

# Session 加密密钥
SESSION_SECRET="${sessionSecret}"
`
  writeFileSync(envPath, envContent, 'utf-8')
  console.log('  ✓ .env 文件已生成')

  // ---------- 9. 自动写入 Vercel 环境变量 ----------
  const useVercel = process.argv.includes('--vercel')
  if (useVercel) {
    console.log('')
    console.log('  正在写入 Vercel 环境变量...')

    if (!checkVercelCLI()) {
      console.log('  ⚠ 未检测到 vercel CLI，跳过自动写入')
      console.log('  安装方法：npm i -g vercel')
      console.log('  然后运行：vercel login')
    } else {
      // 检查是否已登录
      try {
        execSync('vercel whoami', { stdio: 'pipe', timeout: 5000 })
        console.log('  ✓ Vercel CLI 已登录')

        // 自动写入所有环境变量
        addVercelEnv('TURSO_DATABASE_URL', dbUrl)
        addVercelEnv('TURSO_AUTH_TOKEN', dbToken)
        addVercelEnv('SESSION_SECRET', sessionSecret)
        addVercelEnv('ADMIN_USERNAME', adminUsername)
        addVercelEnv('ADMIN_PASSWORD', adminPassword)

        console.log('  ✓ Vercel 环境变量写入完成')
        console.log('  ⚠ 请在 Vercel 后台点击 Redeploy 重新部署以生效')
      } catch {
        console.log('  ⚠ Vercel CLI 未登录，跳过自动写入')
        console.log('  请运行：vercel login')
        console.log('  然后重新运行此脚本并加 --vercel 参数')
      }
    }
  }

  // ---------- 10. 输出结果 ----------
  console.log('')
  console.log('========================================')
  console.log('  ✅ 全部完成！')
  console.log('========================================')
  console.log('')
  console.log('  数据库信息：')
  console.log(`    地址: ${dbUrl}`)
  console.log(`    Token: ${dbToken.substring(0, 20)}...`)
  console.log(`    管理员: ${adminUsername} / ${adminPassword}`)
  console.log('')

  if (!useVercel || !checkVercelCLI()) {
    console.log('  如需自动写入 Vercel 环境变量，请运行：')
    console.log(`    npm i -g vercel && vercel login`)
    console.log(`    node scripts/auto-setup.mjs --turso-token <token> --vercel`)
    console.log('')
    console.log('  或手动在 Vercel 添加以下环境变量：')
    console.log(`    TURSO_DATABASE_URL = ${dbUrl}`)
    console.log(`    TURSO_AUTH_TOKEN   = ${dbToken}`)
    console.log(`    SESSION_SECRET     = ${sessionSecret}`)
    console.log(`    ADMIN_USERNAME     = ${adminUsername}`)
    console.log(`    ADMIN_PASSWORD     = ${adminPassword}`)
    console.log('')
  }

  console.log('  配置完成后重新部署即可，数据库数据不会被清除。')
  console.log('')
}

main().catch((err) => {
  console.error('配置失败:', err.message)
  process.exit(1)
})
