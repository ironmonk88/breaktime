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
        BreakTime.registerHotKeys();
    }

    static async setup() {
        registerSettings();
    }

    static async ready() {
        if (setting("paused")) {
            BreakTime.showApp();
        }
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
        game.keybindings.register('breaktime', 'breaktime-pause', {
            name: 'BREAKTIME.hotkey.pausekey',
            restricted: true,
            editable: [
                { key: 'Home', modifiers: [KeyboardManager.MODIFIER_KEYS?.SHIFT] },
                { key: 'Space', modifiers: [KeyboardManager.MODIFIER_KEYS?.SHIFT] }
            ],
            onDown: () => {
                if (game.user.isGM)
                    BreakTime.startBreak();
                return true;
            }
        });
    }

    static async startBreak() {
        if (setting("paused"))
            BreakTime.showApp();
        else {
            await game.settings.set("breaktime", "break", {});
            await game.settings.set("breaktime", "start", Date.now());
            await game.settings.set("breaktime", "paused", true);
            BreakTime.emit("showApp");

            //BreakTime.showDialog();
            if (setting('auto-pause'))
                game.togglePause(true, true);
        }
    }

    static async endBreak() {
        if (setting('auto-pause') && game.paused)
            game.togglePause(false, true);
        await game.settings.set("breaktime", "paused", false);
        await game.settings.set("breaktime", "remaining", null);
        BreakTime.emit("closeApp");
    }

    static async showApp() {
        if (BreakTime.app == null)
            BreakTime.app = new BreakTimeApplication().render(true);
        else
            BreakTime.app.render(true);

        /*
        if (setting("slideshow") && game.modules.get("monks-enhanced-journal")?.active && !BreakTime.slideshow) {
            BreakTime.slideshow = game.MonksEnhancedJournal.startSlideshow(setting("slideshow"));
        }*/

        if (setting("break-sound")) {
            const audiofiles = await BreakTime.getBreakSounds();

            //audiofiles = audiofiles.filter(i => (audiofiles.length === 1) || !(i === this._lastWildcard));
            if (audiofiles.length > 0) {
                const audiofile = audiofiles[Math.floor(Math.random() * audiofiles.length)];

                let volume = (setting('volume') / 100);
                AudioHelper.play({ src: audiofile, volume: volume });
            }
        }

        if (!game.user.isGM)
            ui.players.render();
    }

    static async getBreakSounds() {
        const audiofile = setting('break-sound');

        if (!audiofile.includes('*')) return [audiofile];
        if (BreakTime.sounds) return BreakTime.sounds;
        let source = "data";
        let pattern = audiofile;
        const browseOptions = { wildcard: true };

        // Support S3 matching
        if (/\.s3\./.test(pattern)) {
            source = "s3";
            const { bucket, keyPrefix } = FilePicker.parseS3URL(pattern);
            if (bucket) {
                browseOptions.bucket = bucket;
                pattern = keyPrefix;
            }
        }

        // Retrieve wildcard content
        try {
            const content = await FilePicker.browse(source, pattern, browseOptions);
            BreakTime.sounds = content.files;
        } catch (err) {
            BreakTime.sounds = [];
            ui.notifications.error(err);
        }
        return BreakTime.sounds;
    }

    static async closeApp() {
        if (BreakTime.app != null && BreakTime.app.rendered) {
            BreakTime.app.close({ ignore: true }).then(() => {
                BreakTime.app = null;
            });
        } else
            BreakTime.app = null;

        /*
        if (setting("slideshow") && game.modules.get("monks-enhanced-journal")?.active && BreakTime.slideshow) {
            BreakTime.slideshow.stopSlideshow();
        }
        */

        if (!game.user.isGM)
            ui.players.render();
    }

    static async changeReturned(data) {
        if (game.user.isGM) {
            let userId = data.userId || data.senderId || game.user.id;
            let state = (data.state != undefined ? data.state : !setting("break")[userId]);
            let breakData = setting("break");
            breakData[userId] = state;
            await game.settings.set("breaktime", "break", breakData);
            if (state == "back") {
                let awayData = setting("away");
                if (awayData.includes(userId)) {
                    awayData.findSplice((id) => id == userId);
                    await game.settings.set("breaktime", "away", awayData);

                    BreakTime.emit("refreshToolbar", {userId: userId});
                    BreakTime.emit("refreshPlayerUI");
                }
            }
            
            BreakTime.emit("refresh");
        }
    }

    static notify(data = {}) {
        ui.notifications.warn(data.message);
    }

    static getRandomText(text) {
        let parts = text.split(";");
        let idx = Math.clamped(parseInt(Math.random() * parts.length), 0, parts.length - 1);
        return parts[idx];
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
            BreakTime.emit("refreshToolbar", { userId: game.user.id });
        }

        //send message declaring if you're back
        if (userId == game.user.id) {
            const message = data.message || (data.away ? BreakTime.getRandomText(i18n(setting("away-text"))) : BreakTime.getRandomText(i18n(setting("back-text"))));

            if (["both", "chat"].includes(setting("notify-option"))) {
                const speaker = setting("chat-bubble") ? { scene: canvas.scene.id, actor: game.user?.character?.id, alias: game.user?.name } : null;
                const messageData = {
                    content: message,
                    type: (setting("chat-bubble") ? CONST.CHAT_MESSAGE_TYPES.IC : CONST.CHAT_MESSAGE_TYPES.OOC),
                    speaker
                };
                ChatMessage.create(messageData, { chatBubble: setting("chat-bubble") });

                let tkn = canvas.scene.tokens.find(t => t.actor.id == game.user?.character?.id);
                await canvas.hud.bubbles.say(tkn?._object, message);
            }
            if (["both", "toast"].includes(setting("notify-option"))) {
                BreakTime.emit("notify", { message: `${game.user.name} - ${message}`});
                //ui.notifications.warn(`${game.user.name} - ${message}`);
            }
        }
    }

    static refresh() {
        if (BreakTime.app && BreakTime.app.rendered)
            BreakTime.app.render();
    }

    static refreshPlayerUI() {
        ui.players.render();
    }

    static refreshToolbar(data) {
        if (game.user.id == data.userId) {
            let awayData = setting("away");
            let away = awayData.includes(game.user.id);
            let tool = ui.controls.controls.find(c => c.name == 'token')?.tools.find(t => t.name == 'togglebreak');
            tool.title = (away ? "BREAKTIME.button.return" : "BREAKTIME.button.title");
            if (tool) tool.active = away;
            ui.controls.render();
        }
    }
}

