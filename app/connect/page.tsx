import { getConnectionStatus } from "@/lib/hyperbrowser";
import ConnectClient from "./ConnectClient";

export const dynamic = "force-dynamic";

export default function ConnectPage() {
  const status = getConnectionStatus();

  return (
    <div>
      <h1 className="text-xl font-semibold mb-2">Connect Canvas</h1>
      <p className="text-sm text-white/60 mb-4 max-w-xl">
        This app doesn't use a Canvas API token. Instead it logs into Canvas as you, in a real
        browser session, and remembers that login for future syncs.
      </p>
      <ConnectClient
        initialBaseUrl={status.baseUrl ?? ""}
        connected={status.connected}
        connectedAt={status.connectedAt}
      />
    </div>
  );
}
