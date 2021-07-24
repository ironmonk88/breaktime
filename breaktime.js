import { registerSettings } from "./settings.js";

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

class BreakTime {
    static app = null;
    static players = [];
    static awayUsers = new Set();

    static async init() {
        log("initializing");

        BreakTime.SOCKET = "module.breaktime";

        registerSettings();

        // init socket
        game.socket.on(BreakTime.SOCKET, (data) => {
            if (data.start == true) {
                BreakTime.showDialog();
            }else if (data.end == true) {
                BreakTime.closeApp();
            } else if (data.state != undefined) {
                BreakTime.toggleReturned(data.senderId, data.state);
            } else if (data.away != undefined)
                BreakTime.stepAway(data.away, data.senderId);
        });
    }

    static async ready() {
        if (game.settings.get("breaktime", "paused"))
            BreakTime.showDialog();

        BreakTime.registerHotKeys();
        /*
        let oldSpace = game.keyboard._onSpace;
        game.keyboard._onSpace = function _onSpace(event, up, modifiers) {
            if (game.user.isGM && !up && modifiers.isShift) {
                event.preventDefault();
                game.togglePause(undefined, true);
                return this._handled.add(modifiers.key);
            } else
                return oldSpace.call(this, event, up, modifiers);
        }*/
    }

    /*
    static pause() {
        //if this is the GM and shift is being held down, then start a break time
        log('Paused', game.paused);
        if (game.paused) {
            if (game.user.isGM && game.keyboard.isDown("Shift")) {
                game.socket.emit(
                    BreakTime.SOCKET,
                    {
                        senderId: game.user.id,
                        start: true
                    },
                    (resp) => { }
                );
                BreakTime.startBreak();
            }
        } else {
            BreakTime.closeApp();
        }
    }*/

    static getPlayers() {
        //find all active users, including the GM
        BreakTime.players = game.users.contents.filter((el) => el.active).map((el) => {
            return {
                name: el.name,
                id: el.id,
                avatar: el.avatar,
                color: el.color,
                character: (el.isGM ? "GM" : el?.character?.name),
                self: el.isSelf,
                state: false
            };
        });

        log('Getting players:', BreakTime.players);
    }

    static startBreak() {
        game.socket.emit(
            BreakTime.SOCKET,
            {
                senderId: game.user.id,
                start: true
            },
            (resp) => { }
        );

        BreakTime.showDialog();
        if (setting('auto-pause'))
            game.togglePause(true, true);
        if(game.user.isGM)
            game.settings.set("breaktime", "paused", true);
    }

    static async closeApp() {
        if (BreakTime.app != null) {
            BreakTime.app.close().then(() => {
                BreakTime.app = null;
                if (game.user.isGM) {
                    if (setting('auto-pause') && game.paused)
                        game.togglePause(false, true);
                    game.settings.set("breaktime", "paused", false);
                    game.socket.emit(
                        BreakTime.SOCKET,
                        {
                            senderId: game.user.id,
                            end: true
                        },
                        (resp) => { }
                    );
                }
                else
                    BreakTime.changeReturnedState(true);
            });
        }
    }

    static showDialog() {
        if (BreakTime.app == null) {
            BreakTime.getPlayers();
            BreakTime.app = new BreakTimeApplication().render(true);
        } else
            BreakTime.app.render(true);
    }

    static changeReturnedState(state) {
        var player = BreakTime.players.filter((el) => el.id == game.user.id)[0];
        BreakTime.toggleReturned(game.user.id, (state != undefined ? state : !player.state));
        game.socket.emit(
            BreakTime.SOCKET,
            {
                senderId: game.user.id,
                state: player.state
            },
            (resp) => { }
        );
    }

    static toggleReturned(user, state) {
        var player = BreakTime.players.filter((el) => el.id == user)[0];
        if (player != undefined) {
            player.state = state;
            if (BreakTime.app != undefined)
                BreakTime.app.render(true);
        }
    }

