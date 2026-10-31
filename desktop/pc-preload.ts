import { contextBridge, ipcRenderer } from "electron";
import type { PcSwitcher } from "../shared/types";

const switcher: PcSwitcher = {
  list: () => ipcRenderer.invoke("pc:list"),
  open: (id) => ipcRenderer.invoke("pc:open", id),
  setIcon: (id, icon) => ipcRenderer.invoke("pc:icon", id, icon),
  manage: () => ipcRenderer.invoke("pc:manage"),
};

contextBridge.exposeInMainWorld("fabsPcs", switcher);
