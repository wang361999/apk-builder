# 📱 APK 生成器

用户提交网址，系统自动打包成原生 Android APK，管理员在后台管理版本更新。

## ✨ 核心功能

- **用户端**：填写网址 + 应用名称 + 包名 → 一键生成 APK → 下载
- **后台管理**：版本管理（发布新版本、更新日志、强制更新控制）、查看构建记录
- **App 端**：启动时自动检查更新 → 弹窗展示更新日志 → 下载安装

## 🏗️ 技术架构

| 组件 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Next.js 14 (App Router) | 全栈框架 |
| 样式 | Tailwind CSS | 快速 UI 开发 |
| 数据库 | Vercel Postgres | 免费托管 |
| ORM | Prisma | 数据库操作 |
| 部署 | Vercel | 一个项目一次部署 |
| 打包服务 | GitHub Actions | 免费编译 APK |
| 存储 | GitHub Releases | 存放 APK 文件 |
| 鉴权 | iron-session (Cookie) | 简单后台登录 |

## 📂 项目结构

```
apk-builder/
├── app/                        # Next.js App Router
│   ├── page.tsx                # 首页（APK 生成表单）
│   ├── build/page.tsx          # 构建进度页
│   ├── download/page.tsx       # 下载页
│   ├── admin/                  # 后台管理
│   │   ├── login/page.tsx      # 管理员登录
│   │   ├── page.tsx            # 仪表盘
│   │   ├── versions/           # 版本管理
│   │   │   ├── page.tsx        # 版本列表
│   │   │   ├── new/page.tsx    # 发布新版本
│   │   │   └── edit/page.tsx   # 编辑版本
│   │   └── records/page.tsx    # 构建记录
│   ├── api/                    # API 路由（7个，Vercel会自动合并打包）
│   │   ├── build/route.ts      # POST 提交构建 / GET 查询状态
│   │   ├── build-status/route.ts  # GitHub Actions 回调
│   │   ├── app-version/route.ts   # App 检查更新
│   │   └── admin/              # 管理员 API
│   │       ├── login/route.ts
│   │       ├── versions/route.ts
│   │       ├── versions/[id]/route.ts
│   │       └── records/route.ts
│   ├── layout.tsx              # 根布局
│   └── globals.css             # 全局样式
├── components/
│   └── AdminLayout.tsx         # 后台布局组件
├── lib/
│   ├── prisma.ts               # Prisma 单例
│   └── session.ts              # Session 配置
├── prisma/
│   ├── schema.prisma           # 数据库 Schema（3张表）
│   └── seed.ts                 # 种子脚本（创建管理员）
├── android/                    # Android WebView 模板
│   ├── app/
│   │   ├── build.gradle
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml
│   │   │   ├── java/com/webview/app/MainActivity.java
│   │   │   └── res/            # 布局、样式、图标
│   │   └── proguard-rules.pro
│   ├── build.gradle
│   ├── settings.gradle
│   └── gradle.properties
├── .github/workflows/
│   └── build-apk.yml           # APK 构建工作流
├── vercel.json                 # Vercel 部署配置
└── package.json
```

## 🗄️ 数据库表结构

### user 表
| 字段 | 说明 |
|------|------|
| id | 主键 |
| username | 登录账号，唯一 |
| password | bcrypt 加密存储 |
| role | admin 或 user |
| created_at | 注册时间 |

### build_record 表
| 字段 | 说明 |
|------|------|
| id | 主键 |
| url | 用户填的网址 |
| app_name | 应用名称 |
| package_name | 包名 |
| download_url | APK 下载链接 |
| status | building / success / failed |
| build_log | 构建日志 |
| version_name | 版本名 |
| file_size | 文件大小(bytes) |
| user_id | 关联用户，可空 |
| created_at | 提交时间 |

### app_version 表
| 字段 | 说明 |
|------|------|
| id | 主键 |
| version_code | 递增整数，App 对比用 |
| version_name | v1.0.1 |
| update_log | 更新日志，支持换行 |
| download_url | APK 下载地址 |
| force_update | 是否强制更新 |
| is_enabled | 是否启用 |
| created_at | 发布时间 |

## 🚀 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone <your-repo-url>
cd apk-builder

