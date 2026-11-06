import type { PcSwitcher } from "../../shared/types";

export const pcBridge = (window as unknown as { fabsPcs?: PcSwitcher }).fabsPcs;
