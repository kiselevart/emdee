# Markdown Editor — Tauri App (Apple Silicon Mac)

## Project Overview
A barebones native Mac markdown editor built with Tauri 2.x + vanilla JS frontend. Features: open files, type, save, toggle view/edit mode. No frameworks, no complexity.

---

## Tech Stack
- **Tauri 2.x** — app shell, file system access, native menus
- **Rust** — Tauri backend (minimal, mostly boilerplate)
- **Vanilla JS + HTML + CSS** — frontend UI
- **marked.js** (CDN or bundled) — markdown rendering
- **No React, No Vue, No bundler** — keep it simple

---

## Project Structure
```
markdown-editor/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs          # Tauri app entry point
│   │   └── lib.rs           # Custom commands (file ops)
│   ├── Cargo.toml           # Rust dependencies
│   ├── tauri.conf.json      # App config, window settings
│   └── icons/               # App icons (generate with Tauri CLI)
├── src/
│   ├── index.html           # Single page UI
│   ├── style.css            # All styling
│   └── main.js              # All frontend logic
└── package.json             # Tauri CLI dev dependency only
```

---

## Phase 1 — Project Setup

### Instructions for agent:
1. Initialize with `npm create tauri-app@latest`
   - App name: `markdown-editor`
   - Frontend: Vanilla
   - No bundler
2. Configure `tauri.conf.json`:
```json
{
  "productName": "Markdown Editor",
  "version": "0.1.0",
  "identifier": "com.yourname.markdowneditor",
  "build": {
    "frontendDist": "../src"
  },
  "app": {
    "windows": [
      {
        "title": "Markdown Editor",
        "width": 900,
        "height": 700,
        "minWidth": 500,
        "minHeight": 400,
        "hiddenTitle": true,
        "titleBarStyle": "Overlay"
      }
    ],
    "macOSPrivateApi": true
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],
    "icon": ["icons/icon.icns"]
  }
}
```

3. Add to `Cargo.toml` dependencies:
```toml
[dependencies]
tauri = { version = "2.0", features = ["macos-private-api"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[dependencies.tauri-plugin-dialog]
version = "2.0"

[dependencies.tauri-plugin-fs]
version = "2.0"
```

---

## Phase 2 — Rust Backend (lib.rs)

### Instructions for agent:
Implement these 4 Tauri commands in `src-tauri/src/lib.rs`:

```rust
// 1. open_file_dialog
// - Uses tauri_plugin_dialog to open native Mac file picker
// - Filter for .md and .txt files
// - Returns { path: String, content: String } or error

// 2. save_file
// - Takes { path: String, content: String }
// - If path is empty, trigger save_as instead
// - Writes content to disk
// - Returns saved path or error

// 3. save_file_as
// - Opens native Mac save dialog
// - Default filename "untitled.md"
// - Returns { path: String } or error

// 4. read_file
// - Takes a path string
// - Returns file content as string
```

Full `lib.rs`:
```rust
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;
use std::fs;

#[tauri::command]
async fn open_file_dialog(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let file = app.dialog()
        .file()
        .add_filter("Markdown", &["md", "txt"])
        .blocking_pick_file();
    
    match file {
        Some(path) => {
            let path_str = path.to_string();
            let content = fs::read_to_string(&path_str)
                .map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "path": path_str, "content": content }))
        }
        None => Err("No file selected".to_string())
    }
}

#[tauri::command]
async fn save_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_file_as(app: tauri::AppHandle, content: String) -> Result<String, String> {
    let path = app.dialog()
        .file()
        .set_file_name("untitled.md")
        .add_filter("Markdown", &["md"])
        .blocking_save_file();
    
    match path {
        Some(p) => {
            let path_str = p.to_string();
            fs::write(&path_str, &content).map_err(|e| e.to_string())?;
            Ok(path_str)
        }
        None => Err("Save cancelled".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            save_file,
            save_file_as,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## Phase 3 — Frontend (index.html)

### Instructions for agent:
Single HTML file. Load marked.js from CDN. Structure:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Markdown Editor</title>
  <link rel="stylesheet" href="style.css" />
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body>
  <div id="toolbar">
    <div id="file-info">
      <span id="filename">untitled.md</span>
      <span id="unsaved-dot" class="hidden">●</span>
    </div>
    <div id="toolbar-actions">
      <button id="btn-open">Open</button>
      <button id="btn-save">Save</button>
      <button id="btn-toggle">Preview</button>
    </div>
  </div>

  <div id="editor-container">
    <textarea id="editor" spellcheck="true" placeholder="Start writing..."></textarea>
    <div id="preview" class="hidden"></div>
  </div>

  <script src="main.js"></script>
</body>
</html>
```

---

## Phase 4 — Frontend Logic (main.js)

### Instructions for agent:
Implement the following in `main.js`:

