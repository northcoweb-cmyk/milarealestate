import { randomUUID } from "node:crypto";
import { ensureSubscription } from "./credits";
import { getStore } from "./db/store";
import { defaultSettings } from "./defaults";
import type { Profile } from "./types";
import { ensureBuiltinWorkflows } from "./workflows";

export async function createProfile(input: { id?: string; email: string; full_name: string; demo?: boolean }): Promise<Profile> {
  const store = getStore();
  const id = input.id ?? randomUUID();
  const profile = await store.insert("profiles", id, {
    id,
    email: input.email.trim().toLowerCase(),
    full_name: input.full_name.trim(),
    role: "Agent", brokerage: null, location: "", primary_market: "",
    timezone: "America/New_York", lat: null, lng: null,
    experience: "growing", business_type: "mixed",
    onboarded: false, is_demo: Boolean(input.demo),
    settings: defaultSettings(),
  });
  await ensureSubscription(id);
  await ensureBuiltinWorkflows(id);
  return profile;
}