    static stepAway(away, userId) {
        if (userId == undefined)
            userId = game.user.id;
        if (BreakTime.awayUsers.has(userId) && away === false)
            BreakTime.awayUsers.delete(userId);
        else if (!BreakTime.awayUsers.has(userId) && away === true)
            BreakTime.awayUsers.add(userId);

        //send message declaring if you're back
        if (userId == game.user.id) {
            const isaway = BreakTime.awayUsers.has(userId);

            const messageData = {
                content: i18n(isaway ? "BREAKTIME.app.away" : "BREAKTIME.app.back"),
                type: CONST.CHAT_MESSAGE_TYPES.OOC
            };
            ChatMessage.create(messageData);

            game.socket.emit(
                BreakTime.SOCKET,
                {
                    senderId: game.user.id,
                    away: isaway
                },
                (resp) => { }
            );
        }

        ui.players.render();
    }

    static addAwayButton(controls) {
        let tokenControls = controls.find(control => control.name === "token")
        tokenControls.tools.push({
            name: "togglebreak",
            title: "BREAKTIME.button.title",
            icon: "fas fa-door-open",
            onClick: BreakTime.stepAway,
            toggle: true
        });
        /*controls.push({
            name: "togglebreak",
            title: "BREAKTIME.button.title",
            icon: "fas fa-door-open",
            onClick: BreakTime.stepAway,
            toggle: true
        });*/
    }

    static registerHotKeys() {
        if (game.user.isGM) {
            Hotkeys.registerGroup({
                name: 'breaktime-pause-key',
                label: 'BreakTime, Pause Key',
                description: 'Use this key to activate BreakTime'
            });

            Hotkeys.registerShortcut({
                name: `breaktime-pause`,
                label: `Pause Key`,
                group: 'breaktime-pause-key',
                default: () => { return { key: Hotkeys.keys.Home, alt: false, ctrl: false, shift: true }; },
                onKeyDown: (e) => {
                    BreakTime.startBreak();
                }
            });
        }
    }
}

class BreakTimeApplication extends Application {

    static get defaultOptions() {
        const options = super.defaultOptions;
        options.title = `${game.i18n.localize("BREAKTIME.app.title")}`;
        options.id = "breaktime-app";
        options.template = "modules/breaktime/templates/breaktime.html";
        options.width = 300;
        options.resizable = false;
        return options;
    }

    getData() {
        var player = BreakTime.players.filter((el) => el.id == game.user.id)[0];
        return {
            players: BreakTime.players,
            my: player
        }
    }

    activateListeners(html) {
        super.activateListeners(html);
        this.element.find("#breaktime-btn").click(this._changeReturnedState.bind(this))
    }

    _changeReturnedState() {
        BreakTime.changeReturnedState();
    }
}

Hooks.once('init', BreakTime.init);
Hooks.once('ready', BreakTime.ready);
//Hooks.on("pauseGame", BreakTime.pause);
Hooks.on("closeBreakTimeApplication", BreakTime.closeApp);
Hooks.on("getSceneControlButtons", BreakTime.addAwayButton);
Hooks.on('renderPlayerList', async (playerList, $html, data) => {
    BreakTime.getPlayers();
    if (BreakTime.app) {
        BreakTime.app.render(true);
        window.setTimeout(function () { BreakTime.app.setPosition(); }, 500);
    }

    BreakTime.awayUsers.forEach((userId) => {
        const styles = `flex:0 0 17px;width:17px;height:16px;border:0`;
        const title = `Player is currently away`
        const i = `<i style="${styles}" class="fas fa-door-open" title="${title}"></i>`;
        $html.find(`[data-user-id="${userId}"]`).append(i);
        $html.find(`[data-user-id="${userId}"] .player-active`).css({background:'transparent'});
    });
});

Hooks.on("chatCommandsReady", function (chatCommands) {
    chatCommands.registerCommand(chatCommands.createCommandFromData({
        commandKey: "/brb",
        invokeOnCommand: (chatlog, messageText, chatdata) => {
            BreakTime.stepAway(true);
        },
        shouldDisplayToChat: false,
        iconClass: "fa-door-open",
        description: i18n("BREAKTIME.app.chataway")
    }));

    chatCommands.registerCommand(chatCommands.createCommandFromData({
        commandKey: "/back",
        invokeOnCommand: (chatlog, messageText, chatdata) => {
            BreakTime.stepAway(false);
        },
        shouldDisplayToChat: false,
        iconClass: "fa-door-closed",
        description: i18n("BREAKTIME.app.chatback")
    }));
});
