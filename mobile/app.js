const KEY_NAME = 'smart-vision-gemini-key';
const MODEL_NAME = 'smart-vision-gemini-model';
const MODE_NAME = 'smart-vision-analysis-mode';
const HISTORY_NAME = 'smart-vision-analysis-history';
const DEFAULT_MODEL = 'gemini-3.6-flash';
const HISTORY_LIMIT = 30;
const PROMPT = `사진의 중심 대상을 동물, 물건, 음식, 글씨, 그 외 중 하나로 분류하고 한국어 JSON만 반환하세요.
JSON 형식: {"category":"animal|object|food|text|other","title":"짧은 제목","summary":"핵심 설명","details":[{"label":"항목","value":"설명"}],"recognized_text":"사진에 보이는 글씨를 줄바꿈 포함해 정확히 옮긴 내용, 글씨가 아니면 빈 문자열","confidence":"high|medium|low","uncertainty_note":"사진만으로 확인하기 어려운 점 또는 빈 문자열"}.
동물은 이름/학명, 서식지, 특징, 참고사항을 details에 넣으세요.
물건은 제품명/브랜드, 예상 가격대(원화), 생산지/제조국, 특징과 용도를 넣으세요. 사진만으로 알 수 없는 가격과 생산지는 추정이라고 표시하세요.
음식은 음식명, 주요 재료, 가능한 경우 간단한 레시피와 조리 순서를 추가하세요. 확실하지 않은 재료나 조리법은 추정이라고 표시하세요.
글씨는 읽히는 내용을 recognized_text에 최대한 원문 그대로 넣고, title과 summary에는 글의 종류나 요지를 간단히 적으세요.
confidence는 이미지에서 핵심 대상을 식별한 확실성을 기준으로 보수적으로 정하세요. 불확실한 세부 정보는 uncertainty_note에 구체적으로 적으세요.
그 외는 식별된 주요 요소와 설명을 넣으세요. 알 수 없는 내용은 추측하지 말고 불확실하다고 밝히세요. Markdown 기호나 코드 블록은 JSON 값에 넣지 마세요.`;
const MODE_INSTRUCTIONS = {
    auto: '대상을 자동으로 분류하세요.',
    animal: '동물 식별에 집중하세요. 동물이 아니면 실제 대상을 말하고 동물로 억지 분류하지 마세요.',
    object: '물건 식별에 집중하세요. 제품명, 용도, 보이는 특징을 우선하고 확인 불가한 정보는 추정으로 표시하세요.',
    food: '음식 식별에 집중하세요. 보이는 재료와 추정 재료를 구분하세요.',
    text: '이미지 속 글씨를 읽는 데 집중하세요. 원문과 줄바꿈을 최대한 유지하고 읽히지 않는 부분은 표시하세요.'
};
const CONFIDENCE_LABELS = { high: '높음', medium: '보통', low: '낮음' };

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
const menuToggle = document.querySelector('#menu-toggle');
const settingsDrawer = document.querySelector('#settings-drawer');
const drawerBackdrop = document.querySelector('#drawer-backdrop');
const modelSelect = document.querySelector('#model-select');
const modeSelect = document.querySelector('#mode-select');
const historyList = document.querySelector('#history-list');
const historyCount = document.querySelector('#history-count');
const historyStatus = document.querySelector('#history-status');
const resultActions = document.querySelector('#result-actions');
const resultActionStatus = document.querySelector('#result-action-status');
const followupPanel = document.querySelector('#followup-panel');
const followupForm = document.querySelector('#followup-form');
const followupInput = document.querySelector('#followup-input');
const conversation = document.querySelector('#conversation');
let selectedFile = null;
let previewUrl = null;
let installPrompt = null;
let currentAnalysis = null;
let currentImageData = null;
let currentHistoryId = null;
let currentConversation = [];

function readHistory() {
    try {
        const history = JSON.parse(localStorage.getItem(HISTORY_NAME) || '[]');
        return Array.isArray(history) ? history : [];
    } catch {
        return [];
    }
}

