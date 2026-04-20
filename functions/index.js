// ---- HTTPS endpoints (admin tools)
import { onRequest } from "firebase-functions/v2/https";
// ---- Firestore trigger
import { onDocumentCreated } from "firebase-functions/v2/firestore";
// ---- Secrets
import { defineSecret } from "firebase-functions/params";

// ---- Admin SDK (ESM)
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage as getAdminStorage } from "firebase-admin/storage";

// ---- Google Cloud Storage (low-level client)
import { Storage as GCSStorage } from "@google-cloud/storage";

// ---- Misc
import nodemailer from "nodemailer";
// ================== INIT ==================
const adminApp = initializeApp();            // ONE TIME
const db       = getFirestore(adminApp);
const adminSt  = getAdminStorage(adminApp);  // Admin Storage (default bucket)
const gcs      = new GCSStorage();

const API_KEY  = process.env.API_KEY ?? "vali";
const okStatus = new Set(["approved","pending","rejected","needs-fix"]);

// ---------- Secrete SMTP ----------
const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_PORT = defineSecret("SMTP_PORT"); // ex: 587 sau 465
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const SMTP_FROM = defineSecret("SMTP_FROM"); // ex: "Mtech Digital <contact@domeniu.ro>"
const FALLBACK_TO = defineSecret("FALLBACK_TO"); // unde trimiți dacă nu există developerEmail

function makeTransporter() {
  const port = parseInt(SMTP_PORT.value() || "587", 10);
  const secure = port === 465; // SSL pentru 465, TLS start pentru 587
  return nodemailer.createTransport({
    host: SMTP_HOST.value(),
    port,
    secure,
    auth: {
      user: SMTP_USER.value(),
      pass: SMTP_PASS.value(),
    },
  });
}

// ============ Firestore trigger: /contactRequests -> email ============
export const sendContactEmail = onDocumentCreated(
  {
    document: "contactRequests/{id}",
    region: "us-central1",
    secrets: [
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASS,
      SMTP_FROM,
      FALLBACK_TO,
    ],
  },
  async (event) => {
    const d = event.data?.data();
    if (!d) return;

    const from = SMTP_FROM.value();
    const to = d.developerEmail || FALLBACK_TO.value();
    if (!from || !to) {
      console.error(
        "Missing SMTP_FROM or recipient (developerEmail/FALLBACK_TO)."
      );
      return;
    }

    const safe = (v) => (typeof v === "string" ? v : "");
    const appTitle = safe(d.appTitle) || safe(d.appId) || "aplicație";
    const replyTo = safe(d.fromEmail) || undefined;

    const transporter = makeTransporter();

    // către developer
    await transporter.sendMail({
      from,
      to,
      replyTo,
      subject: `[Mtech Digital] Cerere pentru ${appTitle}`,
      text: `${safe(d.fromName)} <${safe(d.fromEmail)}>\n\n${safe(d.message)}`,
    });

    // confirmare către expeditor (dacă există)
    if (d.fromEmail) {
      await transporter.sendMail({
        from,
        to: d.fromEmail,
        subject: `Am primit mesajul tău pentru ${appTitle}`,
        text: `Mulțumim! Dezvoltatorul va reveni în curând.\n\nMesajul tău:\n${safe(
          d.message
        )}`,
      });
    }
  }
);
// ---- Storage intake pentru APK ----
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { createHash } from "node:crypto";
import ApkReader from "@devicefarmer/adbkit-apkreader";


function emailIsAdmin(email, admins) {
  return !!email && Array.isArray(admins) && admins.includes(email);
}
// scor simplu pe permisiuni
function dangerScoreFromPerms(perms = []) {
  const up = new Set(perms.map((p) => String(p || "").toUpperCase()));
  let s = 0;
  if (up.has("ANDROID.PERMISSION.RECORD_AUDIO")) s += 20;
  if (up.has("ANDROID.PERMISSION.ACCESS_FINE_LOCATION")) s += 15;
  if (up.has("ANDROID.PERMISSION.READ_SMS")) s += 30;
  if (up.has("ANDROID.PERMISSION.CAMERA")) s += 10;
  return s;
}

