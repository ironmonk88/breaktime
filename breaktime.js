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

class BreakTime {
    static app = null;
    static players = [];
    static awayUsers = new Set();

    static async init() {
        log("initializing");

        BreakTime.SOCKET = "module.breaktime";

        game.settings.register("breaktime", "paused", {
            scope: "world",
            config: false,
            default: false,
            type: Boolean,
        });

        // init socket
        game.socket.on(BreakTime.SOCKET, (data) => {
            if (data.start == true) {
                BreakTime.startBreak();
            } else if (data.state != undefined) {
                BreakTime.toggleReturned(data.senderId, data.state);
            } else if (data.away != undefined)
                BreakTime.stepAway(data.away, data.senderId);
        });
    }

    static async ready() {
        if (game.settings.get("breaktime", "paused"))
            BreakTime.startBreak();
    }

    static pause() {
        //if this is the GM and shift is being held down, then start a break time
        if (game.paused) {
            if (game.user.isGM && game.keyboard.isDown("Shift")) {
                game.socket.emit(
                    BreakTime.SOCKET,
                    {
                        senderId: game.user._id,
                        start: true
                    },
                    (resp) => { }
                );
                BreakTime.startBreak();
            }
        } else {
            BreakTime.closeApp();
        }
    }

    static startBreak() {
        //find all active users, including the GM
        BreakTime.players = game.users.entities.filter((el) => el.active).map((el) => {
            return {
                name: el.name,
                id: el.id,
                avatar: el.avatar,
                color: el.color,
                character: (el.isGM ? "GM" : el.character.name),
                self: el.isSelf,
                state: false
            };
        });

        BreakTime.showDialog();
        if(game.user.isGM)
            game.settings.set("breaktime", "paused", true);
    }

    static async closeApp() {
        if (BreakTime.app != null) {
            BreakTime.app.close().then(() => {
                BreakTime.app = null;
                if (game.user.isGM && game.paused) {
                    game.togglePause(false, true);
                    game.settings.set("breaktime", "paused", false);
                }
                else
                    BreakTime.changeReturnedState(true);
            });
        }
    }

    static showDialog() {
        BreakTime.app = new BreakTimeApplication().render(true);
    }

    static changeReturnedState(state) {
        var player = BreakTime.players.filter((el) => el.id == game.user._id)[0];
        BreakTime.toggleReturned(game.user._id, (state != undefined ? state : !player.state));
        game.socket.emit(
            BreakTime.SOCKET,
            {
                senderId: game.user._id,
                state: player.state
            },
            (resp) => { }
        );
    }

    static toggleReturned(user, state) {
        var player = BreakTime.players.filter((el) => el.id == user)[0];
        player.state = state;
        if (BreakTime.app != undefined)
            BreakTime.app.render(true);
    }

    static stepAway(away, userId) {
        if (userId == undefined)
            userId = game.user._id;
        if (BreakTime.awayUsers.has(userId) && away === false)
            BreakTime.awayUsers.delete(userId);
        else if (!BreakTime.awayUsers.has(userId) && away === true)
            BreakTime.awayUsers.add(userId);

        //send message declaring if you're back
        if (userId == game.user._id) {
            const isaway = BreakTime.awayUsers.has(userId);

            const messageData = {
                content: (isaway ? "I'm stepping away for a second." : "I'm back.")
            };
            ChatMessage.create(messageData);

            game.socket.emit(
                BreakTime.SOCKET,
                {
                    senderId: game.user._id,
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
        var player = BreakTime.players.filter((el) => el.id == game.user._id)[0];
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
Hooks.on("pauseGame", BreakTime.pause);
Hooks.on("closeBreakTimeApplication", BreakTime.closeApp);
Hooks.on("getSceneControlButtons", BreakTime.addAwayButton);
Hooks.on('renderPlayerList', (playerList, $html, data) => {
    BreakTime.awayUsers.forEach((userId) => {
        const styles = `flex:0 0 17px;width:17px;height:16px;border:0`;
        const title = `Player is currently away`
        const i = `<i style="${styles}" class="fas fa-door-open" title="${title}"></i>`;
        $html.find(`[data-user-id="${userId}"]`).append(i);
        $html.find(`[data-user-id="${userId}"] .player-active`).css({background:'transparent'});
    });
});