# 安装依赖
npm install
```

### 2. 配置环境变量（自动生成）

```bash
npm run setup
```

运行后会交互式引导你完成配置，自动生成 `.env` 文件：

- 数据库地址（Vercel Postgres）
- 管理员账号密码（默认 admin / admin666）
- GitHub Token 和仓库地址（可跳过，稍后配置）
- **自动生成** 32 位 SESSION_SECRET 加密密钥
- **自动生成** 24 位 BUILD_WEBHOOK_SECRET 回调密钥

也可以直接指定数据库地址跳过交互：

```bash
npm run setup -- --database "postgresql://user:pass@host:5432/db"
```

生成的 `.env` 文件包含：

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin666"
GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
GITHUB_REPO="your-username/apk-builder"
GITHUB_BRANCH="main"
SESSION_SECRET="自动生成的32位随机密钥"
BUILD_WEBHOOK_SECRET="自动生成的24位随机密钥"
```

### 3. 初始化数据库（部署到 Vercel 时自动执行，本地开发需手动）

```bash
# 创建数据库表 + 创建管理员账户（一条命令搞定）
npm run db:push && npm run db:seed
```

> 部署到 Vercel 时，`build` 命令已包含 `prisma db push` 和 `prisma db seed`，无需手动操作。

### 4. 本地开发

```bash
npm run dev
```

访问 http://localhost:3000

### 5. 部署到 Vercel

1. 在 Vercel 创建项目并连接 GitHub 仓库
2. 在 Vercel 创建 Postgres 数据库
3. 将 `npm run setup` 生成的 `.env` 中的变量复制到 Vercel 环境变量
4. 部署 —— 自动建表 + 创建管理员账户，无需手动操作数据库

### 6. 配置 GitHub Actions

在 GitHub 仓库 Settings → Secrets 中添加：

| Secret 名称 | 说明 |
|---|---|
| `KEYSTORE_BASE64` | 签名文件的 Base64 编码 |
| `KEYSTORE_PASSWORD` | keystore 密码 |
| `KEY_ALIAS` | key 别名 |
| `KEY_PASSWORD` | key 密码 |
| `VERCEL_API_URL` | 你的 Vercel 部域名（如 https://xxx.vercel.app） |
| `BUILD_WEBHOOK_SECRET` | 构建回调密钥（与 .env 中一致） |
| `GITHUB_TOKEN` | GitHub Personal Access Token（需 repo 权限） |

生成 Keystore 的 Base64：
```bash
keytool -genkey -v -keystore keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias mykey
base64 -i keystore.jks | pbcopy  # macOS
# 或
base64 -w 0 keystore.jks  # Linux
```

## 📡 API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/build` | POST | 用户提交，触发 APK 构建 |
| `/api/build` | GET | 查询构建进度（?id=xxx） |
| `/api/build-status` | POST | GitHub Actions 回调更新状态 |
| `/api/app-version` | GET | App 检查更新 |
| `/api/admin/login` | POST | 管理员登录 |
| `/api/admin/versions` | GET | 获取版本列表 |
| `/api/admin/versions` | POST | 发布新版本 |
| `/api/admin/versions/[id]` | PUT | 编辑版本 |
| `/api/admin/versions/[id]` | DELETE | 删除版本 |
| `/api/admin/records` | GET | 获取构建记录列表 |

## 🔧 Vercel 免费版函数优化

本项目针对 Vercel Hobby 计划做了函数数量优化：

- **前台页面全部 `"use client"`**：构建为静态资源，**不占用函数额度**
- **7 个 API 路由**：Vercel 会自动合并打包为最少数量的 Lambda
- **实际函数数远低于 12 个限制**

## 🔄 工作流程

```
用户填写表单 → POST /api/build → 创建记录 + 触发 GitHub Actions
→ GitHub Actions 编译 APK → 上传到 Releases → 回调 /api/build-status
→ 用户看到下载链接 → 下载安装
→ App 启动 → GET /api/app-version → 有新版本则弹窗更新
→ 管理员后台发布新版本
```

## 📝 默认管理员

- 用户名：`admin`（可通过环境变量 `ADMIN_USERNAME` 修改）
- 密码：`admin123`（可通过环境变量 `ADMIN_PASSWORD` 修改）

**生产环境请务必修改默认密码！**
