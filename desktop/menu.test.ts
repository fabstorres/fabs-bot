import { expect, test } from "bun:test";
import type { MenuItemConstructorOptions } from "electron";
import { menuTemplate } from "./menu";

test("macOS hides shortcuts as plain app menu items, not a hidden submenu or the full screen role", () => {
  const [appMenu, ...others] = menuTemplate("darwin", () => {});
  const hidden = (appMenu?.submenu as MenuItemConstructorOptions[]).filter((item) => item.visible === false);
  expect(others).toEqual([]);
  expect(hidden.filter((item) => item.submenu || item.role === "togglefullscreen")).toEqual([]);
  expect(hidden.map((item) => item.accelerator)).toContain("Control+Command+F");
});
