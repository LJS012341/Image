import os
import gradio as gr
from google import genai
from PIL import Image
import qrcode

# 1. Google Gemini API 클라이언트 설정
API_KEY = os.getenv("GEMINI_API_KEY", "//")
client = genai.Client(api_key=API_KEY)

def extract_text(image_path):
    if image_path is None:
        return "이미지를 업로드하거나 촬영해 주세요."

    try:
        image = Image.open(image_path)

        system_prompt = """
        당신은 고성능 OCR(광학 문자 인식) 시스템입니다.
        제시된 이미지 내에 존재하는 모든 텍스트(한글, 영어, 숫자, 기호, 손글씨 포함)를 정확하게 추출하여 그대로 출력하세요.

        [지침]
        1. 이미지에서 읽을 수 있는 모든 글자를 놓치지 말고 작성하세요.
        2. 원본 문맥과 줄바꿈(엔터) 구성을 최대한 유지하여 정리해 주세요.
        3. 이미지에 텍스트가 전혀 포함되어 있지 않다면 "이미지에서 인식된 텍스트가 없습니다."라고 답변하세요.
        """

        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=[image, system_prompt]
        )

        return response.text

    except Exception as e:
        return f"텍스트 추출 중 오류가 발생했습니다: {str(e)}"

# QR 코드 생성 함수
def generate_qr(url_text):
    if not url_text:
        url_text = "http://127.0.0.1:7860"
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

# 비디오 화면 좌우반전 해제 스크립트
js_camera_fix = """
function fixCameraMirror() {
    const applyFix = () => {
        const videos = document.querySelectorAll('video');
        videos.forEach(v => {
            v.style.transform = 'none';
            v.style.webkitTransform = 'none';
        });
    };
    setInterval(applyFix, 500);
}
"""

# Gradio Web UI (js 매개변수 이동 완료)
with gr.Blocks(title="Smart OCR Text Extractor") as demo:
    gr.Markdown("# 📝 스마트 OCR 글자 추출 시스템 (Smart Text Extractor)")
    gr.Markdown("문서, 간판, 책표지, 손글씨 등의 사진을 찍거나 올려주시면 이미지 속 **텍스트를 자동으로 추출**해 드립니다.")

    with gr.Row():
        with gr.Column():
            image_input = gr.Image(
                type="filepath", 
                sources=["upload", "webcam"], 
                label="터치하여 글자가 있는 이미지 촬영 또는 업로드"
            )   
            submit_btn = gr.Button("텍스트 추출하기", variant="primary")

        with gr.Column():
            # 호환성을 위해 show_copy_button 제거 및 Textbox 정상 구성
            output_text = gr.Textbox(
                label="추출된 텍스트 결과", 
                placeholder="텍스트 추출 결과가 여기에 표시됩니다.",
                lines=12
            )

    submit_btn.click(fn=extract_text, inputs=image_input, outputs=output_text)

    # QR 코드 섹션
    gr.Markdown("---")
    gr.Markdown("### 📱 모바일 접속용 QR 코드")
    qr_btn = gr.Button("모바일 QR 코드 생성하기")
    qr_output = gr.Image(label="스마트폰 카메라로 스캔하세요", interactive=False)

    def get_current_qr():
        target_url = demo.share_url if demo.share_url else "http://127.0.0.1:7860"
        return generate_qr(target_url)

    qr_btn.click(fn=get_current_qr, inputs=None, outputs=qr_output)

if __name__ == "__main__":
    # Gradio 경고 조치: js 스크립트를 launch()에 전달
    demo.launch(share=True, js=js_camera_fix)