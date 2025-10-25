// Make New Tabs Active
// Bring new tabs to the front, with toggle + snooze

const SCOPE = chrome.extension.inIncognitoContext ? "incog" : "normal";
const ENABLED_KEY = `enabled_${SCOPE}`;
const SNOOZE_KEY = `snoozeUntil_${SCOPE}`;
const ALARM = `snooze-expire-${SCOPE}`;

const DEFAULTS = { [ENABLED_KEY]: true, [SNOOZE_KEY]: 0 };

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
	chrome.contextMenus.create({
		id: "snooze-5",
		title: "Snooze 5 minutes",
		contexts: ["action"]
	});
	chrome.contextMenus.create({
		id: "snooze-15",
		title: "Snooze 15 minutes",
		contexts: ["action"]
	});
});

chrome.runtime.onStartup.addListener(updateBadge);

chrome.contextMenus.onClicked.addListener((info) => {
	if (info.menuItemId === "snooze-5") snooze(5);
	if (info.menuItemId === "snooze-15") snooze(15);
});

chrome.action.onClicked.addListener(() => toggle());

chrome.commands.onCommand.addListener((cmd) => {
	if (cmd === "toggle-enabled") toggle();
	if (cmd === "snooze-5") snooze(5);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name !== ALARM) return;
	const { snoozeUntil } = await getState();
	if (Date.now() >= (snoozeUntil || 0)) await setState({ snoozeUntil: 0 });
});

chrome.tabs.onCreated.addListener(async (tab) => {
	const state = await getState();
	if (!isActive(state)) return;
	if (!tab.active) bringToFront(tab);
});