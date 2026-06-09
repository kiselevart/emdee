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

export function lineStartOffset(source, offset) {
    return source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
}

export function lineEndOffset(source, offset) {
    const end = source.indexOf('\n', offset);
    return end === -1 ? source.length : end;
}

export function moveVerticalOffset(source, offset, delta) {
    const lines = source.split('\n');
    const before = source.slice(0, offset).split('\n');
    const currentLine = before.length - 1;
    const column = before.at(-1).length;
    const targetLine = Math.max(0, Math.min(lines.length - 1, currentLine + delta));
    const targetColumn = Math.min(column, lines[targetLine].length);
    return lines.slice(0, targetLine).reduce((total, line) => total + line.length + 1, 0)
        + targetColumn;
}

export function nextWordOffset(source, offset) {
    let position = Math.min(source.length, offset);
    while (position < source.length && /\w/.test(source[position])) position++;
    while (position < source.length && !/\w/.test(source[position])) position++;
    return position;
}

export function previousWordOffset(source, offset) {
    let position = Math.max(0, offset - 1);
    while (position > 0 && !/\w/.test(source[position])) position--;
    while (position > 0 && /\w/.test(source[position - 1])) position--;
    return position;
}

export function endWordOffset(source, offset) {
    let position = Math.min(source.length, offset);
    if (position < source.length && !/\w/.test(source[position])) {
        while (position < source.length && !/\w/.test(source[position])) position++;
    }
    while (position < source.length - 1 && /\w/.test(source[position + 1])) position++;
    return position;
}

export function firstNonBlankOffset(source, offset) {
    const start = lineStartOffset(source, offset);
    const match = source.slice(start, lineEndOffset(source, offset)).match(/\S/);
    return match ? start + match.index : start;
}

export function openLineBelow(source, offset) {
    const end = lineEndOffset(source, offset);
    const insertAt = end < source.length ? end + 1 : source.length;
    return {
        source: source.slice(0, insertAt) + '\n' + source.slice(insertAt),
        offset: insertAt,
    };
}

export function openLineAbove(source, offset) {
    const start = lineStartOffset(source, offset);
    return {
        source: source.slice(0, start) + '\n' + source.slice(start),
        offset: start,
    };
}

export function nextBlockOffset(source, offset) {
    const match = source.slice(offset).match(/\n[ \t]*\n+[ \t]*(?=\S)/);
    return match ? offset + match.index + match[0].length : source.length;
}

export function previousBlockOffset(source, offset) {
    const prefix = source.slice(0, offset);
    const matches = [...prefix.matchAll(/\n[ \t]*\n+[ \t]*(?=\S)/g)];
    if (matches.length === 0) return 0;
    const match = matches.at(-1);
    return match.index + match[0].length;
}

export function linewiseSelection(source, anchorOffset, activeOffset) {
    const startOffset = Math.min(anchorOffset, activeOffset);
    const endOffset = Math.max(anchorOffset, activeOffset);
    const start = lineStartOffset(source, startOffset);
    const end = lineEndOffset(source, endOffset);
    return {
        start,
        end,
        text: source.slice(start, end) + '\n',
    };
}

export function deleteLineAtOffset(source, offset) {
    const start = lineStartOffset(source, offset);
    const end = lineEndOffset(source, offset);
    if (end < source.length) {
        return { source: source.slice(0, start) + source.slice(end + 1), offset: start };
    }
    if (start > 0) {
        return { source: source.slice(0, start - 1), offset: start - 1 };
    }
    return { source: '', offset: 0 };
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
    return lines.map((line, index) => {
        if (line === '') {
            return `<div class="md-line" data-source-line="${index}"><br></div>`;
        }
        if (/^#{1,6}\s+/.test(line)) {
            const level = line.match(/^#+/)[0].length;
            const text = line.replace(/^#{1,6}\s+/, '');
            return `<div class="md-heading md-h${level}" data-source-line="${index}"><span class="md-marker">${'#'.repeat(level)} </span>${renderInlineMarkdown(text)}</div>`;
        }
        if (/^[-*+]\s+/.test(line)) {
            const marker = line.slice(0, 2);
            const text = line.replace(/^[-*+]\s+/, '');
            return `<div class="md-list" data-source-line="${index}"><span class="md-marker">${marker}</span>${renderInlineMarkdown(text)}</div>`;
        }
        return `<div class="md-line" data-source-line="${index}">${renderInlineMarkdown(line)}</div>`;
    }).join('');
}
