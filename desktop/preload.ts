import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../shared/types";

const bridge: DesktopBridge = {
  state: () => ipcRenderer.invoke("pcs:state"),
  open: (id) => ipcRenderer.invoke("pcs:open", id),
  add: (link, name) => ipcRenderer.invoke("pcs:add", link, name),
  remove: (id) => ipcRenderer.invoke("pcs:remove", id),
};

contextBridge.exposeInMainWorld("fabsDesktop", bridge);
