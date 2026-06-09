import test from 'node:test';
import assert from 'node:assert/strict';
import {
    clampFontSize,
    countWords,
    deleteLineAtOffset,
    displayNameFromPath,
    endWordOffset,
    firstNonBlankOffset,
    formatWordCount,
    lineEndOffset,
    lineStartOffset,
    linewiseSelection,
    moveVerticalOffset,
    nextBlockOffset,
    nextWordOffset,
    openLineAbove,
    openLineBelow,
    previousBlockOffset,
    previousWordOffset,
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
    assert.match(html, /first<\/div><div class="md-line" data-source-line="1"><br><\/div>/);
});

test('vim motion helpers navigate source offsets', () => {
    const source = 'one two\nthree';
    assert.equal(lineStartOffset(source, 6), 0);
    assert.equal(lineEndOffset(source, 2), 7);
    assert.equal(moveVerticalOffset(source, 2, 1), 10);
    assert.equal(nextWordOffset(source, 0), 4);
    assert.equal(previousWordOffset(source, 7), 4);
    assert.equal(endWordOffset(source, 4), 6);
    assert.equal(firstNonBlankOffset('  one\n  two', 8), 8);
});

test('deleteLineAtOffset removes the current line', () => {
    assert.deepEqual(deleteLineAtOffset('one\ntwo\nthree', 5), {
        source: 'one\nthree',
        offset: 4,
    });
});

test('vim line opening inserts above and below', () => {
    assert.deepEqual(openLineBelow('one\ntwo', 1), {
        source: 'one\n\ntwo',
        offset: 4,
    });
    assert.deepEqual(openLineAbove('one\ntwo', 5), {
        source: 'one\n\ntwo',
        offset: 4,
    });
});

test('vim block motions navigate paragraph starts', () => {
    const source = 'one\ncontinued\n\nsecond\n\n\nthird';
    assert.equal(nextBlockOffset(source, 0), 15);
    assert.equal(nextBlockOffset(source, 15), 24);
    assert.equal(previousBlockOffset(source, source.length), 24);
    assert.equal(previousBlockOffset(source, 24), 15);
});

test('vim linewise selection includes complete lines', () => {
    assert.deepEqual(linewiseSelection('one\ntwo\nthree', 5, 10), {
        start: 4,
        end: 13,
        text: 'two\nthree\n',
    });
});
