/**
 * 自动生成 .env 文件
 *
 * 用法：
 *   node scripts/setup-env.mjs                    # 交互式生成
 *   node scripts/setup-env.mjs --database <url>   # 指定数据库地址
 *
 * 生成的密钥：
 *   - SESSION_SECRET: 32 位随机字符串（用于 iron-session 加密）
 *   - BUILD_WEBHOOK_SECRET: 24 位随机字符串（用于 GitHub Actions 回调验证）
 */

import { writeFileSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'
import { randomBytes } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const envPath = join(projectRoot, '.env')

// 生成随机字符串
function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(length)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length]
  }
  return result
}

// 从命令行参数读取 --database
function getDatabaseFromArgs() {
  const idx = process.argv.indexOf('--database')
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1]
  }
  return null
}

// 检测是否为非交互模式（--yes 或管道输入）
function isNonInteractive() {
  return process.argv.includes('--yes') || !process.stdin.isTTY
}

// 读取用户输入
async function ask(question, defaultValue = '') {
  if (isNonInteractive()) {
    return defaultValue
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const prompt = defaultValue
      ? `${question} [默认: ${defaultValue}]: `
      : `${question}: `
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultValue)
    })
  })
}

// 解析现有 .env 文件（保留已有值）
function parseExistingEnv() {
  const existing = {}
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
      if (match) {
        existing[match[1]] = match[2]
      }
    }
  }
  return existing
}

async function main() {
  console.log('')
  console.log('========================================')
  console.log('  APK 生成器 - 环境变量自动生成')
  console.log('========================================')
  console.log('')

  const existing = parseExistingEnv()

  if (Object.keys(existing).length > 0) {
    console.log('  检测到已有 .env 文件，将保留已有值，仅补充缺失项。')
    console.log('')
  }

  // 1. Turso 数据库配置（生产环境）
  const tursoUrl = existing.TURSO_DATABASE_URL || ''
  const inputTursoUrl = await ask(
    'Turso 数据库地址（生产环境必填，本地开发可跳过）',
    tursoUrl
  )

  const tursoToken = existing.TURSO_AUTH_TOKEN || ''
  const inputTursoToken = await ask(
    'Turso 认证 Token（生产环境必填，本地开发可跳过）',
    tursoToken
  )

  // 本地 SQLite 地址（开发用）
  let databaseUrl = existing.DATABASE_URL || 'file:./dev.db'

  // 2. 管理员账号
  const adminUsername = existing.ADMIN_USERNAME || 'admin'
  const inputUsername = await ask('管理员账号', adminUsername)

  // 3. 管理员密码
  const adminPassword = existing.ADMIN_PASSWORD || 'admin666'
  const inputPassword = await ask('管理员密码（部署后可在后台修改）', adminPassword)

  // 4. GitHub 配置
  const githubToken = existing.GITHUB_TOKEN || ''
  const inputToken = await ask('GitHub Token（可稍后在 Vercel 配置，直接回车跳过）', githubToken)

  const githubRepo = existing.GITHUB_REPO || ''
  const inputRepo = await ask('GitHub 仓库（格式: username/repo，可稍后配置）', githubRepo)

  const githubBranch = existing.GITHUB_BRANCH || 'main'
  const inputBranch = await ask('GitHub 分支', githubBranch)

  // 5. 自动生成密钥
  const sessionSecret = existing.SESSION_SECRET || randomString(32)
  const webhookSecret = existing.BUILD_WEBHOOK_SECRET || randomString(24)

  console.log('')
  console.log('  已自动生成加密密钥：')
  console.log(`    SESSION_SECRET: ${sessionSecret.substring(0, 8)}...（已隐藏）`)
  console.log(`    BUILD_WEBHOOK_SECRET: ${webhookSecret.substring(0, 8)}...（已隐藏）`)
  console.log('')

  // 6. 构建 .env 内容
  const envContent = `# ============================================
# APK 生成器 - 环境变量
# 此文件由 scripts/setup-env.mjs 自动生成
# ============================================

# Turso 云数据库（生产环境必填，Vercel 部署用）
TURSO_DATABASE_URL="${inputTursoUrl}"
TURSO_AUTH_TOKEN="${inputTursoToken}"

# 本地开发数据库（SQLite 文件，仅本地开发用）
DATABASE_URL="${databaseUrl}"

# 管理员账号（首次部署自动创建，之后可在后台修改）
ADMIN_USERNAME="${inputUsername}"
ADMIN_PASSWORD="${inputPassword}"

# GitHub 配置（用于触发 Actions 构建 APK）
GITHUB_TOKEN="${inputToken}"
GITHUB_REPO="${inputRepo}"
GITHUB_BRANCH="${inputBranch}"

# Session 加密密钥（自动生成，请勿修改）
SESSION_SECRET="${sessionSecret}"

# 构建回调密钥（自动生成，需同步配置到 GitHub Secrets）
BUILD_WEBHOOK_SECRET="${webhookSecret}"
`

  // 7. 写入文件
  writeFileSync(envPath, envContent, 'utf-8')

  console.log('========================================')
  console.log('  ✅ .env 文件已生成！')
  console.log('========================================')
  console.log('')
  console.log('  文件位置: .env')
  console.log('')
  console.log('  接下来：')
  console.log('    1. 本地开发: npm run dev')
  console.log('    2. 部署到 Vercel: 将以上变量复制到 Vercel 环境变量')
  console.log('    3. GitHub Secrets: 配置以下密钥')
  console.log(`       BUILD_WEBHOOK_SECRET = ${webhookSecret}`)
  console.log('       KEYSTORE_BASE64 / KEYSTORE_PASSWORD / KEY_ALIAS / KEY_PASSWORD')
  console.log('       VERCEL_API_URL / GITHUB_TOKEN')
  console.log('')
  console.log('  ⚠️  请勿将 .env 文件提交到 Git（已在 .gitignore 中忽略）')
  console.log('')
}

main().catch((err) => {
  console.error('生成 .env 失败:', err)
  process.exit(1)
})
