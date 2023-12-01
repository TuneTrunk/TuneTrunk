import is from 'electron-is';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  MenuItem,
} from 'electron';
import prompt from 'custom-electron-prompt';

import { allPlugins } from 'virtual:plugins';

import { languageResources } from 'virtual:i18n';

import config from './config';

import { restart } from './providers/app-controls';
import { startingPages } from './providers/extracted-data';
import promptOptions from './providers/prompt-options';

import { getAllMenuTemplate, loadAllMenuPlugins } from './loader/menu';
import { setLanguage, t } from '@/i18n';


export type MenuTemplate = Electron.MenuItemConstructorOptions[];

// True only if in-app-menu was loaded on launch
const inAppMenuActive = config.plugins.isEnabled('in-app-menu');

const pluginEnabledMenu = (
  plugin: string,
  label = '',
  hasSubmenu = false,
  refreshMenu: (() => void) | undefined = undefined,
): Electron.MenuItemConstructorOptions => ({
  label: label || plugin,
  type: 'checkbox',
  checked: config.plugins.isEnabled(plugin),
  click(item: Electron.MenuItem) {
    if (item.checked) {
      config.plugins.enable(plugin);
    } else {
      config.plugins.disable(plugin);
    }

    if (hasSubmenu) {
      refreshMenu?.();
    }
  },
});

export const refreshMenu = async (win: BrowserWindow) => {
  await setApplicationMenu(win);
  if (inAppMenuActive) {
    win.webContents.send('refresh-in-app-menu');
  }
};