Hooks.once('init', BreakTime.init);
Hooks.once('setup', BreakTime.setup);
Hooks.once('ready', BreakTime.ready);

Hooks.on("getSceneControlButtons", (controls) => {
    let awayData = setting("away");
    let tokenControls = controls.find(control => control.name === "token")
    tokenControls.tools.push({
        name: "togglebreak",
        title: (awayData.includes(game.user.id) ? "BREAKTIME.button.return" : "BREAKTIME.button.title"),
        icon: "fas fa-door-open",
        onClick: (away, event) => {
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

    if (setting('show-button') && (game.user.isGM || (!game.user.isGM && setting("paused")))) {
        $('<h3>').addClass('breaktime-button')
            .append(`<div><i class="fas fa-coffee"></i> ${i18n("BREAKTIME.app.breaktime")}</div>`)
            .insertAfter($('h3', html))
            .click(game.user.isGM ? BreakTime.startBreak.bind() : BreakTime.showApp.bind());
    }
});

Hooks.on("chatCommandsReady", function (commands) {
    if (commands.register != undefined) {
        commands.register({
            name: "/brb",
            module: "breaktime",
            callback: (chatlog, parameters, messageData) => {
                BreakTime.emit("stepAway", { away: true, message: parameters });
                return true;
            },
            shouldDisplayToChat: false,
            icon: '<i class="fas fa-door-open"></i>',
            description: i18n("BREAKTIME.app.chataway")
        });

        commands.register({
            name: "/back",
            module: "breaktime",
            callback: (chatlog, parameters, chatdata) => {
                BreakTime.emit("stepAway", { away: false, message: parameters });
                return true;
            },
            shouldDisplayToChat: false,
            icon: '<i class="fas fa-door-closed"></i>',
            description: i18n("BREAKTIME.app.chatback")
        });
    } else {
        commands.registerCommand(commands.createCommandFromData({
            commandKey: "/brb",
            invokeOnCommand: (chatlog, messageText, chatdata) => {
                BreakTime.emit("stepAway", { away: true, message: messageText || setting("away-text") });
            },
            shouldDisplayToChat: false,
            iconClass: "fa-door-open",
            description: i18n("BREAKTIME.app.chataway")
        }));

        commands.registerCommand(commands.createCommandFromData({
            commandKey: "/back",
            invokeOnCommand: (chatlog, messageText, chatdata) => {
                BreakTime.emit("stepAway", { away: false, message: messageText || setting("back-text") });
            },
            shouldDisplayToChat: false,
            iconClass: "fa-door-closed",
            description: i18n("BREAKTIME.app.chatback")
        }));
    }
});

Hooks.on("renderSettingsConfig", (app, html, data) => {
    let btn = $('<button>')
        .addClass('file-picker')
        .attr('type', 'button')
        .attr('data-type', "imagevideo")
        .attr('data-target', "img")
        .attr('title', "Browse Files")
        .attr('tabindex', "-1")
        .html('<i class="fas fa-file-import fa-fw"></i>')
        .click(function (event) {
            const fp = new FilePicker({
                type: "audio",
                wildcard: true,
                current: $(event.currentTarget).prev().val(),
                callback: path => {
                    $(event.currentTarget).prev().val(path);
                }
            });
            return fp.browse();
        });

    btn.clone(true).insertAfter($('input[name="breaktime.break-sound"]', html));
});
