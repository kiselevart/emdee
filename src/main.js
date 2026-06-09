import {
    clampFontSize,
    formatWordCount,
    displayNameFromPath,
    shouldReuseBlankTab,
    renderMarkdownSource,
} from './app-logic.mjs';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;

// ── Tab state ──────────────────────────────────────────────────────────────

let tabs = [];
let nextTabId = 1;
let activeTabId = null;

function createTabState(path = null, content = '') {
    return { id: nextTabId++, path, content, isDirty: false, scrollTop: 0 };
}

function activeTab() {
    return tabs.find(t => t.id === activeTabId);
}

// ── Global state ───────────────────────────────────────────────────────────

const state = {
    isPreviewMode: true,
    fontSize: parseInt(localStorage.getItem('fontSize') || '15', 10),
};

// ── DOM refs ───────────────────────────────────────────────────────────────

const editor      = document.getElementById('editor');
const preview     = document.getElementById('preview');
const tabBar      = document.getElementById('tab-bar');
const btnOpen     = document.getElementById('btn-open');
const btnSave     = document.getElementById('btn-save');
const btnToggle   = document.getElementById('btn-toggle');
const btnTheme    = document.getElementById('btn-theme');
const filename    = document.getElementById('filename');
const unsavedDot  = document.getElementById('unsaved-dot');
const saveStatus  = document.getElementById('save-status');
const wordCountEl = document.getElementById('word-count');

// ── Theme ──────────────────────────────────────────────────────────────────

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    btnTheme.textContent = theme === 'dark' ? '☀' : '☽';
    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ── Font size ──────────────────────────────────────────────────────────────

function applyFontSize() {
    editor.style.fontSize = state.fontSize + 'px';
    preview.style.fontSize = state.fontSize + 'px';
}

function changeFontSize(delta) {
    state.fontSize = clampFontSize(state.fontSize + delta);
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
    wordCountEl.textContent = formatWordCount(activeTab()?.content || '');
}

function getEditorText() {
    return (editor.innerText || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n?/g, '\n');
}

function renderActiveView() {
    const source = activeTab()?.content || '';
    if (state.isPreviewMode) {
        preview.innerHTML = marked.parse(source);
    } else {
        renderEditMode(source);
    }
}

function getCaretOffset() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 0;
    const range = selection.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(editor);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
}

function setCaretOffset(offset) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let remaining = offset;
    while (node) {
        const len = node.textContent.length;
        if (remaining <= len) {
            const range = document.createRange();
            const sel = window.getSelection();
            range.setStart(node, remaining);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return;
        }
        remaining -= len;
        node = walker.nextNode();
    }
}

function renderEditMode(source) {
    editor.innerHTML = renderMarkdownSource(source);
}

// ── Tab bar rendering ──────────────────────────────────────────────────────

function renderTabBar() {
    tabBar.innerHTML = '';
    for (const tab of tabs) {
        const el = document.createElement('div');
        el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');

        const nameEl = document.createElement('span');
        nameEl.className = 'tab-name';
        nameEl.textContent = displayNameFromPath(tab.path);
        el.appendChild(nameEl);

        if (tab.isDirty) {
            const dot = document.createElement('span');
            dot.className = 'tab-dot';
            dot.textContent = '●';
            el.appendChild(dot);
        }

        const closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(tab.id);
        });
        el.appendChild(closeBtn);

        el.addEventListener('click', () => {
            if (tab.id !== activeTabId) activateTab(tab.id);
        });
        tabBar.appendChild(el);
    }

    const newBtn = document.createElement('button');
    newBtn.id = 'btn-new-tab';
    newBtn.title = 'New tab (⌘T)';
    newBtn.textContent = '+';
    newBtn.addEventListener('click', newTab);
    tabBar.appendChild(newBtn);
}

// ── Toolbar sync for active tab ────────────────────────────────────────────

function syncToolbar() {
    const tab = activeTab();
    if (!tab) return;
    filename.textContent = displayNameFromPath(tab.path);
    if (tab.isDirty) {
        unsavedDot.classList.remove('hidden');
    } else {
        unsavedDot.classList.add('hidden');
    }
}

// ── Mode toggle ────────────────────────────────────────────────────────────

