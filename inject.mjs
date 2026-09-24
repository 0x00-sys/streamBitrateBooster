// Injects the Vencord folder this plugin was cloned into, without relying on that folder's own pnpm inject script
import { execFileSync } from "child_process";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { fileURLToPath } from "url";

const VENCORD_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FILE_DIR = join(VENCORD_DIR, "dist", "Installer");
const BASE_URL = "https://github.com/Vencord/Installer/releases/latest/download/";
const LATEST_RELEASE_URL = "https://api.github.com/repos/Vencord/Installer/releases/latest";
const HEADERS = { "User-Agent": "StreamBitrateBooster (https://github.com/0x00-sys/streamBitrateBooster)" };

const KNOWN_NAMES = { win32: "VencordInstallerCli.exe", darwin: "VencordInstallerCli-darwin", linux: "VencordInstallerCli-linux" };
const PLATFORM = { win32: /\.exe$/i, darwin: /darwin|mac/i, linux: /linux/i };

if (!KNOWN_NAMES[process.platform]) {
    console.error("Unsupported platform: " + process.platform);
    process.exit(1);
}

if (!existsSync(join(VENCORD_DIR, "dist", "patcher.js"))) {
    console.error("No Vencord build found in " + VENCORD_DIR + ", run pnpm build there first.");
    process.exit(1);
}

async function findFilename() {
    try {
        const res = await fetch(LATEST_RELEASE_URL, { headers: HEADERS });
        const { assets } = await res.json();
        return assets.find(a => /cli/i.test(a.name) && PLATFORM[process.platform].test(a.name))?.name ?? null;
    } catch {
        return null;
    }
}

const filename = await findFilename() ?? KNOWN_NAMES[process.platform];
const installer = join(FILE_DIR, filename);

console.log("Downloading " + filename);
const res = await fetch(BASE_URL + filename, { headers: HEADERS });
if (!res.ok) {
    console.error(`Failed to download the Vencord installer: ${res.status} ${res.statusText}`);
    process.exit(1);
}

mkdirSync(FILE_DIR, { recursive: true });
await finished(Readable.fromWeb(res.body).pipe(createWriteStream(installer, { mode: 0o755 })));

const args = process.argv.length > 2 ? process.argv.slice(2) : ["--install"];

try {
    execFileSync(installer, args, {
        stdio: "inherit",
        env: {
            ...process.env,
            VENCORD_USER_DATA_DIR: VENCORD_DIR,
            VENCORD_DEV_INSTALL: "1"
        }
    });
} catch {
    console.error("Something went wrong. Please check the logs above.");
    process.exit(1);
}
