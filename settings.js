import { i18n } from "./breaktime.js";

export const registerSettings = function () {
    // Register any custom module settings here
	let modulename = "breaktime";

	const debouncedReload = foundry.utils.debounce(function () { window.location.reload(); }, 100);

	game.settings.register("breaktime", "paused", {
		scope: "world",
		config: false,
		default: false,
		type: Boolean,
	});

	game.settings.register("breaktime", "away", {
		scope: "world",
		config: false,
		default: [],
		type: Object,
	});

	game.settings.register("breaktime", "break", {
		scope: "world",
		config: false,
		default: {},
		type: Object,
	});

	game.settings.register(modulename, "auto-pause", {
		name: i18n("BREAKTIME.setting.auto-pause.name"),
		hint: i18n("BREAKTIME.setting.auto-pause.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
	});

	game.settings.register(modulename, "show-button", {
		name: i18n("BREAKTIME.setting.show-button.name"),
		hint: i18n("BREAKTIME.setting.show-button.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		onChange: debouncedReload,
	});

	game.settings.register(modulename, "away-text", {
		name: i18n("BREAKTIME.setting.away-text.name"),
		scope: "client",
		config: true,
		default: i18n("BREAKTIME.app.away"),
		type: String,
	});

	game.settings.register(modulename, "back-text", {
		name: i18n("BREAKTIME.setting.back-text.name"),
		scope: "client",
		config: true,
		default: i18n("BREAKTIME.app.back"),
		type: String,
	});
}