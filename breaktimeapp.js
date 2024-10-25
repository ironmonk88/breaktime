import { BreakTime, setting, i18n } from "./breaktime.js";

export class BreakTimeApplication extends Application {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions,
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

        let done;
        let remaining = setting("remaining") ? this.getRemainingTime(done, true) : null;

        return foundry.utils.mergeObject(super.getData(), {
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

        $('button.set-time', html).click(this.setTime.bind(this));
        $('button.clear-remaining', html).click(this.clearRemaining.bind(this))

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
            if (!BreakTime.endPlayed && BreakTime.canPlayEnd && setting("end-break-sound") && setting("remaining")) {
                BreakTime.endPlayed = true;
                BreakTime.getBreakSounds("end-break-sound").then((audiofiles) => {
                    if (audiofiles.length > 0) {
                        const audiofile = audiofiles[Math.floor(Math.random() * audiofiles.length)];

                        let volume = (setting('volume') / 100);
                        foundry.audio.AudioHelper.play({ src: audiofile, volume: volume, loop: false }).then((soundfile) => {
                            BreakTime.endsound = soundfile;
                            soundfile.addEventListener("end", () => {
                                delete BreakTime.endsound;
                            });
                            soundfile.addEventListener("stop", () => {
                                delete BreakTime.endsound;
                            });
                            soundfile.effectiveVolume = volume;
                            return soundfile;
                        });
                    }
                });
            }
            return "Break is over";
        } else {
            const switchover = 300;
            let min = diff > switchover ? Math.ceil(diff / 60) : Math.floor(diff / 60);
            let sec = (diff > switchover ? null : diff % 60)
            return `Returning in: ${min ? min : ""}${sec != null ? (min ? ":" : "") + String(sec).padStart(2, '0') + (min ? " min" : " sec") : " min"}`;
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
                    let remaining = new Date(Date.now() + (value * 60000));
                    await game.settings.set("breaktime", "remaining", remaining);
                }
                BreakTime.emit("refresh");
            }
        });
    }

    async clearRemaining() {
        await game.settings.set("breaktime", "remaining", 0);
        BreakTime.emit("refresh");
    }

    async close(options = {}) {
        super.close(options);
        if (game.user.isGM)
            BreakTime.endBreak();
        else {
            if (options.ignore !== true) BreakTime.emit("changeReturned", { state: "back" });

            if (BreakTime.sound && BreakTime.sound.stop) {
                BreakTime.sound.fade(0, { duration: 500 }).then(() => {
                    BreakTime.sound.stop();
                });
            }
        }
        BreakTime.app = null;
    }
}