class BreakTimeApplication extends Application {
    
    static get defaultOptions() {
        const options = super.defaultOptions;
        options.title = `${game.i18n.localize("BREAKTIME.app.title")}`;
        options.id = "breaktime-app";
        options.template = "modules/breaktime/templates/breaktime.html";
        // options.width = 700;
        options.resizable = true;
        return options;
    }

    getData() {
        return {
            players: BreakTime.players
        }
    }
}