// Make New Tabs Active
// Bring new tabs to the front, with toggle + snooze

const SCOPE = chrome.extension.inIncognitoContext ? "incog" : "normal";
const ENABLED_KEY = `enabled_${SCOPE}`;
const SNOOZE_KEY = `snoozeUntil_${SCOPE}`;
const STARTUP_GUARD_KEY = `startupGuardUntil_${SCOPE}`;
const ALARM = `snooze-expire-${SCOPE}`;
const STARTUP_GUARD_MS = 10_000;

const DEFAULTS = { [ENABLED_KEY]: true, [SNOOZE_KEY]: 0 };
const sessionStore = chrome.storage && chrome.storage.session;

// Guard against Chrome's session-restore tabs from being pulled to the front.

let startupGuardUntil = 0;
let startupGuardLoaded = false;

// prime the cached guard value when the worker spins up
loadStartupGuard().catch(() => {
	startupGuardLoaded = true;
});

async function getState() {
	const got = await chrome.storage.local.get(DEFAULTS);
	return { enabled: !!got[ENABLED_KEY], snoozeUntil: got[SNOOZE_KEY] || 0 };
}

async function setState(patch) {
	const set = {};
	if (patch.enabled !== undefined) set[ENABLED_KEY] = !!patch.enabled;
	if (patch.snoozeUntil !== undefined) set[SNOOZE_KEY] = patch.snoozeUntil || 0;
	await chrome.storage.local.set(set);
	await updateBadge();
}

function isActive({ enabled, snoozeUntil }) {
	return enabled && Date.now() >= (snoozeUntil || 0);
}

async function updateBadge() {
	const { enabled, snoozeUntil } = await getState();
	const now = Date.now();
	const text = !enabled ? "OFF" : snoozeUntil > now ? "Zz" : "ON";
	await chrome.action.setBadgeText({ text });
	await chrome.action.setTitle({
		title:
			text === "ON"
				? "Make New Tabs Active: enabled. Click to disable."
				: text === "Zz"
					? "Make New Tabs Active: snoozed. Click to disable."
					: "Make New Tabs Active: disabled. Click to enable."
	});
}

async function toggle() {
	const { enabled } = await getState();
	await setState({ enabled: !enabled, snoozeUntil: 0 });
	if (!enabled) chrome.alarms.clear(ALARM);
}

async function snooze(minutes) {
	const until = Date.now() + minutes * 60 * 1000;
	await setState({ enabled: true, snoozeUntil: until });
	chrome.alarms.create(ALARM, { when: until });
}

function bringToFront(tab) {
	if (!tab || tab.id === undefined) return;
	// small delay avoids races at creation time
	setTimeout(() => {
		chrome.tabs.update(tab.id, { active: true });
		// focus the containing window when possible
		if (tab.windowId !== undefined) chrome.windows.update(tab.windowId, { focused: true });
	}, 0);
}

// listeners must be top-level in MV3 service worker
chrome.runtime.onInstalled.addListener(async () => {
	await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
	await armStartupGuard();
	await updateBadge();
});

chrome.action.onClicked.addListener(() => toggle());

chrome.commands.onCommand.addListener((cmd) => {
	if (cmd === "toggle-enabled") toggle();
	if (cmd === "snooze-5") snooze(5);
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
	if (!request || typeof request !== "object") return;
	if (request.type === "toggle") {
		toggle()
			.then(() => sendResponse({ ok: true }))
			.catch((error) => sendResponse({ ok: false, error: error?.message || "toggle failed" }));
		return true;
	}
	if (request.type === "snooze") {
		const minutes = Number(request.minutes);
		if (!Number.isFinite(minutes) || minutes <= 0) {
			sendResponse({ ok: false, error: "invalid minutes" });
			return;
		}
		snooze(minutes)
			.then(() => sendResponse({ ok: true }))
			.catch((error) => sendResponse({ ok: false, error: error?.message || "snooze failed" }));
		return true;
	}
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name !== ALARM) return;
	const { snoozeUntil } = await getState();
	if (Date.now() >= (snoozeUntil || 0)) await setState({ snoozeUntil: 0 });
});

chrome.tabs.onCreated.addListener(async (tab) => {
	await loadStartupGuard();
	if (isStartupGuardActive()) return;
	if (tab.discarded) return;
	const state = await getState();
	if (!isActive(state)) return;
	if (!tab.active) bringToFront(tab);
});

async function armStartupGuard() {
	const until = Date.now() + STARTUP_GUARD_MS;
	startupGuardUntil = until;
	startupGuardLoaded = true;
	if (!sessionStore) return;
	await storageSessionSet({ [STARTUP_GUARD_KEY]: until }).catch(() => {});
}

async function loadStartupGuard() {
	if (startupGuardLoaded) return;
	if (!sessionStore) {
		startupGuardLoaded = true;
		return;
	}
	try {
		const got = await storageSessionGet({ [STARTUP_GUARD_KEY]: 0 });
		startupGuardUntil = got[STARTUP_GUARD_KEY] || 0;
	} catch (_err) {
		startupGuardUntil = 0;
	}
	startupGuardLoaded = true;
}

function isStartupGuardActive() {
	if (!startupGuardUntil) return false;
	if (Date.now() >= startupGuardUntil) {
		startupGuardUntil = 0;
		if (sessionStore) sessionStore.remove(STARTUP_GUARD_KEY, () => {});
		return false;
	}
	return true;
}

function storageSessionGet(defaults) {
	return new Promise((resolve, reject) => {
		if (!sessionStore) {
			resolve(defaults);
			return;
		}
		sessionStore.get(defaults, (result) => {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
				return;
			}
			resolve(result);
		});
	});
}

function storageSessionSet(values) {
	return new Promise((resolve, reject) => {
		if (!sessionStore) {
			resolve();
			return;
		}
		sessionStore.set(values, () => {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
				return;
			}
			resolve();
		});
	});
}
