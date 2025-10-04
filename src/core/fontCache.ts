import { createCanvas } from "@napi-rs/canvas";
import { MAX_TEXT_CACHE_SIZE } from "../constants/general";

export const createFontCache = () => {
    const fontCacheCanvas = createCanvas(0, 0);
    fontCacheCanvas.width = MAX_TEXT_CACHE_SIZE;
    fontCacheCanvas.height = MAX_TEXT_CACHE_SIZE;
    const fontCacheC2d = fontCacheCanvas.getContext("2d");

    return {
        fontCacheCanvas,
        fontCacheC2d,
    };
};
