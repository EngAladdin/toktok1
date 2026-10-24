import type { Config } from "@netlify/functions";
import { getAdminDb } from "../lib/firebase-admin.mts";

// فحص اتصال الـ Admin SDK بقاعدة البيانات (من غير ما يرجّع أي بيانات أو تفاصيل أخطاء).
export default async () => {
  try {
    await getAdminDb().ref("places").limitToFirst(1).once("value");
    return Response.json({ ok: true });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false }, { status: 500 });
  }
};

export const config: Config = { path: "/api/firebase-status" };
