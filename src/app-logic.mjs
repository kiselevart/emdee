export function displayNameFromPath(path) {
    if (!path) return 'untitled.md';
    return path.split('/').pop() || 'untitled.md';
}

export function countWords(text) {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function formatWordCount(text) {
    return `${countWords(text)}w  ${text.length}c`;
}

export function clampFontSize(size) {
    return Math.max(10, Math.min(32, size));
}

export function shouldReuseBlankTab(tab) {
    return !!tab && !tab.path && !tab.isDirty && tab.content === '';
}

export function escapeHtml(text) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function renderInlineMarkdown(source) {
    const escaped = escapeHtml(source);
    return escaped
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="md-marker">[</span><a href="$2" class="md-link">$1</a><span class="md-marker">](</span><span class="md-url">$2</span><span class="md-marker">)</span>')
        .replace(/`([^`]+)`/g, '<span class="md-marker">`</span><code class="md-inline-code">$1</code><span class="md-marker">`</span>')
        .replace(/\*\*([^*]+)\*\*/g, '<span class="md-marker">**</span><strong class="md-bold">$1</strong><span class="md-marker">**</span>')
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<span class="md-marker">*</span><em class="md-italic">$1</em><span class="md-marker">*</span>');
}

export function renderMarkdownSource(source) {
    const lines = source.split('\n');
    return lines.map((line) => {
        if (line === '') {
            return '<div class="md-line"><br></div>';
        }
        if (/^#{1,6}\s+/.test(line)) {
            const level = line.match(/^#+/)[0].length;
            const text = line.replace(/^#{1,6}\s+/, '');
            return `<div class="md-heading md-h${level}"><span class="md-marker">${'#'.repeat(level)} </span>${renderInlineMarkdown(text)}</div>`;
        }
        if (/^[-*+]\s+/.test(line)) {
            const text = line.replace(/^[-*+]\s+/, '');
            return `<div class="md-list"><span class="md-marker">- </span>${renderInlineMarkdown(text)}</div>`;
        }
        return `<div class="md-line">${renderInlineMarkdown(line)}</div>`;
    }).join('');
}
