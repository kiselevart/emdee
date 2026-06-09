import test from 'node:test';
import assert from 'node:assert/strict';
import { applyInsertEdit, createVimState, handleVimKey } from './vim-engine.mjs';

function keys(sequence, initial = createVimState('one two\nthree', 0)) {
    let state = initial;
    let effects = [];
    for (const key of sequence) {
        const result = handleVimKey(state, typeof key === 'string' ? { key } : key);
        state = result.state;
        effects = effects.concat(result.effects);
    }
    return { state, effects };
}

test('normal motions and jumps are deterministic', () => {
    assert.equal(keys(['w']).state.cursor, 4);
    assert.equal(keys(['G']).state.cursor, 13);
    assert.deepEqual(keys(['g', 'g']).effects, [{ type: 'scroll', position: 'top' }]);
    assert.deepEqual(keys(['z', 'z']).effects, [{ type: 'scroll', position: 'center' }]);
});

test('operators compose with motions', () => {
    assert.equal(keys(['d', 'w']).state.source, 'two\nthree');
    assert.equal(keys(['c', '$']).state.mode, 'insert');
    assert.equal(keys(['d', 'd']).state.source, 'three');
});

test('line yank and paste use the register', () => {
    const output = keys(['y', 'y']);
    const yanked = output.state;
    assert.equal(yanked.register, 'one two\n');
    assert.deepEqual(output.effects, [{ type: 'clipboard-write', text: 'one two\n' }]);
    assert.equal(handleVimKey(yanked, { key: 'p' }).state.source, 'one two\none two\nthree');
    assert.equal(keys(['y', 'w']).state.register, 'one ');
});

test('editing commands participate in undo and redo', () => {
    const deleted = keys(['x']).state;
    assert.equal(deleted.source, 'ne two\nthree');
    const undone = handleVimKey(deleted, { key: 'u' }).state;
    assert.equal(undone.source, 'one two\nthree');
    const redone = handleVimKey(undone, { key: 'r', ctrlKey: true }).state;
    assert.equal(redone.source, 'ne two\nthree');
});

test('insert edits are added to engine history', () => {
    const inserted = applyInsertEdit(createVimState('one', 1), 'otne', 2);
    assert.equal(handleVimKey({ ...inserted, mode: 'normal' }, { key: 'u' }).state.source, 'one');
});

test('visual line supports motions and edit operations', () => {
    const visual = keys(['V', 'j', 'y']).state;
    assert.equal(visual.register, 'one two\nthree\n');
    assert.equal(visual.mode, 'normal');
    assert.equal(keys(['V', 'j', 'd']).state.source, '');
});

test('search and ex commands emit effects', () => {
    const searched = keys(['/', 't', 'h', 'r', 'e', 'e', 'Enter']).state;
    assert.equal(searched.cursor, 8);
    assert.deepEqual(keys([':', 'w', 'q', 'Enter']).effects, [{ type: 'save-close' }]);
    assert.deepEqual(keys([':', 'q', '!', 'Enter']).effects, [{ type: 'close', force: true }]);
    assert.deepEqual(keys([':', 'e', ' ', '/', 't', 'm', 'p', '/', 'x', 'Enter']).effects, [{ type: 'open-path', path: '/tmp/x' }]);
});

test('common edit commands transform source', () => {
    assert.equal(keys(['D']).state.source, '\nthree');
    assert.equal(keys(['J']).state.source, 'one two three');
    assert.equal(keys(['~']).state.source, 'One two\nthree');
    assert.equal(keys(['o']).state.mode, 'insert');
});

test('dot repeats common editing commands and modifiers pass through', () => {
    assert.equal(keys(['x', '.']).state.source, 'e two\nthree');
    assert.equal(handleVimKey(createVimState('one'), { key: 's', metaKey: true }).handled, false);
});

test('character find, matching bracket, and numbers work', () => {
    const findState = createVimState('abc def abc', 0);
    assert.equal(keys(['f', 'd'], findState).state.cursor, 4);
    assert.equal(keys(['%'], createVimState('(x)', 0)).state.cursor, 2);
    assert.equal(keys([{ key: 'a', ctrlKey: true }], createVimState('count 9', 6)).state.source, 'count 10');
});

test('visual paste and viewport commands emit expected results', () => {
    const withRegister = { ...createVimState('one\ntwo', 0), register: 'new\n', registerLinewise: true };
    assert.equal(keys(['V', 'p'], withRegister).state.source, 'new\ntwo');
    assert.deepEqual(keys(['H']).effects, [{ type: 'viewport-cursor', position: 'h' }]);
});
