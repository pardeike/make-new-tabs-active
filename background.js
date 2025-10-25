// Make New Tabs Active
// Bring new tabs to the front, with toggle + snooze

// Note: In MV3, incognito context is determined per-window, not per-service-worker.
// We use "normal" scope for the service worker and handle incognito state via window queries.
const SCOPE = "normal";
const ENABLED_KEY = `enabled_${SCOPE}`;
const SNOOZE_KEY = `snoozeUntil_${SCOPE}`;
const SNOOZE_MINUTES_KEY = `snoozeMinutes_${SCOPE}`;
const STARTUP_GUARD_KEY = `startupGuardUntil_${SCOPE}`;
const ALARM = `snooze-expire-${SCOPE}`;
const STARTUP_GUARD_MS = 10_000;

const DEFAULTS = { [ENABLED_KEY]: true, [SNOOZE_KEY]: 0, [SNOOZE_MINUTES_KEY]: 5 };
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
	return {
		enabled: !!got[ENABLED_KEY],
		snoozeUntil: got[SNOOZE_KEY] || 0,
		snoozeMinutes: toValidMinutes(got[SNOOZE_MINUTES_KEY]) || DEFAULTS[SNOOZE_MINUTES_KEY],
	};
}

async function setState(patch) {
	const set = {};
	if (patch.enabled !== undefined) set[ENABLED_KEY] = !!patch.enabled;
	if (patch.snoozeUntil !== undefined) set[SNOOZE_KEY] = patch.snoozeUntil || 0;
	if (patch.snoozeMinutes !== undefined) {
		const minutes = toValidMinutes(patch.snoozeMinutes);
		if (minutes) set[SNOOZE_MINUTES_KEY] = minutes;
	}
	if (!Object.keys(set).length) return;
	await chrome.storage.local.set(set);
	await updateBadge();
}

function toValidMinutes(value) {
	const minutes = Number.parseInt(value, 10);
	if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) return null; // Max 24 hours
	return minutes;
}

function isActive({ enabled, snoozeUntil }) {
	return enabled && Date.now() >= (snoozeUntil || 0);
}

function isSnoozed({ enabled, snoozeUntil }) {
	return enabled && Date.now() < (snoozeUntil || 0);
}

async function updateBadge() {
	const { enabled, snoozeUntil } = await getState();
	const now = Date.now();
	if (!enabled) {
		chrome.action.setTitle({ title: chrome.i18n.getMessage("statusDisabled") || "Disabled" });
		chrome.action.setIcon({ path: "disabled.png" });
	} else if (snoozeUntil > now) {
		const until = new Date(snoozeUntil);
		const time = until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
		const snoozedTitle = chrome.i18n.getMessage("statusSnoozedUntil", time) || `Snoozed until ${time}`;
		chrome.action.setTitle({ title: snoozedTitle });
		chrome.action.setIcon({ path: "snoozed.png" });
	} else {
		chrome.action.setTitle({ title: chrome.i18n.getMessage("statusEnabled") || "Enabled" });
		chrome.action.setIcon({ path: "icon.png" });
	}
}

async function toggle() {
	const state = await getState();
	if (isSnoozed(state)) {
		await unsnooze();
		return;
	}
	const nextEnabled = !state.enabled;
	await setState({ enabled: nextEnabled, snoozeUntil: 0 });
	chrome.alarms.clear(ALARM);
}

async function snooze(minutes) {
	const appliedMinutes = toValidMinutes(minutes) || (await getState()).snoozeMinutes;
	const until = Date.now() + appliedMinutes * 60 * 1000;
	await setState({ enabled: true, snoozeUntil: until });
	chrome.alarms.create(ALARM, { when: until });
}

async function unsnooze() {
	await setState({ enabled: true, snoozeUntil: 0 });
	chrome.alarms.clear(ALARM);
}

function bringToFront(tab) {
	if (!tab || tab.id === undefined) return;
	// small delay avoids races at creation time
	setTimeout(() => {
		chrome.tabs.update(tab.id, { active: true }).catch(() => {
			// Tab may have been closed, ignore the error
		});
		// focus the containing window when possible
		if (tab.windowId !== undefined) {
			chrome.windows.update(tab.windowId, { focused: true }).catch(() => {
				// Window may have been closed, ignore the error
			});
		}
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

chrome.commands.onCommand.addListener(async (cmd) => {
	if (cmd === "toggle-enabled") {
		await toggle();
		return;
	}
	if (cmd === "snooze") {
		const { snoozeMinutes } = await getState();
		await snooze(snoozeMinutes);
	}
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
		const minutes = toValidMinutes(request.minutes);
		if (!minutes) {
			sendResponse({ ok: false, error: "invalid minutes" });
			return;
		}
		snooze(minutes)
			.then(() => sendResponse({ ok: true }))
			.catch((error) => sendResponse({ ok: false, error: error?.message || "snooze failed" }));
		return true;
	}
	if (request.type === "setSnoozeMinutes") {
		const minutes = toValidMinutes(request.minutes);
		if (!minutes) {
			sendResponse({ ok: false, error: "invalid minutes" });
			return;
		}
		setState({ snoozeMinutes: minutes })
			.then(() => sendResponse({ ok: true }))
			.catch((error) => sendResponse({ ok: false, error: error?.message || "save failed" }));
		return true;
	}
	if (request.type === "unsnooze") {
		unsnooze()
			.then(() => sendResponse({ ok: true }))
			.catch((error) => sendResponse({ ok: false, error: error?.message || "unsnooze failed" }));
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
	await storageSessionSet({ [STARTUP_GUARD_KEY]: until }).catch(() => { });
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
		if (sessionStore) {
			sessionStore.remove(STARTUP_GUARD_KEY).catch(() => {
				// Ignore errors when removing startup guard
			});
		}
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
