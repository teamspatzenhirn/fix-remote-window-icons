# Fix Remote Window Icons

## Description

When you run a remote application, from an Incus / LXC container or through SSH, GNOME shows it as a generic icon.
Even if you have a desktop file for it or / and same application is installed on the host.

See the discussion here https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/7818

And the commit here https://gitlab.gnome.org/GNOME/gnome-shell/-/commit/8aeadcdf9a78e13b46c4f0ac3a5a8cc7443d79d6

> Previously we were trying to match up remote windows with local
  .desktop files, which is definitely wrong. This patch simply
  falls back to the app-from-window case for this; better handling
  would need design.

Well, still no better handling :) (not blaming GNOME guys, they have enough work to do), so this extension tries to fix that.

https://github.com/user-attachments/assets/ef5dee8e-fcf2-429e-a73c-6f6702b5d132

You still have to have a corresponding desktop file on the host. The simplest way is to install the same application.

But this may leave you with a useless application on the host. So a better way is to create a desktop file with the same name and icon, but with a different `Exec` line.

~/.local/share/applications/leafpad.desktop

```desktop
[Desktop Entry]
Encoding=UTF-8
Name=Leafpad
# Exec=leafpad %f
Exec=incus exec container-with-my-working-environment -- sudo -u user-inside-container --login leafpad %f
Icon=leafpad
Terminal=false
Type=Application
MimeType=text/plain
```

then `update-desktop-database ~/.local/share/applications`

You can also install the application, copy the desktop file from `/usr/share/applications` into `~/.local/share/applications`,
then uninstall the application and modify the desktop file.


## Installation

I plan to submit this extension to the GNOME extensions site, but for now you can install it manually.

```sh
git clone \
  https://github.com/Phaengris/fix-remote-window-icons.git \
  ~/.local/share/gnome-shell/extensions/fix-remote-window-icons@com.github.phaengris
```

Then restart GNOME Shell with `Alt+F2`, `r`, `Enter` (for Xorg) or login / logout (for Wayland).

## Uninstallation

```sh
rm -rf ~/.local/share/gnome-shell/extensions/fix-remote-window-icons@com.github.phaengris
```

Then restart etc

## Configuration

It should just work. Make sure you have the corresponding desktop file on the host and it matches the window class of the remote application.

## Disclaimer

This extension is provided as is. I did my best to make it work and I still use it, so some support is guaranteed.
But I can't guarantee it will work for you or fit your needs in the same way as it fits mine.

## Issues

Feel free to report issues on https://github.com/Phaengris/fix-remote-window-icons/issues
