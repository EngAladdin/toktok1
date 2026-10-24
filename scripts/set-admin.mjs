// تشغيل محلي مرة واحدة:  node scripts/set-admin.mjs ./serviceAccountKey.json admin@example.com
// (لازم الحساب يكون متعمل قبلها في Firebase Console → Authentication → Users)
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [, , keyPath, email] = process.argv;
if (!keyPath || !email) {
  console.error("Usage: node scripts/set-admin.mjs <serviceAccountKey.json> <admin-email>");
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
const user = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(user.uid, { admin: true });
console.log(`✅ ${email} (${user.uid}) أصبح أدمن. سجّل خروج ودخول من الصفحة عشان الصلاحية تتفعّل.`);
