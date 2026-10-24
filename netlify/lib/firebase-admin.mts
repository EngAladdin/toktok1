import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const DATABASE_URL = "https://tuktuk-app-aladdin-2026-6dc3d-default-rtdb.firebaseio.com";

// مفتاح الخدمة بيتقرا من متغير البيئة FIREBASE_SERVICE_ACCOUNT (محتوى ملف JSON كامل)،
// ومش بيتحط في الريبو أبدًا.
export function getAdminDb() {
  if (!getApps().length) {
    const raw = Netlify.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
    initializeApp({ credential: cert(JSON.parse(raw)), databaseURL: DATABASE_URL });
  }
  return getDatabase();
}
