import { type RefObject, useRef, useState } from "react";
import { LoaderCircle, Webhook } from "lucide-react";
import { toast } from "sonner";
import type { MessagePart, WebhookEncoding, WebhookSettings } from "../../../shared/types";
import { api } from "../api";
import { useLoad } from "../hooks";
import { isConnected, useStore } from "../store";
import { Modal } from "./Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function WebhookDialog({ threadId, trigger, onClose }: { threadId: string; trigger: RefObject<HTMLElement | null>; onClose(): void }) {
  const { data, error } = useLoad(() => api.get<WebhookSettings>(`/api/threads/${threadId}/webhook`), [threadId]);
  return (
    <Modal
      title="Outgoing webhook"
      onClose={onClose}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        trigger.current?.focus();
      }}
    >
      {data ? (
        <WebhookForm threadId={threadId} settings={data} onDone={onClose} />
      ) : error ? (
        <p role="alert" className="text-sm text-failing">
          {error}
        </p>
      ) : (
        <LoaderCircle className="mx-auto size-5 animate-spin text-muted-foreground" />
      )}
    </Modal>
  );
}

function WebhookForm({ threadId, settings, onDone }: { threadId: string; settings: WebhookSettings; onDone(): void }) {
  const [url, setUrl] = useState("");
  const [signing, setSigning] = useState(settings.signing.enabled);
  const [secret, setSecret] = useState("");
  const [header, setHeader] = useState(settings.signing.header || "X-Signature");
  const [encoding, setEncoding] = useState<WebhookEncoding>(settings.signing.encoding);
  const [prefix, setPrefix] = useState(settings.signing.prefix);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      toast.success(done);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api.put(`/api/threads/${threadId}/webhook`, { url, signing, secret, header, encoding, prefix }), "Webhook saved");
      }}
    >
      <p role="status" className="text-sm text-muted-foreground">
        {settings.configured ? "Set up. Bots in this group send tasks to it when you ask." : "Not set up yet. Once it is, bots in this group send tasks to it when you ask."}
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="webhook-url">Endpoint URL</Label>
        <Input
          id="webhook-url"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={url}
          readOnly={busy}
          placeholder={settings.configured ? "Saved. Paste a new address to replace it." : "https://"}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="webhook-signing">Sign requests</Label>
          <span className="text-sm text-muted-foreground">Adds an HMAC-SHA256 signature of the body in a header.</span>
        </div>
        <Switch id="webhook-signing" checked={signing} disabled={busy} onCheckedChange={setSigning} />
      </div>
      {signing && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="webhook-secret">Signing secret</Label>
            <Input
              id="webhook-secret"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={secret}
              readOnly={busy}
              placeholder={settings.signing.enabled ? "Saved. Paste a new secret to replace it." : ""}
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="webhook-header">Signature header</Label>
              <Input id="webhook-header" spellCheck={false} value={header} readOnly={busy} onChange={(e) => setHeader(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="webhook-encoding">Encoding</Label>
              <Select value={encoding} disabled={busy} onValueChange={(v) => setEncoding(v as WebhookEncoding)}>
                <SelectTrigger id="webhook-encoding" aria-label="Encoding" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hex">Hex</SelectItem>
                  <SelectItem value="base64">Base64</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="webhook-prefix">Prefix (optional)</Label>
              <Input id="webhook-prefix" spellCheck={false} value={prefix} readOnly={busy} placeholder="sha256=" onChange={(e) => setPrefix(e.target.value)} />
            </div>
          </div>
        </>
      )}
      <p className="text-sm text-muted-foreground">The address and secret stay on this PC. Bots never see them, and they aren't shown again after you save.</p>
      {error && (
        <p role="alert" className="text-sm text-failing">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {settings.configured && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-failing"
            disabled={busy}
            onClick={() => void run(() => api.del(`/api/threads/${threadId}/webhook`), "Webhook removed")}
          >
            Remove
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" className="rounded-full px-6" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function WebhookSetupCard({ threadId }: { threadId: string }) {
  const online = useStore(isConnected);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <div className="w-full max-w-md rounded-3xl border bg-background p-4" role="group" aria-label="Webhook setup">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Webhook className="size-4 flex-none" />
        This group's webhook
      </div>
      <p className="mt-2">Set where this group sends tasks. The address and secret stay on this PC, and bots never see them.</p>
      <Button ref={button} className="mt-3 rounded-full" disabled={!online} onClick={() => setOpen(true)}>
        Set up webhook
      </Button>
      {open && <WebhookDialog threadId={threadId} trigger={button} onClose={() => setOpen(false)} />}
    </div>
  );
}

const DELIVERY_TITLE = { sending: "Sending to the webhook", received: "Received by the webhook", failed: "Not delivered to the webhook" } as const;

export function WebhookDelivery({ part }: { part: Extract<MessagePart, { type: "webhook" }> }) {
  return (
    <div className="w-full max-w-md rounded-3xl border bg-background p-4" role="group" aria-label="Webhook delivery">
      <div
        role="status"
        className={cn("flex items-center gap-2 text-sm font-medium", part.state === "received" && "text-green-600 dark:text-green-400", part.state === "failed" && "text-failing")}
      >
        {part.state === "sending" ? <LoaderCircle className="size-4 flex-none animate-spin" /> : <Webhook className="size-4 flex-none" />}
        {DELIVERY_TITLE[part.state]}
      </div>
      {part.detail && <p className="mt-2">{part.detail}</p>}
      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">Request {part.requestId}</p>
      {part.state === "received" && <p className="mt-2 text-sm text-muted-foreground">Received only. The work isn't done yet, and no reply comes back here.</p>}
    </div>
  );
}
