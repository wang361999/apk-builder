// POST /api/deploy - 触发指定账号的 Vercel 部署
// Body: { "account": "A" | "B" }

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  try {
    const body = await request.json();
    const account = (body as { account?: string })?.account?.toUpperCase();

    if (account !== 'A' && account !== 'B') {
      return new Response(
        JSON.stringify({ error: '参数 account 必须是 A 或 B' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const deployHook = (env as Record<string, string>)[`DEPLOY_HOOK_${account}`];
    const accountName = (env as Record<string, string>)[`ACCOUNT_NAME_${account}`] || `账号 ${account}`;

    if (!deployHook) {
      return new Response(
        JSON.stringify({
          error: `${accountName} 未配置 DEPLOY_HOOK_${account} 环境变量`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 触发 Vercel Deploy Hook
    const res = await fetch(deployHook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // Deploy Hook 响应可能不是 JSON
    }

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: `${accountName} 部署触发失败（HTTP ${res.status}）`,
          detail,
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${accountName} 部署已触发，预计 2-5 分钟后完成`,
        account: accountName,
        detail,
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
