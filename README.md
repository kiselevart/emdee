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

## Prerequisites

- **Rust** — https://rustup.rs
- **Xcode Command Line Tools** — `xcode-select --install`
- **Tauri CLI** — `cargo install tauri-cli --locked`

## Dev

```bash
cargo tauri dev
```

## Build (Apple Silicon)

```bash
cargo tauri build -- --target aarch64-apple-darwin
```

Output in `src-tauri/target/aarch64-apple-darwin/release/bundle/`.

The resulting `.app` is unsigned. To open it locally without a developer certificate:

```bash
xattr -cr "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Markdown Editor.app"
```