```javascript
// State
const state = {
  currentPath: null,
  isPreviewMode: false,
  isDirty: false
}

// Elements
const editor = document.getElementById('editor')
const preview = document.getElementById('preview')
const btnOpen = document.getElementById('btn-open')
const btnSave = document.getElementById('btn-save')
const btnToggle = document.getElementById('btn-toggle')
const filename = document.getElementById('filename')
const unsavedDot = document.getElementById('unsaved-dot')

// Import Tauri invoke
const { invoke } = window.__TAURI__.core

// --- Core functions agent must implement ---

// 1. toggleMode()
// - Switches between editor and preview
// - When entering preview: render editor content with marked.parse()
//   and set as preview innerHTML, hide editor, show preview
// - When entering editor: hide preview, show editor, focus editor
// - Update btn-toggle text: "Preview" or "Edit"
// - Update state.isPreviewMode

// 2. openFile()
// - invoke('open_file_dialog')
// - On success: set editor.value to content, update state.currentPath,
//   update filename display, set isDirty false
// - Handle error gracefully (user cancelled = do nothing)

// 3. saveFile()
// - If state.currentPath exists: invoke('save_file', { path, content })
// - If no path: invoke('save_file_as', { content })
//   then update state.currentPath with returned path
// - On success: set isDirty false, update unsaved dot

// 4. markDirty()
// - Set state.isDirty true
// - Show unsaved dot indicator

// 5. Keyboard shortcuts
// Cmd+S → saveFile()
// Cmd+O → openFile()
// Cmd+E or Cmd+Shift+E → toggleMode()
// Escape (in preview) → back to edit mode

// 6. Window close guard
// - If isDirty, show confirm dialog before closing
// - Use Tauri's dialog plugin for native confirm

// Wire up events
btnOpen.addEventListener('click', openFile)
btnSave.addEventListener('click', saveFile)
btnToggle.addEventListener('click', toggleMode)
editor.addEventListener('input', markDirty)
```

---

## Phase 5 — Styling (style.css)

### Instructions for agent:
Implement these CSS requirements:

```css
/* Global */
/* - Background: #1e1e1e (dark) or #fafafa (light) — pick dark */
/* - Font: system-ui for UI, monospace for editor */
/* - No scrollbars visible but content still scrollable */
/* - Full height layout, no overflow */

/* Toolbar */
/* - Height: 48px */
/* - Blurred background: backdrop-filter blur, semi-transparent */
/* - Pinned to top */
/* - File info left, actions right */
/* - Buttons: minimal, no border, subtle hover */
/* - Unsaved dot: orange/amber color */

/* Editor (textarea) */
/* - Full remaining height below toolbar */
/* - Monospace font, 15px, comfortable line height 1.7 */
/* - No border, no outline, padding 60px horizontal, 40px vertical */
/* - Dark background matching app */
/* - Caret color white */
/* - Resize: none */

/* Preview */
/* - Same padding as editor */
/* - Rendered markdown styles: */
/*   h1-h6: clean weights, appropriate sizes */
/*   p: line-height 1.8 */
/*   code: monospace, subtle background pill */
/*   pre: code block with background */
/*   blockquote: left border accent, muted text */
/*   a: colored, no underline unless hover */
/*   hr: subtle */
/*   ul/ol: proper indentation */

/* Transitions */
/* - Smooth fade between edit/preview mode (opacity transition 150ms) */
```

---

## Phase 6 — Native Mac Menu (main.rs)

### Instructions for agent:
Add a native Mac menu bar with:

```
File
  New             Cmd+N
  Open...         Cmd+O
  Save            Cmd+S
  Save As...      Cmd+Shift+S
  ───
  Close           Cmd+W

View
  Toggle Preview  Cmd+E
  ───
  Actual Size     Cmd+0
  Increase Font   Cmd+Plus
  Decrease Font   Cmd+Minus

Edit
  (standard: undo, redo, cut, copy, paste, select all)
```

Wire menu items to emit Tauri events that `main.js` listens for with `window.__TAURI__.event.listen()`.

---

## Phase 7 — Polish

### Instructions for agent, implement these in order:

1. **Font size controls** — `Cmd++` / `Cmd+-` adjust editor font size, persist to localStorage
2. **Remember last file** — on launch, reopen last edited file path from localStorage
3. **Auto-save indicator** — show "Saved" flash in toolbar for 2s after saving
4. **Word count** — small muted word/char count in bottom right corner
5. **Drag and drop** — accept `.md` files dragged onto the window to open them
6. **App icon** — generate with `npm run tauri icon path/to/icon.png` (1024x1024 PNG)

---

## Build & Run Commands

```bash
# Install dependencies
npm install

# Dev mode (hot reload)
npm run tauri dev

# Build for Apple Silicon
npm run tauri build -- --target aarch64-apple-darwin

# Output
# .app → src-tauri/target/aarch64-apple-darwin/release/bundle/macos/
# .dmg → src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/
```

---

## Known Gotchas for Agent

- Tauri 2.x breaking changes from 1.x — make sure all imports use `@tauri-apps/api` v2 paths
- `window.__TAURI__.core.invoke` not `window.__TAURI__.invoke` in v2
- File paths from dialog on Mac come back as `file://` URIs — strip the prefix before passing to `save_file`
- `titleBarStyle: Overlay` requires `hiddenTitle: true` to work correctly
- The `tauri-plugin-dialog` and `tauri-plugin-fs` must be registered in both `Cargo.toml` AND `lib.rs` plugin init
- Allow file system permissions in `tauri.conf.json` under `app.security.assetProtocol` if loading local assets
