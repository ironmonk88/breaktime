import { registerSettings } from "./settings.js";
import { BreakTimeApplication } from "./breaktimeapp.js";

export let debug = (...args) => {
    if (debugEnabled > 1) console.log("DEBUG: breaktime | ", ...args);
};
export let log = (...args) => console.log("breaktime | ", ...args);
export let warn = (...args) => {
    if (debugEnabled > 0) console.warn("breaktime | ", ...args);
};
export let error = (...args) => console.error("breaktime | ", ...args);
export let i18n = key => {
    return game.i18n.localize(key);
};

export let setting = key => {
    return game.settings.get("breaktime", key);
};

export class BreakTime {
    static app = null;

    static async init() {
        log("initializing");

        BreakTime.SOCKET = "module.breaktime";

        // init socket
        game.socket.on(BreakTime.SOCKET, BreakTime.onMessage);
    }

    static async setup() {
        registerSettings();
    }

    static async ready() {
        if (setting("paused"))
            BreakTime.showApp();

        BreakTime.registerHotKeys();
    }

    static emit(action, args = {}) {
        args.action = action;
        args.senderId = game.user.id;
        game.socket.emit(BreakTime.SOCKET, args, (resp) => { });
        BreakTime.onMessage(args);
    }

    static onMessage(data) {
        BreakTime[data.action].call(BreakTime, data);
    }

    static registerHotKeys() {
        if (game.user.isGM) {
            Hotkeys.registerGroup({
                name: 'breaktime-pause-key',
                label: i18n("BREAKTIME.hotkey.label"),
                description: i18n("BREAKTIME.hotkey.description")
            });

            Hotkeys.registerShortcut({
                name: `breaktime-pause`,
                label: i18n("BREAKTIME.hotkey.pausekey"),
                group: 'breaktime-pause-key',
                default: () => { return { key: Hotkeys.keys.Home, alt: false, ctrl: false, shift: true }; },
                onKeyDown: (e) => {
                    if (game.user.isGM) BreakTime.startBreak();
                }
            });
        }
    }

    static async startBreak() {
        await game.settings.set("breaktime", "break", {});
        await game.settings.set("breaktime", "paused", true);
        BreakTime.emit("showApp");

        //BreakTime.showDialog();
        if (setting('auto-pause'))
            game.togglePause(true, true);
    }

    static async endBreak() {
        if (setting('auto-pause') && game.paused)
            game.togglePause(false, true);
        await game.settings.set("breaktime", "paused", false);
        BreakTime.emit("closeApp");
    }

    static showApp() {
        if (BreakTime.app == null)
            BreakTime.app = new BreakTimeApplication().render(true);
        else
            BreakTime.app.render(true);
    }

    static async closeApp() {
        if (BreakTime.app != null && BreakTime.app.rendered) {
            BreakTime.app.close({ ignore: true }).then(() => {
                BreakTime.app = null;
            });
        } else
            BreakTime.app = null;
    }

    static async changeReturned(data) {
        if (game.user.isGM) {
            let userId = data.senderId || game.user.id;
            let state = (data.state != undefined ? data.state : !setting("break")[userId]);
            let players = setting("break");
            players[userId] = state;
            await game.settings.set("breaktime", "break", players);
            BreakTime.emit("refresh");
        }
    }

    static async stepAway(data = {}) {
        let userId = data.senderId || game.user.id;

        if (game.user.isGM) {
            let players = setting("away");

            if (players.includes(userId) && data.away === false)
                players.findSplice((id) => id == userId);
            else if (!players.includes(userId) && data.away === true)
                players.push(userId);

            await game.settings.set("breaktime", "away", players);
            BreakTime.emit("refreshPlayerUI");
        }

        //send message declaring if you're back
        if (userId == game.user.id) {
            const message = data.message || i18n(data.away ? setting("away-text") : setting("back-text"));

            const messageData = {
                content: message,
                type: CONST.CHAT_MESSAGE_TYPES.OOC
            };
            ChatMessage.create(messageData);

            let tool = ui.controls.controls.find(c => c.name == 'token')?.tools.find(t => t.name == 'togglebreak');
            if(tool) tool.active = data.away;
            ui.controls.render();
        }
    }

    static refresh() {
        if (BreakTime.app && BreakTime.app.rendered)
            BreakTime.app.render();
    }

    static refreshPlayerUI() {
        ui.players.render();
    }
}

Hooks.once('init', BreakTime.init);
Hooks.once('setup', BreakTime.setup);
Hooks.once('ready', BreakTime.ready);
//Hooks.on("pauseGame", BreakTime.pause);
//Hooks.on("closeBreakTimeApplication", BreakTime.closeApp);
Hooks.on("getSceneControlButtons", (controls) => {
    let tokenControls = controls.find(control => control.name === "token")
    tokenControls.tools.push({
        name: "togglebreak",
        title: "BREAKTIME.button.title",
        icon: "fas fa-door-open",
        onClick: (away) => {
            BreakTime.emit("stepAway", { away: away });
        },
        toggle: true,
        active: setting("away").includes(game.user.id)
    });
});

Hooks.on('renderPlayerList', async (playerList, html, data) => {
    //BreakTime.getPlayers();
    if (BreakTime.app && BreakTime.app.rendered) {
        BreakTime.app.render(true);
    }

    setting("away").forEach((userId) => {
        const styles = `flex:0 0 17px;width:17px;height:16px;border:0`;
        const title = i18n("BREAKTIME.app.playerisaway")
        const i = `<i style="${styles}" class="fas fa-door-open" title="${title}"></i>`;
        html.find(`[data-user-id="${userId}"]`).append(i);
        html.find(`[data-user-id="${userId}"] .player-active`).css({background:'transparent'});
    });

    if (setting('show-button') && game.user.isGM) {
        $('<h3>').addClass('breaktime-button')
            .append(`<div><i class="fas fa-coffee"></i> ${i18n("BREAKTIME.app.breaktime")}</div>`)
            .insertAfter($('h3', html))
            .click(BreakTime.startBreak.bind());
    }
});

Hooks.on("chatCommandsReady", function (chatCommands) {
    chatCommands.registerCommand(chatCommands.createCommandFromData({
        commandKey: "/brb",
        invokeOnCommand: (chatlog, messageText, chatdata) => {
            BreakTime.emit("stepAway", { away: true, message: messageText });
        },
        shouldDisplayToChat: false,
        iconClass: "fa-door-open",
        description: i18n("BREAKTIME.app.chataway")
    }));

    chatCommands.registerCommand(chatCommands.createCommandFromData({
        commandKey: "/back",
        invokeOnCommand: (chatlog, messageText, chatdata) => {
            BreakTime.emit("stepAway", { away: false, message: messageText });
        },
        shouldDisplayToChat: false,
        iconClass: "fa-door-closed",
        description: i18n("BREAKTIME.app.chatback")
    }));
});
