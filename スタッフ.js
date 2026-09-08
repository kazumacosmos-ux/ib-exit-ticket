// ==============================
// スタッフ管理ページ
// スタッフ.js
// ==============================

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  set,
  update,
  remove
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
// Firebase 初期化
// ==============================

const app = initializeApp(firebaseConfig);

const db = getDatabase(app);

const auth = getAuth(app);


// ==============================
// スタッフ情報
// ==============================

// スタッフログインに使用するメールアドレス
const STAFF_EMAIL = "kazuma.cosmos@gmail.com";


// ==============================
// 時刻設定
// ==============================

// 開始時刻・終了時刻は固定
const FIXED_START = "09:00";
const FIXED_END = "15:00";


// ==============================
// 現在の設定
// ==============================

let currentSettings = {
  start: FIXED_START,
  end: FIXED_END,
  slotMinutes: 30,
  maxGroups: 5,
  open: true
};


// ==============================
// HTML取得用関数
// ==============================

function $(id) {
  return document.getElementById(id);
}


// ==============================
// 時刻を「分」に変換
// 例：09:30 → 570
// ==============================

function toMinutes(time) {

  if (!time) {
    return 0;
  }

  const parts = time.split(":");

  const hour = Number(parts[0]);
  const minute = Number(parts[1]);

  return hour * 60 + minute;
}


// ==============================
// 「分」を時刻に変換
// 例：570 → 09:30
// ==============================

function formatTime(minutes) {

  const hour = Math.floor(minutes / 60);

  const minute = minutes % 60;

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );
}


// ==============================
// スロットキーを作る
// 例：09:30 → 09-30
// ==============================

function slotKey(time) {

  return time.replace(":", "-");
}


// ==============================
// 時間枠を作成
// ==============================

function createSlots() {

  const slots = [];

  // 開始・終了は必ず固定値を使用
  const startMinutes = toMinutes(FIXED_START);

  const endMinutes = toMinutes(FIXED_END);

  const slotMinutes = Number(currentSettings.slotMinutes);

  if (!slotMinutes || slotMinutes <= 0) {
    return slots;
  }

  for (
    let minutes = startMinutes;
    minutes + slotMinutes <= endMinutes;
    minutes += slotMinutes
  ) {

    const start = formatTime(minutes);

    const end = formatTime(minutes + slotMinutes);

    slots.push({
      key: slotKey(start),
      start: start,
      end: end
    });
  }

  return slots;
}


// ==============================
// HTMLエスケープ
// ==============================