export const mainMenuTemplate = async (
  win: BrowserWindow,
): Promise<MenuTemplate> => {
  const innerRefreshMenu = () => refreshMenu(win);

  await loadAllMenuPlugins(win);

  const menuResult = Object.entries(getAllMenuTemplate()).map(
    ([id, template]) => {
      const pluginLabel = allPlugins[id]?.name ?? id;

      if (!config.plugins.isEnabled(id)) {
        return [
          id,
          pluginEnabledMenu(id, pluginLabel, true, innerRefreshMenu),
        ] as const;
      }

      return [
        id,
        {
          label: pluginLabel,
          submenu: [
            pluginEnabledMenu(id, t('main.menu.plugins.enabled'), true, innerRefreshMenu),
            { type: 'separator' },
            ...template,
          ],
        } satisfies Electron.MenuItemConstructorOptions,
      ] as const;
    },
  );

  const availablePlugins = Object.keys(allPlugins);
  const pluginMenus = availablePlugins
    .sort((a, b) => {
      const aPluginLabel = allPlugins[a]?.name ?? a;
      const bPluginLabel = allPlugins[b]?.name ?? b;

      return aPluginLabel.localeCompare(bPluginLabel);
    })
    .map((id) => {
      const predefinedTemplate = menuResult.find((it) => it[0] === id);
      if (predefinedTemplate) return predefinedTemplate[1];

      const pluginLabel = allPlugins[id]?.name ?? id;

      return pluginEnabledMenu(id, pluginLabel, true, innerRefreshMenu);
    });

  const availableLanguages = Object.keys(languageResources);

  return [
    {
      label: t('main.menu.plugins.label'),
      submenu: pluginMenus,
    },
    {
      label: t('main.menu.options.label'),
      submenu: [
        {
          label: t('main.menu.options.submenu.auto-update'),
          type: 'checkbox',
          checked: config.get('options.autoUpdates'),
          click(item: MenuItem) {
            config.setMenuOption('options.autoUpdates', item.checked);
          },
        },
        {
          label: t('main.menu.options.submenu.resume-on-start'),
          type: 'checkbox',
          checked: config.get('options.resumeOnStart'),
          click(item: MenuItem) {
            config.setMenuOption('options.resumeOnStart', item.checked);
          },
        },
        {
          label: t('main.menu.options.submenu.starting-page.label'),
          submenu: (() => {
            const subMenuArray: Electron.MenuItemConstructorOptions[] =
              Object.keys(startingPages).map((name) => ({
                label: name,
                type: 'radio',
                checked: config.get('options.startingPage') === name,
                click() {
                  config.set('options.startingPage', name);
                },
              }));
            subMenuArray.unshift({
              label: t('main.menu.options.submenu.starting-page.unset'),
              type: 'radio',
              checked: config.get('options.startingPage') === '',
              click() {
                config.set('options.startingPage', '');
              },
            });
            return subMenuArray;
          })(),
        },
        {
          label: t('main.menu.options.submenu.visual-tweaks.label'),
          submenu: [
            {
              label: t('main.menu.options.submenu.visual-tweaks.submenu.remove-upgrade-button'),
              type: 'checkbox',
              checked: config.get('options.removeUpgradeButton'),
              click(item: MenuItem) {
                config.setMenuOption(
                  'options.removeUpgradeButton',
                  item.checked,
                );
              },
            },
            {
              label: t('main.menu.options.submenu.visual-tweaks.submenu.like-buttons.label'),
              submenu: [
                {
                  label: t('main.menu.options.submenu.visual-tweaks.submenu.like-buttons.default'),
                  type: 'radio',
                  checked: !config.get('options.likeButtons'),
                  click() {
                    config.set('options.likeButtons', '');
                  },
                },
                {
                  label: t('main.menu.options.submenu.visual-tweaks.submenu.like-buttons.force-show'),
                  type: 'radio',
                  checked: config.get('options.likeButtons') === 'force',
                  click() {
                    config.set('options.likeButtons', 'force');
                  },
                },
                {
                  label: t('main.menu.options.submenu.visual-tweaks.submenu.like-buttons.hide'),
                  type: 'radio',
                  checked: config.get('options.likeButtons') === 'hide',
                  click() {
                    config.set('options.likeButtons', 'hide');
                  },
                },
              ],
            },
            {
              label: t('main.menu.options.submenu.visual-tweaks.submenu.theme.label'),
              submenu: [
                {
                  label: t('main.menu.options.submenu.visual-tweaks.submenu.theme.submenu.no-theme'),
                  type: 'radio',
                  checked: config.get('options.themes')?.length === 0, // Todo rename "themes"
                  click() {
                    config.set('options.themes', []);
                  },
                },
                { type: 'separator' },
                {
                  label: t('main.menu.options.submenu.visual-tweaks.submenu.theme.submenu.import-css-file'),
                  type: 'normal',
                  async click() {
                    const { filePaths } = await dialog.showOpenDialog({
                      filters: [{ name: 'CSS Files', extensions: ['css'] }],
                      properties: ['openFile', 'multiSelections'],
                    });
                    if (filePaths) {
                      config.set('options.themes', filePaths);
                    }
                  },
                },
              ],
            },
          ],
        },
        {
          label: t('main.menu.options.submenu.single-instance-lock'),
          type: 'checkbox',
          checked: true,
          click(item: MenuItem) {
            if (!item.checked && app.hasSingleInstanceLock()) {
              app.releaseSingleInstanceLock();
            } else if (item.checked && !app.hasSingleInstanceLock()) {
              app.requestSingleInstanceLock();
            }
          },
        },
        {
          label: t('main.menu.options.submenu.always-on-top'),
          type: 'checkbox',
          checked: config.get('options.alwaysOnTop'),
          click(item: MenuItem) {
            config.setMenuOption('options.alwaysOnTop', item.checked);
            win.setAlwaysOnTop(item.checked);
          },
        },
        ...((is.windows() || is.linux()
          ? [
              {
                label: t('main.menu.options.submenu.hide-menu.label'),
                type: 'checkbox',
                checked: config.get('options.hideMenu'),
                click(item) {
                  config.setMenuOption('options.hideMenu', item.checked);
                  if (item.checked && !config.get('options.hideMenuWarned')) {
                    dialog.showMessageBox(win, {
                      type: 'info',
                      title: t('main.menu.options.submenu.hide-menu.dialog.title'),
                      message: t('main.menu.options.submenu.hide-menu.dialog.message'),
                    });
                  }
                },
              },
            ]
          : []) satisfies Electron.MenuItemConstructorOptions[]),
        ...((is.windows() || is.macOS()
          ? // Only works on Win/Mac
            // https://www.electronjs.org/docs/api/app#appsetloginitemsettingssettings-macos-windows
            [
              {
                label: t('main.menu.options.submenu.start-at-login'),
                type: 'checkbox',
                checked: config.get('options.startAtLogin'),
                click(item) {
                  config.setMenuOption('options.startAtLogin', item.checked);
                },
              },
            ]
          : []) satisfies Electron.MenuItemConstructorOptions[]),
        {
          label: t('main.menu.options.submenu.tray.label'),
          submenu: [
            {
              label: t('main.menu.options.submenu.tray.submenu.disabled'),
              type: 'radio',
              checked: !config.get('options.tray'),
              click() {
                config.setMenuOption('options.tray', false);
                config.setMenuOption('options.appVisible', true);
              },
            },
            {
              label: t('main.menu.options.submenu.tray.submenu.enabled-and-show-app'),
              type: 'radio',
              checked:
                config.get('options.tray') && config.get('options.appVisible'),
              click() {
                config.setMenuOption('options.tray', true);
                config.setMenuOption('options.appVisible', true);
              },
            },
            {
              label: t('main.menu.options.submenu.tray.submenu.enabled-and-hide-app'),
              type: 'radio',
              checked:
                config.get('options.tray') && !config.get('options.appVisible'),
              click() {
                config.setMenuOption('options.tray', true);
                config.setMenuOption('options.appVisible', false);
              },
            },
            { type: 'separator' },
            {
              label: t('main.menu.options.submenu.tray.submenu.play-pause-on-click'),
              type: 'checkbox',
              checked: config.get('options.trayClickPlayPause'),
              click(item: MenuItem) {
                config.setMenuOption(
                  'options.trayClickPlayPause',
                  item.checked,
                );
              },
            },
          ],
        },
        {
          label: t('main.menu.options.submenu.language.label'),
          submenu: availableLanguages.map((lang): Electron.MenuItemConstructorOptions => ({
            label: `${languageResources[lang].translation.language.name} (${languageResources[lang].translation.language['local-name']})`,
            type: 'checkbox',
            checked: config.get('options.language') === lang,
            click() {
              config.setMenuOption('options.language', lang);
              refreshMenu(win);
              setLanguage(lang);
              dialog.showMessageBox(
                win,
                {
                  title: t('main.menu.options.submenu.language.dialog.title'),
                  message: t('main.menu.options.submenu.language.dialog.message'),
                }
              );
            },
          })),
        },
        { type: 'separator' },
        {
          label: t('main.menu.options.submenu.advanced-options.label'),
          submenu: [
            {
              label: t('main.menu.options.submenu.advanced-options.submenu.set-proxy.label'),
              type: 'normal',
              async click(item: MenuItem) {
                await setProxy(item, win);
              },
            },
            {
              label: t('main.menu.options.submenu.advanced-options.submenu.override-user-agent'),
              type: 'checkbox',
              checked: config.get('options.overrideUserAgent'),
              click(item: MenuItem) {
                config.setMenuOption('options.overrideUserAgent', item.checked);
              },
            },
            {
              label: t('main.menu.options.submenu.advanced-options.submenu.disable-hardware-acceleration'),
              type: 'checkbox',
              checked: config.get('options.disableHardwareAcceleration'),
              click(item: MenuItem) {
                config.setMenuOption(
                  'options.disableHardwareAcceleration',
                  item.checked,
                );
              },
            },
            {
              label: t('main.menu.options.submenu.advanced-options.submenu.restart-on-config-changes'),
              type: 'checkbox',
              checked: config.get('options.restartOnConfigChanges'),
              click(item: MenuItem) {
                config.setMenuOption(
                  'options.restartOnConfigChanges',
                  item.checked,
                );
              },
            },
            {
              label: t('main.menu.options.submenu.advanced-options.submenu.auto-reset-app-cache'),
              type: 'checkbox',
              checked: config.get('options.autoResetAppCache'),
              click(item: MenuItem) {
                config.setMenuOption('options.autoResetAppCache', item.checked);
              },
            },
            { type: 'separator' },
            is.macOS()
              ? {
                  label: t('main.menu.options.submenu.advanced-options.submenu.toggle-dev-tools'),
                  // Cannot use "toggleDevTools" role in macOS
                  click() {
                    const { webContents } = win;
                    if (webContents.isDevToolsOpened()) {
                      webContents.closeDevTools();
                    } else {
                      webContents.openDevTools();
                    }
                  },
                }
              : { role: 'toggleDevTools' },
            {
              label: t('main.menu.options.submenu.advanced-options.submenu.edit-config-json'),
              click() {
                config.edit();
              },
            },
          ],
        },
      ],
    },
    {
      label: t('main.menu.view.label'),
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        {
          role: 'zoomIn',
          accelerator: process.platform === 'darwin' ? 'Cmd+I' : 'Ctrl+I',
        },
        {
          role: 'zoomOut',
          accelerator: process.platform === 'darwin' ? 'Cmd+O' : 'Ctrl+O',
        },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: t('main.menu.navigation.label'),
      submenu: [
        {
          label: t('main.menu.navigation.submenu.go-back'),
          click() {
            if (win.webContents.canGoBack()) {
              win.webContents.goBack();
            }
          },
        },
        {
          label: t('main.menu.navigation.submenu.go-forward'),
          click() {
            if (win.webContents.canGoForward()) {
              win.webContents.goForward();
            }
          },
        },
        {
          label: t('main.menu.navigation.submenu.copy-current-url'),
          click() {
            const currentURL = win.webContents.getURL();
            clipboard.writeText(currentURL);
          },
        },
        {
          label: t('main.menu.navigation.submenu.restart'),
          click: restart,
        },
        { role: 'quit' },
      ],
    },
    {
      label: t('main.menu.about'),
      submenu: [{ role: 'about' }],
    },
  ];
};
export const setApplicationMenu = async (win: Electron.BrowserWindow) => {
  const menuTemplate: MenuTemplate = [...(await mainMenuTemplate(win))];
  if (process.platform === 'darwin') {
    const { name } = app;
    menuTemplate.unshift({
      label: name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'selectAll' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'close' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
};

async function setProxy(item: Electron.MenuItem, win: BrowserWindow) {
  const output = await prompt(
    {
      title: t('main.menu.options.submenu.advanced-options.submenu.set-proxy.prompt.title'),
      label: t('main.menu.options.submenu.advanced-options.submenu.set-proxy.prompt.label'),
      value: config.get('options.proxy'),
      type: 'input',
      inputAttrs: {
        type: 'url',
        placeholder: t('main.menu.options.submenu.advanced-options.submenu.set-proxy.prompt.placeholder'),
      },
      width: 450,
      ...promptOptions(),
    },
    win,
  );

  if (typeof output === 'string') {
    config.setMenuOption('options.proxy', output);
    item.checked = output !== '';
  } else {
    // User pressed cancel
    item.checked = !item.checked; // Reset checkbox
  }
}
