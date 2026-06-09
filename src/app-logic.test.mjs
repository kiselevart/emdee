import test from 'node:test';
import assert from 'node:assert/strict';
import {
    clampFontSize,
    countWords,
    displayNameFromPath,
    formatWordCount,
    renderMarkdownSource,
    shouldReuseBlankTab,
} from './app-logic.mjs';

test('displayNameFromPath returns a filename fallback', () => {
    assert.equal(displayNameFromPath('/Users/me/note.md'), 'note.md');
    assert.equal(displayNameFromPath(null), 'untitled.md');
});

test('countWords and formatWordCount stay consistent', () => {
    assert.equal(countWords('hello   world'), 2);
    assert.equal(formatWordCount('hello'), '1w  5c');
});

test('clampFontSize keeps the editor in range', () => {
    assert.equal(clampFontSize(4), 10);
    assert.equal(clampFontSize(18), 18);
    assert.equal(clampFontSize(99), 32);
});

test('shouldReuseBlankTab only matches an empty untitled tab', () => {
    assert.equal(shouldReuseBlankTab({ path: null, isDirty: false, content: '' }), true);
    assert.equal(shouldReuseBlankTab({ path: '/tmp/a.md', isDirty: false, content: '' }), false);
});

test('renderMarkdownSource keeps markdown markers visible', () => {
    const html = renderMarkdownSource('**bold**');
    assert.match(html, /<span class="md-marker">\*\*<\/span>/);
    assert.match(html, /<strong class="md-bold">bold<\/strong>/);
});

test('renderMarkdownSource preserves blank lines as editable blocks', () => {
    const html = renderMarkdownSource('first\n\nsecond');
    assert.match(html, /first<\/div><div class="md-line"><br><\/div><div class="md-line">second/);
});
