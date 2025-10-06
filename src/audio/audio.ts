import sdl, { Sdl } from '@kmamal/sdl';

/** @ignore */
export interface InternalAudioCtx {
    device: Sdl.Audio.AudioPlaybackInstance;
    masterVolume: number;
}

/** @ignore */
export function createEmptyAudioBuffer() {
    return {
        sampleRate: 44100,
        length: 1,
        duration: 1 / 44100,
        numberOfChannels: 1,
        getChannelData: (channel: number) => new Float32Array(1),
        copyFromChannel: () => {},
        copyToChannel: () => {},
    } as AudioBuffer;
}

/** @ignore */
export const initAudio = (): InternalAudioCtx => {
    const device = sdl.audio.openDevice({
        type: 'playback',
    });

    device.play();

    return {
        device,
        masterVolume: 1.0,
    };
};