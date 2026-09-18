// 1-B出口 管理者通知
// 管理者用の通知登録ページから読み込むメインファイルです。
// 予約データの変動（新規予約・キャンセル）は Firebase Functions 側で検知し、
// このiPadのFCMトークン宛てにプッシュ通知を送ります.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getMessaging,
  getToken,
  onMessage
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6xBMX14Z4gO4KE8Dy0qtTrQayDh9Fuzc",
  authDomain: "bdeguchi-1666f.firebaseapp.com",
  databaseURL: "https://bdeguchi-1666f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bdeguchi-1666f",
  storageBucket: "bdeguchi-1666f.firebasestorage.app",
  messagingSenderId: "578146539417",
  appId: "1:578146539417:web:159ff465f65a3fdfeea508"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const messaging = getMessaging(app);

// Firebase Console → プロジェクトの設定 → Cloud Messaging
// 「Web Push 証明書」で発行した公開VAPIDキーをここに入れてください。
const VAPID_KEY = "ここにFirebaseのWeb Push公開鍵を入れる";

const $ = (id) => document.getElementById(id);

function message(text, isError = false) {
  const el = $("notificationMessage");
  if (!el) return;
  el.textContent = text;
  el.className = isError ? "error" : "ok";
}

async function registerToken() {
  if (!("Notification" in window)) {
    throw new Error("このiPadのブラウザはプッシュ通知に対応していません。");
  }

  if (VAPID_KEY.startsWith("ここに")) {
    throw new Error("VAPIDキーがまだ設定されていません。");
  }

  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Workerが利用できません。HTTPSで開いてください。");
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error("通知が許可されていません。iPadの通知設定も確認してください。");
  }

  const registration =
    await navigator.serviceWorker.register("./T-3.js");

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration
  });

  if (!token) {
    throw new Error("通知トークンを取得できませんでした。");
  }

  // Cloud FunctionのCallable APIへ登録
  const idToken = await auth.currentUser.getIdToken();

  const response = await fetch(
    "https://asia-southeast1-bdeguchi-1666f.cloudfunctions.net/registerNotificationToken",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      },
      body: JSON.stringify({ token })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`通知先の登録に失敗しました。${text}`);
  }

  localStorage.setItem("ibExitNotificationEnabled", "1");
  message("通知を有効にしました。このiPadに予約の変動が届きます。");
  $("enableNotification").disabled = true;
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    $("notificationLogin")?.classList.remove("hidden");
    $("notificationPanel")?.classList.add("hidden");
    return;
  }

  $("notificationLogin")?.classList.add("hidden");
  $("notificationPanel")?.classList.remove("hidden");

  if (user.email) {
    $("loggedInAs").textContent = `管理者：${user.email}`;
  }
});

$("adminLogin")?.addEventListener("click", async () => {
  const email = $("adminEmail").value.trim();
  const password = $("adminPassword").value;

  if (!email || !password) {
    message("メールアドレスとパスワードを入力してください。", true);
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    message("管理者ログインしました。");
  } catch (e) {
    message("ログインできませんでした。メールアドレスとパスワードを確認してください。", true);
  }
});

$("enableNotification")?.addEventListener("click", async () => {
  if (!auth.currentUser) {
    message("先に管理者ログインをしてください。", true);
    return;
  }

  try {
    $("enableNotification").disabled = true;
    message("通知を設定しています…");
    await registerToken();
  } catch (e) {
    $("enableNotification").disabled = false;
    message(e?.message || "通知設定に失敗しました。", true);
  }
});

$("adminLogout")?.addEventListener("click", async () => {
  await signOut(auth);
  message("ログアウトしました。");
});

// 通知ページを開いている最中の通知も表示
onMessage(messaging, (payload) => {
  const title = payload?.notification?.title || "1-B出口";
  const body = payload?.notification?.body || "予約に変動があります。";
  message(`${title}：${body}`);
});
