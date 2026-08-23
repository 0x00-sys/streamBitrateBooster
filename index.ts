/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { makeRange, OptionType } from "@utils/types";
import { MediaEngineStore, UserStore } from "@webpack/common";

const logger = new Logger("StreamBitrateBooster");

const settings = definePluginSettings({
    targetBitrate: {
        description: "Target video bitrate for your screenshare, in Mbps",
        type: OptionType.SLIDER,
        markers: makeRange(1, 30, 1),
        default: 10,
        stickToMarkers: true
    },
    lockMinBitrate: {
        description: "Also force the minimum bitrate to the target, preventing Discord's bandwidth estimator from downgrading the stream. Turn off if your stream stutters or drops.",
        type: OptionType.BOOLEAN,
        default: true
    },
    resolution: {
        description: "Force stream resolution (Source = your screen's actual resolution)",
        type: OptionType.SELECT,
        options: [
            { label: "Don't override", value: "off", default: true },
            { label: "Source (actual screen resolution)", value: "source" },
            { label: "720p", value: "720" },
            { label: "1080p", value: "1080" },
            { label: "1440p", value: "1440" },
            { label: "4K (2160p)", value: "2160" }
        ]
    },
    fpsOverride: {
        description: "Force stream framerate, including the capture source (0 = don't override). Overrides Discord's quality picker. Restart the stream after changing.",
        type: OptionType.SLIDER,
        markers: [0, 30, 60, 90, 120, 144],
        default: 0,
        stickToMarkers: true
    },
    codec: {
        description: "Force video codec. WARNING: viewers whose devices can't decode the chosen codec will see a black stream. Discord normally downgrades codecs to avoid this.",
        type: OptionType.SELECT,
        options: [
            { label: "Don't override", value: "off", default: true },
            { label: "H.265 / HEVC (hardware-accelerated on Macs)", value: "H265" },
            { label: "H.264 (most compatible)", value: "H264" },
            { label: "AV1 (best quality, needs recent hardware)", value: "AV1" },
            { label: "VP9", value: "VP9" }
        ]
    },
    boostCamera: {
        description: "Also apply the overrides to camera/voice connections (not just screenshare)",
        type: OptionType.BOOLEAN,
        default: false
    },
    debugLogging: {
        description: "Log every overridden call to the console (Cmd+Opt+I)",
        type: OptionType.BOOLEAN,
        default: false
    }
});

// patched object -> { prop -> original function }
const patched = new Map<any, Map<string, any>>();
let engine: any = null;
let onConnection: ((connection: any) => void) | null = null;

function wrapMethod(target: any, prop: string, wrapper: (original: (...args: any[]) => any, args: any[]) => any) {
    if (!target?.[prop]) return false;

    let originals = patched.get(target);
    if (originals?.has(prop)) return true;

    if (!originals) {
        originals = new Map();
        patched.set(target, originals);
    }

    const original = target[prop];
    originals.set(prop, original);

    target[prop] = function (...args: any[]) {
        try {
            return wrapper(original.bind(this), args);
        } catch (e) {
            logger.error(`Wrapper for ${prop} failed, calling original`, e);
            return original.apply(this, args);
        }
    };

    return true;
}

function unwrapAll() {
    for (const [target, originals] of patched)
        for (const [prop, original] of originals)
            target[prop] = original;

    patched.clear();
}

function bitrateOverrides() {
    const target = settings.store.targetBitrate * 1_000_000;
    const min = settings.store.lockMinBitrate ? target : Math.min(target, 1_000_000);

    return {
        encodingVideoBitRate: target,
        encodingVideoMinBitRate: min,
        encodingVideoMaxBitRate: target,
        callBitRate: target,
        callMinBitRate: min,
        callMaxBitRate: target
    };
}

function getCaptureQuality(connection: any) {
    try {
        return connection.applyQualityConstraints?.({})?.quality?.capture;
    } catch {
        return null;
    }
}

// Returns the forced resolution as { width, height, type } or null if not overriding
function resolutionOverride(connection: any) {
    const mode = settings.store.resolution;
    if (mode === "off") return null;

    const capture = getCaptureQuality(connection);

    if (mode === "source") {
        if (!capture?.width || !capture?.height) return null;
        return { width: capture.width, height: capture.height, type: "source" };
    }

    const height = parseInt(mode, 10);
    // Derive width from the capture source's aspect ratio when known, else assume 16:9
    const aspect = capture?.width && capture?.height
        ? capture.width / capture.height
        : 16 / 9;

    return { width: Math.round(height * aspect / 2) * 2, height, type: "fixed" };
}

function codecOverride(connection: any) {
    const { codec } = settings.store;
    if (codec === "off") return null;

    try {
        const codecOptions = connection.getCodecOptions?.("opus", codec, "H264");
        if (codecOptions?.videoEncoder) return codecOptions.videoEncoder;
        logger.warn(`getCodecOptions returned no videoEncoder for ${codec}`, codecOptions);
    } catch (e) {
        logger.error(`Failed to build codec options for ${codec}`, e);
    }
    return null;
}

