import {
    deleteLineAtOffset,
    endWordOffset,
    firstNonBlankOffset,
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
} from './app-logic.mjs';

export function createVimState(source = '', cursor = 0) {
    return {
        source,
        cursor,
        mode: 'normal',
        pending: '',
        command: '',
        search: '',
        searchDirection: 1,
        lastSearch: '',
        lastFind: null,
        lastChange: [],
        register: '',
        registerLinewise: false,
        visualAnchor: null,
        visualActive: null,
        undoStack: [],
        redoStack: [],
    };
}

function result(state, effects = []) {
    return { state, effects, handled: true };
}

function changed(state, keys) {
    return { ...state, lastChange: keys };
}

function snapshot(state) {
    return { source: state.source, cursor: state.cursor };
}

function commit(state, source, cursor, mode = 'normal') {
    if (source === state.source) return { ...state, cursor, mode, pending: '' };
    return {
        ...state,
        source,
        cursor: Math.max(0, Math.min(source.length, cursor)),
        mode,
        pending: '',
        undoStack: [...state.undoStack, snapshot(state)].slice(-200),
        redoStack: [],
    };
}

function motion(state, key) {
    const { source, cursor } = state;
    switch (key) {
        case 'h': return { cursor: Math.max(lineStartOffset(source, cursor), cursor - 1) };
        case 'l': return { cursor: Math.min(lineEndOffset(source, cursor), cursor + 1) };
        case 'j': return { cursor: moveVerticalOffset(source, cursor, 1) };
        case 'k': return { cursor: moveVerticalOffset(source, cursor, -1) };
        case 'w': return { cursor: nextWordOffset(source, cursor) };
        case 'b': return { cursor: previousWordOffset(source, cursor) };
        case 'e': return { cursor: endWordOffset(source, cursor) };
        case '0': return { cursor: lineStartOffset(source, cursor) };
        case '^': return { cursor: firstNonBlankOffset(source, cursor) };
        case '$': return { cursor: lineEndOffset(source, cursor) };
        case ']':
        case '}': return { cursor: nextBlockOffset(source, cursor) };
        case '[':
        case '{': return { cursor: previousBlockOffset(source, cursor) };
        case 'G': return { cursor: source.length, scroll: 'bottom' };
        default: return null;
    }
}

function operatorRange(state, key) {
    const moved = motion(state, key);
    if (!moved) return null;
    const start = Math.min(state.cursor, moved.cursor);
    let end = Math.max(state.cursor, moved.cursor);
    if (key === 'e' || key === '$' || key === 'G' || key === ']' || key === '}') {
        end = Math.min(state.source.length, end + 1);
    }
    return { start, end };
}

function deleteRange(state, range, insert = false) {
    const removed = state.source.slice(range.start, range.end);
    const source = state.source.slice(0, range.start) + state.source.slice(range.end);
    return {
        ...commit(state, source, range.start, insert ? 'insert' : 'normal'),
        register: removed,
        registerLinewise: false,
    };
}

function undo(state) {
    if (state.undoStack.length === 0) return state;
    const previous = state.undoStack.at(-1);
    return {
        ...state,
        ...previous,
        pending: '',
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, snapshot(state)],
    };
}

function redo(state) {
    if (state.redoStack.length === 0) return state;
    const next = state.redoStack.at(-1);
    return {
        ...state,
        ...next,
        pending: '',
        undoStack: [...state.undoStack, snapshot(state)],
        redoStack: state.redoStack.slice(0, -1),
    };
}

function findSearch(state, reverse = false) {
    if (!state.lastSearch) return state;
    const direction = reverse ? -state.searchDirection : state.searchDirection;
    const haystack = state.source.toLowerCase();
    const needle = state.lastSearch.toLowerCase();
    let cursor;
    if (direction > 0) {
        cursor = haystack.indexOf(needle, state.cursor + 1);
        if (cursor === -1) cursor = haystack.indexOf(needle);
    } else {
        cursor = haystack.lastIndexOf(needle, Math.max(0, state.cursor - 1));
        if (cursor === -1) cursor = haystack.lastIndexOf(needle);
    }
    return cursor === -1 ? state : { ...state, cursor };
}

function wordUnderCursor(state) {
    const start = previousWordOffset(state.source, state.cursor + 1);
    const end = endWordOffset(state.source, start);
    return state.source.slice(start, end + 1);
}

