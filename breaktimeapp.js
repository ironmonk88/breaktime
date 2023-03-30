import { BreakTime, setting, i18n } from "./breaktime.js";

export class BreakTimeApplication extends Application {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions,
            {
                title: i18n("BREAKTIME.app.title"),
                id: "breaktime-app",
                template: "modules/breaktime/templates/breaktime.html",
                width: 300,
                height: 'auto',
                resizable: false,
            });
    }

    getData() {
        let awayData = setting("away");
        let me = null;
        const players = game.users.contents.filter((el) => el.active).map((el) => {
            const player = {
                name: el.name,
                id: el.id,
                avatar: el.avatar,
                color: el.color,
                character: (el.isGM ? "GM" : el?.character?.name),
                self: el.isSelf,
                state: (setting('break')[el.id] || (awayData.includes(el.id) ? "away" : "")),
            };
            if (el.id == game.user.id) me = player;
            return player;
        });

        let remaining = setting("remaining") ? this.getRemainingTime() : null;

        return mergeObject(super.getData(), {
            players: players,
            my: me,
            gm: game.user.isGM,
            timestart: new Date(setting("start")).toLocaleTimeString('en-US', {
                hour: "numeric",
                minute: "numeric",
                second: "numeric"
            }),
            remaining: remaining
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
        this.element.find("#back-btn").click(this._changeReturnedState.bind(this, 'back'));
        this.element.find("#away-btn").click(this._changeReturnedState.bind(this, 'away'));

        $('button.set-time', html).click(this.setTime.bind(this))

        if (game.user.isGM) {
            this.element.find(".breaktime-avatar").click(this._changePlayerState.bind(this, 'back')).contextmenu(this._changePlayerState.bind(this, 'away'));
        } else {
            this.element.find(`.breaktime-player[data-user-id="${game.user.id}"] .breaktime-avatar`).click(this._changePlayerState.bind(this, 'back')).contextmenu(this._changePlayerState.bind(this, 'away'));
        }

        if (setting("remaining")) {
            if (this.remainingTimer)
                window.clearInterval(this.remainingTimer);
            this.remainingTimer = window.setInterval(() => {
                let done;
                $('.remaining-timer', html).val(this.getRemainingTime(done));
                if (done) {
                    window.clearInterval(this.remainingTimer);
                }
            }, 1000);
        }
    }

    getRemainingTime(done) {
        let remaining = new Date(setting("remaining"));
        let diff = Math.ceil((remaining - Date.now()) / 1000);
        if (diff <= 0) {
            done = true;
            return "Break is over";
        } else {
            let min = Math.ceil(diff / 60);
            let sec = (diff > 120 ? null : diff % 60)
            return `Returning in: ${min ? min : ""}${sec != null ? ":" + String(sec).padStart(2, '0') : " min"}`;
        }
    }

    _changeReturnedState(state) {
        BreakTime.emit("changeReturned", { userId: game.user.id, state: state });
    }

    _changePlayerState(state, event) {
        let playerId = event.currentTarget.closest('.breaktime-player').dataset.userId;
        BreakTime.emit("changeReturned", { userId: playerId, state: state });
    }

    setTime() {
        Dialog.confirm({
            title: "Set Time Remaining",
            content: `<p class="notes">Set the time remaining for this break (minutes)</p><input type="text" style="float:right; margin-bottom: 10px;text-align: right;width: 150px;" value="${setting("break-time")}"/> `,
            yes: async (html) => {
                let value = parseInt($('input', html).val());
                if (isNaN(value) || value == 0)
                    await game.settings.set("breaktime", "remaining", null);
                else {
                    let remaining = new Date(Date.now() + value * 60000);
                    await game.settings.set("breaktime", "remaining", remaining);
                }
                BreakTime.emit("refresh");
            }
        });
    }

    async close(options = {}) {
        super.close(options);
        if (game.user.isGM)
            BreakTime.endBreak();
        else {
            if (options.ignore !== true) BreakTime.emit("changeReturned", { state: "back" });
        }
        BreakTime.app = null;
    }
}