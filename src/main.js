const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;

const state = {
    currentPath: null,
    isPreviewMode: false,
    isDirty: false,
    fontSize: parseInt(localStorage.getItem('fontSize') || '15', 10),
};

const editor      = document.getElementById('editor');
const preview     = document.getElementById('preview');
const btnOpen     = document.getElementById('btn-open');
const btnSave     = document.getElementById('btn-save');
const btnToggle   = document.getElementById('btn-toggle');
const filename    = document.getElementById('filename');
const unsavedDot  = document.getElementById('unsaved-dot');
const saveStatus  = document.getElementById('save-status');
const wordCountEl = document.getElementById('word-count');

// ── Font size ──────────────────────────────────────────────────────────────

function applyFontSize() {
    editor.style.fontSize = state.fontSize + 'px';
    preview.style.fontSize = state.fontSize + 'px';
}

function changeFontSize(delta) {
    state.fontSize = Math.max(10, Math.min(32, state.fontSize + delta));
    localStorage.setItem('fontSize', state.fontSize);
    applyFontSize();
}

function resetFontSize() {
    state.fontSize = 15;
    localStorage.setItem('fontSize', state.fontSize);
    applyFontSize();
}

// ── Word count ─────────────────────────────────────────────────────────────

function updateWordCount() {
    const text = editor.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    wordCountEl.textContent = words + 'w  ' + text.length + 'c';
}

// ── Mode toggle ────────────────────────────────────────────────────────────

function toggleMode() {
    if (state.isPreviewMode) {
        preview.classList.add('hidden');
        editor.classList.remove('hidden');
        editor.focus();
        btnToggle.textContent = 'Preview';
        state.isPreviewMode = false;
    } else {
        preview.innerHTML = marked.parse(editor.value);
        editor.classList.add('hidden');
        preview.classList.remove('hidden');
        btnToggle.textContent = 'Edit';
        state.isPreviewMode = true;
    }
}

// ── File loading ───────────────────────────────────────────────────────────

function applyFileContent(path, content) {
    editor.value = content;
    state.currentPath = path;
    state.isDirty = false;
    filename.textContent = path.split('/').pop();
    unsavedDot.classList.add('hidden');
    localStorage.setItem('lastFilePath', path);
    updateWordCount();
    if (state.isPreviewMode) toggleMode();
}

async function loadFileByPath(path) {
    const content = await invoke('read_file', { path });
    applyFileContent(path, content);
}

// ── Dirty state ────────────────────────────────────────────────────────────

function markDirty() {
    if (!state.isDirty) {
        state.isDirty = true;
        unsavedDot.classList.remove('hidden');
    }
    updateWordCount();
}

// ── Saved indicator ────────────────────────────────────────────────────────

let saveStatusTimer = null;

function showSavedIndicator() {
    saveStatus.classList.remove('hidden', 'fading');
    if (saveStatusTimer) clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(() => {
        saveStatus.classList.add('fading');
        saveStatusTimer = setTimeout(() => saveStatus.classList.add('hidden'), 400);
    }, 1600);
}

function markSaved() {
    state.isDirty = false;
    unsavedDot.classList.add('hidden');
    showSavedIndicator();
}

// ── Confirm helper ─────────────────────────────────────────────────────────

async function confirmUnsaved(action) {
    return invoke('show_confirm_dialog', {
        message: 'You have unsaved changes. Discard and ' + action + '?',
        title: 'Unsaved Changes',
    });
}

// ── Core actions ───────────────────────────────────────────────────────────

async function newFile() {
    if (state.isDirty && !(await confirmUnsaved('create a new file'))) return;
    editor.value = '';
    state.currentPath = null;
    state.isDirty = false;
    filename.textContent = 'untitled.md';
    unsavedDot.classList.add('hidden');
    updateWordCount();
    if (state.isPreviewMode) toggleMode();
    editor.focus();
}

async function openFile() {
    if (state.isDirty && !(await confirmUnsaved('open another file'))) return;
    try {
        const result = await invoke('open_file_dialog');
        applyFileContent(result.path, result.content);
    } catch (e) {
        if (e !== 'No file selected') console.error('open error:', e);
    }
}

async function saveFile() {
    const content = editor.value;
    if (state.currentPath) {
        try {
            await invoke('save_file', { path: state.currentPath, content });
            markSaved();
        } catch (e) {
            console.error('save error:', e);
        }
    } else {
        await saveFileAs();
    }
}

async function saveFileAs() {
    const content = editor.value;
    try {
        const newPath = await invoke('save_file_as', { content });
        state.currentPath = newPath;
        filename.textContent = newPath.split('/').pop();
        localStorage.setItem('lastFilePath', newPath);
        markSaved();
    } catch (e) {
        if (e !== 'Save cancelled') console.error('save-as error:', e);
    }
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key === 's') {
        e.preventDefault();
        e.shiftKey ? saveFileAs() : saveFile();
    } else if (meta && e.key === 'o') {
        e.preventDefault();
        openFile();
    } else if (meta && e.key === 'n') {
        e.preventDefault();
        newFile();
    } else if (meta && e.key === 'e') {
        e.preventDefault();
        toggleMode();
    } else if (e.key === 'Escape' && state.isPreviewMode) {
        toggleMode();
    } else if (meta && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        changeFontSize(1);
    } else if (meta && e.key === '-') {
        e.preventDefault();
        changeFontSize(-1);
    } else if (meta && e.key === '0') {
        e.preventDefault();
        resetFontSize();
    }
});

// ── Menu events ────────────────────────────────────────────────────────────

listen('menu-new',            () => newFile());
listen('menu-open',           () => openFile());
listen('menu-save',           () => saveFile());
listen('menu-save-as',        () => saveFileAs());
listen('menu-toggle-preview', () => toggleMode());
listen('menu-increase-font',  () => changeFontSize(1));
listen('menu-decrease-font',  () => changeFontSize(-1));
listen('menu-actual-size',    () => resetFontSize());

// ── Window close guard ─────────────────────────────────────────────────────

listen('tauri://close-requested', async () => {
    if (state.isDirty) {
        const confirmed = await invoke('show_confirm_dialog', {
            message: 'You have unsaved changes. Discard and close?',
            title: 'Unsaved Changes',
        });
        if (!confirmed) return;
    }
    await getCurrentWindow().close();
});

// ── Drag and drop ──────────────────────────────────────────────────────────

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

listen('tauri://drag-drop', async (event) => {
    const paths = event.payload.paths;
    if (!paths || paths.length === 0) return;
    const path = paths[0];
    if (!path.endsWith('.md') && !path.endsWith('.txt')) return;
    if (state.isDirty && !(await confirmUnsaved('open the dropped file'))) return;
    try {
        await loadFileByPath(path);
    } catch (e) {
        console.error('drag-drop error:', e);
    }
});

// ── Button wiring ──────────────────────────────────────────────────────────

btnOpen.addEventListener('click', openFile);
btnSave.addEventListener('click', saveFile);
btnToggle.addEventListener('click', toggleMode);
editor.addEventListener('input', markDirty);

// ── Init ───────────────────────────────────────────────────────────────────

applyFontSize();
updateWordCount();

(async () => {
    const lastFilePath = localStorage.getItem('lastFilePath');
    if (lastFilePath) {
        try {
            await loadFileByPath(lastFilePath);
        } catch {
            localStorage.removeItem('lastFilePath');
        }
    }
})();
