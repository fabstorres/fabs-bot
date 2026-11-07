import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { PcSwitcher } from "../shared/types";

const titleBar = process.argv.includes("--fabs-title-bar") ? process.platform : undefined;

const switcher: PcSwitcher = {
  list: () => ipcRenderer.invoke("pc:list"),
  open: (id) => ipcRenderer.invoke("pc:open", id),
  setIcon: (id, icon) => ipcRenderer.invoke("pc:icon", id, icon),
  manage: () => ipcRenderer.invoke("pc:manage"),
  titleBar,
  windowControls: titleBar && titleBar !== "darwin" ? {
    minimize: () => ipcRenderer.invoke("pc:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("pc:toggle-maximize"),
    close: () => ipcRenderer.invoke("pc:close"),
    onMaximizedChange: (listener) => {
      let active = true;
      const notify = (_event: IpcRendererEvent, maximized: boolean) => listener(maximized);
      ipcRenderer.on("pc:maximized", notify);
      void ipcRenderer.invoke("pc:is-maximized").then((maximized) => {
        if (active) listener(maximized);
      });
      return () => {
        active = false;
        ipcRenderer.removeListener("pc:maximized", notify);
      };
    },
  } : undefined,
};

contextBridge.exposeInMainWorld("fabsPcs", switcher);