function buildTransportOverrides(connection: any) {
    const overrides: Record<string, any> = bitrateOverrides();

    const res = resolutionOverride(connection);
    if (res) {
        overrides.encodingVideoWidth = res.width;
        overrides.encodingVideoHeight = res.height;
        overrides.remoteSinkWantsPixelCount = res.width * res.height;
    }

    const fps = settings.store.fpsOverride;
    if (fps > 0) {
        overrides.encodingVideoFrameRate = fps;
        overrides.remoteSinkWantsMaxFramerate = fps;
    }

    const videoEncoder = codecOverride(connection);
    if (videoEncoder) overrides.videoEncoder = videoEncoder;

    return overrides;
}

function applyToStreamParameters(connection: any, options: any) {
    if (!options.streamParameters) return;

    const target = settings.store.targetBitrate * 1_000_000;
    const res = resolutionOverride(connection);
    const fps = settings.store.fpsOverride;

    const params = Array.isArray(options.streamParameters)
        ? options.streamParameters
        : [options.streamParameters];

    for (const p of params) {
        if (!p || typeof p !== "object") continue;

        p.maxBitrate = target;

        if (res) {
            p.maxResolution = { width: res.width, height: res.height, type: res.type };
            p.maxPixelCount = res.width * res.height;
        }

        if (fps > 0) p.maxFrameRate = fps;
    }
}

// Rewrites the quality the Go Live picker chose (this is what actually
// controls the capture pipeline's fps/resolution)
function overrideGoLiveQuality(quality: any) {
    if (!quality || typeof quality !== "object") return;

    const fps = settings.store.fpsOverride;
    if (fps > 0) quality.frameRate = fps;

    const mode = settings.store.resolution;
    if (mode === "source") quality.resolution = 0; // 0 = source in Discord's presets
    else if (mode !== "off") quality.resolution = parseInt(mode, 10);

    if (settings.store.debugLogging) logger.info("Overrode Go Live quality", quality);
}

function shouldBoost(connection: any) {
    if (connection.context === "stream")
        return connection.streamUserId === UserStore.getCurrentUser()?.id;

    return settings.store.boostCamera;
}

function wrapConnection(connection: any) {
    try {
        if (!shouldBoost(connection)) return;

        const native = connection.conn;

        wrapMethod(native, "setTransportOptions", (original, [options]) => {
            Object.assign(options, buildTransportOverrides(connection));
            applyToStreamParameters(connection, options);
            if (settings.store.debugLogging) logger.info("Overrode transport options", options);
            return original(options);
        });

        // Capture-side encoding: force the framerate/resolution Discord tells
        // the desktop capturer to use
        wrapMethod(connection, "setDesktopEncodingOptions", (original, [width, height, framerate]) => {
            const fps = settings.store.fpsOverride;
            if (fps > 0) framerate = fps;

            const res = resolutionOverride(connection);
            if (res) {
                width = res.width;
                height = res.height;
            }

            if (settings.store.debugLogging) logger.info("Overrode desktop encoding options", { width, height, framerate });
            return original(width, height, framerate);
        });

        // Connection-level Go Live source (quality lives on source.quality)
        wrapMethod(connection, "setGoLiveSource", (original, [source]) => {
            overrideGoLiveQuality(source?.quality);
            return original(source);
        });

        // Re-assert once the connection is actually established, since Discord
        // pushes its own (low) estimate right after connecting
        connection.emitter?.on?.("connected", () => {
            try {
                native?.setTransportOptions?.(buildTransportOverrides(connection));
                logger.info(`Forced overrides on ${connection.context} connection`);
            } catch (e) {
                logger.error("Failed to force overrides after connect", e);
            }
        });

        logger.info(`Hooked ${connection.context} connection`, connection.mediaEngineConnectionId);
    } catch (e) {
        logger.error("Failed to hook connection", e);
    }
}

export default definePlugin({
    name: "StreamBitrateBooster",
    description: "Forces bitrate, resolution, framerate and codec for your screenshares. Use it when Discord forces a low bitrate for no given reason (e.g. ~600 kbps on macOS 27).",
    authors: [{ name: "zerohq", id: 0n }],
    tags: ["Voice", "Utility"],
    settings,

    start() {
        engine = (MediaEngineStore as any).getMediaEngine();

        // Engine-level Go Live source: the Stream Quality picker flows through here
        wrapMethod(engine, "setGoLiveSource", (original, args) => {
            overrideGoLiveQuality(args[0]?.quality);
            return original(...args);
        });

        onConnection = wrapConnection;
        engine.emitter?.on?.("connection", onConnection);

        // Hook any connection that already exists (e.g. plugin enabled mid-stream)
        engine.connections?.forEach?.(wrapConnection);
    },

    stop() {
        if (engine && onConnection) {
            engine.emitter?.off?.("connection", onConnection);
            engine.emitter?.removeListener?.("connection", onConnection);
        }

        unwrapAll();
        engine = null;
        onConnection = null;
    }
});
