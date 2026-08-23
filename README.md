# StreamBitrateBooster

Vencord plugin that forces the bitrate, resolution, framerate and codec Discord uses for your screenshare.

Made because Discord on macOS 27 started capping streams at around 600 kbps for no reason. Might help on other platforms too.

## Install

This needs Vencord built from source. It will not work with Vesktop, the Vencord installer app, or the browser extension. If you already have Vencord installed that way, uninstall it first.

### 1. Install the tools

You need git, Node.js and pnpm. Open Terminal and run:

```sh
xcode-select --install
```

Click install if a popup shows up. Then install Node from https://nodejs.org (pick the LTS one), and run:

```sh
npm i -g pnpm
```

Check everything works:

```sh
git --version
node --version
pnpm --version
```

All three should print a version number. If one says command not found, close Terminal, open it again and try once more.

### 2. Build Vencord with the plugin

Copy this whole block and paste it into Terminal:

```sh
cd ~
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm i
git clone https://github.com/0x00-sys/streamBitrateBooster src/userplugins/streamBitrateBooster
pnpm build
```

It takes a minute or two. The last line should say Done.

### 3. Put it into Discord

Quit Discord fully (Cmd+Q, not just closing the window), then run:

```sh
pnpm inject
```

It asks which Discord to patch, pick Stable (or whichever you use) with the arrow keys and press enter. It may ask for your password, that's fine.

Open Discord, go to Settings, scroll down to the Vencord section, click Plugins, search for StreamBitrateBooster and turn it on.

## Settings

- Target bitrate (1 to 30 Mbps, default 10). Start with 10, go higher if your upload can take it.
- Lock min bitrate so Discord's estimator can't downgrade you. Turn off if the stream stutters.
- Resolution override (source, 720p, 1080p, 1440p, 4K)
- Framerate override (30 to 144)
- Codec override. Careful with this one, viewers who can't decode the codec get a black screen. Leave it off unless you know what you're doing.
- Optionally apply everything to camera too

Stop and restart your stream after changing anything.

## Update

```sh
cd ~/Vencord
git pull
git -C src/userplugins/streamBitrateBooster pull
pnpm i
pnpm build
```

Then restart Discord. No need to inject again.

## Problems

Plugin doesn't show up in the list: make sure `pnpm build` ran without errors after cloning the plugin, then fully quit and reopen Discord.

Vencord itself isn't showing in settings: Discord probably updated itself and removed the patch. Quit Discord and run `pnpm inject` again from the Vencord folder.

Want it gone: quit Discord, run `pnpm uninject` in the Vencord folder.

## License

GPL-3.0-or-later, same as Vencord.
