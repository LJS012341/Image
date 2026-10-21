const KEY_NAME = 'smart-vision-gemini-key';
const MODEL = 'gemini-3.6-flash';
const PROMPT = `당신은 스마트 비전 객체 분석 전문가입니다. 제시된 이미지를 분석하여 한국어로 답변하세요.
중심 객체를 물건/제품, 동물/식물, 기타로 분류하세요.
물건/제품이면 제품명/브랜드, 예상 가격대(원화), 주요 생산지/제조국, 핵심 특징과 용도를 알려주세요.
동물/식물이면 한글명/학명, 주요 서식지/자생지, 생태적 특징, 참고사항을 알려주세요.
기타이면 식별된 주요 요소를 설명하세요. 확실하지 않은 정보는 추정임을 밝히세요.`;

const keyDialog = document.querySelector('#key-dialog');
const keyInput = document.querySelector('#key-input');
const keyError = document.querySelector('#key-error');
const cameraInput = document.querySelector('#camera-input');
const galleryInput = document.querySelector('#gallery-input');
const preview = document.querySelector('#preview');
const emptyPhoto = document.querySelector('#empty-photo');
const analyzeButton = document.querySelector('#analyze');
const resultText = document.querySelector('#result-text');
const cancelKey = document.querySelector('#cancel-key');
const installButton = document.querySelector('#install-button');
const installDialog = document.querySelector('#install-dialog');
let selectedFile = null;
let previewUrl = null;
let installPrompt = null;

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
});
window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.hidden = true;
});
installButton.hidden = window.matchMedia('(display-mode: standalone)').matches;
installButton.addEventListener('click', async () => {
    if (installPrompt) {
        await installPrompt.prompt();
        installPrompt = null;
    } else {
        installDialog.showModal();
    }
});
document.querySelector('#close-install').addEventListener('click', () => installDialog.close());

function openKeyDialog() {
    keyInput.value = '';
    keyError.hidden = true;
    cancelKey.hidden = !localStorage.getItem(KEY_NAME);
    keyDialog.showModal();
}

if (!localStorage.getItem(KEY_NAME)) openKeyDialog();
document.querySelector('#change-key').addEventListener('click', openKeyDialog);
cancelKey.addEventListener('click', () => keyDialog.close());
document.querySelector('#key-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const key = keyInput.value.trim();
    if (!key) {
        keyError.textContent = 'API 키를 입력해 주세요.';
        keyError.hidden = false;
        return;
    }
    try {
        localStorage.setItem(KEY_NAME, key);
        keyDialog.close();
    } catch {
        keyError.textContent = '키를 저장할 수 없습니다. 브라우저 저장소 설정을 확인해 주세요.';
        keyError.hidden = false;
    }
});
keyDialog.addEventListener('cancel', (event) => {
    if (!localStorage.getItem(KEY_NAME)) event.preventDefault();
});

document.querySelector('#camera-button').addEventListener('click', () => cameraInput.click());
document.querySelector('#gallery-button').addEventListener('click', () => galleryInput.click());
for (const input of [cameraInput, galleryInput]) {
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            resultText.textContent = '이미지 파일만 선택해 주세요.';
            return;
        }
        selectedFile = file;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(file);
        preview.src = previewUrl;
        preview.hidden = false;
        emptyPhoto.hidden = true;
        analyzeButton.disabled = false;
        resultText.textContent = '사진이 준비됐습니다.';
        input.value = '';
    });
}

async function imageData(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

analyzeButton.addEventListener('click', async () => {
    const key = localStorage.getItem(KEY_NAME);
    if (!key) {
        openKeyDialog();
        return;
    }
    if (!selectedFile) return;
    analyzeButton.disabled = true;
    resultText.textContent = '사진을 분석하고 있습니다...';
    try {
        const data = await imageData(selectedFile);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data } }
                    ]
                }]
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(`요청 실패 (${response.status}): ${result.error?.message || '키와 모델 권한을 확인해 주세요.'}`);
        resultText.textContent = result.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '분석 결과가 없습니다. 다른 사진으로 다시 시도해 주세요.';
    } catch (error) {
        resultText.textContent = `분석 중 오류가 발생했습니다: ${error.message}`;
    } finally {
        analyzeButton.disabled = false;
    }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');