import {
    clampFontSize,
    formatWordCount,
    displayNameFromPath,
    linewiseSelection,
    shouldReuseBlankTab,
    renderMarkdownSource,
} from './app-logic.mjs';
import {
    applyInsertEdit,
    createVimState,
    handleVimKey,
} from './vim-engine.mjs';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;

// ── Tab state ──────────────────────────────────────────────────────────────

let tabs = [];
let nextTabId = 1;
let activeTabId = null;

function createTabState(path = null, content = '') {
    return {
        id: nextTabId++,
        path,
        content,
        isDirty: false,
        scrollTop: 0,
        vimState: createVimState(content),
    };
}

function activeTab() {
    return tabs.find(t => t.id === activeTabId);
}

// ── Global state ───────────────────────────────────────────────────────────

const state = {
    isPreviewMode: true,
    fontSize: parseInt(localStorage.getItem('fontSize') || '15', 10),
    vimEnabled: localStorage.getItem('vimEnabled') === 'true',
    vim: createVimState(),
};

// ── DOM refs ───────────────────────────────────────────────────────────────

const editor      = document.getElementById('editor');
const preview     = document.getElementById('preview');
const tabBar      = document.getElementById('tab-bar');
const btnOpen     = document.getElementById('btn-open');
const btnSave     = document.getElementById('btn-save');
const btnToggle   = document.getElementById('btn-toggle');
const btnVim      = document.getElementById('btn-vim');
const btnTheme    = document.getElementById('btn-theme');
const filename    = document.getElementById('filename');
const unsavedDot  = document.getElementById('unsaved-dot');
const saveStatus  = document.getElementById('save-status');
const wordCountEl = document.getElementById('word-count');
const vimStatus   = document.getElementById('vim-status');

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
    const line = range.endContainer.nodeType === Node.ELEMENT_NODE
        ? range.endContainer.closest?.('[data-source-line]')
        : range.endContainer.parentElement?.closest('[data-source-line]');
    if (!line) return 0;

    const lineIndex = Number(line.dataset.sourceLine);
    const pre = range.cloneRange();
    pre.selectNodeContents(line);
    pre.setEnd(range.endContainer, range.endOffset);
    const column = pre.toString().length;
    const lineElements = Array.from(editor.querySelectorAll('[data-source-line]'));
    const before = lineElements.slice(0, lineIndex)
        .reduce((total, element) => total + (element.textContent || '').length + 1, 0);
    return before + column;
}

