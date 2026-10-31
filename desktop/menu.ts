import type { MenuItemConstructorOptions } from "electron";

const MAC_SHORTCUT_ROLES = [
  "close",
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "pasteAndMatchStyle",
  "selectAll",
  "reload",
  "forceReload",
  "toggleDevTools",
  "resetZoom",
  "zoomIn",
  "zoomOut",
  "minimize",
] as const;

export function menuTemplate(platform: NodeJS.Platform, switchPc: () => void): MenuItemConstructorOptions[] {
  const switchPcItem: MenuItemConstructorOptions = { label: "Switch PC…", accelerator: "CmdOrCtrl+Shift+O", click: switchPc };
  if (platform !== "darwin") {
    return [
      { label: "File", submenu: [switchPcItem, { type: "separator" }, { role: "quit" }] },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ];
  }

  const fullScreen: MenuItemConstructorOptions = {
    label: "Toggle Full Screen",
    accelerator: "Control+Command+F",
    click: (_item, win) => win?.setFullScreen(!win.isFullScreen()),
  };
  const shortcuts: MenuItemConstructorOptions[] = [switchPcItem, fullScreen, ...MAC_SHORTCUT_ROLES.map((role) => ({ role }))];
  return [
    {
      role: "appMenu",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
        ...shortcuts.map((item) => ({ ...item, visible: false })),
      ],
    },
  ];
}
