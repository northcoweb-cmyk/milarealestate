import { api } from "@/lib/server/route";
import { capabilityRegistry } from "@/lib/capabilities";

/** What Mila can do on this deployment right now (no keys or vendor details). */
export const GET = api(async () => ({ capabilities: capabilityRegistry() }));
