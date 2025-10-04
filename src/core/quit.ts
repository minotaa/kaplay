import { _k } from "../shared";

export const quit = () => {
    const { game, app, gfx, ggl, gc } = _k;
    game.events.onOnce("frameEnd", () => {
        app.quit();

        // run all scattered gc events
        ggl.destroy();
        gc.forEach((f) => f());

        // remove canvas
        app.window.destroy();
    });
};

export const onCleanup = (action: () => void) => {
    _k.gc.push(action);
};