export const apkIntake = onObjectFinalized(
  { region: "us-west1", memory: "1GiB", timeoutSeconds: 180 },
  async (event) => {
    const name = event.data?.name || "";
    const bucketName = event.data?.bucket || "";
    if (!name.endsWith(".apk")) return;
    if (!name.startsWith("downloads/")) return;

    const parts = name.split("/");
    if (parts.length < 4) return;
    const uid   = parts[1];
    const stamp = parts[2];
    const appId = `${uid}_${stamp}`;

    const bucket = gcs.bucket(bucketName);
    const file   = bucket.file(name);

    const [buf] = await file.download();

// foloseste importul static deja prezent
const sha256 = createHash("sha256").update(buf).digest("hex");

// foloseste importul dinamic O SINGURA DATA (sau poti lasa static – vezi mai jos varianta statica)
// deja ai: import ApkReader from "@devicefarmer/adbkit-apkreader" sus în fișier
const reader = await ApkReader.open(buf);
const manifest = await reader.readManifest();

    const sizeBytes = buf.length;


    const packageId   = manifest.package || null;
    const versionName = manifest.versionName || null;
    const versionCode = manifest.versionCode || null;
    const usesSdk     = manifest.usesSdk || {};
    const minSdk      = usesSdk.minSdkVersion ?? null;
    const targetSdk   = usesSdk.targetSdkVersion ?? null;

    const permissions = Array.isArray(manifest.usesPermissions)
      ? manifest.usesPermissions.map(p => p?.name || "").filter(Boolean)
      : [];

    const danger = dangerScoreFromPerms(permissions);

    const appRef = db.doc(`apps/${appId}`);
    const snap   = await appRef.get();
    const baseIfNew = snap.exists ? {} : { ownerUid: uid, status: "pending", createdAt: new Date() };

    await appRef.set({
      ...baseIfNew,
      apkBucket: normalizeBucket(bucketName),
      apkBucketGcs: toGcsBucketName(bucketName),      // <— nou
      apkPath: name,
      apk: {
        sha256Server: sha256,
        minSdk, targetSdk, permissions,
        packageId, versionName, versionCode, sizeBytes
      },
      dangerScore: danger,
      apkParsedAt: new Date()
    }, { merge: true });

  }
);
function toGcsBucketName(rawBucket) {
  let b = normalizeBucket(rawBucket);
  if (!b) return adminSt.bucket().name; // fallback sigur

  if (b.endsWith(".firebasestorage.app")) {
    const pid =
      process.env.GCLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT_ID ||
      adminSt.bucket().name.replace(/\.appspot\.com$/, "");
    return `${pid}.appspot.com`;
  }
  return b;
}


// ================== Helpers ==================
// ================== Helpers (ONE COPY ONLY) ==================
function checkApiKey(req, res) {
  if (req.get("x-api-key") !== (process.env.API_KEY ?? "vali")) {
    res.status(401).send("unauthorized");
    return false;
  }
  return true;
}

function withCors(handler) {
  return async (req, res) => {
    const origin = req.get("origin") || "*";
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.set("Access-Control-Allow-Headers", "x-api-key,x-admin-email,authorization,content-type");
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    return handler(req, res);
  };
}