function escapeHtml(value) {

  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ==============================
// 最大組数を設定
// ==============================

function setupMaxGroups() {

  const maxGroupsElement = $("maxGroups");

  if (!maxGroupsElement) {
    return;
  }

  const value = Number(currentSettings.maxGroups);

  if (value >= 1 && value <= 10) {
    maxGroupsElement.value = String(value);
  }
}


// ==============================
// ページ全体を表示
// ==============================

function render() {

  setupMaxGroups();

  renderPaperSlots();

  renderReservations();
}


// ==============================
// 紙予約の時間枠一覧を作成
// ==============================

function renderPaperSlots() {

  const paperSlot = $("paperSlot");

  if (!paperSlot) {
    return;
  }

  const slots = createSlots();

  paperSlot.innerHTML = "";

  for (const slot of slots) {

    const option = document.createElement("option");

    option.value = slot.key;

    option.textContent =
      `${slot.start}〜${slot.end}`;

    paperSlot.appendChild(option);
  }

  updatePaperSlotInfo();
}


// ==============================
// 紙予約の時間枠情報を表示
// ==============================

function updatePaperSlotInfo() {

  const paperSlot = $("paperSlot");

  const info = $("paperSlotInfo");

  if (!paperSlot || !info) {
    return;
  }

  const selectedSlot = paperSlot.value;

  if (!selectedSlot) {

    info.textContent = "";

    return;
  }

  const slot = createSlots().find(
    item => item.key === selectedSlot
  );

  if (!slot) {

    info.textContent = "";

    return;
  }

  const countRef = ref(
    db,
    `Queue/slots/${slot.key}/count`
  );

  onValue(
    countRef,
    snapshot => {

      const count = snapshot.exists()
        ? Number(snapshot.val())
        : 0;

      const max = Number(
        currentSettings.maxGroups
      );

      info.textContent =
        `現在 ${count} / ${max} 組`;
    },
    {
      onlyOnce: false
    }
  );
}


// ==============================
// 予約一覧を表示
// ==============================

function renderReservations() {

  const slotList = $("slotList");

  if (!slotList) {
    return;
  }

  const reservationsRef =
    ref(db, "Queue/reservations");

  onValue(
    reservationsRef,
    snapshot => {

      const data = snapshot.val();

      const reservations = [];

      if (data) {

        for (const key of Object.keys(data)) {

          const reservation = data[key];

          if (!reservation) {
            continue;
          }

          reservations.push(reservation);
        }
      }

      reservations.sort(
        (a, b) => Number(a.number) - Number(b.number)
      );

      const slots = createSlots();

      slotList.innerHTML = "";

      for (const slot of slots) {

        const slotReservations =
          reservations.filter(
            reservation =>
              reservation.slot === slot.key
          );

        const section =
          document.createElement("section");

        section.className = "slot-section";

        const title =
          document.createElement("h3");

        title.textContent =
          `${slot.start}〜${slot.end} ` +
          `（${slotReservations.length}/${currentSettings.maxGroups}組）`;

        section.appendChild(title);

        if (slotReservations.length === 0) {

          const empty =
            document.createElement("p");

          empty.textContent =
            "予約はありません。";

          section.appendChild(empty);

        } else {

          for (
            const reservation
            of slotReservations
          ) {

            const item =
              document.createElement("div");

            item.className =
              "reservation-item";

            const name =
              reservation.name
              ? escapeHtml(reservation.name)
              : "名前なし";

            const size =
              Number(reservation.size);

            const type =
              reservation.type === "paper"
              ? "紙予約"
              : "Web予約";

            item.innerHTML = `
              <strong>
                ${name}
              </strong>
              <br>
              ${size}人
              ・
              ${type}
              ・
              予約番号 ${reservation.number}
            `;

            // ==========================
            // 移動用セレクト
            // ==========================

            const moveSelect =
              document.createElement("select");

            const defaultOption =
              document.createElement("option");

            defaultOption.value = "";

            defaultOption.textContent =
              "時間枠を変更";

            moveSelect.appendChild(
              defaultOption
            );

            for (const targetSlot of slots) {

              if (
                targetSlot.key === reservation.slot
              ) {
                continue;
              }

              const option =
                document.createElement("option");

              option.value =
                targetSlot.key;

              option.textContent =
                `${targetSlot.start}〜${targetSlot.end}`;

              moveSelect.appendChild(option);
            }

            moveSelect.addEventListener(
              "change",
              async () => {

                const targetSlot =
                  moveSelect.value;

                if (!targetSlot) {
                  return;
                }

                await moveReservation(
                  reservation,
                  targetSlot
                );

                moveSelect.value = "";
              }
            );

            item.appendChild(
              document.createElement("br")
            );

            item.appendChild(moveSelect);


            // ==========================
            // 削除ボタン
            // ==========================

            const deleteButton =
              document.createElement("button");

            deleteButton.textContent =
              "削除";

            deleteButton.type =
              "button";

            deleteButton.addEventListener(
              "click",
              async () => {

                await deleteReservation(
                  reservation
                );
              }
            );

            item.appendChild(
              document.createTextNode(" ")
            );

            item.appendChild(
              deleteButton
            );

            section.appendChild(item);
          }
        }

        slotList.appendChild(section);
      }
    }
  );
}


// ==============================
// 予約の時間枠を変更
// ==============================

async function moveReservation(
  reservation,
  targetSlotKey
) {

  const oldSlotKey =
    reservation.slot;

  if (
    !oldSlotKey ||
    !targetSlotKey ||
    oldSlotKey === targetSlotKey
  ) {
    return;
  }


  // ==========================
  // 対象時間枠を探す
  // ==========================

  const targetSlot =
    createSlots().find(
      slot => slot.key === targetSlotKey
    );

  if (!targetSlot) {

    alert("変更先の時間枠が見つかりません。");

    return;
  }


  // ==========================
  // 移動先の人数を確認
  // ==========================

  const targetCountRef =
    ref(
      db,
      `Queue/slots/${targetSlotKey}/count`
    );


  let targetIncremented = false;


  try {

    const transactionResult =
      await runTransaction(
        targetCountRef,
        current => {

          const count =
            current === null
              ? 0
              : Number(current);

          const maxGroups =
            Number(currentSettings.maxGroups);

          if (count >= maxGroups) {

            return;
          }

          return count + 1;
        }
      );


    if (!transactionResult.committed) {

      alert(
        "変更先の時間枠が満員です。"
      );

      return;
    }


    targetIncremented = true;


    // ==========================
    // 予約情報を更新
    // ==========================

    const reservationRef =
      ref(
        db,
        `Queue/reservations/${reservation.number}`
      );

    await update(
      reservationRef,
      {
        slot: targetSlot.key,
        start: targetSlot.start,
        end: targetSlot.end
      }
    );


    // ==========================
    // 元の時間枠を1減らす
    // ==========================

    const oldCountRef =
      ref(
        db,
        `Queue/slots/${oldSlotKey}/count`
      );

    await runTransaction(
      oldCountRef,
      current => {

        const count =
          current === null
            ? 0
            : Number(current);

        return Math.max(0, count - 1);
      }
    );


    alert("時間枠を変更しました。");


  } catch (error) {

    console.error(
      "予約移動エラー:",
      error
    );


    // ==========================
    // 予約更新に失敗した場合
    // 移動先を元に戻す
    // ==========================

    if (targetIncremented) {

      try {

        await runTransaction(
          targetCountRef,
          current => {

            const count =
              current === null
                ? 0
                : Number(current);

            return Math.max(
              0,
              count - 1
            );
          }
        );

      } catch (rollbackError) {

        console.error(
          "ロールバックエラー:",
          rollbackError
        );
      }
    }

    alert(
      "時間枠の変更に失敗しました。"
    );
  }
}


// ==============================
// 予約を削除
// ==============================

async function deleteReservation(
  reservation
) {

  const number =
    reservation.number;

  if (number === undefined) {
    return;
  }


  // ==========================
  // 確認
  // ==========================

  const confirmed =
    confirm(
      `予約番号 ${number} を削除しますか？`
    );

  if (!confirmed) {
    return;
  }


  const reservationRef =
    ref(
      db,
      `Queue/reservations/${number}`
    );


  try {

    // ==========================
    // 予約データを削除
    // ==========================

    await remove(
      reservationRef
    );


    // ==========================
    // 時間枠の人数を1減らす
    // ==========================

    if (reservation.slot) {

      const countRef =
        ref(
          db,
          `Queue/slots/${reservation.slot}/count`
        );

      await runTransaction(
        countRef,
        current => {

          const count =
            current === null
              ? 0
              : Number(current);

          return Math.max(
            0,
            count - 1
          );
        }
      );
    }


    alert("予約を削除しました。");


  } catch (error) {

    console.error(
      "予約削除エラー:",
      error
    );

    alert(
      "予約の削除に失敗しました。"
    );
  }
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
        "パスワードを入力してください。";

      return;
    }


    loginMessage.textContent =
      "ログインしています……";


    try {

      await signInWithEmailAndPassword(
        auth,
        STAFF_EMAIL,
        password
      );

      loginMessage.textContent =
        "";

    } catch (error) {

      console.error(
        "ログインエラー:",
        error
      );

      loginMessage.textContent =
        "パスワードが違います。";
    }
  }
);


