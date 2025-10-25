const SCOPE = chrome.extension.inIncognitoContext ? "incog" : "normal";
const ENABLED_KEY = `enabled_${SCOPE}`;
const SNOOZE_KEY = `snoozeUntil_${SCOPE}`;
const SNOOZE_MINUTES_KEY = `snoozeMinutes_${SCOPE}`;
const DEFAULTS = { [ENABLED_KEY]: true, [SNOOZE_KEY]: 0, [SNOOZE_MINUTES_KEY]: 5 };

const statusEl = document.getElementById("status");
const toggleButton = document.getElementById("toggle");
const snoozeButton = document.getElementById("snooze");
const snoozeMinutesInput = document.getElementById("snooze-minutes");
const snoozeMinLabel = document.getElementById("snooze-min-label");
let currentState = null;
let lastValidMinutes = DEFAULTS[SNOOZE_MINUTES_KEY];

const statusDisabledText = chrome.i18n.getMessage("statusDisabled") || "Disabled";
const statusEnabledText = chrome.i18n.getMessage("statusEnabled") || "Enabled";
const toggleStopSnoozeText = chrome.i18n.getMessage("toggleStopSnooze") || "Stop Snooze";
const toggleDisableText = chrome.i18n.getMessage("toggleDisable") || "Disable";
const toggleEnableText = chrome.i18n.getMessage("toggleEnable") || "Enable";

init();

async function init() {
  await refresh();

  const snoozeLabel = chrome.i18n.getMessage("snoozeButtonLabel") || "Snooze";
  const snoozeMinutesLabel = chrome.i18n.getMessage("snoozeMinutesSuffix") || "min";
  const snoozeMinutesAria = chrome.i18n.getMessage("snoozeMinutesInputLabel") || "Snooze minutes";
  snoozeButton.textContent = snoozeLabel;
  snoozeMinLabel.textContent = snoozeMinutesLabel;
  snoozeMinutesInput.setAttribute("aria-label", snoozeMinutesAria);

  toggleButton.addEventListener("click", async () => {
    await withButtonLock(toggleButton, () => {
      if (isSnoozed(currentState)) return sendMessage({ type: "unsnooze" });
      return sendMessage({ type: "toggle" });
    });
  });
  snoozeButton.addEventListener("click", async () => {
    const minutes = currentState?.snoozeMinutes || lastValidMinutes;
    if (!minutes) return;
    await withButtonLock(snoozeButton, () => sendMessage({ type: "snooze", minutes }));
  });

  snoozeMinutesInput.addEventListener("blur", commitMinutesInput);
  snoozeMinutesInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      snoozeMinutesInput.blur();
    }
  });

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "local") return;
    if (!(changes[ENABLED_KEY] || changes[SNOOZE_KEY] || changes[SNOOZE_MINUTES_KEY])) return;
    await refresh();
  });
}

async function refresh() {
  const state = await loadState();
  currentState = state;
  render(state);
}

function render(state) {
  const now = Date.now();
  if (!state.enabled) {
    statusEl.textContent = statusDisabledText;
  } else if (state.snoozeUntil > now) {
    const until = new Date(state.snoozeUntil);
    const time = until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    statusEl.textContent = chrome.i18n.getMessage("statusSnoozedUntil", time) || `Snoozed until ${time}`;
  } else {
    statusEl.textContent = statusEnabledText;
  }

  if (state.snoozeUntil > now)
    toggleButton.textContent = toggleStopSnoozeText;
  else
    toggleButton.textContent = state.enabled ? toggleDisableText : toggleEnableText;

  lastValidMinutes = state.snoozeMinutes;
  snoozeMinutesInput.value = String(state.snoozeMinutes);
}

function isSnoozed(state) {
  if (!state) return false;
  return state.enabled && state.snoozeUntil > Date.now();
}

async function loadState() {
  const got = await storageGet(DEFAULTS);
  return {
    enabled: !!got[ENABLED_KEY],
    snoozeUntil: got[SNOOZE_KEY] || 0,
    snoozeMinutes: toValidMinutes(got[SNOOZE_MINUTES_KEY]) || DEFAULTS[SNOOZE_MINUTES_KEY],
  };
}

function storageGet(defaults) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(defaults, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(result);
    });
  });
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(response);
    });
  });
}

async function commitMinutesInput() {
  const raw = snoozeMinutesInput.value.trim();
  if (!raw) {
    snoozeMinutesInput.value = String(lastValidMinutes);
    return;
  }
  const minutes = toValidMinutes(raw);
  if (!minutes) {
    snoozeMinutesInput.value = String(lastValidMinutes);
    return;
  }
  if (minutes === lastValidMinutes) {
    snoozeMinutesInput.value = String(lastValidMinutes);
    return;
  }

  const previous = lastValidMinutes;
  try {
    const response = await sendMessage({ type: "setSnoozeMinutes", minutes });
    if (!response?.ok) throw new Error(response?.error || "save failed");
    lastValidMinutes = minutes;
  } catch (err) {
    console.error(err);
    snoozeMinutesInput.value = String(previous);
  }
}

function toValidMinutes(value) {
  const minutes = Number.parseInt(value, 10);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes;
}

async function withButtonLock(button, fn) {
  button.disabled = true;
  try {
    await fn();
  } catch (err) {
    console.error(err);
  } finally {
    button.disabled = false;
    await refresh();
  }
}
