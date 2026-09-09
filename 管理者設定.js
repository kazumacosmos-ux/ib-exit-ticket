import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  update,
  set
} from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { firebaseConfig } from "./Firebase設定.js";


// =========================
// Firebase
// =========================

const app = initializeApp(firebaseConfig);

const db = getDatabase(app);
const auth = getAuth(app);


// =========================
// 設定
// =========================

const STAFF_EMAIL =
  "kazuma.cosmos@gmail.com";

const ADMIN_PASSWORD =
  "kazuma";


// =========================
// DOM
// =========================

const loginArea =
  document.getElementById("loginArea");

const settingsArea =
  document.getElementById("settingsArea");

const passwordInput =
  document.getElementById("password");

const loginButton =
  document.getElementById("login");

const loginMessage =
  document.getElementById("loginMessage");

const receptionState =
  document.getElementById("receptionState");

const toggleOpen =
  document.getElementById("toggleOpen");

const slotMinutesInput =
  document.getElementById("slotMinutes");

const maxGroupsInput =
  document.getElementById("maxGroups");

const saveSettingsButton =
  document.getElementById("saveSettings");

const settingsMessage =
  document.getElementById("settingsMessage");

const resetAllButton =
  document.getElementById("resetAll");

const resetMessage =
  document.getElementById("resetMessage");

const backToStaffButton =
  document.getElementById("backToStaff");

const logoutButton =
  document.getElementById("logout");


// =========================
// 現在の設定
// =========================

let currentSettings = {
  start: "09:00",
  end: "15:00",
  slotMinutes: 30,
  maxGroups: 5,
  open: true
};


// =========================
// ログイン
// =========================

loginButton.addEventListener(
  "click",
  async () => {

    const password =
      passwordInput.value.trim();

    loginMessage.textContent = "";

    if (!password) {
      loginMessage.textContent =
        "パスワードを入力してください。";
      return;
    }

    // Firebaseスタッフアカウントでログイン
    try {

      await signInWithEmailAndPassword(
        auth,
        STAFF_EMAIL,
        password
      );

    } catch (error) {

      loginMessage.textContent =
        "ログインに失敗しました。";

      console.error(error);

    }

  }
);


// =========================
// Firebaseログイン状態
// =========================

onAuthStateChanged(
  auth,
  (user) => {

    if (user && user.email === STAFF_EMAIL) {

      loginArea.style.display = "none";

      // Firebaseログイン後、
      // さらに管理者用パスワードを要求
      showAdminPassword();

    } else {

      loginArea.style.display = "block";

      settingsArea.style.display = "none";

    }

  }
);


// =========================
// 管理者パスワード
// =========================

function showAdminPassword() {

  const entered =
    window.prompt(
      "管理者用パスワードを入力してください。"
    );

  if (entered !== ADMIN_PASSWORD) {

    alert(
      "管理者用パスワードが違います。"
    );

    signOut(auth);

    return;

  }

  settingsArea.style.display = "block";

  loginMessage.textContent = "";

}


// =========================
// 設定読み込み
// =========================

onValue(
  ref(db, "Queue/settings"),
  (snapshot) => {

    const data =
      snapshot.val();

    if (!data) {
      return;
    }

    currentSettings = {
      ...currentSettings,
      ...data
    };

    updateSettingsScreen();

  }
);


// =========================
// 設定画面更新
// =========================

function updateSettingsScreen() {

  slotMinutesInput.value =
    currentSettings.slotMinutes;

  maxGroupsInput.value =
    currentSettings.maxGroups;

  if (currentSettings.open) {

    receptionState.textContent =
      "受付中";

    toggleOpen.textContent =
      "受付停止";

  } else {

    receptionState.textContent =
      "受付停止中";

    toggleOpen.textContent =
      "受付再開";

  }

}


// =========================
// 受付停止・再開
// =========================

toggleOpen.addEventListener(
  "click",
  async () => {

    const nextOpen =
      !currentSettings.open;

    try {

      await update(
        ref(db, "Queue/settings"),
        {
          open: nextOpen
        }
      );

      settingsMessage.textContent =
        nextOpen
          ? "受付を再開しました。"
          : "受付を停止しました。";

    } catch (error) {

      settingsMessage.textContent =
        "設定変更に失敗しました。";

      console.error(error);

    }

  }
);


// =========================
// 設定保存
// =========================

saveSettingsButton.addEventListener(
  "click",
  async () => {

    const slotMinutes =
      Number(slotMinutesInput.value);

    const maxGroups =
      Number(maxGroupsInput.value);

    if (
      !Number.isInteger(slotMinutes) ||
      slotMinutes < 1
    ) {

      settingsMessage.textContent =
        "1枠の時間を正しく入力してください。";

      return;

    }

    if (
      !Number.isInteger(maxGroups) ||
      maxGroups < 1 ||
      maxGroups > 10
    ) {

      settingsMessage.textContent =
        "最大組数は1〜10組で設定してください。";

      return;

    }

    try {

      await update(
        ref(db, "Queue/settings"),
        {
          slotMinutes,
          maxGroups
        }
      );

      settingsMessage.textContent =
        "設定を保存しました。";

    } catch (error) {

      settingsMessage.textContent =
        "設定の保存に失敗しました。";

      console.error(error);

    }

  }
);


// =========================
// 全体リセット
// =========================

resetAllButton.addEventListener(
  "click",
  async () => {

    const first =
      confirm(
        "本当に全ての予約データを削除しますか？"
      );

    if (!first) {
      return;
    }

    const second =
      confirm(
        "この操作は取り消せません。本当に実行しますか？"
      );

    if (!second) {
      return;
    }

    try {

      await set(
        ref(db, "Queue/reservations"),
        null
      );

      await set(
        ref(db, "Queue/slots"),
        null
      );

      await set(
        ref(db, "Queue/reservationLast"),
        0
      );

      await set(
        ref(db, "Queue/resetAt"),
        Date.now()
      );

      resetMessage.textContent =
        "予約データをすべてリセットしました。";

    } catch (error) {

      resetMessage.textContent =
        "リセットに失敗しました。";

      console.error(error);

    }

  }
);


// =========================
// スタッフ画面へ戻る
// =========================

backToStaffButton.addEventListener(
  "click",
  () => {

    window.location.href =
      "./スタッフ.html";

  }
);


// =========================
// ログアウト
// =========================

logoutButton.addEventListener(
  "click",
  async () => {

    await signOut(auth);

    settingsArea.style.display =
      "none";

    loginArea.style.display =
      "block";

    passwordInput.value = "";

  }
);