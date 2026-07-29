package com.webview.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.view.KeyEvent;
import android.webkit.DownloadListener;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "WebViewApp";
    private static final int PERMISSION_REQUEST_CODE = 1001;

    // 视图
    private WebView webView;
    private ProgressBar progressBar;

    // 打包时硬编码的用户网址（后台可后续修改此地址）
    private String appUrl = "https://example.com";

    // 网页缩放比例（后台可配置，默认 1.0 即自适应）
    private String webScale = "1.0";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        initViews();
        setupWebView();
        requestStoragePermission();
    }

    private void initViews() {
        progressBar = findViewById(R.id.progress_bar);
        webView = findViewById(R.id.web_view);
    }

    // ==============================
    // 样式应用
    // ==============================
    // 注入自适应 viewport
    // 当 webScale=1.0 时使用标准自适应（width=device-width）
    // 当 webScale<1.0 时缩小显示（initial-scale < 1，可看到更多内容）
    // 当 webScale>1.0 时放大显示
    private void injectAdaptiveViewport() {
        if (webView == null) return;
        float scale = 1.0f;
        try {
            scale = Float.parseFloat(webScale);
        } catch (Exception e) {
            scale = 1.0f;
        }

        String viewportContent;
        if (scale >= 0.99f && scale <= 1.01f) {
            // 标准自适应：网页根据屏幕宽度自动适配
            viewportContent = "width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes";
        } else {
            // 自定义缩放：width=device-width + initial-scale 调整大小
            viewportContent = "width=device-width, initial-scale=" + webScale + ", maximum-scale=5.0, user-scalable=yes";
        }

        String js = "javascript:(function(){" +
            "var content='" + viewportContent + "';" +
            "var meta=document.querySelector('meta[name=\"viewport\"]');" +
            "if(meta){meta.setAttribute('content',content);}" +
            "else{meta=document.createElement('meta');meta.name='viewport';meta.content=content;document.head.appendChild(meta);}" +
            "})();";
        webView.evaluateJavascript(js, null);
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

        // 自适应模式：使用默认 User-Agent，让网页根据屏幕自动适配
        // 不再强制桌面版 UA，网页会自动选择手机版或桌面版

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

                // 页面开始加载时注入自适应 viewport
                injectAdaptiveViewport();
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                super.onPageCommitVisible(view, url);
                // 页面可见时注入 viewport
                injectAdaptiveViewport();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                progressBar.setVisibility(View.GONE);

                // 页面加载完成后注入 viewport
                injectAdaptiveViewport();

                // 延迟再次注入，防止某些网站异步修改 viewport
                view.postDelayed(() -> {
                    if (view != null) {
                        injectAdaptiveViewport();
                    }
                }, 500);
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
            if (webView.canGoBack()) {
                webView.goBack();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
    }
}
