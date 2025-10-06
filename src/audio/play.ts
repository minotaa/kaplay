import { Asset } from "../assets/asset";
import { resolveSound, type SoundData } from "../assets/sound";
import { KEvent, type KEventController } from "../events/events";
import { _k } from "../shared";
import type { MusicData } from "../types";
import { playMusic } from "./playMusic";
import sdl from "@kmamal/sdl";
import decode from "audio-decode";
import fs from "fs";

// TODO: enable setting on load, make part of SoundData
/**
 * Audio play configurations.
 *
 * @group Audio
 */
export interface AudioPlayOpt {
    /**
     * If audio should start out paused.
     *
     * @since v3000.0
     */
    paused?: boolean;
    /**
     * If audio should be played again from start when its ended.
     */
    loop?: boolean;
    /**
     * Volume of audio. 1.0 means full volume, 0.5 means half volume.
     */
    volume?: number;
    /**
     * Playback speed. 1.0 means normal playback speed, 2.0 means twice as fast.
     */
    speed?: number;
    /**
     * Detune the sound. Every 100 means a semitone.
     *
     * @example
     * ```js
     * // play a random note in the octave
     * play("noteC", {
     *     detune: randi(0, 12) * 100,
     * })
     * ```
     */
    detune?: number;
    /**
     * The start time, in seconds.
     */
    seek?: number;
    /**
     * The stereo pan of the sound.
     * -1.0 means fully from the left channel, 0.0 means centered, 1.0 means fully right.
     * Defaults to 0.0.
     */
    pan?: number;
    /**
     * If the audio node should start out connected to another audio node rather than
     * KAPLAY's default volume node. Defaults to undefined, i.e. use KAPLAY's volume node.
     */
    connectTo?: AudioNode;
}

/**
 * @group Audio
 */
export interface AudioPlay {
    /**
     * Start playing audio.
     *
     * @since v3000.0
     */
    play(time?: number): void;
    /**
     * Seek time.
     *
     * @since v3000.0
     */
    seek(time: number): void;
    /**
     * Stop the sound.
     *
     * @since v3001.0
     */
    stop(): void;
    /**
     * If the sound is paused.
     *
     * @since v2000.1
     */
    paused: boolean;
    /**
     * Playback speed of the sound. 1.0 means normal playback speed, 2.0 means twice as fast.
     */
    speed: number;
    /**
     * Detune the sound. Every 100 means a semitone.
     *
     * @example
     * ```js
     * // tune down a semitone
     * music.detune = -100
     *
     * // tune up an octave
     * music.detune = 1200
     * ```
     */
    detune: number;
    /**
     * Volume of the sound. 1.0 means full volume, 0.5 means half volume.
     */
    volume: number;
    /**
     * The stereo pan of the sound.
     * -1.0 means fully from the left channel, 0.0 means centered, 1.0 means fully right.
     * Defaults to 0.0.
     */
    pan?: number;
    /**
     * If the audio should start again when it ends.
     */
    loop: boolean;
    /**
     * The current playing time (not accurate if speed is changed).
     */
    time(): number;
    /**
     * The total duration.
     */
    duration(): number;
    /**
     * Register an event that runs when audio ends.
     *
     * @since v3000.0
     */
    onEnd(action: () => void): KEventController;
    then(action: () => void): KEventController;
    /**
     * Disconnect the audio node from whatever it is currently connected to
     * and connect it to the passed-in audio node, or to Kaplay's default volume node
     * if no node is passed.
     */
    connect(node?: AudioNode): void;
}