function toggleMode() {
    if (state.isPreviewMode) {
        renderEditMode(activeTab()?.content || '');
        preview.classList.add('hidden');
        editor.classList.remove('hidden');
        editor.focus();
        btnToggle.textContent = 'Read';
        state.isPreviewMode = false;
    } else {
        editor.classList.add('hidden');
        preview.classList.remove('hidden');
        btnToggle.textContent = 'Edit';
        state.isPreviewMode = true;
        renderActiveView();
    }
}

// ── Tab switching ──────────────────────────────────────────────────────────

function activateTab(id) {
    // Persist current editor content and scroll before leaving
    const prev = activeTab();
    if (prev) {
        prev.scrollTop = editor.scrollTop;
    }

    activeTabId = id;
    const tab = activeTab();
    if (!tab) return;

    editor.scrollTop = tab.scrollTop;
    syncToolbar();
    renderTabBar();
    updateWordCount();
    renderActiveView();
    if (!state.isPreviewMode) editor.focus();
}

// ── Tab lifecycle ──────────────────────────────────────────────────────────

function newTab() {
    const tab = createTabState();
    tabs.push(tab);
    activateTab(tab.id);
}

async function closeTab(id) {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    if (tab.isDirty) {
        const name = displayNameFromPath(tab.path);
        const confirmed = await invoke('show_confirm_dialog', {
            message: `"${name}" has unsaved changes. Discard and close?`,
            title: 'Unsaved Changes',
        });
        if (!confirmed) return;
    }

    if (tabs.length === 1) {
        await getCurrentWindow().destroy();
        return;
    }

    const idx = tabs.indexOf(tab);
    tabs.splice(idx, 1);

    if (activeTabId === id) {
        const next = tabs[Math.min(idx, tabs.length - 1)];
        activeTabId = next.id;
        editor.scrollTop = next.scrollTop;
        syncToolbar();
        updateWordCount();
        renderActiveView();
    }

    renderTabBar();
}

// ── Open file in best tab ──────────────────────────────────────────────────

// Reuses current tab if it's a blank untitled clean tab; otherwise opens a new one.
function applyFileInTab(path, content) {
    const tab = activeTab();
    if (shouldReuseBlankTab(tab)) {
        // Reuse current blank tab
        applyFileContent(path, content);
    } else {
        // Open in a new tab
        const prev = activeTab();
        const newTabState = createTabState(path, content);
        tabs.push(newTabState);
        activeTabId = newTabState.id;
        editor.scrollTop = 0;
        syncToolbar();
        localStorage.setItem('lastFilePath', path);
        renderTabBar();
        updateWordCount();
        renderActiveView();
    }
}

// ── File loading ───────────────────────────────────────────────────────────

function applyFileContent(path, content) {
    const tab = activeTab();
    if (!tab) return;
    tab.path = path;
    tab.content = content;
    tab.isDirty = false;
    tab.scrollTop = 0;
    editor.scrollTop = 0;
    syncToolbar();
    localStorage.setItem('lastFilePath', path);
    renderTabBar();
    updateWordCount();
    renderActiveView();
}

async function loadFileByPath(path) {
    const content = await invoke('read_file', { path });
    applyFileContent(path, content);
}

// ── Dirty state ────────────────────────────────────────────────────────────

function markDirty() {
    const tab = activeTab();
    if (!tab) return;
    if (!tab.isDirty) {
        tab.isDirty = true;
        unsavedDot.classList.remove('hidden');
        renderTabBar();
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
    const tab = activeTab();
    if (!tab) return;
    tab.isDirty = false;
    unsavedDot.classList.add('hidden');
    showSavedIndicator();
    renderTabBar();
}

// ── Core actions ───────────────────────────────────────────────────────────

async function openFile() {
    try {
        const result = await invoke('open_file_dialog');
        applyFileInTab(result.path, result.content);
    } catch (e) {
        if (e !== 'No file selected') console.error('open error:', e);
    }
}

async function saveFile() {
    const tab = activeTab();
    if (!tab) return;
    if (tab.path) {
        try {
            await invoke('save_file', { path: tab.path, content: tab.content });
            markSaved();
        } catch (e) {
            console.error('save error:', e);
        }
    } else {
        await saveFileAs();
    }
}

async function saveFileAs() {
    const tab = activeTab();
    if (!tab) return;
    try {
        const newPath = await invoke('save_file_as', { content: tab.content });
        tab.path = newPath;
        filename.textContent = newPath.split('/').pop();
        localStorage.setItem('lastFilePath', newPath);
        markSaved();
        renderTabBar();
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
        newTab();
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
    } else if (meta && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (idx < tabs.length) activateTab(tabs[idx].id);
    }
});