// ==============================
// Enterキーでもログイン
// ==============================

$("password").addEventListener(
  "keydown",
  event => {

    if (event.key === "Enter") {

      $("login").click();
    }
  }
);


// ==============================
// 認証状態の監視
// ==============================

onAuthStateChanged(
  auth,
  user => {

    const loginArea =
      $("loginArea");

    const adminArea =
      $("adminArea");


    if (user) {

      loginArea.style.display =
        "none";

      adminArea.style.display =
        "block";

      // ログインしたら設定を表示
      render();

    } else {

      loginArea.style.display =
        "block";

      adminArea.style.display =
        "none";
    }
  }
);


// ==============================
// Firebaseの設定を監視
// ==============================

const settingsRef =
  ref(db, "Queue/settings");

onValue(
  settingsRef,
  snapshot => {

    const data =
      snapshot.val();


    if (data) {

      currentSettings = {

        // Firebaseに何が入っていても
        // 開始・終了は固定
        start: FIXED_START,

        end: FIXED_END,

        slotMinutes:
          Number(data.slotMinutes) || 30,

        maxGroups:
          Number(data.maxGroups) || 5,

        open:
          data.open !== false
      };
    }


    // ==========================
    // 1枠の時間
    // ==========================

    const slotMinutes =
      $("slotMinutes");

    if (slotMinutes) {

      slotMinutes.value =
        String(
          currentSettings.slotMinutes
        );
    }


    // ==========================
    // 最大組数
    // ==========================

    const maxGroups =
      $("maxGroups");

    if (maxGroups) {

      maxGroups.value =
        String(
          currentSettings.maxGroups
        );
    }


    // ==========================
    // 受付状態
    // ==========================

    const receptionState =
      $("receptionState");

    const toggleOpen =
      $("toggleOpen");


    if (currentSettings.open) {

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


    render();
  }
);


// ==============================
// 時間枠の人数を監視
// ==============================

const slotsRef =
  ref(db, "Queue/slots");

onValue(
  slotsRef,
  () => {

    renderPaperSlots();

    renderReservations();
  }
);


// ==============================
// 受付停止・再開
// ==============================

$("toggleOpen").addEventListener(
  "click",
  async () => {

    const newOpen =
      !currentSettings.open;


    try {

      await update(
        ref(db, "Queue/settings"),
        {
          open: newOpen
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
// 設定を保存
// ==============================

$("saveSettings").addEventListener(
  "click",
  async () => {

    const settingsMessage =
      $("settingsMessage");


    // ==========================
    // 1枠の時間
    // ==========================

    const slotMinutes =
      Number(
        $("slotMinutes").value
      );


    // ==========================
    // 最大組数
    // ==========================

    const maxGroups =
      Number(
        $("maxGroups").value
      );


    // ==========================
    // 入力チェック
    // ==========================

    if (
      !Number.isInteger(slotMinutes) ||
      slotMinutes <= 0
    ) {

      settingsMessage.textContent =
        "1枠の時間は1分以上の整数にしてください。";

      return;
    }


    if (
      !Number.isInteger(maxGroups) ||
      maxGroups < 1 ||
      maxGroups > 10
    ) {

      settingsMessage.textContent =
        "最大組数は1〜10組にしてください。";

      return;
    }


    // ==========================
    // 09:00〜15:00に収まるか確認
    // ==========================

    const totalMinutes =
      toMinutes(FIXED_END) -
      toMinutes(FIXED_START);


    if (slotMinutes > totalMinutes) {

      settingsMessage.textContent =
        "1枠の時間が長すぎます。15:00までに収まる時間を設定してください。";

      return;
    }


    // ==========================
    // きれいに割り切れるか確認
    // ==========================

    if (
      totalMinutes % slotMinutes !== 0
    ) {

      settingsMessage.textContent =
        "1枠の時間は、09:00〜15:00の6時間にきれいに収まる値にしてください。";

      return;
    }


    settingsMessage.textContent =
      "保存しています……";


    try {

      await update(
        ref(db, "Queue/settings"),
        {

          // 開始時刻は固定
          start: FIXED_START,

          // 終了時刻は固定
          end: FIXED_END,

          // スタッフが変更可能
          slotMinutes: slotMinutes,

          // スタッフが変更可能
          maxGroups: maxGroups,

          // 現在の受付状態
          open: currentSettings.open
        }
      );


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
// 紙予約の時間枠変更
// ==============================

$("paperSlot").addEventListener(
  "change",
  () => {

    updatePaperSlotInfo();
  }
);


// ==============================
// 紙予約を追加
// ==============================

$("addPaper").addEventListener(
  "click",
  async () => {

    const paperName =
      $("paperName").value.trim();

    const paperSize =
      Number(
        $("paperSize").value
      );

    const paperSlot =
      $("paperSlot").value;

    const paperMessage =
      $("paperMessage");


    // ==========================
    // 入力チェック
    // ==========================

    if (!paperName) {

      paperMessage.textContent =
        "名前を入力してください。";

      return;
    }


    if (
      !Number.isInteger(paperSize) ||
      paperSize < 1 ||
      paperSize > 4
    ) {

      paperMessage.textContent =
        "人数は1〜4人にしてください。";

      return;
    }


    if (!paperSlot) {

      paperMessage.textContent =
        "時間枠を選択してください。";

      return;
    }


    // ==========================
    // 選択した時間枠を探す
    // ==========================

    const slot =
      createSlots().find(
        item => item.key === paperSlot
      );


    if (!slot) {

      paperMessage.textContent =
        "時間枠が見つかりません。";

      return;
    }


    paperMessage.textContent =
      "追加しています……";


    // ==========================
    // 時間枠の人数を増やす
    // ==========================

    const countRef =
      ref(
        db,
        `Queue/slots/${slot.key}/count`
      );


    let countTransaction;


    try {

      countTransaction =
        await runTransaction(
          countRef,
          current => {

            const count =
              current === null
                ? 0
                : Number(current);

            const maxGroups =
              Number(
                currentSettings.maxGroups
              );


            // 満員ならキャンセル
            if (
              count >= maxGroups
            ) {

              return;
            }


            return count + 1;
          }
        );

    } catch (error) {

      console.error(
        "枠数更新エラー:",
        error
      );

      paperMessage.textContent =
        "時間枠の更新に失敗しました。";

      return;
    }


    // ==========================
    // 満員だった場合
    // ==========================

    if (
      !countTransaction.committed
    ) {

      paperMessage.textContent =
        "その時間枠は満員です。";

      return;
    }


    // ==========================
    // 予約番号を発行
    // ==========================

    const lastRef =
      ref(
        db,
        "Queue/reservationLast"
      );


    let reservationNumber;


    try {

      const result =
        await runTransaction(
          lastRef,
          current => {

            const value =
              current === null
                ? 0
                : Number(current);

            return value + 1;
          }
        );


      if (!result.committed) {

        throw new Error(
          "予約番号の発行に失敗しました。"
        );
      }


      reservationNumber =
        result.snapshot.val();


    } catch (error) {

      console.error(
        "予約番号発行エラー:",
        error
      );


      // 枠数を元に戻す
      try {

        await runTransaction(
          countRef,
          current => {

            const count =
              current === null
                ? 0
                : Number(current);

            return Math.max(
              0,
              count - 1
            );
          }
        );

      } catch (rollbackError) {

        console.error(
          "枠数ロールバックエラー:",
          rollbackError
        );
      }


      paperMessage.textContent =
        "予約番号の発行に失敗しました。";

      return;
    }


    // ==========================
    // 予約データ
    // ==========================

    const reservationData = {

      number:
        Number(reservationNumber),

      name:
        paperName,

      slot:
        slot.key,

      start:
        slot.start,

      end:
        slot.end,

      size:
        paperSize,

      type:
        "paper",

      createdAt:
        Date.now()
    };


    // ==========================
    // 予約を保存
    // ==========================

    const reservationRef =
      ref(
        db,
        `Queue/reservations/${reservationNumber}`
      );


    try {

      await set(
        reservationRef,
        reservationData
      );


      paperMessage.textContent =
        `予約を追加しました。予約番号：${reservationNumber}`;


      // 入力欄をクリア
      $("paperName").value = "";


      // 最新の枠情報を表示
      updatePaperSlotInfo();


    } catch (error) {

      console.error(
        "紙予約保存エラー:",
        error
      );


      // ==========================
      // 保存失敗時のロールバック
      // ==========================

      try {

        await runTransaction(
          countRef,
          current => {

            const count =
              current === null
                ? 0
                : Number(current);

            return Math.max(
              0,
              count - 1
            );
          }
        );

      } catch (rollbackError) {

        console.error(
          "枠数ロールバックエラー:",
          rollbackError
        );
      }


      paperMessage.textContent =
        "紙予約の保存に失敗しました。";
    }
  }
);


// ==============================
// ログアウト
// ==============================

$("logout").addEventListener(
  "click",
  async () => {

    try {

      await signOut(auth);

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


// ==============================
// 初期表示
// ==============================

render();
