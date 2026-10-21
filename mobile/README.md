# 스마트 비전 모바일 앱 설치

`mobile` 폴더는 Gradio/Python 서버 없이 작동하는 PWA입니다. Android APK는 이 PWA를 HTTPS로 여는 WebView 앱입니다. 이미지 분석에는 인터넷 연결과 사용자의 Gemini API 키가 필요합니다.

## GitHub Pages 배포

1. `D:\Image`의 파일을 GitHub 저장소에 올리고 `main` 또는 `master` 브랜치에 push합니다. `.github/workflows/publish-mobile.yml`이 PWA와 테스트용 APK를 함께 빌드합니다.
2. GitHub 저장소의 **Settings > Pages > Build and deployment**에서 Source를 **GitHub Actions**로 설정합니다.
3. Actions의 `Publish mobile app and Android APK` 실행이 성공하면 아래 주소에서 앱과 APK를 받을 수 있습니다. `<owner>`와 `<repo>`는 GitHub 계정명과 저장소명으로 바꿉니다.

	- PWA: `https://<owner>.github.io/<repo>/`
	- Android APK: `https://<owner>.github.io/<repo>/smart-vision.apk`

## 설치 및 QR 코드

Android에서는 APK 주소를 열어 다운로드한 뒤 설치를 진행합니다. 브라우저가 요청하면 해당 출처의 앱 설치를 허용해야 할 수 있습니다. 이 workflow의 APK는 테스트용 debug 서명입니다. 재빌드 후 앱을 업데이트하거나 Google Play에 배포하려면 직접 관리하는 고정 서명 키와 release 빌드 설정이 필요합니다.

기존 Gradio 앱의 QR 코드를 사용하려면 실행 PowerShell에서 주소를 설정합니다.

```powershell
$env:APP_INSTALL_URL = 'https://<owner>.github.io/<repo>/'
$env:APP_APK_URL = 'https://<owner>.github.io/<repo>/smart-vision.apk'
python D:\Image\app.py
```

PWA 주소의 QR은 브라우저 앱을 열고, APK QR은 APK 다운로드를 시작합니다. `접속 QR`은 임시 Gradio 공유 주소이므로 PC가 꺼지면 사용할 수 없습니다.

PWA를 처음 열면 Gemini API 키를 입력합니다. 키는 해당 기기의 브라우저 저장소에 보관되며 사용자가 개발자 도구를 통해 읽을 수 있습니다. 공용 기기에서 사용하지 말고, 높은 보안이 필요한 용도에는 별도 인증 백엔드를 사용하세요. HTTPS 배포 앱은 PC 서버가 꺼져도 열리지만 오프라인 이미지 분석은 지원하지 않습니다.