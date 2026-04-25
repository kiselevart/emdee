# emdee

A barebones native Mac markdown editor built with Tauri 2 + vanilla JS.

## Download

Grab the latest `.dmg` from [Releases](https://github.com/kiselevart/emdee/releases/latest).

After installing, if macOS blocks the app (unsigned binary):

```bash
xattr -cr "/Applications/Markdown Editor.app"
```

## Features

- Edit and preview markdown
- Open / save / save-as with native file dialogs
- Native macOS menu bar (File, Edit, View)
- Overlay title bar
- Font size controls (Cmd+= / Cmd+- / Cmd+0)
- Drag-and-drop `.md` files onto the window
- Unsaved-changes indicator and close guard
- Word count, auto-save flash, remembers last file

## Building from source

### Prerequisites

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Xcode Command Line Tools
xcode-select --install

# Tauri CLI
cargo install tauri-cli --locked
```

### Dev server

```bash
cargo tauri dev
```

### Release build (Apple Silicon)

```bash
cargo tauri build --target aarch64-apple-darwin
```

Output in `src-tauri/target/aarch64-apple-darwin/release/bundle/`.

To open the unsigned `.app` locally without a developer certificate:

```bash
xattr -cr "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Markdown Editor.app"
open "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Markdown Editor.app"
```

## Releasing

Tag a commit with a version number to trigger a GitHub Actions build and publish it to Releases:

```bash
git tag v0.1.0
git push origin v0.1.0
```