// Admin SDK foloseste numele de bucket (*.appspot.com), nu domenii *.firebasestorage.app
function normalizeBucket(raw) {
  if (!raw) return null;
  let s = String(raw).trim();

  // gs://BUCKET => BUCKET
  s = s.replace(/^gs:\/\//i, "");

  // daca e URL REST, extrage numele de bucket
  const m = s.match(/[?&/]b\/([^/]+)\/o[/?]/i);
  if (m && m[1]) s = m[1];

  // daca e URL http/https, extrage hostname
  try { if (s.startsWith("http")) s = new URL(s).hostname; } catch {}

  // IMPORTANT: nu mai inlocui .firebasestorage.app cu .appspot.com
  return s; // returneaza exact numele (appspot.com sau firebasestorage.app)
}

function defaultBucketFromEnv() {
  const pid = process.env.GCLOUD_PROJECT || process.env.GCLOUD_PROJECT_ID;
  return pid ? `${pid}.appspot.com` : null;
}
// ============= Auth helpers pentru preview ============
async function getRequesterFromAuthHeader(req) {
  try {
    const authHeader = req.headers.authorization || req.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return { uid: null, email: null, isAdmin: false };

    const token = authHeader.slice(7);
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid || null;
    const email = decoded.email || null;

    // admin by custom claim
    let isAdmin = decoded.admin === true || decoded.role === "admin";

    // admin by config/admins emails
    try {
      const cfgSnap = await db.doc("config/admins").get();
      const emails = cfgSnap.exists ? (cfgSnap.data()?.emails || []) : [];
      if (!isAdmin && email && Array.isArray(emails) && emails.includes(email)) {
        isAdmin = true;
      }
    } catch (_) {}

    return { uid, email, isAdmin };
  } catch {
    return { uid: null, email: null, isAdmin: false };
  }
}

// ================== HTTPS: setDeveloper ==================
export const setDeveloper = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    try {
      if (!checkApiKey(req, res)) return;
      const uid = String(req.query.uid || "");
      const enable = String(req.query.enable || "false") === "true";
      if (!uid) return res.status(400).send("uid required");

      const user = await getAuth().getUser(uid);
      const claims = { ...(user.customClaims || {}), developer: enable };
      await getAuth().setCustomUserClaims(uid, claims);

      res.send(`developer=${enable} set for uid=${uid}`);
    } catch (e) {
      console.error(e);
      res.status(500).send(String(e));
    }
  }
);

// ================== HTTPS: setAdmin ==================
export const setAdmin = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    try {
      if (!checkApiKey(req, res)) return;
      const uid = String(req.query.uid || "");
      const enable = String(req.query.enable || "false") === "true";
      if (!uid) return res.status(400).send("uid required");

      const user = await getAuth().getUser(uid);
      const claims = { ...(user.customClaims || {}), admin: enable };
      await getAuth().setCustomUserClaims(uid, claims);

      res.send(`admin=${enable} set for uid=${uid}`);
    } catch (e) {
      console.error(e);
      res.status(500).send(String(e));
    }
  }
);

