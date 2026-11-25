import os
from urllib.parse import urlsplit
import gradio as gr
from google import genai
from PIL import Image
import qrcode

API_KEY = ""
APP_INSTALL_URL = os.getenv("APP_INSTALL_URL", "https://ljs012341.github.io/Image/").strip()
APP_APK_URL = os.getenv("APP_APK_URL", "https://ljs012341.github.io/Image/smart-vision.apk").strip()

def analyze_image(image_path):
    if image_path is None:
        return "이미지를 업로드하거나 촬영해 주세요."

    api_key = API_KEY or os.getenv("GEMINI_API_KEY")
    if not api_key:
        return "app.py의 API_KEY에 키를 입력하거나 GEMINI_API_KEY 환경 변수를 설정해 주세요."

    try:
        image = Image.open(image_path)

        system_prompt = """
        당신은 스마트 비전 객체 분석 전문가입니다.
                이미지를 분석해 한국어 Markdown으로 답변하세요. 중심 대상을 동물, 물건, 음식, 글씨, 그 외 중 하나로 분류하고, 첫 줄에는 큰 제목으로 '1. 제목'을 표시한 뒤 분류와 핵심 정보를 간결하게 정리하세요.
                동물은 이름/학명, 서식지, 생태적 특징, 참고사항을 설명하세요.
                물건은 제품명/브랜드, 예상 가격대(원화), 생산지/제조국, 특징과 용도를 설명하세요.
                음식은 음식명, 주요 재료, 가능한 경우 간단한 레시피와 조리 순서를 추가하세요. 확실하지 않은 재료나 조리법은 추정이라고 표시하세요.
                글씨는 읽히는 내용을 원문 그대로 옮겨 적고, 글의 종류나 요지를 간단히 설명하세요.
                그 외는 식별된 요소와 설명을 적으세요. 알 수 없는 내용은 추측하지 말고 불확실하다고 밝히세요.
                제목과 항목을 깔끔하게 구성하고, 불필요하게 중첩된 제목이나 Markdown 기호를 과하게 쓰지 마세요.
        """

        with genai.Client(api_key=api_key) as client:
            response = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=[image, system_prompt]
            )

        return response.text

    except Exception as e:
        return f"분석 중 오류가 발생했습니다: {str(e)}"

def generate_qr(url_text):
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(url_text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    return img.convert('RGB')

with gr.Blocks(title="Smart Vision Info System") as demo:
    gr.Markdown("# 정보 조회 시스템")
    gr.Markdown("사진을 업로드하거나 촬영하면 **물건(가격, 생산지)** 또는 **생물(서식지, 특징)**을 자동 분류하여 맞춤 정보를 제공합니다.")

    with gr.Row():
        with gr.Column():
            image_input = gr.Image(
                type="filepath", 
                sources=["upload"],
                label="사진 선택 또는 촬영"
            )   
            submit_btn = gr.Button("정보 분석 및 조회하기", variant="primary")

        with gr.Column():
            output_text = gr.Markdown(label="분석 결과 및 정보", value="이미지를 올리고 버튼을 누르면 분석 결과가 여기에 표시됩니다.")

    submit_btn.click(fn=analyze_image, inputs=image_input, outputs=output_text)

    # QR 코드 섹션
    gr.Markdown("---")
    gr.Markdown("### 📱 모바일 접속용 QR 코드")
    qr_btn = gr.Button("접속 QR 코드 생성")
    qr_output = gr.Image(label="스마트폰 카메라로 스캔하세요", interactive=False)

    def get_current_qr():
        if not demo.share_url:
            raise gr.Error("공유 링크가 생성되지 않았습니다. 터미널의 공유 링크 상태를 확인해 주세요.")
        return generate_qr(demo.share_url)

    qr_btn.click(fn=get_current_qr, inputs=None, outputs=qr_output)

    install_btn = gr.Button("PWA 설치 QR 코드 생성")
    install_qr_output = gr.Image(label="PWA 설치 주소", interactive=False)

    def get_install_qr():
        install_url = APP_INSTALL_URL
        if not install_url.startswith("https://") or "gradio.live" in install_url:
            raise gr.Error("독립 앱을 HTTPS에 배포한 뒤 APP_INSTALL_URL에 고정 주소를 설정해 주세요.")
        return generate_qr(install_url)

    install_btn.click(fn=get_install_qr, inputs=None, outputs=install_qr_output)

    apk_btn = gr.Button("Android APK 다운로드 QR 코드 생성")
    apk_qr_output = gr.Image(label="Android APK 다운로드", interactive=False)

    def get_apk_qr():
        apk_url = APP_APK_URL
        parsed_url = urlsplit(apk_url)
        if (
            parsed_url.scheme != "https"
            or not parsed_url.netloc
            or not parsed_url.path.lower().endswith(".apk")
        ):
            raise gr.Error("서명된 APK를 HTTPS에 업로드한 뒤 APP_APK_URL에 .apk 다운로드 주소를 설정해 주세요.")
        return generate_qr(apk_url)

    apk_btn.click(fn=get_apk_qr, inputs=None, outputs=apk_qr_output)

if __name__ == "__main__":
    demo.launch(share=True)