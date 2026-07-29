package com.webview.app;

import android.Manifest;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.DownloadListener;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "WebViewApp";
    // 配置接口地址，打包时会被替换为实际后台地址
    private static final String CONFIG_URL = "https://your-domain.com/api/app-config";
    private static final int PERMISSION_REQUEST_CODE = 1001;

    // 视图
    private WebView webView;
    private ProgressBar progressBar;
    private SwipeRefreshLayout swipeRefreshLayout;
    private LinearLayout announcementBar;
    private TextView announcementText;
    private FrameLayout bannerContainer;
    private ImageView bannerImage;
    private FrameLayout splashContainer;
    private ImageView splashImage;
    private TextView splashSkip;

    private Handler handler = new Handler(Looper.getMainLooper());
    private ExecutorService executor = Executors.newSingleThreadExecutor();

    // 打包时硬编码的用户网址（后台可后续修改此地址）
    private String appUrl = "https://example.com";

    // 配置缓存
    private boolean enablePullToRefresh = true;
    private boolean enableShare = true;
    private boolean enableExitConfirm = false;
    private boolean popupShownToday = false;

    // 配置版本号缓存（用于检测后台配置是否变化，变了就强制刷新）
    private String lastConfigVersion = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // 读取上次保存的配置版本号
        SharedPreferences sp = getSharedPreferences("app_config", Context.MODE_PRIVATE);
        lastConfigVersion = sp.getString("config_version", "");

        initViews();
        setupWebView();
        setupSwipeRefresh();
        requestStoragePermission();

        // 拉取远程配置并应用
        fetchAppConfig();
    }

    private void initViews() {
        progressBar = findViewById(R.id.progress_bar);
        webView = findViewById(R.id.web_view);
        swipeRefreshLayout = findViewById(R.id.swipe_refresh);
        announcementBar = findViewById(R.id.announcement_bar);
        announcementText = findViewById(R.id.announcement_text);
        bannerContainer = findViewById(R.id.banner_container);
        bannerImage = findViewById(R.id.banner_image);
        splashContainer = findViewById(R.id.splash_container);
        splashImage = findViewById(R.id.splash_image);
        splashSkip = findViewById(R.id.splash_skip);
    }

    // ==============================
    // 远程配置拉取与应用
    // ==============================
    private void fetchAppConfig() {
        executor.execute(() -> {
            try {
                URL url = new URL(CONFIG_URL);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                int responseCode = conn.getResponseCode();
                if (responseCode == 200) {
                    InputStream is = conn.getInputStream();
                    BufferedReader reader = new BufferedReader(new InputStreamReader(is));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();

                    JSONObject json = new JSONObject(sb.toString());
                    handler.post(() -> applyConfig(json));
                }
            } catch (Exception e) {
                Log.e(TAG, "拉取配置失败", e);
            }
        });
    }

    private void applyConfig(JSONObject json) {
        try {
            // 0. 检测配置版本号是否变化（后台保存配置后版本号自动更新）
            String configVersion = json.optString("configVersion", "");
            if (!configVersion.isEmpty()) {
                if (!lastConfigVersion.isEmpty() && !configVersion.equals(lastConfigVersion)) {
                    // 版本号变了，说明后台配置有更新，强制刷新网页
                    Log.d(TAG, "配置版本号变化: " + lastConfigVersion + " -> " + configVersion);
                    forceRefreshWebView();
                }
                // 保存新版本号
                lastConfigVersion = configVersion;
                getSharedPreferences("app_config", Context.MODE_PRIVATE)
                    .edit()
                    .putString("config_version", configVersion)
                    .apply();
            }

            // 1. 版本检查
            if (json.has("version") && !json.isNull("version")) {
                JSONObject version = json.getJSONObject("version");
                checkVersionUpdate(version);
            }

            // 2. 样式配置
            if (json.has("style")) {
                JSONObject style = json.getJSONObject("style");
                applyStyle(style);
            }

            // 3. 功能开关
            if (json.has("features")) {
                JSONObject features = json.getJSONObject("features");
                applyFeatures(features);
            }

            // 4. 公告
            if (json.has("announcement")) {
                JSONObject announcement = json.getJSONObject("announcement");
                applyAnnouncement(announcement);
            }

            // 5. 启动页广告
            if (json.has("splash")) {
                JSONObject splash = json.getJSONObject("splash");
                showSplashAd(splash);
            }

            // 6. 弹窗广告（延迟到页面加载完成后显示）
            if (json.has("popup")) {
                JSONObject popup = json.getJSONObject("popup");
                handler.postDelayed(() -> showPopupAd(popup), 2000);
            }

            // 7. 底部横幅广告
            if (json.has("banner")) {
                JSONObject banner = json.getJSONObject("banner");
                showBannerAd(banner);
            }

        } catch (Exception e) {
            Log.e(TAG, "应用配置失败", e);
        }
    }

    // ==============================
    // 强制刷新网页（清除缓存后重新加载）
    // ==============================
    private void forceRefreshWebView() {
        // 清除 WebView 缓存
        webView.clearCache(true);
        webView.clearHistory();

        // 清除 Cookie
        android.webkit.CookieManager.getInstance().removeAllCookies(null);
        android.webkit.CookieManager.getInstance().flush();

        // 重新加载网页
        webView.loadUrl(appUrl);

        Log.d(TAG, "已强制刷新网页（配置版本变化）");
    }

    // ==============================
    // 版本更新
    // ==============================
    private void checkVersionUpdate(JSONObject version) {
        try {
            int serverVersionCode = version.getInt("code");
            String versionName = version.getString("name");
            String updateLog = version.getString("updateLog");
            String downloadUrl = version.getString("downloadUrl");
            boolean forceUpdate = version.getBoolean("forceUpdate");

            int currentVersionCode = getCurrentVersionCode();

            if (serverVersionCode > currentVersionCode && !downloadUrl.isEmpty()) {
                showUpdateDialog(versionName, updateLog, downloadUrl, forceUpdate);
            }
        } catch (Exception e) {
            Log.e(TAG, "版本检查失败", e);
        }
    }

    private int getCurrentVersionCode() {
        try {
            PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return (int) pInfo.getLongVersionCode();
            }
            return pInfo.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    private void showUpdateDialog(String versionName, String updateLog, String downloadUrl, boolean forceUpdate) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("发现新版本 " + versionName);
        builder.setMessage(updateLog);
        builder.setCancelable(!forceUpdate);
        builder.setPositiveButton("立即更新", (dialog, which) -> {
            downloadAndInstall(downloadUrl, versionName);
        });

        if (!forceUpdate) {
            builder.setNegativeButton("稍后再说", (dialog, which) -> dialog.dismiss());
        }

        AlertDialog dialog = builder.create();
        if (forceUpdate) {
            dialog.setCancelable(false);
            dialog.setCanceledOnTouchOutside(false);
        }
        dialog.show();
    }

    private void downloadAndInstall(String downloadUrl, String versionName) {
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(downloadUrl));
            request.setTitle("下载更新 " + versionName);
            request.setDescription("正在下载...");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "update_" + versionName + ".apk");

            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            long downloadId = dm.enqueue(request);

            // 监听下载完成
            handler.postDelayed(() -> {
                DownloadManager.Query query = new DownloadManager.Query();
                query.setFilterById(downloadId);
                android.database.Cursor cursor = dm.query(query);
                if (cursor != null && cursor.moveToFirst()) {
                    int statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                    int status = cursor.getInt(statusIdx);
                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        int uriIdx = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
                        String apkUri = cursor.getString(uriIdx);
                        installApk(Uri.parse(apkUri));
                    }
                }
                if (cursor != null) cursor.close();
            }, 3000);

            Toast.makeText(this, "开始下载更新...", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "下载失败，请手动下载", Toast.LENGTH_SHORT).show();
            Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(downloadUrl));
            startActivity(browserIntent);
        }
    }

    private void installApk(Uri uri) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!getPackageManager().canRequestPackageInstalls()) {
                    startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getPackageName())));
                    return;
                }
            }

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "安装失败", Toast.LENGTH_SHORT).show();
        }
    }

    // ==============================
    // 样式应用
    // ==============================
    private void applyStyle(JSONObject style) {
        try {
            String themeColor = style.optString("themeColor", "#3B82F6");
            String statusBarColor = style.optString("statusBarColor", "#1A1A2E");

            // 设置状态栏颜色
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                getWindow().setStatusBarColor(parseColor(statusBarColor));
            }

            // 设置进度条颜色为主题色
            progressBar.setProgressTintList(android.content.res.ColorStateList.valueOf(parseColor(themeColor)));
            swipeRefreshLayout.setColorSchemeColors(parseColor(themeColor));

            // 更新标题栏标题
            String appName = style.optString("appName", "");
            if (!appName.isEmpty() && getSupportActionBar() != null) {
                getSupportActionBar().setTitle(appName);
            }
        } catch (Exception e) {
            Log.e(TAG, "应用样式失败", e);
        }
    }

    private int parseColor(String colorStr) {
        try {
            return Color.parseColor(colorStr);
        } catch (Exception e) {
            return Color.parseColor("#3B82F6");
        }
    }

    // ==============================
    // 功能开关
    // ==============================
    private void applyFeatures(JSONObject features) {
        try {
            enablePullToRefresh = features.optBoolean("enablePullToRefresh", true);
            enableShare = features.optBoolean("enableShare", true);
            enableExitConfirm = features.optBoolean("enableExitConfirm", false);

            // 下拉刷新开关
            swipeRefreshLayout.setEnabled(enablePullToRefresh);
        } catch (Exception e) {
            Log.e(TAG, "应用功能开关失败", e);
        }
    }

    // ==============================
    // 公告
    // ==============================
    private void applyAnnouncement(JSONObject announcement) {
        try {
            boolean enabled = announcement.optBoolean("enabled", false);
            String text = announcement.optString("text", "");
            final String linkUrl = announcement.optString("linkUrl", "");

            if (enabled && !text.isEmpty()) {
                announcementText.setText(text);
                announcementBar.setVisibility(View.VISIBLE);
                // 让 TextView 获取焦点以启动跑马灯
                announcementText.requestFocus();

                // 点击公告跳转
                if (!linkUrl.isEmpty()) {
                    announcementBar.setOnClickListener(v -> {
                        webView.loadUrl(linkUrl);
                    });
                }
            } else {
                announcementBar.setVisibility(View.GONE);
            }
        } catch (Exception e) {
            Log.e(TAG, "应用公告失败", e);
        }
    }

    // ==============================
    // 启动页广告
    // ==============================
    private void showSplashAd(JSONObject splash) {
        try {
            boolean enabled = splash.optBoolean("enabled", false);
            if (!enabled) return;

            String imageUrl = splash.optString("imageUrl", "");
            int duration = splash.optInt("duration", 3);
            final String linkUrl = splash.optString("linkUrl", "");

            if (imageUrl.isEmpty()) return;

            // 显示启动页广告
            splashContainer.setVisibility(View.VISIBLE);

            // 加载图片
            executor.execute(() -> {
                try {
                    URL url = new URL(imageUrl);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    InputStream is = conn.getInputStream();
                    final android.graphics.Bitmap bitmap = android.graphics.BitmapFactory.decodeStream(is);
                    is.close();

                    if (bitmap != null) {
                        handler.post(() -> {
                            splashImage.setImageBitmap(bitmap);

                            // 点击跳转
                            if (!linkUrl.isEmpty()) {
                                splashImage.setOnClickListener(v -> {
                                    hideSplash();
                                    webView.loadUrl(linkUrl);
                                });
                            }

                            // 跳过按钮
                            splashSkip.setOnClickListener(v -> hideSplash());

                            // 自动关闭
                            handler.postDelayed(this::hideSplash, duration * 1000L);
                        });
                    } else {
                        handler.post(this::hideSplash);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "加载启动页广告失败", e);
                    handler.post(this::hideSplash);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "显示启动页广告失败", e);
        }
    }

    private void hideSplash() {
        splashContainer.setVisibility(View.GONE);
    }

    // ==============================
    // 弹窗广告
    // ==============================
    private void showPopupAd(JSONObject popup) {
        try {
            boolean enabled = popup.optBoolean("enabled", false);
            if (!enabled) return;

            // 检查今天是否已显示过
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
            SharedPreferences sp = getSharedPreferences("popup_ad", Context.MODE_PRIVATE);
            String lastDate = sp.getString("last_date", "");
            int showCount = sp.getInt("show_count", 0);
            int maxTimes = popup.optInt("showTimesPerDay", 1);

            if (today.equals(lastDate) && showCount >= maxTimes) {
                return; // 今天已达到最大显示次数
            }

            String imageUrl = popup.optString("imageUrl", "");
            final String linkUrl = popup.optString("linkUrl", "");
            if (imageUrl.isEmpty()) return;

            // 使用 Dialog 显示弹窗广告
            AlertDialog.Builder builder = new AlertDialog.Builder(this);
            ImageView imageView = new ImageView(this);
            imageView.setAdjustViewBounds(true);
            imageView.setScaleType(ImageView.ScaleType.FIT_CENTER);

            // 加载图片
            executor.execute(() -> {
                try {
                    URL url = new URL(imageUrl);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    InputStream is = conn.getInputStream();
                    final Bitmap bitmap = android.graphics.BitmapFactory.decodeStream(is);
                    is.close();

                    if (bitmap != null) {
                        handler.post(() -> {
                            imageView.setImageBitmap(bitmap);
                            AlertDialog dialog = builder
                                .setView(imageView)
                                .setPositiveButton("关闭", (d, w) -> d.dismiss())
                                .setCancelable(true)
                                .create();

                            // 点击图片跳转
                            if (!linkUrl.isEmpty()) {
                                imageView.setOnClickListener(v -> {
                                    dialog.dismiss();
                                    webView.loadUrl(linkUrl);
                                });
                            }

                            dialog.show();

                            // 记录显示次数
                            SharedPreferences.Editor editor = sp.edit();
                            if (!today.equals(lastDate)) {
                                editor.putString("last_date", today);
                                editor.putInt("show_count", 1);
                            } else {
                                editor.putInt("show_count", showCount + 1);
                            }
                            editor.apply();
                        });
                    }
                } catch (Exception e) {
                    Log.e(TAG, "加载弹窗广告失败", e);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "显示弹窗广告失败", e);
        }
    }

    // ==============================
    // 底部横幅广告
    // ==============================
    private void showBannerAd(JSONObject banner) {
        try {
            boolean enabled = banner.optBoolean("enabled", false);
            if (!enabled) {
                bannerContainer.setVisibility(View.GONE);
                return;
            }

            String imageUrl = banner.optString("imageUrl", "");
            final String linkUrl = banner.optString("linkUrl", "");
            if (imageUrl.isEmpty()) return;

            bannerContainer.setVisibility(View.VISIBLE);

            // 加载图片
            executor.execute(() -> {
                try {
                    URL url = new URL(imageUrl);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    InputStream is = conn.getInputStream();
                    final Bitmap bitmap = android.graphics.BitmapFactory.decodeStream(is);
                    is.close();

                    if (bitmap != null) {
                        handler.post(() -> {
                            bannerImage.setImageBitmap(bitmap);

                            // 点击跳转
                            if (!linkUrl.isEmpty()) {
                                bannerImage.setOnClickListener(v -> {
                                    webView.loadUrl(linkUrl);
                                });
                            }
                        });
                    }
                } catch (Exception e) {
                    Log.e(TAG, "加载横幅广告失败", e);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "显示横幅广告失败", e);
        }
    }

    // ==============================
    // WebView 设置
    // ==============================
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // 设置桌面版 User-Agent，强制显示电脑版网页
        String desktopUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        settings.setUserAgentString(desktopUA);

        // 强制使用桌面版 viewport，让网页以电脑模式渲染
        // 很多网站通过屏幕宽度判断是否显示手机版，设为 1280 模拟桌面屏幕
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("tel:") || url.startsWith("mailto:")) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                }
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                progressBar.setVisibility(View.VISIBLE);
                swipeRefreshLayout.setRefreshing(false);

                // 页面开始加载时尽早注入桌面 viewport
                String js = "javascript:(function(){" +
                    "var meta = document.querySelector('meta[name=\"viewport\"]');" +
                    "if(meta){meta.setAttribute('content','width=1280, initial-scale=0.4, maximum-scale=5.0, user-scalable=yes');}" +
                    "})();";
                view.evaluateJavascript(js, null);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                progressBar.setVisibility(View.GONE);
                swipeRefreshLayout.setRefreshing(false);

                // 页面加载完成后注入 JS：设置桌面 viewport + 隐藏网页自带的移动端导航栏
                String js = "javascript:(function(){" +
                    // 强制设置桌面版 viewport
                    "var meta = document.querySelector('meta[name=\"viewport\"]');" +
                    "if(meta){meta.setAttribute('content','width=1280, initial-scale=0.4, maximum-scale=5.0, user-scalable=yes');}" +
                    "else{meta=document.createElement('meta');meta.name='viewport';meta.content='width=1280, initial-scale=0.4, maximum-scale=5.0, user-scalable=yes';document.head.appendChild(meta);}" +
                    // 隐藏常见的移动端导航栏/header
                    "var selectors=['header','[class*=\"mobile-header\"]','[class*=\"navbar-mobile\"]','[class*=\"app-header\"]','[id*=\"mobile-header\"]','nav[class*=\"mobile\"]']," +
                    "els=[];" +
                    "selectors.forEach(function(s){document.querySelectorAll(s).forEach(function(e){els.push(e);});});" +
                    "els.forEach(function(e){e.style.display='none';});" +
                    // 移除 body 上的 mobile class
                    "document.body.className=document.body.className.replace(/mobile|phone/gi,'');" +
                    "document.documentElement.className=document.documentElement.className.replace(/mobile|phone/gi,'');" +
                    "})();";
                view.evaluateJavascript(js, null);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                if (newProgress == 100) {
                    progressBar.setVisibility(View.GONE);
                }
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                downloadFile(url, contentDisposition, mimetype);
            }
        });

        webView.loadUrl(appUrl);
    }

    private void setupSwipeRefresh() {
        swipeRefreshLayout.setColorSchemeResources(android.R.color.holo_blue_bright);
        swipeRefreshLayout.setOnRefreshListener(() -> {
            webView.reload();
        });
    }

    private void requestStoragePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE,
                            Manifest.permission.READ_EXTERNAL_STORAGE},
                    PERMISSION_REQUEST_CODE);
            }
        }
    }

    private void downloadFile(String url, String contentDisposition, String mimetype) {
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setMimeType(mimetype);
            request.setTitle("下载文件");

            String fileName = "download";
            if (contentDisposition != null) {
                fileName = contentDisposition.replaceFirst("attachment;\\s*filename=", "");
                fileName = fileName.replace("\"", "");
            }

            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            dm.enqueue(request);
            Toast.makeText(this, "开始下载", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "下载失败", Toast.LENGTH_SHORT).show();
        }
    }

    // ==============================
    // 返回键处理
    // ==============================
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (splashContainer.getVisibility() == View.VISIBLE) {
                // 启动页广告显示时，返回键关闭广告
                hideSplash();
                return true;
            }
            if (webView.canGoBack()) {
                webView.goBack();
                return true;
            }
            // 启用退出确认时，弹窗询问
            if (enableExitConfirm) {
                new AlertDialog.Builder(this)
                    .setTitle("退出应用")
                    .setMessage("确定要退出吗？")
                    .setPositiveButton("退出", (d, w) -> finish())
                    .setNegativeButton("取消", null)
                    .show();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (executor != null && !executor.isShutdown()) {
            executor.shutdown();
        }
        super.onDestroy();
    }
}
