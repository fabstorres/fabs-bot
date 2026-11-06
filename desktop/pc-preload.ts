import { contextBridge, ipcRenderer } from "electron";
import type { PcSwitcher } from "../shared/types";

const switcher: PcSwitcher = {
  list: () => ipcRenderer.invoke("pc:list"),
  open: (id) => ipcRenderer.invoke("pc:open", id),
  setIcon: (id, icon) => ipcRenderer.invoke("pc:icon", id, icon),
  manage: () => ipcRenderer.invoke("pc:manage"),
  titleBar: process.argv.includes("--fabs-title-bar") ? process.platform : undefined,
  setDarkTitleBar: (dark) => ipcRenderer.invoke("pc:title-bar", dark),
};

contextBridge.exposeInMainWorld("fabsPcs", switcher);