function paste(state, before) {
    if (!state.register) return state;
    if (state.registerLinewise) {
        const at = before ? lineStartOffset(state.source, state.cursor) : lineEndOffset(state.source, state.cursor);
        const prefix = before ? '' : at < state.source.length ? '\n' : '\n';
        const insertion = before ? state.register : prefix + state.register.replace(/\n$/, '');
        return commit(state, state.source.slice(0, at) + insertion + state.source.slice(at), at);
    }
    const at = before ? state.cursor : Math.min(state.source.length, state.cursor + 1);
    return commit(state, state.source.slice(0, at) + state.register + state.source.slice(at), at);
}

function joinLine(state) {
    const end = lineEndOffset(state.source, state.cursor);
    if (end === state.source.length) return state;
    const rest = state.source.slice(end + 1).replace(/^\s+/, '');
    return commit(state, state.source.slice(0, end) + ' ' + rest, end);
}

function toggleCase(state) {
    if (state.cursor >= state.source.length) return state;
    const char = state.source[state.cursor];
    const replacement = char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase();
    return commit(
        state,
        state.source.slice(0, state.cursor) + replacement + state.source.slice(state.cursor + 1),
        state.cursor + 1,
    );
}

function findCharacter(state, char, direction, till = false) {
    const start = lineStartOffset(state.source, state.cursor);
    const end = lineEndOffset(state.source, state.cursor);
    const line = state.source.slice(start, end);
    const column = state.cursor - start;
    const found = direction > 0
        ? line.indexOf(char, column + 1)
        : line.lastIndexOf(char, Math.max(0, column - 1));
    if (found === -1) return { ...state, pending: '' };
    return {
        ...state,
        cursor: start + found + (till ? -direction : 0),
        lastFind: { char, direction, till },
        pending: '',
    };
}

function matchingBracketOffset(source, cursor) {
    const pairs = { '(': ')', '[': ']', '{': '}', ')': '(', ']': '[', '}': '{' };
    const char = source[cursor];
    if (!pairs[char]) return cursor;
    const direction = '([{'.includes(char) ? 1 : -1;
    let depth = 0;
    for (let index = cursor; index >= 0 && index < source.length; index += direction) {
        if (source[index] === char) depth++;
        if (source[index] === pairs[char]) depth--;
        if (depth === 0) return index;
    }
    return cursor;
}

function changeNumber(state, delta) {
    const before = state.source.slice(0, state.cursor);
    const after = state.source.slice(state.cursor);
    const forward = after.match(/\d+/);
    const backward = before.match(/\d+$/);
    const match = forward
        ? { start: state.cursor + forward.index, text: forward[0] }
        : backward
            ? { start: state.cursor - backward[0].length, text: backward[0] }
            : null;
    if (!match) return state;
    const replacement = String(Number(match.text) + delta);
    return commit(
        state,
        state.source.slice(0, match.start) + replacement + state.source.slice(match.start + match.text.length),
        match.start,
    );
}

function visualLineAction(state, key) {
    const selection = linewiseSelection(state.source, state.visualAnchor, state.visualActive);
    if (key === 'y') {
        return {
            ...state,
            cursor: selection.start,
            mode: 'normal',
            register: selection.text,
            registerLinewise: true,
            visualAnchor: null,
            visualActive: null,
        };
    }
    if (key === 'd' || key === 'c') {
        const end = selection.end < state.source.length ? selection.end + 1 : selection.end;
        const next = deleteRange(state, { start: selection.start, end }, key === 'c');
        return { ...next, register: selection.text, registerLinewise: true, visualAnchor: null, visualActive: null };
    }
    if (key === '>' || key === '<') {
        const text = selection.text.replace(/\n$/, '');
        const changed = text.split('\n').map(line => key === '>' ? `  ${line}` : line.replace(/^ {1,2}/, '')).join('\n');
        const source = state.source.slice(0, selection.start) + changed + state.source.slice(selection.end);
        return { ...commit(state, source, selection.start), visualAnchor: null, visualActive: null };
    }
    if (key === 'p' && state.register) {
        const end = selection.end < state.source.length ? selection.end + 1 : selection.end;
        const replacement = state.registerLinewise ? state.register : `${state.register}\n`;
        const source = state.source.slice(0, selection.start) + replacement + state.source.slice(end);
        return { ...commit(state, source, selection.start), visualAnchor: null, visualActive: null };
    }
    return state;
}

export function applyInsertEdit(state, source, cursor) {
    return commit(state, source, cursor, 'insert');
}

