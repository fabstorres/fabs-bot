import type { Connector, ConnectorStatus } from "../shared/types";
import { publish } from "./bus";
import * as db from "./db";
import { access, detect, finishSignIn, needsDetect, onAuthChange } from "./oauth";

export const findConnector = (id: string) => db.listConnectors().find((c) => c.id === id) ?? null;

const detecting = new Set<string>();

onAuthChange(() => publish({ type: "connectors" }));

function detectLater(c: Connector) {
  if (detecting.has(c.id)) return;
  detecting.add(c.id);
  void detect(c).finally(() => {
    detecting.delete(c.id);
    publish({ type: "connectors" });
  });
}

export function connectorStatus(): ConnectorStatus {
  const connectors = db.listConnectors();
  for (const c of connectors) if (needsDetect(c)) detectLater(c);
  return { access: connectors.map(access), checks: [] };
}

export async function connectorSaved(c: Connector) {
  await detect(c);
  publish({ type: "connectors" });
}

export const finishConnectorSignIn = (query: URLSearchParams) => finishSignIn(query, findConnector);
