# Make New Tabs Active

<p align="center">
  <img src="icon.png" alt="Make New Tabs Active icon" width="128" />
</p>

Chrome extension that brings every new tab to the foreground so you stay in your flow. Toggle it on/off from the toolbar, snooze it when you need a break, or use handy keyboard shortcuts—all without losing track of what opened where.

## Features
- Promotes every newly created tab (including those from other extensions) to the active tab.
- Toolbar popup shows current state, quick toggle button, and optional snooze timer.
- Snooze the behavior for a configurable number of minutes—automatically resumes afterwards.
- Separate state for regular and incognito windows thanks to split-incognito support.
- Command shortcuts: `Alt+Shift+T` to toggle, `Alt+Shift+S` to snooze the saved duration.

## Install

### Load the unpacked extension
1. Clone or download this repository.
2. Visit `chrome://extensions/` in Chrome and enable **Developer mode**.
3. Choose **Load unpacked** and select the repository directory.
4. Pin the "Make New Tabs Active" icon if you want quick access to the popup.

### Build a signed `.crx` (optional)
- macOS script `./make.sh` packages the extension using Chrome's `--pack-extension` flag.
- Update `CHROME_BINARY` and `CHROME_KEY` paths in the script to match your environment before running it.
- The resulting archive is written as `make-new-tabs-active-<version>.crx` in the project root.

## Using the extension
- Click the toolbar button to open the popup. It shows whether the extension is **Enabled**, **Disabled**, or temporarily **Snoozed**.
- Press **Toggle** to enable/disable immediately, or use **Snooze** to pause the behavior for the number of minutes shown in the input field.
- Adjust the snooze duration by entering a new value; it saves when the field loses focus or when you press Enter.
- Keyboard shortcuts mirror the popup actions and can be customized in Chrome's shortcut settings.

## Localization
- All user-visible strings rely on Chrome's i18n system (`_locales/` folder).
- Add translations by copying `en/messages.json` to a new locale folder and updating the `message` values.
- Headlines and labels in `popup.html` are auto-localized at runtime, so new locales require no markup changes.

## Development notes
- Background logic lives in `background.js`; the popup UI and behavior live in `popup.html`, `popup.css`, and `popup.js`.
- Tests are not included, so validate changes manually by loading the unpacked extension and exercising the snooze/toggle flows.
- When making changes, keep localization keys in `manifest.json` and `_locales` synchronized.

