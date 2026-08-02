// POST /api/toggle - 暂停或恢复指定账号的 Vercel 项目
// Body: { "account": "A" | "B", "action": "pause" | "resume" }
//
// Vercel API:
//   暂停: POST https://api.vercel.com/v1/projects/{projectId}/pause
//   恢复: POST https://api.vercel.com/v1/projects/{projectId}/unpause
//
// 暂停后访问者会看到 503 DEPLOYMENT_PAUSED 错误页面
// 恢复后立即恢复访问

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  try {
    const body = await request.json();
    const account = (body as { account?: string })?.account?.toUpperCase();
    const action = (body as { action?: string })?.action?.toLowerCase();

    if (account !== 'A' && account !== 'B') {
      return new Response(
        JSON.stringify({ error: '参数 account 必须是 A 或 B' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (action !== 'pause' && action !== 'resume') {
      return new Response(
        JSON.stringify({ error: '参数 action 必须是 pause 或 resume' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const token = (env as Record<string, string>)[`VERCEL_TOKEN_${account}`];
    const projectId = (env as Record<string, string>)[`VERCEL_PROJECT_ID_${account}`];
    const accountName = (env as Record<string, string>)[`ACCOUNT_NAME_${account}`] || `账号 ${account}`;

    if (!token || !projectId) {
      return new Response(
        JSON.stringify({ error: `${accountName} 未配置 VERCEL_TOKEN 或 VERCEL_PROJECT_ID` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 调用 Vercel API
    const endpoint = action === 'pause' ? 'pause' : 'unpause';
    const apiUrl = `https://api.vercel.com/v1/projects/${projectId}/${endpoint}`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // 响应可能不是 JSON
    }

    if (!res.ok) {
      // 常见错误
      let errorMsg = `Vercel API 返回 ${res.status}`;
      if (res.status === 403) {
        errorMsg = 'Token 权限不足，请确保 Token 有该项目的管理权限';
      } else if (res.status === 404) {
        errorMsg = '项目未找到，请检查 VERCEL_PROJECT_ID 是否正确';
      } else if (res.status === 409) {
        errorMsg = action === 'pause' ? '项目已经是暂停状态' : '项目已经是运行状态';
      }
      return new Response(
        JSON.stringify({ error: `${accountName} ${action === 'pause' ? '暂停' : '恢复'}失败：${errorMsg}`, detail }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const actionLabel = action === 'pause' ? '已暂停' : '已恢复';
    const message = action === 'pause'
      ? `${accountName} 已暂停，访问者将看到 503 维护页面`
      : `${accountName} 已恢复运行，站点可正常访问`;

    return new Response(
      JSON.stringify({
        success: true,
        message,
        account: accountName,
        action,
        paused: action === 'pause',
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: `请求处理失败：${err instanceof Error ? err.message : '未知错误'}`,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
