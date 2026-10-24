import type { Config } from "@netlify/functions";
import { getAdminDb } from "../lib/firebase-admin.mts";

// كل ساعة: يمسح أي رحلة عدّى عليها أكتر من 3 ساعات (بيشيل مواقع الركاب القديمة).
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

export default async () => {
  const db = getAdminDb();
  const snap = await db.ref("trips").orderByChild("publishedAt").endAt(Date.now() - MAX_AGE_MS).once("value");
  const updates: Record<string, null> = {};
  snap.forEach((c) => { updates[c.key as string] = null; });
  const n = Object.keys(updates).length;
  if (n) await db.ref("trips").update(updates);
  console.log(`cleanup-trips: removed ${n}`);
};

export const config: Config = { schedule: "@hourly" };