export function play(
    src:
        | string
        | SoundData
        | Asset<SoundData>
        | MusicData
        | Asset<MusicData>,
    opt: AudioPlayOpt = {},
): AudioPlay {
    
    if (typeof src === "string" && _k.assets.music[src]) {
        return playMusic(_k.assets.music[src], opt);
    }

    const device = _k.audio.device;
    let paused = opt.paused ?? false;
    let volume = opt.volume ?? 1;
    let pan = opt.pan ?? 0;
    let speed = opt.speed ?? 1;
    let detune = opt.detune ?? 0;
    let loop = Boolean(opt.loop);
    let seekPos = opt.seek ?? 0;
    
    const onEndEvents = new KEvent();
    
    let audioBuffer: Float32Array | null = null;
    let sampleRate = 44100;
    let channels = 1;
    let playbackPosition = 0;
    let startTime = 0;
    let pauseTime = 0;
    let isPlaying = false;
    let playbackId: NodeJS.Timeout | null = null;

    const start = (data: SoundData) => {
        // data.buf is always an AudioBuffer
        sampleRate = data.buf.sampleRate;
        channels = data.buf.numberOfChannels;
        const frameCount = data.buf.length;
        
        // Interleave channels into single Float32Array
        audioBuffer = new Float32Array(frameCount * channels);
        
        for (let frame = 0; frame < frameCount; frame++) {
            for (let channel = 0; channel < channels; channel++) {
                const channelData = data.buf.getChannelData(channel);
                audioBuffer[frame * channels + channel] = channelData[frame];
            }
        }
        
        if (!paused) {
            startPlayback();
        }
    };

    const startPlayback = () => {
        if (!audioBuffer || isPlaying) return;
        
        isPlaying = true;
        startTime = Date.now();
        playbackPosition = seekPos * sampleRate;
        
        // Schedule audio chunks
        scheduleNextChunk();
    };

    const scheduleNextChunk = () => {
        if (!audioBuffer || !isPlaying) return;
        
        // Get device parameters
        const deviceChannels = device.channels;
        const deviceFrequency = device.frequency;
        
        const chunkSize = 2048 * deviceChannels;
        const chunk = new Float32Array(chunkSize);
        
        for (let i = 0; i < chunkSize; i += deviceChannels) {
            const pos = Math.floor(playbackPosition);
            const sourceIndex = pos * channels;
            
            if (sourceIndex >= audioBuffer.length) {
                if (loop) {
                    playbackPosition = 0;
                } else {
                    isPlaying = false;
                    onEndEvents.trigger();
                    // Fill rest with silence
                    for (let j = i; j < chunkSize; j++) {
                        chunk[j] = 0;
                    }
                    break;
                }
                continue;
            }
            
            // Get sample from source (mono or stereo)
            const leftSample = audioBuffer[sourceIndex] || 0;
            const rightSample = channels > 1 ? (audioBuffer[sourceIndex + 1] || 0) : leftSample;
            
            // Apply volume and pan for stereo output
            if (deviceChannels === 2) {
                const leftGain = volume * (1 - Math.max(0, pan));
                const rightGain = volume * (1 + Math.min(0, pan));
                
                chunk[i] = leftSample * leftGain * _k.audio.masterVolume;
                chunk[i + 1] = rightSample * rightGain * _k.audio.masterVolume;
            } else {
                // Mono output - mix down
                chunk[i] = ((leftSample + rightSample) / 2) * volume * _k.audio.masterVolume;
            }
            
            playbackPosition += speed;
        }
        
        // Convert Float32Array to Buffer for SDL
        const buffer = Buffer.from(chunk.buffer);
        device.enqueue(buffer);
        
        // Schedule next chunk based on buffer time
        const chunkDuration = (chunkSize / deviceChannels / deviceFrequency) * 1000;
        playbackId = setTimeout(scheduleNextChunk, chunkDuration * 0.5);
    };

    const stopPlayback = () => {
        if (playbackId) {
            clearTimeout(playbackId);
            playbackId = null;
        }
        isPlaying = false;
        device.clearQueue();
    };

    const snd = resolveSound(
        // @ts-expect-error Resolve Type Error
        src,
    );

    if (snd instanceof Asset) {
        snd.onLoad(start);
    } else if (snd) {
        start(snd);
    }

    const getTime = () => {
        if (!audioBuffer) return 0;
        const t = paused
            ? pauseTime - startTime
            : Date.now() - startTime;
        const d = (audioBuffer.length / channels / sampleRate) * 1000;
        return loop ? (t % d) / 1000 : Math.min(t / 1000, d / 1000);
    };

    return {
        stop() {
            this.paused = true;
            this.seek(0);
        },

        set paused(p: boolean) {
            if (paused === p) return;
            paused = p;
            if (p) {
                stopPlayback();
                pauseTime = Date.now();
            } else {
                const elapsed = pauseTime - startTime;
                startTime = Date.now() - elapsed;
                startPlayback();
            }
        },

        get paused() {
            return paused;
        },

        play(time: number = 0) {
            this.seek(time);
            this.paused = false;
        },

        seek(time: number) {
            if (!audioBuffer) return;
            const duration = audioBuffer.length / channels / sampleRate;
            if (time > duration) return;
            
            seekPos = time;
            playbackPosition = time * sampleRate;
            
            if (!paused) {
                stopPlayback();
                startTime = Date.now();
                startPlayback();
            }
        },

        set speed(val: number) {
            speed = val;
        },

        get speed() {
            return speed;
        },

        set detune(val: number) {
            detune = val;
            speed = Math.pow(2, detune / 1200);
        },

        get detune() {
            return detune;
        },

        set volume(val: number) {
            volume = Math.max(val, 0);
        },

        get volume() {
            return volume;
        },

        set pan(p: number) {
            pan = Math.max(-1, Math.min(1, p));
        },

        get pan() {
            return pan;
        },

        set loop(l: boolean) {
            loop = l;
        },

        get loop() {
            return loop;
        },

        duration(): number {
            return audioBuffer ? audioBuffer.length / channels / sampleRate : 0;
        },

        time(): number {
            return getTime();
        },

        onEnd(action: () => void) {
            return onEndEvents.add(action);
        },

        then(action: () => void) {
            return this.onEnd(action);
        },

        connect(node?: AudioNode) {
            console.warn('connect() not supported with SDL audio');
        },
    };
}