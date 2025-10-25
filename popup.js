const SCOPE = chrome.extension.inIncognitoContext ? "incog" : "normal";
const ENABLED_KEY = `enabled_${SCOPE}`;
const SNOOZE_KEY = `snoozeUntil_${SCOPE}`;
const DEFAULTS = { [ENABLED_KEY]: true, [SNOOZE_KEY]: 0 };

const statusEl = document.getElementById("status");
const toggleButton = document.getElementById("toggle");
const snoozeButtons = Array.from(document.querySelectorAll("[data-minutes]"));
let currentState = null;

init();

async function init() {
  await refresh();
  toggleButton.addEventListener("click", async () => {
    await withButtonLock(toggleButton, () => {
      if (isSnoozed(currentState)) return sendMessage({ type: "unsnooze" });
      return sendMessage({ type: "toggle" });
    });
  });
  snoozeButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const minutes = Number(button.dataset.minutes || "0");
      if (!minutes) return;
      await withButtonLock(button, () => sendMessage({ type: "snooze", minutes }));
    });
  });

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "local") return;
    if (!(changes[ENABLED_KEY] || changes[SNOOZE_KEY])) return;
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
    statusEl.textContent = "Disabled";
  } else if (state.snoozeUntil > now) {
    const until = new Date(state.snoozeUntil);
    const time = until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    statusEl.textContent = `Snoozed until ${time}`;
  } else {
    statusEl.textContent = "Enabled";
  }

  if (state.snoozeUntil > now)
    toggleButton.textContent = "Stop Snooze";
  else
    toggleButton.textContent = state.enabled ? "Disable" : "Enable";
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
