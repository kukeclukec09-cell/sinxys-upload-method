import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const ffmpeg = new FFmpeg();

let loaded = false;

async function loadEngine() {
    if (loaded) return;

    const baseURL =
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

    await ffmpeg.load({
        coreURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            "text/javascript"
        ),
        wasmURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            "application/wasm"
        )
    });

    loaded = true;
}

function getResolutionFilter(resolution) {
    if (resolution === "1080") {
        return "scale=1920:1080";
    }

    if (resolution === "720") {
        return "scale=1280:720";
    }

    if (resolution === "420") {
        return "scale=768:420";
    }

    return null;
}

function getFPSFilter(fps) {
    if (fps === "120") {
        return "fps=120";
    }

    if (fps === "60") {
        return "fps=60";
    }

    if (fps === "30") {
        return "fps=30";
    }

    return null;
}

export async function processVideo(
    file,
    progressCallback,
    settings = {}
) {
    await loadEngine();

    const resolution =
        settings.resolution || "original";

    const fps =
        settings.fps || "original";

    const selectedCRF =
        Number(settings.crf) || 18;

    const handbrake =
        Boolean(settings.handbrake);

    /*
        If HandBrake was already used,
        reduce CRF by 2 for a lighter
        second encode.
    */
    const finalCRF = handbrake
        ? Math.max(selectedCRF - 2, 15)
        : selectedCRF;

    const extension =
        file.name
            .split(".")
            .pop()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
        || "mp4";

    const inputName =
        `sinxy-input.${extension}`;

    const outputName =
        "sinxy-patched.mp4";

    await ffmpeg.writeFile(
        inputName,
        await fetchFile(file)
    );

    const progressHandler = ({ progress }) => {
        if (
            typeof progressCallback ===
            "function"
        ) {
            progressCallback(
                Math.min(
                    progress * 100,
                    100
                )
            );
        }
    };

    ffmpeg.on(
        "progress",
        progressHandler
    );

    try {
        const filters = [];

        const resolutionFilter =
            getResolutionFilter(
                resolution
            );

        const fpsFilter =
            getFPSFilter(fps);

        if (resolutionFilter) {
            filters.push(
                resolutionFilter
            );
        }

        if (fpsFilter) {
            filters.push(
                fpsFilter
            );
        }

        const command = [
            "-i",
            inputName
        ];

        /*
            Only add video filters when
            the user actually selected
            a resolution or FPS change.
        */
        if (filters.length > 0) {
            command.push(
                "-vf",
                filters.join(",")
            );
        }

        command.push(
            "-c:v",
            "libx264",

            /*
                ULTRAFAST is considerably
                faster than VERYFAST for
                browser-based encoding.
            */
            "-preset",
            "ultrafast",

            "-crf",
            String(finalCRF),

            "-pix_fmt",
            "yuv420p"
        );

        /*
            Keep audio processing simple
            and relatively fast.
        */
        command.push(
            "-c:a",
            "aac",
            "-b:a",
            "160k"
        );

        /*
            Makes the MP4 easier to start
            playing/uploading immediately.
        */
        command.push(
            "-movflags",
            "+faststart"
        );

        command.push(
            outputName
        );

        await ffmpeg.exec(
            command
        );

        const data =
            await ffmpeg.readFile(
                outputName
            );

        const blob =
            new Blob(
                [data.buffer],
                {
                    type: "video/mp4"
                }
            );

        const url =
            URL.createObjectURL(
                blob
            );

        return {
            url,
            resolution,
            fps,
            crf: finalCRF,
            handbrake
        };

    } finally {

        ffmpeg.off(
            "progress",
            progressHandler
        );

        /*
            Remove temporary input file.
        */
        try {
            await ffmpeg.deleteFile(
                inputName
            );
        } catch (error) {
            console.warn(
                "Input cleanup failed:",
                error
            );
        }

        /*
            Remove temporary output file.
        */
        try {
            await ffmpeg.deleteFile(
                outputName
            );
        } catch (error) {
            console.warn(
                "Output cleanup failed:",
                error
            );
        }
    }
}