// ==============================
// 管理者設定ページ
// 管理者設定.js
// ==============================


import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";


import {
  getDatabase,
  ref,
  onValue,
  set,
  update
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


// ==============================
// Firebase初期化
// ==============================

const app =
  initializeApp(firebaseConfig);


const db =
  getDatabase(app);


const auth =
  getAuth(app);


// ==============================
// ★ 管理者Firebaseアカウント
// ==============================
//
// Firebase Authenticationで
// 管理者専用アカウントを作って、
// そのメールアドレスをここに入れる。
//
// 例:
// admin@ib-exit.example
//
// ==============================

const ADMIN_EMAIL =
  "ここに管理者用メールアドレスを入れる";


// ==============================
// 固定時刻
// ==============================

const FIXED_START =
  "09:00";


const FIXED_END =
  "15:00";


// ==============================
// 現在の設定
// ==============================

let currentSettings = {

  start:
    FIXED_START,

  end:
    FIXED_END,

  slotMinutes:
    30,

  maxGroups:
    5,

  open:
    true
};


// ==============================
// HTML取得
// ==============================

function $(id) {

  return document.getElementById(id);

}


// ==============================
// 時刻 → 分
// ==============================

function toMinutes(time) {

  if (!time) {

    return 0;
  }


  const parts =
    time.split(":");


  const hour =
    Number(parts[0]);


  const minute =
    Number(parts[1]);


  return (
    hour * 60 +
    minute
  );
}


// ==============================
// ログイン
// ==============================

$("login").addEventListener(
  "click",
  async () => {

    const password =
      $("password").value;


    const loginMessage =
      $("loginMessage");


    if (!password) {

      loginMessage.textContent =
        "管理者パスワードを入力してください。";

      return;
    }


    loginMessage.textContent =
      "認証しています……";


    try {

      const result =
        await signInWithEmailAndPassword(
          auth,
          ADMIN_EMAIL,
          password
        );


      if (
        result.user.email !==
        ADMIN_EMAIL
      ) {

        await signOut(auth);

        throw new Error(
          "管理者アカウントではありません。"
        );
      }


      loginMessage.textContent =
        "";

    } catch (error) {

      console.error(
        "管理者ログインエラー:",
        error
      );


      loginMessage.textContent =
        "管理者パスワードが違います。";
    }
  }
);


// ==============================
// Enterキー
// ==============================

$("password").addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Enter"
    ) {

      $("login").click();
    }
  }
);


// ==============================
// 認証状態
// ==============================

onAuthStateChanged(
  auth,
  user => {

    const loginArea =
      $("loginArea");


    const settingsArea =
      $("settingsArea");


    if (
      user &&
      user.email ===
      ADMIN_EMAIL
    ) {

      loginArea.style.display =
        "none";


      settingsArea.style.display =
        "block";


      loadSettings();

    } else {

      loginArea.style.display =
        "block";


      settingsArea.style.display =
        "none";
    }
  }
);


// ==============================
// 設定読み込み
// ==============================

function loadSettings() {

  const settingsRef =
    ref(
      db,
      "Queue/settings"
    );


  onValue(
    settingsRef,
    snapshot => {

      const data =
        snapshot.val();


      if (data) {

        currentSettings = {

          start:
            FIXED_START,

          end:
            FIXED_END,

          slotMinutes:
            Number(
              data.slotMinutes
            ) || 30,

          maxGroups:
            Number(
              data.maxGroups
            ) || 5,

          open:
            data.open !== false
        };
      }


      updateScreen();
    }
  );
}


// ==============================
// 画面更新
// ==============================

function updateScreen() {

  const slotMinutes =
    $("slotMinutes");


  const maxGroups =
    $("maxGroups");


  const receptionState =
    $("receptionState");


  const toggleOpen =
    $("toggleOpen");


  if (slotMinutes) {

    slotMinutes.value =
      String(
        currentSettings.slotMinutes
      );
  }


  if (maxGroups) {

    maxGroups.value =
      String(
        currentSettings.maxGroups
      );
  }


  if (
    currentSettings.open
  ) {

    if (receptionState) {

      receptionState.textContent =
        "受付中";
    }


    if (toggleOpen) {

      toggleOpen.textContent =
        "受付停止";
    }

  } else {

    if (receptionState) {

      receptionState.textContent =
        "受付停止中";
    }


    if (toggleOpen) {

      toggleOpen.textContent =
        "受付再開";
    }
  }
}


// ==============================
// 受付停止・再開
// ==============================

$("toggleOpen").addEventListener(
  "click",
  async () => {

    if (
      !auth.currentUser ||
      auth.currentUser.email !==
      ADMIN_EMAIL
    ) {

      alert(
        "管理者としてログインしてください。"
      );

      return;
    }


    const newOpen =
      !currentSettings.open;


    try {

      await update(
        ref(
          db,
          "Queue/settings"
        ),
        {
          open:
            newOpen
        }
      );

    } catch (error) {

      console.error(
        "受付状態変更エラー:",
        error
      );


      alert(
        "受付状態の変更に失敗しました。"
      );
    }
  }
);


// ==============================
// 設定保存
// ==============================

