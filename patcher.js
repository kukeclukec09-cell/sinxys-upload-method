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
        HandBrake mode

        If the user already used HandBrake,
        we use a lighter encode.

        This means:
        - Less compression
        - Higher quality
        - Less aggressive processing
        - The selected quality is respected

        Normal mode uses the selected CRF.

        HandBrake mode subtracts 2 from CRF,
        making the encode higher quality.
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
            getFPSFilter(
                fps
            );


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


        if (filters.length > 0) {

            command.push(
                "-vf",
                filters.join(",")
            );

        }


        /*
            Video encoding
        */

        command.push(
            "-c:v",
            "libx264",

            "-preset",
            handbrake
                ? "veryfast"
                : "veryfast",

            "-crf",
            String(finalCRF),

            "-pix_fmt",
            "yuv420p"
        );


        /*
            Audio

            HandBrake mode keeps more audio quality
            because the video has already been processed.
        */

        command.push(
            "-c:a",
            "aac",

            "-b:a",
            handbrake
                ? "160k"
                : "160k"
        );


        /*
            Fast-start MP4
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