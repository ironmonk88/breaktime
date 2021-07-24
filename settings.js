import { i18n } from "./breaktime.js";

export const registerSettings = function () {
    // Register any custom module settings here
	let modulename = "breaktime";

	game.settings.register("breaktime", "paused", {
		scope: "world",
		config: false,
		default: false,
		type: Boolean,
	});

	game.settings.registerMenu(modulename, 'hot-keys', {
		name: 'Change Hotkeys',
		label: 'Change Hotkeys',
		hint: 'Change the hotkeys that this module uses',
		icon: 'fas fa-keyboard',
		restricted: true,
		type: Hotkeys.createConfig('Breaktime', ['breaktime'])
	});

	game.settings.register(modulename, "auto-pause", {
		name: "Automatically Pause",
		hint: "Automatically pause when opening up the Breaktime window",
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
	});
}