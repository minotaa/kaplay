import { _k } from "../shared";
import { clamp } from "../math/clamp";
import { deprecateMsg } from "../utils/log";

export function setVolume(v: number) {
    _k.audio.masterVolume = clamp(v, 0, 1);
}

export function getVolume() {
    return _k.audio.masterVolume;
}

// get / set master volume
export function volume(v?: number): number {
    deprecateMsg("volume", "setVolume / getVolume");

    if (v !== undefined) {
        setVolume(v);
    }
    return getVolume();
}