function writeHistory(history) {
    try {
        localStorage.setItem(HISTORY_NAME, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
        historyStatus.textContent = '';
        renderHistory();
        return true;
    } catch {
        historyStatus.textContent = '저장 공간이 부족해 기록을 저장하지 못했습니다.';
        return false;
    }
}

function renderHistory() {
    const history = readHistory();
    historyCount.textContent = String(history.length);
    historyList.replaceChildren();
    if (!history.length) {
        const empty = document.createElement('li');
        empty.className = 'history-empty';
        empty.textContent = '저장된 분석이 없습니다.';
        historyList.append(empty);
        return;
    }
    for (const entry of history) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.className = 'history-item';
        button.type = 'button';
        const title = document.createElement('span');
        title.textContent = entry.analysis?.title || '분석 결과';
        const date = document.createElement('time');
        date.dateTime = entry.createdAt;
        date.textContent = new Date(entry.createdAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
        button.append(title, date);
        button.addEventListener('click', () => loadHistoryEntry(entry));
        item.append(button);
        historyList.append(item);
    }
}

function saveAnalysis(analysis) {
    const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        analysis,
        conversation: []
    };
    currentHistoryId = entry.id;
    writeHistory([entry, ...readHistory()]);
}

function updateCurrentConversation() {
    const history = readHistory();
    const entry = history.find(item => item.id === currentHistoryId);
    if (!entry) return;
    entry.conversation = currentConversation;
    writeHistory(history);
}

function appendConversationMessage(role, text) {
    const message = document.createElement('p');
    message.className = `conversation-message ${role}`;
    const label = document.createElement('strong');
    label.textContent = role === 'user' ? '나' : '스마트 비전';
    const content = document.createElement('span');
    content.textContent = text;
    message.append(label, content);
    conversation.append(message);
}

function renderConversation() {
    conversation.replaceChildren();
    for (const message of currentConversation) appendConversationMessage(message.role, message.text);
}

function openDrawer() {
    settingsDrawer.classList.add('is-open');
    settingsDrawer.removeAttribute('inert');
    settingsDrawer.setAttribute('aria-hidden', 'false');
    drawerBackdrop.hidden = false;
    menuToggle.setAttribute('aria-expanded', 'true');
    menuToggle.setAttribute('aria-label', '메뉴 닫기');
    document.body.classList.add('drawer-open');
}

function closeDrawer() {
    settingsDrawer.classList.remove('is-open');
    settingsDrawer.setAttribute('inert', '');
    settingsDrawer.setAttribute('aria-hidden', 'true');
    drawerBackdrop.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', '메뉴 열기');
    document.body.classList.remove('drawer-open');
}

menuToggle.addEventListener('click', () => {
    if (settingsDrawer.classList.contains('is-open')) closeDrawer();
    else openDrawer();
});
document.querySelector('#close-menu').addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && settingsDrawer.classList.contains('is-open')) closeDrawer();
});

const storedModel = localStorage.getItem(MODEL_NAME);
if ([...modelSelect.options].some(option => option.value === storedModel)) modelSelect.value = storedModel;
else modelSelect.value = DEFAULT_MODEL;
const storedMode = localStorage.getItem(MODE_NAME);
if ([...modeSelect.options].some(option => option.value === storedMode)) modeSelect.value = storedMode;
modelSelect.addEventListener('change', () => localStorage.setItem(MODEL_NAME, modelSelect.value));
modeSelect.addEventListener('change', () => localStorage.setItem(MODE_NAME, modeSelect.value));
document.querySelector('#clear-history').addEventListener('click', () => {
    if (!readHistory().length || !window.confirm('저장된 분석 기록을 모두 삭제할까요?')) return;
    localStorage.removeItem(HISTORY_NAME);
    currentHistoryId = null;
    historyStatus.textContent = '분석 기록을 삭제했습니다.';
    renderHistory();
});

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

    const confidence = CONFIDENCE_LABELS[analysis.confidence] ? analysis.confidence : 'medium';
    const confidenceNotice = document.createElement('p');
    confidenceNotice.className = `confidence-notice confidence-${confidence}`;
    confidenceNotice.textContent = `모델 추정 확실성: ${CONFIDENCE_LABELS[confidence]}${analysis.uncertainty_note ? ` · ${analysis.uncertainty_note}` : ' · 가격, 제조국 등은 사진만으로 확인하기 어려울 수 있습니다.'}`;
    resultText.append(confidenceNotice);

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
    resultActions.hidden = false;
    followupPanel.hidden = true;
    document.querySelector('#followup-toggle').setAttribute('aria-expanded', 'false');
    renderConversation();
}

function analysisAsText(analysis = currentAnalysis) {
    if (!analysis) return '';
    const lines = [analysis.title || '분석 결과', analysis.summary || ''];
    for (const detail of analysis.details || []) {
        if (detail?.label && detail?.value) lines.push(`${detail.label}: ${detail.value}`);
    }
    if (analysis.recognized_text) lines.push(`인식한 글씨:\n${analysis.recognized_text}`);
    lines.push(`모델 추정 확실성: ${CONFIDENCE_LABELS[analysis.confidence] || '보통'}`);
    if (analysis.uncertainty_note) lines.push(`불확실한 정보: ${analysis.uncertainty_note}`);
    return lines.filter(Boolean).join('\n\n');
}

