import { WifiOff } from "lucide-react";
import { offlineReason, offlineTitle, reconnect, showOffline, useStore } from "../store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function OfflineBanner() {
  const shown = useStore(showOffline);
  const title = useStore(offlineTitle);
  const reason = useStore(offlineReason);
  if (!shown) return null;
  return (
    <Alert className="mx-auto mb-2 flex max-w-3xl items-center gap-3 rounded-2xl border-amber-300 bg-amber-50 [&>svg]:translate-y-0 [&>svg]:text-amber-600">
      <WifiOff />
      <div className="min-w-0 flex-1">
        <AlertTitle>{title}</AlertTitle>
        {reason && <AlertDescription>{reason}</AlertDescription>}
      </div>
      <Button size="xs" variant="ghost" onClick={reconnect}>
        Reconnect
      </Button>
    </Alert>
  );
}
