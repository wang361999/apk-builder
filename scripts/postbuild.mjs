/**
 * postbuild 脚本：构建完成后自动初始化数据库
 * 容错设计：任何步骤失败都不会中断流程
 *
 * 支持两种数据库：
 *   1. Turso 云数据库（生产环境，Vercel）—— 使用 libSQL 客户端直接建表
 *   2. SQLite 本地文件（本地开发）—— 使用 prisma db push
 */
import { execSync } from 'child_process'

function run(cmd, label) {
  try {
    console.log(`[postbuild] ${label}...`)
    execSync(cmd, { stdio: 'pipe', timeout: 30000 })
    console.log(`[postbuild] ${label} ✓`)
  } catch (err) {
    console.log(`[postbuild] ${label} 跳过（非致命）: ${err.message?.split('\n')[0] || ''}`)
  }
}

// 检测是否配置了 Turso
const hasTurso = process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN

if (hasTurso) {
  console.log('[postbuild] 检测到 Turso 配置，使用 Turso 云数据库')
  // 用 libSQL 客户端直接建表 + 种子数据
  run('node scripts/turso-init.mjs', '初始化 Turso 数据库')
} else {
  console.log('[postbuild] 未检测到 Turso 配置，使用本地 SQLite')
  // 本地开发用 prisma db push + seed
  run('npx prisma db push --accept-data-loss', '创建数据库表（SQLite）')
  run('npx prisma db seed', '初始化管理员账户')
}

console.log('[postbuild] 完成')
// 确保退出码为 0
process.exit(0)