function setCaretOffset(offset, scroll = 'nearest') {
    const source = activeTab()?.content || '';
    const lines = source.split('\n');
    let lineIndex = 0;
    let lineStart = 0;
    while (lineIndex < lines.length - 1 && lineStart + lines[lineIndex].length < offset) {
        lineStart += lines[lineIndex].length + 1;
        lineIndex++;
    }

    const line = editor.querySelector(`[data-source-line="${lineIndex}"]`);
    if (!line) return;
    const column = Math.min(offset - lineStart, lines[lineIndex].length);
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let remaining = column;
    while (node) {
        const len = node.textContent.length;
        if (remaining <= len) {
            const range = document.createRange();
            const sel = window.getSelection();
            range.setStart(node, remaining);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            scrollCaretLine(line, scroll);
            return;
        }
        remaining -= len;
        node = walker.nextNode();
    }

    const range = document.createRange();
    const sel = window.getSelection();
    range.setStart(line, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    scrollCaretLine(line, scroll);
}

function setLinewiseSelection(anchorOffset, activeOffset, scroll = 'nearest') {
    const source = activeTab()?.content || '';
    const selection = linewiseSelection(source, anchorOffset, activeOffset);
    const startLine = source.slice(0, selection.start).split('\n').length - 1;
    const endLine = source.slice(0, selection.end).split('\n').length - 1;
    const start = editor.querySelector(`[data-source-line="${startLine}"]`);
    const end = editor.querySelector(`[data-source-line="${endLine}"]`);
    if (!start || !end) return;

    const range = document.createRange();
    const browserSelection = window.getSelection();
    range.setStart(start, 0);
    range.setEnd(end, end.childNodes.length);
    browserSelection.removeAllRanges();
    browserSelection.addRange(range);
    const activeLine = source.slice(0, activeOffset).split('\n').length - 1;
    const active = editor.querySelector(`[data-source-line="${activeLine}"]`);
    if (active) scrollCaretLine(active, scroll);
}

function scrollCaretLine(line, scroll) {
    if (scroll === 'top') {
        editor.scrollTop = 0;
    } else if (scroll === 'bottom') {
        editor.scrollTop = editor.scrollHeight;
    } else if (scroll === 'nearest') {
        line.scrollIntoView({ block: 'nearest' });
    } else if (scroll === 'center') {
        line.scrollIntoView({ block: 'center' });
    }
}

function renderEditMode(source) {
    editor.innerHTML = renderMarkdownSource(source);
}

// ── Vim keybindings ────────────────────────────────────────────────────────

function applyVimState() {
    const active = state.vimEnabled;
    btnVim.classList.toggle('active', active);
    vimStatus.classList.toggle('hidden', !active);
    vimStatus.textContent = state.isPreviewMode
        ? 'VIM READ'
        : state.vim.mode === 'command'
            ? `:${state.vim.command}`
            : state.vim.mode === 'search'
                ? `${state.vim.searchDirection > 0 ? '/' : '?'}${state.vim.search}`
            : state.vim.mode === 'visual-line'
                ? 'VIM VISUAL LINE'
            : state.vim.pending
                ? `VIM ${state.vim.mode.toUpperCase()} ${state.vim.pending}`
            : `VIM ${state.vim.mode.toUpperCase()}`;
    editor.classList.toggle('vim-normal', active && state.vim.mode === 'normal');
    editor.contentEditable = 'true';
}

function toggleVim() {
    state.vimEnabled = !state.vimEnabled;
    localStorage.setItem('vimEnabled', state.vimEnabled);
    state.vim = createVimState(activeTab()?.content || '', getCaretOffset());
    applyVimState();
    if (!state.isPreviewMode) editor.focus();
}

function syncVimDocument() {
    const tab = activeTab();
    if (!tab) return;
    if (state.vim.source !== tab.content) {
        state.vim = { ...state.vim, source: tab.content, cursor: 0, undoStack: [], redoStack: [] };
    }
    tab.vimState = state.vim;
}

async function runVimEffects(effects) {
    for (const effect of effects) {
        if (effect.type === 'clipboard-write') {
            await navigator.clipboard.writeText(effect.text)
                .catch((error) => console.error('clipboard write error:', error));
        } else if (effect.type === 'save') {
            await saveFile();
        } else if (effect.type === 'save-close') {
            if (await saveFile()) await closeTab(activeTabId);
        } else if (effect.type === 'close') {
            await closeTab(activeTabId, effect.force);
        } else if (effect.type === 'scroll') {
            if (state.vim.mode === 'visual-line') {
                setLinewiseSelection(state.vim.visualAnchor, state.vim.visualActive, effect.position);
            } else {
                setCaretOffset(state.vim.cursor, effect.position);
            }
        } else if (effect.type === 'scroll-page') {
            editor.scrollBy({
                top: editor.clientHeight * (effect.full ? 1 : 0.5) * effect.direction,
                behavior: 'smooth',
            });
        } else if (effect.type === 'viewport-cursor') {
            const visible = Array.from(editor.querySelectorAll('[data-source-line]'))
                .filter((line) => {
                    const rect = line.getBoundingClientRect();
                    const container = editor.getBoundingClientRect();
                    return rect.bottom >= container.top && rect.top <= container.bottom;
                });
            if (visible.length > 0) {
                const index = effect.position === 'h'
                    ? 0
                    : effect.position === 'l'
                        ? visible.length - 1
                        : Math.floor(visible.length / 2);
                const lineNumber = Number(visible[index].dataset.sourceLine);
                const lines = state.vim.source.split('\n');
                state.vim = {
                    ...state.vim,
                    cursor: lines.slice(0, lineNumber).reduce((total, line) => total + line.length + 1, 0),
                };
                setCaretOffset(state.vim.cursor);
            }
        } else if (effect.type === 'open-path') {
            try {
                const content = await invoke('read_file', { path: effect.path });
                applyFileInTab(effect.path, content);
            } catch (error) {
                console.error('open-path error:', error);
            }
        }
    }
}

function renderVimState(previousSource) {
    const tab = activeTab();
    if (!tab) return;
    if (state.vim.source !== previousSource) {
        tab.content = state.vim.source;
        markDirty();
        renderEditMode(tab.content);
    }
    tab.vimState = state.vim;
    applyVimState();
    if (state.vim.mode === 'visual-line') {
        setLinewiseSelection(state.vim.visualAnchor, state.vim.visualActive);
    } else if (!state.isPreviewMode) {
        setCaretOffset(state.vim.cursor, 'nearest');
    }
}

function handleVimKeydown(e) {
    if (!state.vimEnabled || state.isPreviewMode) return false;
    syncVimDocument();
    if (state.vim.mode !== 'command' && state.vim.mode !== 'search' && state.vim.mode !== 'visual-line') {
        state.vim = { ...state.vim, cursor: getCaretOffset() };
    }
    const previousSource = state.vim.source;
    const output = handleVimKey(state.vim, {
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
    });
    if (!output.handled) return false;
    e.preventDefault();
    state.vim = output.state;
    renderVimState(previousSource);
    void runVimEffects(output.effects);
    return true;
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
        btnToggle.textContent = 'Read';
        state.isPreviewMode = false;
        if (state.vimEnabled) {
            state.vim = { ...state.vim, source: activeTab()?.content || '', mode: 'normal', cursor: 0 };
        }
        applyVimState();
        editor.focus();
    } else {
        editor.classList.add('hidden');
        preview.classList.remove('hidden');
        btnToggle.textContent = 'Edit';
        state.isPreviewMode = true;
        applyVimState();
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
    state.vim = tab.vimState || createVimState(tab.content);

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

async function closeTab(id, force = false) {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    if (tab.isDirty && !force) {
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
        state.vim = next.vimState || createVimState(next.content);
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
        state.vim = newTabState.vimState;
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
    tab.vimState = createVimState(content);
    state.vim = tab.vimState;
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
    if (!tab) return false;
    if (tab.path) {
        try {
            await invoke('save_file', { path: tab.path, content: tab.content });
            markSaved();
            return true;
        } catch (e) {
            console.error('save error:', e);
            return false;
        }
    } else {
        return await saveFileAs();
    }
}

async function saveFileAs() {
    const tab = activeTab();
    if (!tab) return false;
    try {
        const newPath = await invoke('save_file_as', { content: tab.content });
        tab.path = newPath;
        filename.textContent = newPath.split('/').pop();
        localStorage.setItem('lastFilePath', newPath);
        markSaved();
        renderTabBar();
        return true;
    } catch (e) {
        if (e !== 'Save cancelled') console.error('save-as error:', e);
        return false;
    }
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
    if (handleVimKeydown(e)) return;

    const meta = e.metaKey || e.ctrlKey;
    if (e.metaKey && e.key === 'z') {
        e.preventDefault();
        const previousSource = state.vim.source;
        state.vim = e.shiftKey
            ? handleVimKey(state.vim, { key: 'r', ctrlKey: true }).state
            : handleVimKey(state.vim, { key: 'u' }).state;
        renderVimState(previousSource);
    } else if (meta && e.key === 's') {
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
listen('menu-toggle-vim',     () => toggleVim());
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
btnVim.addEventListener('click', toggleVim);
btnTheme.addEventListener('click', toggleTheme);
editor.addEventListener('beforeinput', (e) => {
    if (state.vimEnabled && state.vim.mode !== 'insert') e.preventDefault();
});
editor.addEventListener('input', () => {
    if (!state.isPreviewMode) {
        const caret = getCaretOffset();
        const text = getEditorText();
        const tab = activeTab();
        if (tab) {
            state.vim = applyInsertEdit(
                { ...state.vim, source: tab.content },
                text,
                caret,
            );
            tab.content = state.vim.source;
            tab.vimState = state.vim;
        }
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
state.vim = firstTab.vimState;
renderTabBar();
updateWordCount();
editor.classList.add('hidden');
preview.classList.remove('hidden');
btnToggle.textContent = 'Edit';
renderActiveView();
applyVimState();

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