export function handleVimKey(state, event) {
    const key = event.key;
    const effects = [];

    if (state.mode === 'command' || state.mode === 'search') {
        const field = state.mode === 'command' ? 'command' : 'search';
        if (key === 'Escape') return result({ ...state, mode: 'normal', [field]: '' });
        if (key === 'Backspace') return result({ ...state, [field]: state[field].slice(0, -1) });
        if (key === 'Enter') {
            if (state.mode === 'search') {
                const searched = findSearch({ ...state, mode: 'normal', lastSearch: state.search, search: '' });
                return result(searched);
            }
            const command = state.command.trim();
            const next = { ...state, mode: 'normal', command: '' };
            if (command === 'w') effects.push({ type: 'save' });
            if (command === 'q') effects.push({ type: 'close', force: false });
            if (command === 'q!') effects.push({ type: 'close', force: true });
            if (command === 'wq') effects.push({ type: 'save-close' });
            if (command.startsWith('e ')) effects.push({ type: 'open-path', path: command.slice(2).trim() });
            return result(next, effects);
        }
        if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            return result({ ...state, [field]: state[field] + key });
        }
        return result(state);
    }

    if (state.mode === 'insert') {
        if (key === 'Escape') return result({ ...state, mode: 'normal' });
        return { state, effects, handled: false };
    }

    if (event.metaKey || event.altKey) return { state, effects, handled: false };
    if (event.ctrlKey && key === 'r' && state.mode === 'normal') return result(redo(state));
    if (event.ctrlKey && (key === 'a' || key === 'x') && state.mode === 'normal') {
        return result(changeNumber(state, key === 'a' ? 1 : -1));
    }
    if (event.ctrlKey && ['u', 'd', 'f', 'b'].includes(key)) {
        effects.push({ type: 'scroll-page', direction: key === 'u' || key === 'b' ? -1 : 1, full: key === 'f' || key === 'b' });
        return result(state, effects);
    }
    if (event.ctrlKey) return { state, effects, handled: false };

    if (state.mode === 'visual-line') {
        if (key === 'Escape') return result({ ...state, mode: 'normal', cursor: state.visualActive, visualAnchor: null, visualActive: null });
        if (['y', 'd', 'c', '>', '<', 'p'].includes(key)) return result(visualLineAction(state, key), key === 'y' ? [{ type: 'clipboard-write', text: linewiseSelection(state.source, state.visualAnchor, state.visualActive).text }] : []);
        if (state.pending === 'g') {
            const cursor = key === 'g' ? 0 : key === 'G' ? state.source.length : state.visualActive;
            return result({ ...state, pending: '', visualActive: cursor }, key === 'g' || key === 'G' ? [{ type: 'scroll', position: key === 'g' ? 'top' : 'bottom' }] : []);
        }
        if (state.pending === 'z') return result({ ...state, pending: '' }, key === 'z' ? [{ type: 'scroll', position: 'center' }] : []);
        if (key === 'g' || key === 'z') return result({ ...state, pending: key });
        const moved = motion({ ...state, cursor: state.visualActive }, key);
        if (moved) return result({ ...state, visualActive: moved.cursor }, moved.scroll ? [{ type: 'scroll', position: moved.scroll }] : []);
        return result(state);
    }

    if (state.pending === 'g') {
        const cursor = key === 'g' ? 0 : key === 'G' ? state.source.length : state.cursor;
        return result({ ...state, pending: '', cursor }, key === 'g' || key === 'G' ? [{ type: 'scroll', position: key === 'g' ? 'top' : 'bottom' }] : []);
    }
    if (state.pending === 'z') return result({ ...state, pending: '' }, key === 'z' ? [{ type: 'scroll', position: 'center' }] : []);
    if (state.pending === 'r') {
        if (key.length !== 1) return result({ ...state, pending: '' });
        return result(commit(state, state.source.slice(0, state.cursor) + key + state.source.slice(state.cursor + 1), state.cursor));
    }
    if (['f', 'F', 't', 'T'].includes(state.pending)) {
        if (key.length !== 1) return result({ ...state, pending: '' });
        return result(findCharacter(
            state,
            key,
            state.pending === 'f' || state.pending === 't' ? 1 : -1,
            state.pending === 't' || state.pending === 'T',
        ));
    }
    if (state.pending === 'd' || state.pending === 'c') {
        if (key === state.pending) {
            const line = linewiseSelection(state.source, state.cursor, state.cursor);
            const end = line.end < state.source.length ? line.end + 1 : line.end;
            const next = deleteRange({ ...state, pending: '' }, { start: line.start, end }, key === 'c');
            return result(changed({ ...next, register: line.text, registerLinewise: true }, [state.pending, key]));
        }
        const range = operatorRange(state, key);
        return result(range
            ? changed(deleteRange({ ...state, pending: '' }, range, state.pending === 'c'), [state.pending, key])
            : { ...state, pending: '' });
    }
    if (state.pending === 'y') {
        if (key === 'y') {
            const line = linewiseSelection(state.source, state.cursor, state.cursor);
            return result(
                { ...state, pending: '', register: line.text, registerLinewise: true },
                [{ type: 'clipboard-write', text: line.text }],
            );
        }
        const range = operatorRange(state, key);
        if (range) {
            const text = state.source.slice(range.start, range.end);
            return result(
                { ...state, pending: '', register: text, registerLinewise: false },
                [{ type: 'clipboard-write', text }],
            );
        }
        return result({ ...state, pending: '' });
    }

    const moved = motion(state, key);
    if (moved) return result({ ...state, cursor: moved.cursor }, moved.scroll ? [{ type: 'scroll', position: moved.scroll }] : []);

    switch (key) {
        case 'i': return result({ ...state, mode: 'insert' });
        case 'a': return result({ ...state, mode: 'insert', cursor: Math.min(state.source.length, state.cursor + 1) });
        case 'I': return result({ ...state, mode: 'insert', cursor: lineStartOffset(state.source, state.cursor) });
        case 'A': return result({ ...state, mode: 'insert', cursor: lineEndOffset(state.source, state.cursor) });
        case 'o': {
            const opened = openLineBelow(state.source, state.cursor);
            return result(changed(commit(state, opened.source, opened.offset, 'insert'), ['o']));
        }
        case 'O': {
            const opened = openLineAbove(state.source, state.cursor);
            return result(changed(commit(state, opened.source, opened.offset, 'insert'), ['O']));
        }
        case 'x': return result(changed(deleteRange(state, { start: state.cursor, end: Math.min(state.source.length, state.cursor + 1) }), ['x']));
        case 's': return result(changed(deleteRange(state, { start: state.cursor, end: Math.min(state.source.length, state.cursor + 1) }, true), ['s']));
        case 'S': {
            const line = linewiseSelection(state.source, state.cursor, state.cursor);
            return result(changed(deleteRange(state, { start: line.start, end: line.end }, true), ['S']));
        }
        case 'D': return result(changed(deleteRange(state, { start: state.cursor, end: lineEndOffset(state.source, state.cursor) }), ['D']));
        case 'C': return result(changed(deleteRange(state, { start: state.cursor, end: lineEndOffset(state.source, state.cursor) }, true), ['C']));
        case 'J': return result(changed(joinLine(state), ['J']));
        case '~': return result(changed(toggleCase(state), ['~']));
        case 'p': return result(changed(paste(state, false), ['p']));
        case 'P': return result(changed(paste(state, true), ['P']));
        case 'u': return result(undo(state));
        case '.': {
            if (state.lastChange.length === 0) return result(state);
            let repeated = { ...state, lastChange: [] };
            for (const repeatKey of state.lastChange) {
                repeated = handleVimKey(repeated, { key: repeatKey }).state;
            }
            return result({ ...repeated, lastChange: state.lastChange });
        }
        case '%': return result({ ...state, cursor: matchingBracketOffset(state.source, state.cursor) });
        case ';': return result(state.lastFind ? findCharacter(state, state.lastFind.char, state.lastFind.direction, state.lastFind.till) : state);
        case ',': return result(state.lastFind ? findCharacter(state, state.lastFind.char, -state.lastFind.direction, state.lastFind.till) : state);
        case 'H':
        case 'M':
        case 'L': return result(state, [{ type: 'viewport-cursor', position: key.toLowerCase() }]);
        case 'V': return result({ ...state, mode: 'visual-line', visualAnchor: state.cursor, visualActive: state.cursor });
        case 'd':
        case 'c':
        case 'y':
        case 'r':
        case 'f':
        case 'F':
        case 't':
        case 'T':
        case 'g':
        case 'z': return result({ ...state, pending: key });
        case ':': return result({ ...state, mode: 'command', command: '' });
        case '/': return result({ ...state, mode: 'search', search: '', searchDirection: 1 });
        case '?': return result({ ...state, mode: 'search', search: '', searchDirection: -1 });
        case 'n': return result(findSearch(state));
        case 'N': return result(findSearch(state, true));
        case '*':
        case '#': {
            const word = wordUnderCursor(state);
            const searched = findSearch({ ...state, lastSearch: word, searchDirection: key === '*' ? 1 : -1 });
            return result(searched);
        }
        default: return result(state);
    }
}
