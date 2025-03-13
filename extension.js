/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import {default as GLib} from 'gi://GLib';
import {default as Shell} from 'gi://Shell';
import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {default as Meta} from 'gi://Meta';

let TheExtension = null;

export default class FixRemoteWindowIcons extends Extension {
    enable() {
        TheExtension = this;

        this._foundWindows = new Set();
        this._fixedWindows = new Map();

        this._injectionManager = new InjectionManager();
        this._override_ShellWindowTracker_get_window_app();
        this._override_ShellWindowTracker_get_app_from_pid();
        this._override_MetaWindow_get_gtk_application_id();
        // this._override_MetaWindow_get_gtk_application_object_path();
        this._override_MetaWindow_is_remote();
        this._override_ShellApp_get_n_windows();
        this._override_ShellApp_get_pids();
        this._override_ShellApp_get_windows();
        this._override_ShellApp_is_on_workspace();
        this._override_ShellApp_get_state();
        this._override_ShellAppSystem_get_running();

        this._windowCreatedSignal = global.display.connect("window-created", (_, win) => {
            this._log(`New ${this._windowNameForLogging(win)} created`);
            this._fixWindowWhenWeCan(win);
            return win;
        })
        this._fixExistingWindows();
    }

    disable() {
        global.display.disconnect(this._windowCreatedSignal);
        this._windowCreatedSignal = null;

        for (toBeCleared of [
            '_fixedWindows',
            '_foundWindows',
            '_injectionManager',
        ]) {
            this[toBeCleared]?.clear();
            this[toBeCleared] = null
        }

        TheExtension = null;
    }

    _fixExistingWindows() {
        global.get_window_actors().forEach((actor) => {
            let win = actor.get_meta_window();
            if (win) {
                this._log(`Checking existing ${this._windowNameForLogging(win)}`);
                this._fixWindowWhenWeCan(win);
            }
        });
    }

    _fixWindowWhenWeCan(win) {
        if (this._foundWindows.has(win)) return;

        this._foundWindows.add(win);
        win.connect("unmanaged", () => {
            this._log(`Unmanaging ${this._windowNameForLogging(win)}`);
            this._foundWindows.delete(win)
            const
                winFix = this._fixedWindows.get(win)
            if (winFix) {
                this._log(`- ${this._windowNameForLogging(win)} was fixed by us, unfixing`);
                this._fixedWindows.delete(win);
                winFix.app.emit('windows-changed');
            }
        });

        GLib.idle_add(GLib.PRIORITY_DEFAULT, this._fixWindow.bind(this, win));
    }

    _fixWindow(win) {
        const
            windowClass = win.get_wm_class()
        this._log(`Processing ${this._windowNameForLogging(win)}`);
        if (!windowClass) {
            this._log(`- ${this._windowNameForLogging(win)}" has no WM_CLASS, so it can't be linked to an app`);
            return GLib.SOURCE_REMOVE;
        }

        const
            autoDetectedApp = global.get_window_tracker().get_window_app(win),
            appInfo = autoDetectedApp?.get_app_info();
        this._log(`- ${this._windowNameForLogging(win)} .app is set to ${autoDetectedApp?.get_id()}`);
        if (appInfo) {
            this._log(`- ${this._windowNameForLogging(win)} is already linked to app ${appInfo.get_name()}`);
            return GLib.SOURCE_REMOVE;
        }

        // TODO: use the corresponding methods from Shell.AppSystem:
        //   - lookup_desktop_wmclass
        //   - lookup_heuristic_basename
        //   - lookup_startup_wmclass
        const
            matchingApp = this._findAppByDesktopFile(windowClass) || this._findAppByDesktopFile(windowClass.toLowerCase())
        if (!matchingApp) {
            this._log(`- Found no local app matching window class ${windowClass}`);
            return GLib.SOURCE_REMOVE;
        }

        this._fixedWindows.set(win, {
            dummyApp: autoDetectedApp,
            app: matchingApp,
            pid: win.get_pid(),
        })
        Object.defineProperty(win, 'gtk_application_id', {
            get: () => matchingApp.get_id(),
        })
        // Object.defineProperty(win, 'gtk_application_object_path', {
        //     get: () => matchingApp.get_object_path(),
        // })
        matchingApp.emit('windows-changed');
        Shell.AppSystem.get_default().emit('app-state-changed', matchingApp);
        return GLib.SOURCE_REMOVE;
    }

    _findAppByDesktopFile(fileName) {
        const app = Shell.AppSystem.get_default().lookup_app(`${fileName}.desktop`);
        if (app)
            this._log(`- Found file ${fileName}.desktop which refers to app ${app.get_name()}`);
        else
            this._log(`- File ${fileName}.desktop not found`)
        return app;
    }

    _log(...args) {
        log('[FRWI]', ...args);
    }

    _windowNameForLogging(win) {
        const
            windowClass = win.get_wm_class(),
            windowTitle = win.get_title();
        return windowClass ? `${windowClass} window "${windowTitle}"` : `window "${windowTitle}"`;
    }

    _findFixForWindow(win) {
        return this._fixedWindows.get(win);
    }

    _override_ShellWindowTracker_get_window_app() {
        this._injectionManager.overrideMethod(Shell.WindowTracker.prototype, 'get_window_app', originalMethod => {
            // this._injectionManager.overrideMethod(Shell.WindowTracker, 'get_window_app', originalMethod => {
            return function (win) {
                TheExtension._log(`get_window_app(${TheExtension._windowNameForLogging(win)})`);
                return TheExtension._findFixForWindow(win)?.app || originalMethod.call(this, win);
            }
        })
    }

