# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the frontend UI: `main.js` for app logic, `style.css` for styling, `index.html` for the shell, and `marked.min.js` for markdown rendering.
- `src-tauri/` contains the Rust backend and Tauri configuration: `Cargo.toml`, `tauri.conf.json`, `build.rs`, and the native app bundle settings.
- Build outputs land under `src-tauri/target/`; do not commit generated bundles or DMG artifacts.

## Build, Test, and Development Commands
- `cargo tauri dev` starts the desktop app in development mode.
- `cargo tauri build --target aarch64-apple-darwin` builds a release bundle for Apple Silicon.
- `cargo check --manifest-path src-tauri/Cargo.toml` validates the Rust backend without producing a release bundle.
- There is no dedicated automated test suite in this repository today.

## Coding Style & Naming Conventions
- Use 2-space indentation in frontend files; keep JavaScript and CSS formatting consistent with the existing code.
- Prefer descriptive camelCase names in `src/main.js` for functions and variables, and kebab-case for DOM IDs and CSS selectors.
- Keep frontend code vanilla and dependency-light. Reuse the current patterns for state management, tab handling, and Tauri API calls.

## Testing Guidelines
- No framework is configured yet, so verify changes by running the app and exercising file open/save, tab switching, preview mode, and theme toggling.
- If you add tests, place them near the code they cover and name them clearly, such as `*.test.js` or Rust `#[test]` modules.

## Commit & Pull Request Guidelines
- Commit history uses short, imperative messages with optional prefixes, for example `feat: add tabs` or `Fix rust-version...`.
- Keep commits focused on one change set.
- Pull requests should include a short summary, user-visible impact, and screenshots or a screen recording for UI changes.
- Link related issues when applicable and call out any macOS-specific packaging or signing considerations.

## Security & Configuration Tips
- The app is macOS-focused and uses Tauri private APIs; confirm changes against the bundled config before shipping.
- Avoid hardcoding machine-specific paths or secrets in frontend or Rust code.
