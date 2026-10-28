const KEY_NAME = 'smart-vision-gemini-key';
const MODEL_NAME = 'smart-vision-gemini-model';
const MODE_NAME = 'smart-vision-analysis-mode';
const HISTORY_NAME = 'smart-vision-analysis-history';
const HISTORY_IMAGE_DB = 'smart-vision-history-images';
const USAGE_NAME = 'smart-vision-model-usage';
const MODEL_LIMIT_NAME = 'smart-vision-model-limits';
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
const historyFilterAll = document.querySelector('#history-filter-all');
const historyFilterFavorites = document.querySelector('#history-filter-favorites');
const modelUsage = document.querySelector('#model-usage');
const modelLimit = document.querySelector('#model-limit');
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
let currentImageBlob = null;
let currentHistoryId = null;
let currentConversation = [];
let historyFilter = 'all';

function openHistoryImageDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(HISTORY_IMAGE_DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('images');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveHistoryImage(id, blob) {
    const database = await openHistoryImageDb();
    await new Promise((resolve, reject) => {
        const transaction = database.transaction('images', 'readwrite');
        transaction.objectStore('images').put(blob, id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
    database.close();
}

async function loadHistoryImage(id) {
    if (!id) return null;
    const database = await openHistoryImageDb();
    const blob = await new Promise((resolve, reject) => {
        const request = database.transaction('images').objectStore('images').get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
    database.close();
    return blob;
}

async function deleteHistoryImages(ids) {
    if (!ids.length) return;
    const database = await openHistoryImageDb();
    await new Promise((resolve, reject) => {
        const transaction = database.transaction('images', 'readwrite');
        const store = transaction.objectStore('images');
        for (const id of ids) store.delete(id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
    database.close();
}

function localDateKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function readUsage() {
    try {
        const usage = JSON.parse(localStorage.getItem(USAGE_NAME) || '{}');
        return usage.date === localDateKey() ? usage : { date: localDateKey(), counts: {} };
    } catch {
        return { date: localDateKey(), counts: {} };
    }
}

function readModelLimits() {
    try {
        return JSON.parse(localStorage.getItem(MODEL_LIMIT_NAME) || '{}');
    } catch {
        return {};
    }
}

function selectedModelLimit() {
    return Number(readModelLimits()[modelSelect.value]) || 10;
}

function renderModelUsage() {
    const usage = readUsage();
    const count = Number(usage.counts?.[modelSelect.value]) || 0;
    const limit = selectedModelLimit();
    modelUsage.textContent = `오늘 요청: ${count} / ${limit}`;
    modelLimit.value = String(limit);
}

function recordModelRequest(model) {
    const usage = readUsage();
    usage.counts[model] = (Number(usage.counts[model]) || 0) + 1;
    localStorage.setItem(USAGE_NAME, JSON.stringify(usage));
    renderModelUsage();
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

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
    const visibleHistory = historyFilter === 'favorites' ? history.filter(entry => entry.favorite) : history;
    historyCount.textContent = String(history.length);
    historyList.replaceChildren();
    if (!visibleHistory.length) {
        const empty = document.createElement('li');
        empty.className = 'history-empty';
        empty.textContent = history.length ? '즐겨찾기에 추가한 기록이 없습니다.' : '저장된 분석이 없습니다.';
        historyList.append(empty);
        return;
    }
    for (const entry of visibleHistory) {
        const item = document.createElement('li');
        item.className = 'history-row';
        const favorite = document.createElement('button');
        favorite.className = 'history-favorite';
        favorite.type = 'button';
        favorite.textContent = entry.favorite ? '★' : '☆';
        favorite.setAttribute('aria-label', entry.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가');
        favorite.setAttribute('aria-pressed', String(Boolean(entry.favorite)));
        favorite.addEventListener('click', () => {
            const updatedHistory = readHistory();
            const updatedEntry = updatedHistory.find(candidate => candidate.id === entry.id);
            if (!updatedEntry) return;
            updatedEntry.favorite = !updatedEntry.favorite;
            writeHistory(updatedHistory);
        });
        const openButton = document.createElement('button');
        openButton.className = 'history-item';
        openButton.type = 'button';
        const title = document.createElement('span');
        title.textContent = entry.analysis?.title || '분석 결과';
        const date = document.createElement('time');
        date.dateTime = entry.createdAt;
        date.textContent = new Date(entry.createdAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
        openButton.append(title, date);
        if (entry.imageId) {
            const photoLabel = document.createElement('small');
            photoLabel.textContent = '사진 포함';
            openButton.append(photoLabel);
        }
        openButton.addEventListener('click', () => loadHistoryEntry(entry));
        const removeButton = document.createElement('button');
        removeButton.className = 'history-delete';
        removeButton.type = 'button';
        removeButton.textContent = '×';
        removeButton.setAttribute('aria-label', `${title.textContent} 기록 삭제`);
        removeButton.addEventListener('click', () => deleteHistoryEntry(entry.id));
        item.append(favorite, openButton, removeButton);
        historyList.append(item);
    }
}

function deleteHistoryEntry(id) {
    const history = readHistory();
    const entry = history.find(item => item.id === id);
    if (!entry || !window.confirm(`'${entry.analysis?.title || '분석 결과'}' 기록을 삭제할까요?`)) return;
    writeHistory(history.filter(item => item.id !== id));
    if (currentHistoryId === id) currentHistoryId = null;
    if (entry.imageId) {
        deleteHistoryImages([entry.imageId]).catch(() => {
            historyStatus.textContent = '기록은 삭제했지만 사진 파일을 지우지 못했습니다.';
        });
    }
}

historyFilterAll.addEventListener('click', () => {
    historyFilter = 'all';
    historyFilterAll.setAttribute('aria-pressed', 'true');
    historyFilterFavorites.setAttribute('aria-pressed', 'false');
    renderHistory();
});
historyFilterFavorites.addEventListener('click', () => {
    historyFilter = 'favorites';
    historyFilterAll.setAttribute('aria-pressed', 'false');
    historyFilterFavorites.setAttribute('aria-pressed', 'true');
    renderHistory();
});

async function saveAnalysis(analysis) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = {
        id,
        createdAt: new Date().toISOString(),
        analysis,
        imageId: currentImageBlob ? id : null,
        conversation: []
    };
    currentHistoryId = entry.id;
    const nextHistory = [entry, ...readHistory()];
    const expiredImageIds = nextHistory.slice(HISTORY_LIMIT).map(item => item.imageId).filter(Boolean);
    writeHistory(nextHistory);
    deleteHistoryImages(expiredImageIds).catch(() => { });
    if (currentImageBlob) {
        try {
            await saveHistoryImage(entry.imageId, currentImageBlob);
        } catch {
            historyStatus.textContent = '결과는 기록했지만 사진 저장에 실패했습니다.';
        }
    }
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
modelSelect.addEventListener('change', () => {
    localStorage.setItem(MODEL_NAME, modelSelect.value);
    renderModelUsage();
});
modeSelect.addEventListener('change', () => localStorage.setItem(MODE_NAME, modeSelect.value));
modelLimit.addEventListener('change', () => {
    const limit = Math.max(1, Math.min(100000, Math.floor(Number(modelLimit.value) || 10)));
    const limits = readModelLimits();
    limits[modelSelect.value] = limit;
    localStorage.setItem(MODEL_LIMIT_NAME, JSON.stringify(limits));
    renderModelUsage();
});
document.querySelector('#clear-history').addEventListener('click', () => {
    if (!readHistory().length || !window.confirm('저장된 분석 기록을 모두 삭제할까요?')) return;
    const imageIds = readHistory().map(entry => entry.imageId).filter(Boolean);
    localStorage.removeItem(HISTORY_NAME);
    currentHistoryId = null;
    historyStatus.textContent = '분석 기록을 삭제했습니다.';
    renderHistory();
    deleteHistoryImages(imageIds).catch(() => {
        historyStatus.textContent = '기록은 삭제했지만 일부 사진을 지우지 못했습니다.';
    });
});
renderModelUsage();

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

let pdfLibraryPromise;
let pdfConstructor;
function loadPdfLibrary() {
    if (typeof pdfConstructor === 'function') return Promise.resolve(pdfConstructor);
    if (typeof window.jspdf?.jsPDF === 'function') {
        pdfConstructor = window.jspdf.jsPDF;
        return Promise.resolve(pdfConstructor);
    }
    if (pdfLibraryPromise) return pdfLibraryPromise;
    pdfLibraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/3.0.4/jspdf.umd.min.js';
        script.onload = () => {
            pdfConstructor = window.jspdf?.jsPDF;
            if (typeof pdfConstructor !== 'function') {
                pdfLibraryPromise = null;
                reject(new Error('PDF 기능을 초기화하지 못했습니다.'));
                return;
            }
            resolve(pdfConstructor);
        };
        script.onerror = () => {
            pdfLibraryPromise = null;
            reject(new Error('PDF 기능을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'));
        };
        document.head.append(script);
    });
    return pdfLibraryPromise;
}

function wrapPdfText(context, text, maxWidth) {
    const lines = [];
    for (const paragraph of text.split('\n')) {
        let line = '';
        for (const character of paragraph) {
            if (line && context.measureText(line + character).width > maxWidth) {
                lines.push(line);
                line = character;
            } else {
                line += character;
            }
        }
        lines.push(line);
    }
    return lines;
}

async function createAnalysisPdf(analysis, imageBlob) {
    const JsPDF = await loadPdfLibrary();
    const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = 1240;
    const pageHeight = 1754;
    const margin = 96;
    const contentWidth = pageWidth - margin * 2;
    let canvas;
    let context;
    let y;
    let pageCount = 0;

    const beginPage = () => {
        if (pageCount > 0) pdf.addPage();
        pageCount += 1;
        canvas = document.createElement('canvas');
        canvas.width = pageWidth;
        canvas.height = pageHeight;
        context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, pageWidth, pageHeight);
        context.fillStyle = '#17241e';
        context.textBaseline = 'top';
        y = margin;
    };

    const savePage = () => {
        const pageImage = canvas.toDataURL('image/jpeg', 0.94);
        pdf.addImage(pageImage, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    };

    beginPage();
    context.font = '700 52px sans-serif';
    const title = analysis.title || '스마트 비전 분석 결과';
    for (const line of wrapPdfText(context, title, contentWidth)) {
        context.fillText(line, margin, y);
        y += 68;
    }
    context.font = '26px sans-serif';
    context.fillStyle = '#52665a';
    context.fillText(new Date().toLocaleString('ko-KR'), margin, y + 4);
    y += 62;

    if (imageBlob) {
        const imageUrl = URL.createObjectURL(imageBlob);
        const image = new Image();
        try {
            image.src = imageUrl;
            await image.decode();
            const scale = Math.min(contentWidth / image.naturalWidth, 620 / image.naturalHeight);
            const imageWidth = image.naturalWidth * scale;
            const imageHeight = image.naturalHeight * scale;
            context.drawImage(image, (pageWidth - imageWidth) / 2, y, imageWidth, imageHeight);
            y += imageHeight + 54;
        } finally {
            URL.revokeObjectURL(imageUrl);
        }
    }

    const paragraphs = analysisAsText(analysis).split('\n\n');
    if (paragraphs[0] === title) paragraphs.shift();
    context.fillStyle = '#17241e';
    context.font = '700 34px sans-serif';
    context.fillText('분석 결과', margin, y);
    y += 54;
    context.font = '30px sans-serif';
    const lineHeight = 48;
    for (const paragraph of paragraphs.join('\n\n').split('\n')) {
        const lines = wrapPdfText(context, paragraph, contentWidth);
        for (const line of lines) {
            if (y + lineHeight > pageHeight - margin) {
                savePage();
                beginPage();
                context.font = '30px sans-serif';
            }
            if (line) context.fillText(line, margin, y);
            y += lineHeight;
        }
        y += lineHeight / 2;
    }
    savePage();

    const blob = pdf.output('blob');
    const bytes = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (new TextDecoder().decode(bytes) !== '%PDF-' || blob.size < 1000) {
        throw new Error('PDF 파일을 올바르게 생성하지 못했습니다.');
    }
    return blob;
}

document.querySelector('#save-result').addEventListener('click', async () => {
    if (!currentAnalysis) return;
    const saveButton = document.querySelector('#save-result');
    saveButton.disabled = true;
    resultActionStatus.textContent = '사진과 분석 내용을 PDF로 만들고 있습니다...';
    try {
        await loadPdfLibrary();
        const fileTitle = (currentAnalysis.title || 'analysis').replace(/[^a-zA-Z0-9가-힣_-]/g, '_').slice(0, 40);
        const filename = `smart-vision-${new Date().toISOString().slice(0, 10)}-${fileTitle}.pdf`;
        const pdfBlob = await createAnalysisPdf(currentAnalysis, currentImageBlob);

        if (window.SmartVisionNative?.savePdf) {
            const dataUrl = await blobToDataUrl(pdfBlob);
            const savedLocation = window.SmartVisionNative.savePdf(dataUrl.split(',')[1], filename);
            if (!savedLocation) throw new Error('PDF 파일을 Android 저장소에 기록하지 못했습니다.');
            resultActionStatus.textContent = `PDF를 저장했습니다: ${savedLocation}`;
        } else {
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 30000);
            resultActionStatus.textContent = '사진과 분석 내용이 포함된 PDF를 다운로드했습니다.';
        }
    } catch (error) {
        resultActionStatus.textContent = `PDF 저장 실패: ${error.message}`;
    } finally {
        saveButton.disabled = false;
    }
});

async function requestModel(contents, generationConfig) {
    const model = modelSelect.value;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': localStorage.getItem(KEY_NAME) },
        body: JSON.stringify({ contents, ...(generationConfig ? { generationConfig } : {}) })
    });
    recordModelRequest(model);
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
        if (!currentHistoryId) await saveAnalysis(currentAnalysis);
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

async function loadHistoryEntry(entry) {
    currentAnalysis = entry.analysis;
    currentHistoryId = entry.id;
    currentConversation = Array.isArray(entry.conversation) ? [...entry.conversation] : [];
    currentImageBlob = await loadHistoryImage(entry.imageId);
    currentImageData = currentImageBlob ? (await blobToDataUrl(currentImageBlob)).split(',')[1] : null;
    selectedFile = currentImageBlob;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    preview.hidden = !currentImageBlob;
    emptyPhoto.hidden = Boolean(currentImageBlob);
    if (currentImageBlob) {
        previewUrl = URL.createObjectURL(currentImageBlob);
        preview.src = previewUrl;
    }
    analyzeButton.disabled = !currentImageBlob;
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
        currentImageBlob = null;
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
    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('사진을 변환하지 못했습니다.')), 'image/jpeg', 0.85);
    });
    return { data: (await blobToDataUrl(blob)).split(',')[1], blob };
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
        const image = await imageData(selectedFile);
        currentImageData = image.data;
        currentImageBlob = image.blob;
        const responseText = await requestModel([{
            role: 'user',
            parts: [
                { text: `${PROMPT}\n분석 모드: ${MODE_INSTRUCTIONS[modeSelect.value] || MODE_INSTRUCTIONS.auto}` },
                { inline_data: { mime_type: 'image/jpeg', data: image.data } }
            ]
        }], { responseMimeType: 'application/json', temperature: 0.2 });
        const jsonText = responseText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        currentAnalysis = JSON.parse(jsonText);
        currentConversation = [];
        renderAnalysis(currentAnalysis);
        await saveAnalysis(currentAnalysis);
    } catch (error) {
        analysisPanel.hidden = false;
        copyPanel.hidden = true;
        resultText.textContent = `분석 중 오류가 발생했습니다: ${error.message}`;
    } finally {
        analyzeButton.disabled = false;
    }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');