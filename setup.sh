#!/usr/bin/env bash
# Vercel 管理面板 - 一键配置和部署脚本
# 用法：bash setup.sh
#
# 运行后会：
#   1. 检查 wrangler 是否安装
#   2. 登录 Cloudflare
#   3. 创建 Pages 项目
#   4. 交互式收集环境变量
#   5. 自动批量设置所有变量
#   6. 部署

set -euo pipefail

PROJECT_NAME="vercel-panel"
BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${BOLD}========================================${RESET}"
echo -e "${BOLD}  Vercel 双账号管理面板 - 部署脚本${RESET}"
echo -e "${BOLD}========================================${RESET}"
echo ""

# ============ 1. 检查 wrangler ============
echo -e "${YELLOW}[1/6] 检查 wrangler CLI...${RESET}"

if ! command -v npx &> /dev/null; then
  echo -e "${RED}错误：需要先安装 Node.js（包含 npx）${RESET}"
  exit 1
fi

# 检查是否已安装 wrangler
if ! npx wrangler --version &> /dev/null 2>&1; then
  echo "  正在安装 wrangler..."
  npm install -g wrangler 2>/dev/null || {
    echo "  使用 npx 运行 wrangler（每次会临时下载）"
  }
fi

echo -e "  ${GREEN}✓ wrangler 就绪${RESET}"
echo ""

# ============ 2. 登录 Cloudflare ============
echo -e "${YELLOW}[2/6] 登录 Cloudflare...${RESET}"
echo "  如果浏览器已登录会自动跳过"
echo ""

npx wrangler whoami 2>/dev/null && {
  echo -e "  ${GREEN}✓ 已登录${RESET}"
} || {
  echo "  正在打开浏览器登录..."
  npx wrangler login
  echo -e "  ${GREEN}✓ 登录成功${RESET}"
}
echo ""

# ============ 3. 创建 Pages 项目 ============
echo -e "${YELLOW}[3/6] 创建 Pages 项目 ${PROJECT_NAME}...${RESET}"

# 尝试创建项目（已存在会报错，忽略即可）
npx wrangler pages project create "$PROJECT_NAME" --production-branch=main 2>/dev/null && {
  echo -e "  ${GREEN}✓ 项目已创建${RESET}"
} || {
  echo -e "  ${YELLOW}⚠ 项目可能已存在，继续使用${RESET}"
}
echo ""

# ============ 4. 收集环境变量 ============
echo -e "${YELLOW}[4/6] 配置环境变量${RESET}"
echo "  请按提示输入各项配置（直接回车可跳过可选项）"
echo ""

# 辅助函数：读取输入
read_var() {
  local prompt="$1"
  local required="$2"
  local value=""

  while true; do
    read -p "  $prompt: " value
    if [ -z "$value" ] && [ "$required" = "required" ]; then
      echo -e "    ${RED}此项为必填，请重新输入${RESET}"
    else
      break
    fi
  done
  echo "$value"
}

echo -e "${BOLD}  --- 账号 A（主力）---${RESET}"
ACCOUNT_NAME_A=$(read_var "显示名 [主力]" "" )
[ -z "$ACCOUNT_NAME_A" ] && ACCOUNT_NAME_A="主力"
VERCEL_TOKEN_A=$(read_var "Vercel API Token (vercel.com/account/tokens)" "required")
VERCEL_PROJECT_ID_A=$(read_var "Project ID (Settings → General)" "required")
DEPLOY_HOOK_A=$(read_var "Deploy Hook URL (Settings → Git → Deploy Hooks)" "required")
SITE_URL_A=$(read_var "站点地址 (如 https://xxx.vercel.app)" "required")
echo ""

echo -e "${BOLD}  --- 账号 B（备用）---${RESET}"
ACCOUNT_NAME_B=$(read_var "显示名 [备用]" "")
[ -z "$ACCOUNT_NAME_B" ] && ACCOUNT_NAME_B="备用"
VERCEL_TOKEN_B=$(read_var "Vercel API Token" "required")
VERCEL_PROJECT_ID_B=$(read_var "Project ID" "required")
DEPLOY_HOOK_B=$(read_var "Deploy Hook URL" "required")
SITE_URL_B=$(read_var "站点地址" "required")
echo ""

echo -e "${BOLD}  --- 面板安全 ---${RESET}"
PANEL_PASSWORD=$(read_var "面板访问密码" "required")
echo ""

# ============ 5. 批量设置环境变量 ============
echo -e "${YELLOW}[5/6] 自动设置环境变量...${RESET}"

# 辅助函数：设置变量（生产 + 预览环境都设置）
set_var() {
  local key="$1"
  local value="$2"
  local display="${3:-$2}"  # 第三个参数是显示用的脱敏值

  # 用 echo 管道传值给 wrangler secret put
  printf '%s' "$value" | npx wrangler pages secret put "$key" --project-name="$PROJECT_NAME" 2>/dev/null && {
    echo -e "  ${GREEN}✓${RESET} $key = $display"
  } || {
    # 某些版本 wrangler 不支持 pages secret put，回退到 dashboard 提示
    echo -e "  ${YELLOW}⚠${RESET} $key 自动设置失败，请手动到 Dashboard 添加"
  }
}

set_var "ACCOUNT_NAME_A" "$ACCOUNT_NAME_A"
set_var "VERCEL_TOKEN_A" "$VERCEL_TOKEN_A" "***"
set_var "VERCEL_PROJECT_ID_A" "$VERCEL_PROJECT_ID_A"
set_var "DEPLOY_HOOK_A" "$DEPLOY_HOOK_A" "***"
set_var "SITE_URL_A" "$SITE_URL_A"

set_var "ACCOUNT_NAME_B" "$ACCOUNT_NAME_B"
set_var "VERCEL_TOKEN_B" "$VERCEL_TOKEN_B" "***"
set_var "VERCEL_PROJECT_ID_B" "$VERCEL_PROJECT_ID_B"
set_var "DEPLOY_HOOK_B" "$DEPLOY_HOOK_B" "***"
set_var "SITE_URL_B" "$SITE_URL_B"

set_var "PANEL_PASSWORD" "$PANEL_PASSWORD" "***"

echo ""

# ============ 6. 部署 ============
echo -e "${YELLOW}[6/6] 部署到 Cloudflare Pages...${RESET}"
echo ""

npx wrangler pages deploy public --project-name="$PROJECT_NAME" && {
  echo ""
  echo -e "${GREEN}${BOLD}========================================${RESET}"
  echo -e "${GREEN}${BOLD}  部署成功！${RESET}"
  echo -e "${GREEN}${BOLD}========================================${RESET}"
  echo ""
  echo "  面板地址："
  echo "  https://${PROJECT_NAME}.pages.dev"
  echo ""
  echo "  登录密码：你刚才设置的 PANEL_PASSWORD"
  echo ""
  echo "  接下来："
  echo "  1. 打开面板地址，输入密码登录"
  echo "  2. 确认两个账号状态正常显示"
  echo "  3. 测试一键部署按钮"
  echo ""
} || {
  echo -e "${RED}部署失败，请检查上方错误信息${RESET}"
  exit 1
}
