# emdee

A barebones native Mac markdown editor built with Tauri 2 + vanilla JS.

## Features

- Edit and preview markdown
- Open / save / save-as with native file dialogs
- Native macOS menu bar (File, Edit, View)
- Overlay title bar
- Font size controls (Cmd+= / Cmd+- / Cmd+0)
- Drag-and-drop `.md` files onto the window
- Unsaved-changes indicator and close guard
- Word count, auto-save flash, remembers last file

## Run

```bash
npm install
npm run tauri dev
```

## Build (Apple Silicon)

```bash
npm run tauri build -- --target aarch64-apple-darwin
```

Output: `src-tauri/target/aarch64-apple-darwin/release/bundle/`
