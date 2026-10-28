package kr.co.smartvision.mobile;

import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

public class MainActivity extends ComponentActivity {
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraImageUri;
    private ActivityResultLauncher<Intent> filePickerLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        filePickerLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(), result -> {
                    Uri[] selectedUris = null;
                    if (result.getResultCode() == RESULT_OK) {
                        Intent data = result.getData();
                        if (data != null && data.getData() != null) {
                            selectedUris = new Uri[] { data.getData() };
                        } else if (cameraImageUri != null) {
                            selectedUris = new Uri[] { cameraImageUri };
                        }
                    }
                    if (filePathCallback != null) {
                        filePathCallback.onReceiveValue(selectedUris);
                        filePathCallback = null;
                    }
                    cameraImageUri = null;
                });

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        webView.addJavascriptInterface(new SmartVisionBridge(), "SmartVisionNative");
        setContentView(webView);

        Uri appUri = Uri.parse(BuildConfig.APP_URL);
        String appHost = appUri.getHost();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                if ("https".equals(target.getScheme()) && appHost != null && appHost.equals(target.getHost())) {
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, target));
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                Intent galleryIntent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                galleryIntent.addCategory(Intent.CATEGORY_OPENABLE);
                galleryIntent.setType("image/*");
                Intent chooser = Intent.createChooser(galleryIntent, "사진 선택");

                Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                if (cameraIntent.resolveActivity(getPackageManager()) != null) {
                    try {
                        File photoDirectory = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
                        if (photoDirectory == null) {
                            throw new IOException("사진 저장 폴더를 사용할 수 없습니다.");
                        }
                        File photoFile = File.createTempFile("smart-vision-", ".jpg", photoDirectory);
                        cameraImageUri = FileProvider.getUriForFile(
                                MainActivity.this,
                                getPackageName() + ".fileprovider",
                                photoFile);
                        cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
                        cameraIntent.setClipData(ClipData.newUri(getContentResolver(), "사진", cameraImageUri));
                        cameraIntent.addFlags(
                                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { cameraIntent });
                    } catch (IOException exception) {
                        cameraImageUri = null;
                    }
                }

                filePickerLauncher.launch(chooser);
                return true;
            }
        });
        webView.loadUrl(BuildConfig.APP_URL);
    }

    private final class SmartVisionBridge {
        @JavascriptInterface
        public void shareUrl(String url) {
            if (url == null || !url.startsWith("https://")) {
                return;
            }
            runOnUiThread(() -> {
                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType("text/plain");
                shareIntent.putExtra(Intent.EXTRA_TEXT, url);
                startActivity(Intent.createChooser(shareIntent, "분석 결과 링크 공유"));
            });
        }

        @JavascriptInterface
        public String savePdf(String encodedPdf, String filename) {
            if (encodedPdf == null || filename == null || !filename.endsWith(".pdf")) {
                return "";
            }
            String safeFilename = filename.replaceAll("[^A-Za-z0-9._-]", "_");
            try {
                byte[] pdfBytes = Base64.decode(encodedPdf, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safeFilename);
                    values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Smart Vision");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri fileUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (fileUri == null) {
                        return "";
                    }
                    try (OutputStream outputStream = getContentResolver().openOutputStream(fileUri)) {
                        if (outputStream == null) {
                            getContentResolver().delete(fileUri, null, null);
                            return "";
                        }
                        outputStream.write(pdfBytes);
                    }
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(fileUri, values, null, null);
                    return "Downloads/Smart Vision/" + safeFilename;
                }

                File downloads = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (downloads == null) {
                    return "";
                }
                File pdfFile = new File(downloads, safeFilename);
                try (FileOutputStream outputStream = new FileOutputStream(pdfFile)) {
                    outputStream.write(pdfBytes);
                }
                return pdfFile.getAbsolutePath();
            } catch (IOException | IllegalArgumentException exception) {
                return "";
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}