export const setAppStatus = onRequest(
  {
    region: "us-central1",
    secrets: [
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASS,
      SMTP_FROM,
      FALLBACK_TO,
    ],
  },
  withCors(async (req, res) => {
    const apiKey = req.get("x-api-key") || String(req.query.apiKey || "");
    if (apiKey !== API_KEY) {
      return res.status(401).send("unauthorized");
    }

    const body = req.method === "POST" ? req.body || {} : {};
    const id = String(body.id ?? req.query.id ?? "");
    const status = String(body.status ?? req.query.status ?? "");
    const reason = String(body.reason ?? req.query.reason ?? "");
    const adminEmail = String(
      req.get("x-admin-email") || body.adminEmail || "admin@mtech.ro"
    );

    if (!id || !okStatus.has(status)) return res.status(400).send("bad params");

    const ref = db.doc(`apps/${id}`);
    await ref.set(
      {
        status,
        review: {
          reason: reason || null,
          reviewedAt: new Date(),
          reviewedBy: adminEmail,
        },
      },
      { merge: true }
    );
const snap = await ref.get();
const d = snap.data() || {};

if (status === "approved" && !d.apkUrl && d.apkPath) {
  try {
      const candidates = [
        toGcsBucketName(d.apkBucket || d.apkBucketGcs),  // <— GCS first
        adminSt.bucket().name,                           // default
        defaultBucketFromEnv(),                          // fallback
      ].filter(Boolean);


    const tried = [];
    let signedUrl = null;

    for (const bucketName of candidates) {
      try {
        const b = adminSt.bucket(bucketName);
        const f = b.file(String(d.apkPath));
        const [exists] = await f.exists();
        if (!exists) { tried.push(`${bucketName} (404)`); continue; }

        const [url] = await f.getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + 7 * 24 * 3600 * 1000
        });

        signedUrl = url;
        tried.push(`${bucketName} (OK)`);
        break;
      } catch (e) {
        tried.push(`${bucketName} (ERR ${e?.message || e})`);
      }
    }

    console.log("setAppStatus issueApkUrl tried =>", tried);

    if (signedUrl) {
      await ref.set(
        { apkUrl: signedUrl, apk: { ...(d.apk || {}), url: signedUrl } },
        { merge: true }
      );
    } else {
      console.error("apkUrl generation failed; tried:", tried);
    }
  } catch (e) {
    console.error("apkUrl generate failed:", e);
  }
}


    // 2) e-mail: nu bloca aprobarea daca SMTP pica
    try {
      const title = d.title || id;
      const to =
        (d.authorEmail && String(d.authorEmail)) || FALLBACK_TO.value();
      const from = SMTP_FROM.value();
      if (from && to) {
        const transporter = makeTransporter();
        const subject =
          status === "approved"
            ? `Aplicatia "${title}" a fost aprobata`
            : status === "rejected"
            ? `Aplicatia "${title}" a fost respinsa`
            : status === "needs-fix"
            ? `Corectii necesare pentru "${title}"`
            : `Status actualizat pentru "${title}": ${status}`;
        const bodyTxt =
          status === "approved"
            ? `Salut!\n\nAplicatia ta "${title}" a fost aprobata si apare public.\n\nMultumim!`
            : `Salut!\n\nStatus pentru "${title}": ${status.toUpperCase()}.\n${
                reason ? `Motiv: ${reason}\n` : ""
              }\nPoti corecta si retrimite din "Aplicatiile mele".\n\nMultumim!`;
        await transporter.sendMail({ from, to, subject, text: bodyTxt });
      } else {
        console.warn("Email skipped: missing FROM/TO");
      }
    } catch (e) {
      console.error("email send failed:", e);
      // nu intoarcem 500
    }

    return res.send(`ok: ${id} -> ${status}`);
  })
);
export const issueApkUrl = onRequest(
  { region: "us-central1" },
  withCors(async (req, res) => {
    // Regula:
    // - Public (fara Authorization): necesita x-api-key VALID + app.approved
    // - Preview (cu Authorization Bearer): permite daca requesterul e admin SAU owner (chiar daca nu e approved)

    const id = String(req.query.id || "");
    if (!id) return res.status(400).send("missing id");

    const appSnap = await db.doc(`apps/${id}`).get();
    if (!appSnap.exists) return res.status(404).send("app not found");
    const app = appSnap.data() || {};

    const isApproved = String(app.status || "").toLowerCase() === "approved" || app.isApproved === true;

    // 1) Incearca autentificare prin Bearer (preview)
    const requester = await getRequesterFromAuthHeader(req);
    const isOwner = requester.uid && requester.uid === app.ownerUid;
    const canPreview = requester.isAdmin || isOwner;

    // 2) Daca nu e Bearer/nu are drept de preview, cadem pe cheia API (public)
    const hasApiKey = (req.get("x-api-key") || "") === (process.env.API_KEY ?? "vali");

    if (!isApproved && !canPreview) {
      // nu e aprobat -> doar admin/owner pot preview
      return res.status(403).send("app not approved");
    }
    if (!isApproved && !hasApiKey && !canPreview) {
      // cu tot cu fallback, nu ai nici admin/owner nici api-key cu approved
      return res.status(401).send("unauthorized");
    }

    // De unde luam APK
    const directUrl = app.apkUrl || app.apk?.url;
    const apkPath = app.apkPath || app.apk?.path;
    if (!directUrl && !apkPath) {
      return res.status(404).send("apkPath/apkUrl missing");
    }

    if (directUrl) {
      // Daca exista URL deja salvat (ex: din setAppStatus), il returnam direct
      return res.status(200).json({ url: directUrl, kind: "direct" });
    }

    // Construim semnat (v4) din unul dintre bucketuri candidate
    const candidates = [
      app.apkBucketGcs,
      toGcsBucketName(app.apkBucket),
      app.apkBucket,
      adminSt.bucket().name,
      defaultBucketFromEnv(),
    ].filter(Boolean);

    const tried = [];
    let urlOut = null;

    for (const bn of candidates) {
      try {
        const b = adminSt.bucket(bn);
        const f = b.file(String(apkPath));
        const [exists] = await f.exists();
        if (!exists) { tried.push(`${bn} (404)`); continue; }

        const filename = (app.apk?.fileName || app.title || "app").replace(/"/g, "");
        const [url] = await f.getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + 15 * 60 * 1000,
          responseDisposition: `attachment; filename="${filename}.apk"`,
        });

        urlOut = url;
        tried.push(`${bn} (OK)`);
        break;
      } catch (e) {
        tried.push(`${bn} (ERR ${e?.message || String(e)})`);
      }
    }

    console.log("issueApkUrl tried =>", tried);

    if (!urlOut) {
      return res
        .status(404)
        .send("apk not found in any bucket. Tried: " + tried.join(" | "));
    }

    await db.doc(`apps/${id}`).set({
      lastIssuedAt: new Date(),
      // optional: cache si pentru data viitoare
      apkUrl: urlOut,
      apk: { ...(app.apk || {}), url: urlOut },
    }, { merge: true });

    return res.json({ url: urlOut, preview: !isApproved });
  })
);
export const issueApkUrlPreview = onRequest(
  { region: "us-central1" },
  withCors(async (req, res) => {
    if (!checkApiKey(req, res)) return; // verifica x-api-key
    
    const id = String(req.query.id || "");
    if (!id) return res.status(400).send("missing id");

    // 1) verifica admin din header
    const adminEmailHeader = String(req.get("x-admin-email") || "");
    if (!adminEmailHeader) return res.status(401).send("missing admin email");

    // citeste lista de admini din Firestore: config/admins { emails: [] }
    const cfgSnap = await db.doc("config/admins").get();
    const admins = cfgSnap.exists ? (cfgSnap.data().emails || []) : [];
    const isAdmin = emailIsAdmin(adminEmailHeader, admins);
    if (!isAdmin) return res.status(403).send("not admin");

    // 2) app doc
    const snap = await db.doc(`apps/${id}`).get();
    if (!snap.exists) return res.status(404).send("app not found");
    const d = snap.data() || {};

    const apkPath = d.apkPath;
    if (!apkPath) return res.status(404).send("apkPath missing");

    // 3) cauta fisierul in bucket (aceeasi logica tried/candidates)
    const candidates = [
      d.apkBucketGcs,                    // ex: *.appspot.com
      toGcsBucketName(d.apkBucket),      // mapare *.firebasestorage.app -> *.appspot.com
      d.apkBucket,                       // alias REST
      adminSt.bucket().name,             // default Admin bucket
      defaultBucketFromEnv(),            // fallback
    ].filter(Boolean);

    const tried = [];
    let urlOut = null;

    for (const bn of candidates) {
      try {
        const b = adminSt.bucket(bn);
        const f = b.file(String(apkPath));
        const [exists] = await f.exists();
        if (!exists) { tried.push(`${bn} (404)`); continue; }

        const [url] = await f.getSignedUrl({
          version: "v4",
          action: "read",
          // preview => scurt, 15 minute
          expires: Date.now() + 15 * 60 * 1000,
          responseDisposition: "attachment",
        });

        urlOut = url;
        tried.push(`${bn} (OK)`);
        break;
      } catch (e) {
        tried.push(`${bn} (ERR ${e && e.message ? e.message : String(e)})`);
      }
    }

    console.log("issueApkUrlPreview tried =>", tried);

    if (!urlOut) {
      return res
        .status(404)
        .send("apk not found in any bucket. Tried: " + tried.join(" | "));
    }

    // optional: nu salvam permanent in doc, e doar preview
    return res.json({ url: urlOut });
  })
);

async function downloadApk(appId) {
  const u = new URL("https://us-central1-mtechdigital-2449f.cloudfunctions.net/issueApkUrl");
  u.searchParams.set("id", appId);

  const r = await fetch(u, { headers: { "x-api-key": "vali" } });
  if (!r.ok) throw new Error(await r.text());

  const { url } = await r.json();
  window.open(url, "_blank", "noopener,noreferrer");
}

export const debugListApk = onRequest({ region: "us-central1" }, withCors(async (req, res) => {
  if (!checkApiKey(req, res)) return;
  const id = String(req.query.id || "");
  if (!id) return res.status(400).send("missing id");

  const ref = db.doc(`apps/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).send("app not found");
  const d = snap.data() || {};

const bucketName =
  toGcsBucketName(d.apkBucket || d.apkBucketGcs) ||
  adminSt.bucket().name ||
  defaultBucketFromEnv();


  const b = adminSt.bucket(bucketName);
  const [files] = await b.getFiles({
    prefix: `downloads/${id.split('_')[0]}/${id.split('_')[1]}/`
  });

  res.json({
    bucketName,
    expectedPath: d.apkPath,
    found: files.map(f => f.name)
  });
}));


