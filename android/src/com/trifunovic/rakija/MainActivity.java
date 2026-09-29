package com.trifunovic.rakija;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;

/**
 * Prikazuje web aplikaciju RakiJA iz fajlova u samom APK-u (assets/www).
 * Fajlovi se serviraju sa https://appassets.androidplatform.net (adresa koju
 * Android rezerviše za ovu namjenu), pa localStorage i istorija rade kao na webu.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";

    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        // Dok se stranica učitava vidi se pozadina teme, a ne bijeli ekran.
        web.setBackgroundColor(0);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        // app.js po ovome zna da radi unutar APK-a.
        s.setUserAgentString(s.getUserAgentString() + " RakiJA-Android");

        // Bez WebChromeClient-a WebView ne prikazuje JS dijaloge (confirm).
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return serveAsset(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return openExternally(req.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternally(Uri.parse(url));
            }
        });

        setContentView(web);
        if (state == null || web.restoreState(state) == null) web.loadUrl(START_URL);
    }

    private WebResourceResponse serveAsset(Uri uri) {
        if (!HOST.equals(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || path.equals("/")) path = "/index.html";
        try {
            return new WebResourceResponse(mimeType(path), "UTF-8", getAssets().open("www" + path));
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
        }
    }

    private static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".webmanifest")) return "application/manifest+json";
        return "application/octet-stream";
    }

    // Linkovi ka drugim sajtovima (npr. uputstvo) otvaraju se u pregledaču.
    private boolean openExternally(Uri uri) {
        if (HOST.equals(uri.getHost())) return false;
        String scheme = uri.getScheme();
        if ("http".equals(scheme) || "https".equals(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
                // nema pregledača — ništa
            }
            return true;
        }
        return false;
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