$("saveSettings").addEventListener(
  "click",
  async () => {

    if (
      !auth.currentUser ||
      auth.currentUser.email !==
      ADMIN_EMAIL
    ) {

      alert(
        "管理者としてログインしてください。"
      );

      return;
    }


    const settingsMessage =
      $("settingsMessage");


    const slotMinutes =
      Number(
        $("slotMinutes").value
      );


    const maxGroups =
      Number(
        $("maxGroups").value
      );


    if (
      !Number.isInteger(
        slotMinutes
      ) ||
      slotMinutes <= 0
    ) {

      settingsMessage.textContent =
        "1枠の時間は1分以上の整数にしてください。";

      return;
    }


    if (
      !Number.isInteger(
        maxGroups
      ) ||
      maxGroups < 1 ||
      maxGroups > 10
    ) {

      settingsMessage.textContent =
        "最大組数は1〜10組にしてください。";

      return;
    }


    const totalMinutes =
      toMinutes(FIXED_END) -
      toMinutes(FIXED_START);


    if (
      slotMinutes >
      totalMinutes
    ) {

      settingsMessage.textContent =
        "1枠の時間が長すぎます。";

      return;
    }


    if (
      totalMinutes %
      slotMinutes !== 0
    ) {

      settingsMessage.textContent =
        "1枠の時間は、09:00〜15:00の6時間にきれいに収まる値にしてください。";

      return;
    }


    settingsMessage.textContent =
      "保存しています……";


    try {

      await update(
        ref(
          db,
          "Queue/settings"
        ),
        {

          start:
            FIXED_START,

          end:
            FIXED_END,

          slotMinutes:
            slotMinutes,

          maxGroups:
            maxGroups,

          open:
            currentSettings.open
        }
      );


      currentSettings = {

        start:
          FIXED_START,

        end:
          FIXED_END,

        slotMinutes:
          slotMinutes,

        maxGroups:
          maxGroups,

        open:
          currentSettings.open
      };


      settingsMessage.textContent =
        "設定を保存しました。";

    } catch (error) {

      console.error(
        "設定保存エラー:",
        error
      );


      settingsMessage.textContent =
        "設定の保存に失敗しました。";
    }
  }
);


// ==============================
// ★ 全体リセット
// ==============================

$("resetAll").addEventListener(
  "click",
  async () => {

    if (
      !auth.currentUser ||
      auth.currentUser.email !==
      ADMIN_EMAIL
    ) {

      alert(
        "管理者としてログインしてください。"
      );

      return;
    }


    // ============================
    // 1回目の確認
    // ============================

    const firstConfirm =
      confirm(
        "予約データをすべてリセットします。\n\n" +
        "Web予約・紙予約・予約番号がすべて消えます。\n\n" +
        "本当に実行しますか？"
      );


    if (!firstConfirm) {

      return;
    }


    // ============================
    // 2回目の確認
    // ============================

    const secondConfirm =
      confirm(
        "【最終確認】\n\n" +
        "現在の予約をすべて削除し、" +
        "予約番号をDREAM001から再スタートします。\n\n" +
        "実行しますか？"
      );


    if (!secondConfirm) {

      return;
    }


    const resetButton =
      $("resetAll");


    const resetMessage =
      $("resetMessage");


    if (resetButton) {

      resetButton.disabled =
        true;

      resetButton.textContent =
        "リセットしています……";
    }


    if (resetMessage) {

      resetMessage.textContent =
        "データをリセットしています……";
    }


    try {

      // ==========================
      // ① 予約削除
      // ==========================

      await set(
        ref(
          db,
          "Queue/reservations"
        ),
        null
      );


      // ==========================
      // ② 時間枠データ削除
      // ==========================

      await set(
        ref(
          db,
          "Queue/slots"
        ),
        null
      );


      // ==========================
      // ③ 予約番号リセット
      // ==========================

      await set(
        ref(
          db,
          "Queue/reservationLast"
        ),
        0
      );


      // ==========================
      // ④ リセット時刻
      // ==========================

      await set(
        ref(
          db,
          "Queue/resetAt"
        ),
        Date.now()
      );


      if (resetMessage) {

        resetMessage.textContent =
          "予約データをリセットしました。";
      }


      alert(
        "予約データをリセットしました。\n\n" +
        "次の予約番号はDREAM001です。"
      );

    } catch (error) {

      console.error(
        "全体リセットエラー:",
        error
      );


      if (resetMessage) {

        resetMessage.textContent =
          "リセットに失敗しました。";
      }


      let detail =
        error?.message ||
        "原因不明のエラー";


      if (
        error?.code
      ) {

        detail =
          `${error.code}\n${detail}`;
      }


      alert(
        "リセットに失敗しました。\n\n" +
        detail
      );

    } finally {

      if (resetButton) {

        resetButton.disabled =
          false;

        resetButton.textContent =
          "全体リセット";
      }
    }
  }
);


// ==============================
// スタッフ画面へ戻る
// ==============================

$("backToStaff").addEventListener(
  "click",
  () => {

    window.location.href =
      "./スタッフ.html";
  }
);


// ==============================
// ログアウト
// ==============================

$("logout").addEventListener(
  "click",
  async () => {

    try {

      await signOut(
        auth
      );

      window.location.href =
        "./スタッフ.html";

    } catch (error) {

      console.error(
        "ログアウトエラー:",
        error
      );


      alert(
        "ログアウトに失敗しました。"
      );
    }
  }
);
