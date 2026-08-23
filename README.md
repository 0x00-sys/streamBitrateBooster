# StreamBitrateBooster

Vencord plugin that forces the bitrate, resolution, framerate and codec Discord uses for your screenshare.

Made because Discord on macOS 27 started capping streams at around 600 kbps for no reason. Might help on other platforms too.

## Install

You need a source build of Vencord. This does not work with Vesktop or the prebuilt installer.

```sh
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm i
git clone https://github.com/0x00-sys/streamBitrateBooster src/userplugins/streamBitrateBooster
pnpm build
pnpm inject
```

Restart Discord, then enable StreamBitrateBooster in Vencord settings.

## Settings

- Target bitrate (1 to 30 Mbps, default 10)
- Lock min bitrate so Discord's estimator can't downgrade you. Turn off if the stream stutters.
- Resolution override (source, 720p, 1080p, 1440p, 4K)
- Framerate override (30 to 144)
- Codec override. Careful with this one, viewers who can't decode the codec get a black screen.
- Optionally apply everything to camera too

Restart your stream after changing settings.

## Update

```sh
cd Vencord
git pull
git -C src/userplugins/streamBitrateBooster pull
pnpm build
```

## License

GPL-3.0-or-later, same as Vencord.
