use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    Emitter,
};
use tauri_plugin_dialog::DialogExt;
use std::fs;

fn filepath_to_string(fp: tauri_plugin_dialog::FilePath) -> Result<String, String> {
    match fp {
        tauri_plugin_dialog::FilePath::Path(p) => Ok(p.to_string_lossy().to_string()),
        tauri_plugin_dialog::FilePath::Url(u) => u
            .to_file_path()
            .map(|p| p.to_string_lossy().to_string())
            .map_err(|_| "Cannot convert file URL to path".to_string()),
    }
}

#[tauri::command]
async fn open_file_dialog(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "txt"])
        .blocking_pick_file();

    match file {
        Some(path) => {
            let path_str = filepath_to_string(path)?;
            let content = fs::read_to_string(&path_str).map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "path": path_str, "content": content }))
        }
        None => Err("No file selected".to_string()),
    }
}

#[tauri::command]
async fn save_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_file_as(app: tauri::AppHandle, content: String) -> Result<String, String> {
    let path = app
        .dialog()
        .file()
        .set_file_name("untitled.md")
        .add_filter("Markdown", &["md"])
        .blocking_save_file();

    match path {
        Some(p) => {
            let path_str = filepath_to_string(p)?;
            fs::write(&path_str, &content).map_err(|e| e.to_string())?;
            Ok(path_str)
        }
        None => Err("Save cancelled".to_string()),
    }
}

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn show_confirm_dialog(
    app: tauri::AppHandle,
    message: String,
    title: String,
) -> Result<bool, String> {
    let confirmed = app
        .dialog()
        .message(message)
        .title(title)
        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
        .blocking_show();
    Ok(confirmed)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let new_item = MenuItemBuilder::with_id("menu-new", "New")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;
            let open_item = MenuItemBuilder::with_id("menu-open", "Open...")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let save_item = MenuItemBuilder::with_id("menu-save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let save_as_item = MenuItemBuilder::with_id("menu-save-as", "Save As...")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?;
            let toggle_item = MenuItemBuilder::with_id("menu-toggle-preview", "Toggle Preview")
                .accelerator("CmdOrCtrl+E")
                .build(app)?;
            let actual_size_item = MenuItemBuilder::with_id("menu-actual-size", "Actual Size")
                .accelerator("CmdOrCtrl+0")
                .build(app)?;
            let increase_font_item =
                MenuItemBuilder::with_id("menu-increase-font", "Increase Font Size")
                    .accelerator("CmdOrCtrl+Plus")
                    .build(app)?;
            let decrease_font_item =
                MenuItemBuilder::with_id("menu-decrease-font", "Decrease Font Size")
                    .accelerator("CmdOrCtrl+Minus")
                    .build(app)?;

            let file_submenu = SubmenuBuilder::new(app, "File")
                .item(&new_item)
                .item(&open_item)
                .item(&save_item)
                .item(&save_as_item)
                .separator()
                .item(&PredefinedMenuItem::close_window(app, Some("Close"))?)
                .build()?;

            let edit_submenu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, Some("Undo"))?)
                .item(&PredefinedMenuItem::redo(app, Some("Redo"))?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, Some("Cut"))?)
                .item(&PredefinedMenuItem::copy(app, Some("Copy"))?)
                .item(&PredefinedMenuItem::paste(app, Some("Paste"))?)
                .separator()
                .item(&PredefinedMenuItem::select_all(app, Some("Select All"))?)
                .build()?;

            let view_submenu = SubmenuBuilder::new(app, "View")
                .item(&toggle_item)
                .separator()
                .item(&actual_size_item)
                .item(&increase_font_item)
                .item(&decrease_font_item)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&file_submenu)
                .item(&edit_submenu)
                .item(&view_submenu)
                .build()?;

            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit(event.id().as_ref(), ());
        })
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            save_file,
            save_file_as,
            read_file,
            show_confirm_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
