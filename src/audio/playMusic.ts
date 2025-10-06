import { KEvent } from "../events/events";
import { clamp } from "../math/clamp";
import { _k } from "../shared";
import type { AudioPlay, AudioPlayOpt } from "./play";
import sdl from '@kmamal/sdl';
import decode from 'audio-decode';
import fs from 'fs';

export function playMusic(url: string, opt: AudioPlayOpt = {}): AudioPlay {
    const onEndEvents = new KEvent();
    
    let isPlaying = false;
    let isPaused = opt.paused ?? false;
    let currentTime = 0;
    let duration = 0;
    let looping = Boolean(opt.loop);
    let volume = opt.volume ?? 1;
    let playbackRate = 1;
    
    let audioData: Float32Array | null = null;
    let sampleRate = 44100;
    let channels = 2;
    let playbackPosition = 0;
    let playbackId: NodeJS.Timeout | null = null;
    let isLoaded = false;
    
    const device = _k.audio.device;

    // Load and decode audio file
    const loadAudio = async () => {
        try {
            const filePath = url.replace(/^file:\/\//, '');
            
            // Read file as buffer
            const fileBuffer = fs.readFileSync(filePath);
            
            // Decode audio - supports MP3, OGG, WAV, FLAC, etc.
            const audioBuffer = await decode(fileBuffer);
            
            // Extract audio data
            sampleRate = audioBuffer.sampleRate;
            channels = audioBuffer.numberOfChannels;
            const frameCount = audioBuffer.length;
            
            // Interleave channels into single Float32Array
            audioData = new Float32Array(frameCount * channels);
            
            for (let frame = 0; frame < frameCount; frame++) {
                for (let channel = 0; channel < channels; channel++) {
                    const channelData = audioBuffer.getChannelData(channel);
                    audioData[frame * channels + channel] = channelData[frame];
                }
            }
            
            duration = frameCount / sampleRate;
            isLoaded = true;
            
            // Start playing if not paused
            if (!isPaused && !isPlaying) {
                play();
            }
            
        } catch (error) {
            console.error('Failed to load music:', error);
        }
    };

    const resumeAudioCtx = () => {
        if (_k.debug.paused) return;
        if (_k.app.isHidden() && !_k.globalOpt.backgroundAudio) return;
    };

    const scheduleNextChunk = () => {
        if (!audioData || !isPlaying || isPaused) return;
        
        const deviceChannels = device.channels;
        const deviceFrequency = device.frequency;
        const chunkSize = 4096 * deviceChannels;
        const chunk = new Float32Array(chunkSize);
        
        let samplesWritten = 0;
        
        while (samplesWritten < chunkSize) {
            const sourcePos = Math.floor(playbackPosition);
            const sourceIndex = sourcePos * channels;
            
            if (sourceIndex >= audioData.length) {
                if (looping) {
                    playbackPosition = 0;
                    currentTime = 0;
                } else {
                    isPlaying = false;
                    onEndEvents.trigger();
                    // Fill rest with silence
                    for (let i = samplesWritten; i < chunkSize; i++) {
                        chunk[i] = 0;
                    }
                    break;
                }
                continue;
            }
            
            // Get sample from source
            const leftSample = audioData[sourceIndex] || 0;
            const rightSample = channels > 1 ? (audioData[sourceIndex + 1] || 0) : leftSample;
            
            // Apply volume
            const leftVol = leftSample * volume;
            const rightVol = rightSample * volume;
            
            // Write to output
            if (deviceChannels === 2) {
                chunk[samplesWritten] = leftVol * _k.audio.masterVolume;
                chunk[samplesWritten + 1] = rightVol * _k.audio.masterVolume;
                samplesWritten += 2;
            } else {
                // Mono output - mix down
                chunk[samplesWritten] = ((leftVol + rightVol) / 2) * _k.audio.masterVolume;
                samplesWritten += 1;
            }
            
            playbackPosition += playbackRate;
            currentTime = (playbackPosition / sampleRate);
        }
        
        const buffer = Buffer.from(chunk.buffer);
        device.enqueue(buffer);
        
        const chunkDuration = (chunkSize / deviceChannels / deviceFrequency) * 1000;
        playbackId = setTimeout(scheduleNextChunk, chunkDuration * 0.5);
    };

    const play = () => {
        resumeAudioCtx();
        if (!isLoaded) {
            return;
        }
        if (!isPlaying) {
            isPlaying = true;
            scheduleNextChunk();
        }
    };

    const stopPlayback = () => {
        if (playbackId) {
            clearTimeout(playbackId);
            playbackId = null;
        }
        isPlaying = false;
        device.clearQueue();
    };

    // Start loading immediately
    loadAudio();

    if (!opt.paused) {
        play();
    }

    return {
        play() {
            isPaused = false;
            play();
        },

        seek(time: number) {
            if (!audioData) return;
            currentTime = clamp(time, 0, duration);
            playbackPosition = currentTime * sampleRate;
        },

        stop() {
            stopPlayback();
            isPaused = true;
            this.seek(0);
        },

        set loop(l: boolean) {
            looping = l;
        },

        get loop() {
            return looping;
        },

        set paused(p: boolean) {
            if (p === isPaused) return;
            isPaused = p;
            if (p) {
                stopPlayback();
            } else {
                play();
            }
        },

        get paused() {
            return isPaused;
        },

        time() {
            return currentTime;
        },

        duration() {
            return duration;
        },

        set volume(val: number) {
            volume = clamp(val, 0, 1);
        },

        get volume() {
            return volume;
        },

        set speed(s) {
            playbackRate = Math.max(s, 0);
        },

        get speed() {
            return playbackRate;
        },

        set detune(d) {
            playbackRate = Math.pow(2, d / 1200);
        },

        get detune() {
            return Math.log2(playbackRate) * 1200;
        },

        set pan(p: number) {
            console.warn('Pan not yet implemented for music');
        },

        get pan() {
            return 0;
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