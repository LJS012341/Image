const KEY_NAME = 'smart-vision-gemini-key';
const MODEL = 'gemini-3.6-flash';
const PROMPT = `사진의 중심 대상을 동물, 물건, 음식, 글씨, 그 외 중 하나로 분류하고 한국어 JSON만 반환하세요.
JSON 형식: {"category":"animal|object|food|text|other","title":"짧은 제목","summary":"핵심 설명","details":[{"label":"항목","value":"설명"}],"recognized_text":"사진에 보이는 글씨를 줄바꿈 포함해 정확히 옮긴 내용, 글씨가 아니면 빈 문자열"}.
동물은 이름/학명, 서식지, 특징, 참고사항을 details에 넣으세요.
물건은 제품명/브랜드, 예상 가격대(원화), 생산지/제조국, 특징과 용도를 넣으세요.
음식은 음식명, 주요 재료, 가능한 경우 간단한 레시피와 조리 순서를 넣으세요. 확실하지 않은 재료나 조리법은 추정이라고 표시하세요.
글씨는 읽히는 내용을 recognized_text에 최대한 원문 그대로 넣고, title과 summary에는 글의 종류나 요지를 간단히 적으세요.
그 외는 식별된 주요 요소와 설명을 넣으세요. 알 수 없는 내용은 추측하지 말고 불확실하다고 밝히세요. Markdown 기호나 코드 블록은 JSON 값에 넣지 마세요.`;

const keyDialog = document.querySelector('#key-dialog');
const keyInput = document.querySelector('#key-input');
const keyError = document.querySelector('#key-error');
const cameraInput = document.querySelector('#camera-input');
const galleryInput = document.querySelector('#gallery-input');
const preview = document.querySelector('#preview');
const emptyPhoto = document.querySelector('#empty-photo');
const analyzeButton = document.querySelector('#analyze');
const resultText = document.querySelector('#result-text');
const resultTabs = document.querySelector('#result-tabs');
const analysisTab = document.querySelector('#analysis-tab');
const copyTab = document.querySelector('#copy-tab');
const analysisPanel = document.querySelector('#analysis-panel');
const copyPanel = document.querySelector('#copy-panel');
const recognizedText = document.querySelector('#recognized-text');
const copyStatus = document.querySelector('#copy-status');
const cancelKey = document.querySelector('#cancel-key');
const installButton = document.querySelector('#install-button');
const installDialog = document.querySelector('#install-dialog');
let selectedFile = null;
let previewUrl = null;
let installPrompt = null;

function selectResultTab(copySelected) {
    analysisTab.setAttribute('aria-selected', String(!copySelected));
    copyTab.setAttribute('aria-selected', String(copySelected));
    analysisPanel.hidden = copySelected;
    copyPanel.hidden = !copySelected;
}

analysisTab.addEventListener('click', () => selectResultTab(false));
copyTab.addEventListener('click', () => selectResultTab(true));
document.querySelector('#copy-text').addEventListener('click', async () => {
    const text = recognizedText.textContent;
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const temporaryInput = document.createElement('textarea');
        temporaryInput.value = text;
        temporaryInput.style.position = 'fixed';
        temporaryInput.style.opacity = '0';
        document.body.append(temporaryInput);
        temporaryInput.select();
        document.execCommand('copy');
        temporaryInput.remove();
    }
    copyStatus.textContent = '클립보드에 복사했습니다.';
});

function renderAnalysis(analysis) {
    const categoryLabels = {
        animal: '동물',
        object: '물건',
        food: '음식',
        text: '글씨',
        other: '그 외'
    };
    const category = categoryLabels[analysis.category] ? analysis.category : 'other';
    const recognized = typeof analysis.recognized_text === 'string' ? analysis.recognized_text.trim() : '';
    resultText.replaceChildren();

    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'category-badge';
    categoryBadge.textContent = categoryLabels[category];
    resultText.append(categoryBadge);

    const heading = document.createElement('h3');
    heading.className = 'result-heading';
    heading.textContent = `1. ${analysis.title || '분석 결과'}`;
    resultText.append(heading);

    if (analysis.summary) {
        const summary = document.createElement('p');
        summary.className = 'result-summary';
        summary.textContent = analysis.summary;
        resultText.append(summary);
    }

    if (Array.isArray(analysis.details) && analysis.details.length) {
        const detailsList = document.createElement('dl');
        detailsList.className = 'detail-list';
        for (const detail of analysis.details) {
            if (!detail?.label || !detail?.value) continue;
            const row = document.createElement('div');
            row.className = 'detail-row';
            const label = document.createElement('dt');
            label.textContent = detail.label;
            const value = document.createElement('dd');
            value.textContent = detail.value;
            row.append(label, value);
            detailsList.append(row);
        }
        resultText.append(detailsList);
    }

    const hasRecognizedText = category === 'text' && recognized.length > 0;
    resultTabs.hidden = !hasRecognizedText;
    copyTab.hidden = !hasRecognizedText;
    recognizedText.textContent = recognized;
    copyStatus.textContent = '';
    selectResultTab(false);
}

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
    resultTabs.hidden = true;
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
                }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(`요청 실패 (${response.status}): ${result.error?.message || '키와 모델 권한을 확인해 주세요.'}`);
        const responseText = result.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
        const jsonText = responseText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        renderAnalysis(JSON.parse(jsonText));
    } catch (error) {
        analysisPanel.hidden = false;
        copyPanel.hidden = true;
        resultText.textContent = `분석 중 오류가 발생했습니다: ${error.message}`;
    } finally {
        analyzeButton.disabled = false;
    }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');