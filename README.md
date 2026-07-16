# Obsidian Note Assistant

A comprehensive toolkit for structural document management in Obsidian, designed to automate headings, formulas, and outline organization.

This plugin combines advanced heading management, automatic numbering, and formula indexing into a single, cohesive workflow.

## Per-note frontmatter

Numbering settings remain ordinary text properties so they render in Obsidian Properties. Existing compact values continue to work:

```yaml
---
number headings: auto, 1-6, 111111, ....., 111111
number formulas: auto, continuous
---
```

The first field controls per-note behavior:

- `auto` maintains numbering automatically.
- `none` removes numbering managed by the current configuration and keeps the note unnumbered.
- `off` leaves existing content unchanged.
- Omitting the state field keeps the compact configuration in manual mode.

For example, changing only the first field preserves the numbering pattern:

```yaml
number headings: none, 1-6, 111111, ....., 111111
number formulas: none, heading-based(4)
```

The global heading/formula module switches always take precedence. When a module is disabled, a note-level `auto` or `none` value cannot modify note content.

## 🌟 Features

### 🔢 MyHeadings - Intelligent Heading Numbering
Automatically number headings in your documents to maintain a clear structure.

- **5 Numbering Styles**:
  - `1.1.1` (Arabic)
  - `A.A.A` (Uppercase)
  - `a.a.a` (Lowercase)
  - `一.一.一` (Chinese)
  - `①.①.①` (Circled)
- **Flexible Configuration**:
  - Custom start values and separators
  - Configurable level ranges (e.g., enable for H2-H4 only)
  - "Skip specific headings" via keyphrase
- **Auto-Numbering**: Automatically update numbers when headings change (optional).

### 📐 MyFormulas - Formula Numbering System
The first plugin to bring scientific paper-style formula numbering to Obsidian.

- **Automatic Tagging**: Appends `\tag{}` to math blocks automatically.
- **Two Numbering Modes**:
  - **Continuous**: `(1)`, `(2)`, `(3)`... across the entire document.
  - **Heading-Based**: `(2.1-1)`, `(2.1-2)`... resets per section.
- **Advanced Control**:
  - Adjustable depth for heading-based numbering (e.g., use H2 or H3 as prefix).
  - Smart detection to avoid numbering specific blocks.

### 🔄 Heading Shifter - Structural Editing
Rapidly reorganize your document structure with powerful hotkeys.

- **Apply Headings**: Quickly set a line to H1-H6 (Ctrl+1~6).
- **Shift Levels**: Batch increase/decrease heading levels for selected text.
- **Smart Insert**:
  - **Insert Same Level**: Quickly add a sibling section.
  - **Insert Child**: Quickly add a sub-section.
  - **Insert Parent**: Quickly add a parent section.
- **Style Management**: Automatically remove list markers/bold/italics when converting to headings.

---

## 📦 Installation

### From Release
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/yourusername/obsidian-note-assistant/releases).
2. Create a folder named `obsidian-note-assistant` in your vault's `.obsidian/plugins/` directory.
3. Place the files into this folder.
4. Restart Obsidian and enable the plugin.

### Manual Build
```bash
git clone https://github.com/yourusername/obsidian-note-assistant.git
cd obsidian-note-assistant
npm install
npm run build
```

---

## 🚀 Usage

### Configuring Numbering
1. Go to **Settings > Note Assistant**.
2. Enable "My Headings" or "My Formulas".
3. Configure your preferred styles (e.g., `1.1` vs `1-1`).
4. Run the command **"Number Headings"** or **"Number Formulas"** to apply changes immediately.

### Using Heading Shifter
- **Increase Level**: `Tab` (if enabled in settings) or custom hotkey.
- **Decrease Level**: `Shift+Tab` (if enabled) or custom hotkey.
- **Apply H1-H6**: Map `Ctrl+1` through `Ctrl+6` in Obsidian Hotkeys settings to "Apply Heading 1" etc.

---

## 🌐 Internationalization

Fully localized for:
- 🇬🇧 English
- 🇨🇳 简体中文 (Simplified Chinese)

---

## 🙏 Acknowledgments

This plugin is built upon the brilliant work of the open-source community. We want to explicitly credit the original authors whose work forms the core foundation of this plugin:

1. **[Kevin Albrecht (onlyafly)](https://www.kevinalbrecht.com)** - Creator of **[Number Headings](https://github.com/onlyafly/number-headings-obsidian)**
   - The core algorithm for heading numbering and the logic for traversing the document structure are derived from his excellent plugin.

2. **[kasahala (k4a-l)](https://github.com/k4a-l)** - Creator of **[Heading Shifter](https://github.com/k4a-dev/obsidian-heading-shifter)**
   - The "Heading Shifter" module is a direct integration of his powerful heading manipulation tools, including the apply, shift, and smart insert features.

### Enhancements by Note Assistant
Building on these foundations, this plugin adds:
- **Integrated Formula Numbering**: A new engine for numbering math blocks with LaTeX tags.
- **Extended Styles**: Added support for Chinese (一, 二) and Circled (①, ②) numbering formats.
- **Unified Settings**: A consolidated interface to manage all structural aspects of your note.

---

## 📄 License

MIT License

Copyright (c) 2026 Randy Allen

This project integrates code from multiple open-source plugins (see Acknowledgments). Each original plugin retains its original license and copyright. The integration work, TypeScript refactoring, and enhancements are licensed under MIT.
