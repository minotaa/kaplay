import type { KAPLAYOpt, MustKAPLAYOpt } from "../types";
import sdl from '@kmamal/sdl';

export const createWindow = (gopt: MustKAPLAYOpt) => {
  const window = sdl.video.createWindow({
    title: gopt.title || "KAPLAY Game",
    width: gopt.width || 800,
    height: gopt.height || 600,
    opengl: true
  })
  return window;
}