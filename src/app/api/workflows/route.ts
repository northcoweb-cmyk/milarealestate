import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { ensureBuiltinWorkflows } from "@/lib/workflows";

export const GET = api(async ({ profile }) => {
  await ensureBuiltinWorkflows(profile.id);
  const store = getStore();
  const [workflows, runs] = await Promise.all([store.list("workflows", profile.id), store.list("workflow_runs", profile.id)]);
  return { workflows: workflows.sort((a, b) => a.name.localeCompare(b.name)), runs: runs.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 15) };
});