document.querySelector('#followup-toggle').addEventListener('click', event => {
    const isOpen = !followupPanel.hidden;
    followupPanel.hidden = isOpen;
    event.currentTarget.setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen) followupInput.focus();
});

document.querySelector('#share-result').addEventListener('click', async () => {
    const text = analysisAsText();
    try {
        if (navigator.share) await navigator.share({ title: currentAnalysis?.title || '스마트 비전 분석 결과', text });
        else {
            await navigator.clipboard.writeText(text);
            resultActionStatus.textContent = '공유할 결과를 클립보드에 복사했습니다.';
        }
    } catch (error) {
        if (error.name !== 'AbortError') resultActionStatus.textContent = '결과를 공유하지 못했습니다.';
    }
});

document.querySelector('#save-result').addEventListener('click', () => {
    const file = new Blob([`\ufeff${analysisAsText()}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smart-vision-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    resultActionStatus.textContent = '분석 결과를 텍스트 파일로 저장했습니다.';
});

async function requestModel(contents, generationConfig) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelSelect.value}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': localStorage.getItem(KEY_NAME) },
        body: JSON.stringify({ contents, ...(generationConfig ? { generationConfig } : {}) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`요청 실패 (${response.status}): ${result.error?.message || '키와 모델 권한을 확인해 주세요.'}`);
    return result.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim() || '';
}

followupForm.addEventListener('submit', async event => {
    event.preventDefault();
    const question = followupInput.value.trim();
    if (!question || !currentAnalysis) return;
    const submit = followupForm.querySelector('button');
    submit.disabled = true;
    currentConversation.push({ role: 'user', text: question });
    appendConversationMessage('user', question);
    followupInput.value = '';
    const previousConversation = currentConversation.slice(0, -1)
        .map(item => `${item.role === 'user' ? '사용자' : '도우미'}: ${item.text}`).join('\n');
    const parts = [{ text: `분석 결과: ${analysisAsText()}\n이전 대화: ${previousConversation}\n사용자의 질문에 한국어로 간결하고 정확하게 답하세요. 확인할 수 없는 것은 추측하지 말고 밝혀 주세요.\n질문: ${question}` }];
    if (currentImageData) parts.push({ inline_data: { mime_type: 'image/jpeg', data: currentImageData } });
    try {
        const answer = await requestModel([{ role: 'user', parts }]);
        currentConversation.push({ role: 'model', text: answer || '답변을 생성하지 못했습니다.' });
        appendConversationMessage('model', answer || '답변을 생성하지 못했습니다.');
        updateCurrentConversation();
    } catch (error) {
        const message = `질문 처리 중 오류가 발생했습니다: ${error.message}`;
        currentConversation.push({ role: 'model', text: message });
        appendConversationMessage('model', message);
    } finally {
        submit.disabled = false;
        followupInput.focus();
    }
});

function loadHistoryEntry(entry) {
    currentAnalysis = entry.analysis;
    currentImageData = null;
    currentHistoryId = entry.id;
    currentConversation = Array.isArray(entry.conversation) ? [...entry.conversation] : [];
    closeDrawer();
    renderAnalysis(currentAnalysis);
}

renderHistory();

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
document.querySelector('#change-key').addEventListener('click', () => {
    closeDrawer();
    openKeyDialog();
});
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
        currentAnalysis = null;
        currentImageData = null;
        currentHistoryId = null;
        currentConversation = [];
        resultActions.hidden = true;
        followupPanel.hidden = true;
        resultActionStatus.textContent = '';
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
        currentImageData = data;
        const responseText = await requestModel([{
            role: 'user',
            parts: [
                { text: `${PROMPT}\n분석 모드: ${MODE_INSTRUCTIONS[modeSelect.value] || MODE_INSTRUCTIONS.auto}` },
                { inline_data: { mime_type: 'image/jpeg', data } }
            ]
        }], { responseMimeType: 'application/json', temperature: 0.2 });
        const jsonText = responseText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        currentAnalysis = JSON.parse(jsonText);
        currentConversation = [];
        renderAnalysis(currentAnalysis);
        saveAnalysis(currentAnalysis);
    } catch (error) {
        analysisPanel.hidden = false;
        copyPanel.hidden = true;
        resultText.textContent = `분석 중 오류가 발생했습니다: ${error.message}`;
    } finally {
        analyzeButton.disabled = false;
    }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');