    _override_ShellWindowTracker_get_app_from_pid() {
        this._injectionManager.overrideMethod(Shell.WindowTracker.prototype, 'get_app_from_pid', originalMethod => {
            // this._injectionManager.overrideMethod(Shell.WindowTracker, 'get_app_from_pid', originalMethod => {
            return function (pid) {
                TheExtension._log(`get_app_from_pid(${pid})`);
                return [...TheExtension._fixedWindows.values()].find(({pid: p}) => p === pid)?.app || originalMethod.call(this, pid);
            }
        })
    }

    _override_MetaWindow_get_gtk_application_id() {
        this._injectionManager.overrideMethod(Meta.Window, 'get_gtk_application_id', originalMethod => {
            return function () {
                return TheExtension._findFixForWindow(this)?.app.get_id() || originalMethod.call(this);
            }
        })
    }

    _override_MetaWindow_get_gtk_application_object_path() {
        this._injectionManager.overrideMethod(Meta.Window, 'get_gtk_application_object_path', originalMethod => {
            return function () {
                return TheExtension._findFixForWindow(this)?.app.get_object_path() || originalMethod.call(this);
            }
        })
    }

    _override_MetaWindow_is_remote() {
        this._injectionManager.overrideMethod(Meta.Window, 'is_remote', originalMethod => {
            return function () {
                return !!TheExtension._findFixForWindow(this) || originalMethod.call(this);
            }
        })
    }

    _override_ShellApp_get_n_windows() {
        this._injectionManager.overrideMethod(Shell.App.prototype, 'get_n_windows', originalMethod => {
            return function () {
                // we return 0 if the app is a dummy app auto-created by the system
                if ([...TheExtension._fixedWindows.values()].some(fix => fix.dummyApp === this))
                    return 0;

                return [...TheExtension._fixedWindows.values()].filter(fix => fix.app === this).length +
                    originalMethod.call(this);
            }
        })
    }

    _override_ShellApp_get_pids() {
        this._injectionManager.overrideMethod(Shell.App.prototype, 'get_pids', originalMethod => {
            return function () {
                // we return an empty array if the app is a dummy app auto-created by the system
                if ([...TheExtension._fixedWindows.values()].some(fix => fix.dummyApp === this))
                    return [];

                return [...TheExtension._fixedWindows.values()].filter(fix => fix.app === this).map(fix => fix.pid)
                    .concat(originalMethod.call(this));
            }
        })
    }

    _override_ShellApp_get_windows() {
        this._injectionManager.overrideMethod(Shell.App.prototype, 'get_windows', originalMethod => {
            return function () {
                // we return an empty array if the app is a dummy app auto-created by the system
                if ([...TheExtension._fixedWindows.values()].some(fix => fix.dummyApp === this))
                    return [];

                return originalMethod.call(this).concat(
                    [...TheExtension._fixedWindows.keys()].filter(win => TheExtension._findFixForWindow(win)?.app === this)
                )
            }
        })
    }

    _override_ShellApp_is_on_workspace() {
        this._injectionManager.overrideMethod(Shell.App.prototype, 'is_on_workspace', originalMethod => {
            return function (workspace) {
                // we return false if the app is a dummy app auto-created by the system
                if ([...TheExtension._fixedWindows.values()].some(fix => fix.dummyApp === this))
                    return false;

                return [...TheExtension._fixedWindows.values()]
                        .some(fix => fix.app === this && fix.win.get_workspace() === workspace) ||
                    originalMethod.call(this, workspace);
            }
        })
    }

    _override_ShellApp_get_state() {
        this._injectionManager.overrideMethod(Shell.App.prototype, 'get_state', originalMethod => {
            return function () {
                // we return STOPPED if the app is a dummy app auto-created by the system and no window is running
                if ([...TheExtension._fixedWindows.values()].some(fix => fix.dummyApp === this))
                    return Shell.AppState.STOPPED;

                const
                    originalState = originalMethod.call(this),
                    fixedWindows = [...TheExtension._fixedWindows.keys()].filter(win => TheExtension._findFixForWindow(win)?.app === this),
                    isRunning = fixedWindows.some(win => win.get_workspace() !== null);
                if (originalState === Shell.AppState.STOPPED && isRunning)
                    return Shell.AppState.RUNNING;
                return originalState
            }
        })
    }

    _override_ShellAppSystem_get_running() {
        this._injectionManager.overrideMethod(Shell.AppSystem.prototype, 'get_running', originalMethod => {
            return function () {
                // [Original result] + [Our apps from _fixedWindows] - [Dummy apps from _fixedWindows]
                const
                    originalResult = [...originalMethod.call(this)],
                    fixedWindows = [...TheExtension._fixedWindows.values()],
                    fixedApps = fixedWindows.map(fix => fix.app),
                    dummyApps = fixedWindows.map(fix => fix.dummyApp);
                return originalResult.concat(fixedApps).filter(app => !dummyApps.includes(app));
            }
        })
    }

    // _override_MetaWindow_get_gtk_application_object_path() {
    //     this._injectionManager.overrideMethod(Meta.Window, 'get_gtk_application_object_path', originalMethod => {
    //         return function() {
    //             return TheExtension._overriddenWindows.get(this)?.app.get_object_path() || originalMethod.call(this);
    //         }
    //     })
    // }
}
