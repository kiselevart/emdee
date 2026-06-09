# emdee

A barebones native Mac markdown editor built with Tauri 2 + vanilla JS.

Free and open source under the MIT License.

## Download

Grab the latest `.dmg` from [Releases](https://github.com/kiselevart/emdee/releases/latest).

After installing, if macOS blocks the app (unsigned binary):

```bash
xattr -cr "/Applications/emdee.app"
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
- Light and dark mode toggle
- Optional Vim keybindings with Normal, Insert, Visual Line, search, and command modes

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

### Tests

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

The JavaScript suite includes pure Vim-engine command sequence tests.

### Release build (Apple Silicon)

```bash
cargo tauri build --target aarch64-apple-darwin
```

Output in `src-tauri/target/aarch64-apple-darwin/release/bundle/`.

To open the unsigned `.app` locally without a developer certificate:

```bash
xattr -cr "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/emdee.app"
open "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/emdee.app"
```

## Releasing

Tag a commit with a version number to trigger a GitHub Actions build and publish it to Releases:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## License

[MIT](LICENSE) © 2026 Artem Kiselev