// ── Menu events ────────────────────────────────────────────────────────────

listen('menu-new',            () => newTab());
listen('menu-new-tab',        () => newTab());
listen('menu-open',           () => openFile());
listen('menu-save',           () => saveFile());
listen('menu-save-as',        () => saveFileAs());
listen('menu-close-tab',      () => closeTab(activeTabId));
listen('menu-toggle-preview', () => toggleMode());
listen('menu-toggle-theme',   () => toggleTheme());
listen('menu-increase-font',  () => changeFontSize(1));
listen('menu-decrease-font',  () => changeFontSize(-1));
listen('menu-actual-size',    () => resetFontSize());

// ── Window close guard ─────────────────────────────────────────────────────

listen('tauri://close-requested', async () => {
    const dirtyTabs = tabs.filter(t => t.isDirty);
    if (dirtyTabs.length > 0) {
        const names = dirtyTabs
            .map(t => displayNameFromPath(t.path))
            .join(', ');
        const confirmed = await invoke('show_confirm_dialog', {
            message: `You have unsaved changes in: ${names}. Discard and close?`,
            title: 'Unsaved Changes',
        });
        if (!confirmed) return;
    }
    // destroy() bypasses close-requested; close() would re-fire it, causing an infinite loop.
    await getCurrentWindow().destroy();
});

// ── Drag and drop ──────────────────────────────────────────────────────────

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

listen('tauri://drag-drop', async (event) => {
    const paths = (event.payload.paths || [])
        .filter(p => p.endsWith('.md') || p.endsWith('.txt'));
    if (paths.length === 0) return;

    for (let i = 0; i < paths.length; i++) {
        try {
            const content = await invoke('read_file', { path: paths[i] });
            if (i === 0) {
                applyFileInTab(paths[i], content);
            } else {
                // Additional files always go in new tabs
                const newTabState = createTabState(paths[i], content);
                tabs.push(newTabState);
                renderTabBar();
            }
        } catch (e) {
            console.error('drag-drop error:', e);
        }
    }
});

// ── Button wiring ──────────────────────────────────────────────────────────

btnOpen.addEventListener('click', openFile);
btnSave.addEventListener('click', saveFile);
btnToggle.addEventListener('click', toggleMode);
btnTheme.addEventListener('click', toggleTheme);
editor.addEventListener('input', () => {
    if (!state.isPreviewMode) {
        const caret = getCaretOffset();
        const text = getEditorText();
        const tab = activeTab();
        if (tab) tab.content = text;
        markDirty();
        renderEditMode(text);
        setCaretOffset(caret);
    }
});

// ── Init ───────────────────────────────────────────────────────────────────

applyTheme(localStorage.getItem('theme') || 'dark');
applyFontSize();

const firstTab = createTabState();
tabs.push(firstTab);
activeTabId = firstTab.id;
renderTabBar();
updateWordCount();
editor.classList.add('hidden');
preview.classList.remove('hidden');
btnToggle.textContent = 'Edit';
renderActiveView();

// File opened while app is already running (e.g. `emdee other.md`).
listen('open-file', async (event) => {
    try {
        const content = await invoke('read_file', { path: event.payload });
        applyFileInTab(event.payload, content);
    } catch (e) { console.error(e); }
});

(async () => {
    const pendingPath = await invoke('get_pending_file');
    if (pendingPath) {
        try { await loadFileByPath(pendingPath); return; } catch {}
    }
    const lastFilePath = localStorage.getItem('lastFilePath');
    if (lastFilePath) {
        try {
            await loadFileByPath(lastFilePath);
        } catch {
            localStorage.removeItem('lastFilePath');
        }
    }
})();
