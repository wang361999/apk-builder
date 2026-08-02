# Vercel 双账号管理面板

部署在 Cloudflare Pages 上的轻量管理面板，用于监控和操作两个 Vercel 账号的部署。

## 功能

- 双账号部署状态实时监控（每 30 秒自动刷新）
- 站点健康检查（在线/离线 + HTTP 状态码）
- 一键触发部署（通过 Vercel Deploy Hook）
- 最新 Commit 信息展示
- 密码保护
- 账号轮替切换指引

## 部署到 Cloudflare Pages

### 方式一：一键脚本（推荐，全自动）

```bash
cd vercel-panel
bash setup.sh
```

脚本会自动完成：
1. 检查并安装 wrangler CLI
2. 登录 Cloudflare（打开浏览器）
3. 创建 Pages 项目
4. 交互式收集所有配置（Token、Hook URL 等）
5. 自动批量设置 11 个环境变量
6. 部署

你只需要按提示输入值，其他全自动。

### 方式二：手动 CLI 部署

```bash
cd vercel-panel
npm install
npx wrangler login
npm run deploy
```

然后手动到 Cloudflare Dashboard → Pages → 项目 → Settings → Environment variables 逐个添加环境变量。

### 方式三：Dashboard 部署

1. 将 `vercel-panel` 文件夹上传到 GitHub 仓库
2. Cloudflare Dashboard → Pages → Create a project → Connect to Git
3. 选择仓库，构建配置：
   - Framework preset: `None`
   - Build command: 留空
   - Build output directory: `public`
4. Deploy

## 配置环境变量

在 Cloudflare Dashboard → Pages → 你的项目 → Settings → Environment variables 中添加：

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `VERCEL_TOKEN_A` | 账号 A 的 Vercel API Token | 是 |
| `VERCEL_PROJECT_ID_A` | 账号 A 的项目 ID | 是 |
| `DEPLOY_HOOK_A` | 账号 A 的 Deploy Hook URL | 是 |
| `SITE_URL_A` | 账号 A 的站点地址 | 是 |
| `ACCOUNT_NAME_A` | 账号 A 显示名（如"主力"） | 否 |
| `VERCEL_TOKEN_B` | 账号 B 的 Vercel API Token | 是 |
| `VERCEL_PROJECT_ID_B` | 账号 B 的项目 ID | 是 |
| `DEPLOY_HOOK_B` | 账号 B 的 Deploy Hook URL | 是 |
| `SITE_URL_B` | 账号 B 的站点地址 | 是 |
| `ACCOUNT_NAME_B` | 账号 B 显示名（如"备用"） | 否 |
| `PANEL_PASSWORD` | 面板访问密码 | 强烈建议 |

### 获取各项配置的方法

**Vercel API Token**：
- 访问 https://vercel.com/account/tokens
- Create Token → 勾选该账号的项目权限
- 复制 token

**Project ID**：
- Vercel Dashboard → 你的项目 → Settings → General
- 复制 Project ID

**Deploy Hook URL**：
- Vercel Dashboard → 你的项目 → Settings → Git → Deploy Hooks
- Create Hook（选择 main 分支）→ 复制 URL

**Site URL**：
- 账号 A: `https://你的项目.vercel.app`（或绑定的自定义域名）
- 账号 B: `https://你的项目-2.vercel.app`（新账号的默认域名）

## 本地开发

```bash
npm install
npm run dev
```

然后在 `.dev.vars` 文件中配置环境变量（参考 wrangler.toml 中的列表）。

## 技术栈

- 前端：纯 HTML + CSS + JavaScript（无构建工具）
- 后端：Cloudflare Pages Functions（Workers 运行时）
- 不消耗 Vercel 配额，完全运行在 Cloudflare 免费版上
