import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  set,
  update,
  remove
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { firebaseConfig } from "./Firebase設定.js";


// ====================
// Firebase
// ====================

const app = initializeApp(firebaseConfig);

const db = getDatabase(app);

const auth = getAuth(app);


// ====================
// HTML取得
// ====================

const $ = (id) => document.getElementById(id);


// ====================
// データ
// ====================

let settings = {};
let slots = {};
let reservations = {};


// ====================
// スタッフ用アカウント
// ====================

const STAFF_EMAIL = "kazuma.cosmos@gmail.com";


// ====================
// 時間関連
// ====================

function toMinutes(time) {

  const [h, m] =
    time.split(":").map(Number);

  return h * 60 + m;
}


function formatTime(minutes) {

  const h =
    Math.floor(minutes / 60);

  const m =
    minutes % 60;

  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0")
  );
}


function slotKey(minutes) {

  return (
    String(
      Math.floor(minutes / 60)
    ).padStart(2, "0") +
    "-" +
    String(minutes % 60).padStart(2, "0")
  );
}


// ====================
// 時間枠を作る
// ====================

function createSlots() {

  const result = {};

  const start =
    toMinutes(
      settings.start || "09:00"
    );

  const end =
    toMinutes(
      settings.end || "17:00"
    );

  const slotMinutes =
    Number(
      settings.slotMinutes || 30
    );


  for (
    let m = start;
    m < end;
    m += slotMinutes
  ) {

    const e =
      Math.min(
        m + slotMinutes,
        end
      );


    result[slotKey(m)] = {

      key:
        slotKey(m),

      start:
        formatTime(m),

      end:
        formatTime(e)
    };
  }


  return result;
}


// ====================
// HTML安全対策
// ====================

function escapeHtml(value) {

  return String(value).replace(
    /[&<>"']/g,
    (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c])
  );
}


// ====================
// 最大組数の選択肢
// ====================

function setupMaxGroups() {

  const select =
    $("maxGroups");

  if (!select) return;


  select.innerHTML = "";


  for (
    let i = 1;
    i <= 10;
    i++
  ) {

    const option =
      document.createElement(
        "option"
      );


    option.value =
      String(i);

    option.textContent =
      `${i}組`;


    select.appendChild(
      option
    );
  }


  select.value =
    String(
      settings.maxGroups || 5
    );
}


// ====================
// 全体表示
// ====================

function render() {

  setupMaxGroups();

  renderPaperSlots();

  renderReservations();
}


// ====================
// 紙予約の時間枠
// ====================

function renderPaperSlots() {

  const select =
    $("paperSlot");

  if (!select) return;


  const currentValue =
    select.value;


  select.innerHTML = "";


  const maxGroups =
    Number(
      settings.maxGroups || 5
    );


  Object.values(
    createSlots()
  ).forEach((slot) => {

    const count =
      Number(
        slots[slot.key]?.count || 0
      );


    const option =
      document.createElement(
        "option"
      );


    option.value =
      slot.key;


    option.textContent =
      `${slot.start}～${slot.end}` +
      `（${count}/${maxGroups}組）`;


    option.disabled =
      count >= maxGroups;


    select.appendChild(
      option
    );
  });


  if (
    currentValue &&
    select.querySelector(
      `option[value="${currentValue}"]`
    )
  ) {

    select.value =
      currentValue;
  }


  updatePaperSlotInfo();
}


// ====================
// 紙予約の時間枠情報
// ====================

function updatePaperSlotInfo() {

  const select =
    $("paperSlot");

  const info =
    $("paperSlotInfo");

  if (!select || !info) return;


  const slot =
    createSlots()[select.value];


  info.textContent =
    slot
      ? `${slot.start}～${slot.end}`
      : "";
}


// ====================
// 予約一覧
// ====================

function renderReservations() {

  const list =
    $("slotList");

  if (!list) return;


  list.innerHTML = "";


  const maxGroups =
    Number(
      settings.maxGroups || 5
    );


  Object.values(
    createSlots()
  ).forEach((slot) => {

    const count =
      Number(
        slots[slot.key]?.count || 0
      );


    const box =
      document.createElement(
        "div"
      );


    box.className =
      "slot-box";


    box.innerHTML =
      `<h4>
        ${slot.start}～${slot.end}
        <span>
          ${count}/${maxGroups}組
        </span>
      </h4>`;


    const reservationsInSlot =
      Object.values(
        reservations
      )
        .filter(
          (r) =>
            r &&
            r.slot === slot.key
        )
        .sort(
          (a, b) =>
            Number(a.number) -
            Number(b.number)
        );


    if (
      reservationsInSlot.length === 0
    ) {

      box.innerHTML +=
        "<p>予約なし</p>";
    }


    reservationsInSlot.forEach(
      (reservation) => {

        const row =
          document.createElement(
            "div"
          );


        row.className =
          "reservation-row";


        const text =
          document.createElement(
            "div"
          );


        text.innerHTML =
          `<strong>
            No.${escapeHtml(reservation.number)}
          </strong>　` +

          `${escapeHtml(
            reservation.name ||
            "名前なし"
          )}　` +

          `${escapeHtml(
            reservation.size
          )}人　` +

          `${reservation.type === "paper"
            ? "紙"
            : "Web"}`;


        const actions =
          document.createElement(
            "div"
          );


        // ====================
        // 時間変更ボタン
        // ====================

        const moveButton =
          document.createElement(
            "button"
          );


        moveButton.textContent =
          "時間変更";


        moveButton.className =
          "small";


        moveButton.onclick =
          () =>
            moveReservation(
              reservation
            );


        // ====================
        // 削除ボタン
        // ====================

        const deleteButton =
          document.createElement(
            "button"
          );


        deleteButton.textContent =
          "削除";


        deleteButton.className =
          "small danger";


        deleteButton.onclick =
          () =>
            deleteReservation(
              reservation
            );


        actions.appendChild(
          moveButton
        );


        actions.appendChild(
          deleteButton
        );


        row.appendChild(
          text
        );


        row.appendChild(
          actions
        );


        box.appendChild(
          row
        );
      }
    );


    list.appendChild(
      box
    );
  });
}


// ====================
// 予約の時間変更
// ====================

async function moveReservation(
  reservation
) {

  const maxGroups =
    Number(
      settings.maxGroups || 5
    );


  const available =
    Object.values(
      createSlots()
    ).filter(
      (slot) => {

        const count =
          Number(
            slots[slot.key]?.count || 0
          );


        return (
          slot.key !==
            reservation.slot &&
          count < maxGroups
        );
      }
    );


  if (
    available.length === 0
  ) {

    alert(
      "移動できる空き枠がありません。"
    );

    return;
  }


  const choices =
    available
      .map(
        (slot, index) => {

          const count =
            Number(
              slots[slot.key]?.count ||
              0
            );


          return (
            `${index + 1}: ` +
            `${slot.start}～${slot.end} ` +
            `（${count}/${maxGroups}組）`
          );
        }
      )
      .join("\n");


  const input =
    prompt(
      "移動先の番号を入力してください。\n\n" +
      choices
    );


  if (
    input === null
  ) return;


  const index =
    Number(input) - 1;


  const target =
    available[index];


  if (!target) {

    alert(
      "正しい番号を入力してください。"
    );

    return;
  }


  // ====================
  // 元の枠
  // ====================

  const oldRef =
    ref(
      db,
      `Queue/slots/${reservation.slot}/count`
    );


  // ====================
  // 新しい枠
  // ====================

  const newRef =
    ref(
      db,
      `Queue/slots/${target.key}/count`
    );


  // ====================
  // 新しい枠を先に確保
  // ====================

  const newResult =
    await runTransaction(
      newRef,
      (value) => {

        const count =
          Number(value || 0);


        if (
          count >= maxGroups
        ) {

          return undefined;
        }


        return count + 1;
      }
    );


  if (
    !newResult.committed
  ) {

    alert(
      "移動先が満員になりました。"
    );

    return;
  }


  // ====================
  // 予約データ変更
  // ====================

  try {

    await update(
      ref(
        db,
        `Queue/reservations/${reservation.number}`
      ),
      {
        slot:
          target.key,

        start:
          target.start,

        end:
          target.end
      }
    );


  } catch (error) {

    console.error(
      error
    );


    // 予約変更に失敗したら
    // 新しい枠を元に戻す

    await runTransaction(
      newRef,
      (value) =>
        Math.max(
          0,
          Number(value || 0) - 1
        )
    );


    alert(
      "予約の時間変更に失敗しました。"
    );

    return;
  }


  // ====================
  // 元の枠を1減らす
  // ====================

  await runTransaction(
    oldRef,
    (value) =>
      Math.max(
        0,
        Number(value || 0) - 1
      )
  );


  alert(
    `${target.start}～${target.end}へ変更しました。`
  );
}


// ====================
// 予約削除
// ====================

async function deleteReservation(
  reservation
) {

  const ok =
    confirm(
      `No.${reservation.number}「${reservation.name || "名前なし"}」を削除しますか？`
    );


  if (!ok) return;


  try {

    // ====================
    // 予約データ削除
    // ====================

    await remove(
      ref(
        db,
        `Queue/reservations/${reservation.number}`
      )
    );


    // ====================
    // 枠の人数を1減らす
    // ====================

    await runTransaction(
      ref(
        db,
        `Queue/slots/${reservation.slot}/count`
      ),
      (value) =>
        Math.max(
          0,
          Number(value || 0) - 1
        )
    );


    alert(
      `No.${reservation.number}の予約を削除しました。`
    );


  } catch (error) {

    console.error(
      "予約削除エラー:",
      error
    );


    alert(
      "予約の削除に失敗しました。\n" +
      "Firebaseのルールを確認してください。"
    );
  }
}


// ====================
// ログイン
// ====================

const loginButton =
  $("login");


if (loginButton) {

  loginButton.onclick =
    async () => {

      const password =
        $("password")?.value || "";


      const message =
        $("loginMessage");


      if (message) {

        message.textContent =
          "";
      }


      if (!password) {

        if (message) {

          message.textContent =
            "パスワードを入力してください。";
        }

        return;
      }


      try {

        await signInWithEmailAndPassword(
          auth,
          STAFF_EMAIL,
          password
        );


      } catch (error) {

        console.error(
          "ログインエラー:",
          error
        );


        if (message) {

          message.textContent =
            "パスワードが違います。";
        }
      }
    };
}


// ====================
// ログイン状態
// ====================

onAuthStateChanged(
  auth,
  (user) => {

    const loginArea =
      $("loginArea");

    const adminArea =
      $("adminArea");


    if (!loginArea ||
        !adminArea) {
      return;
    }


    if (user) {

      loginArea.style.display =
        "none";

      adminArea.style.display =
        "block";

    } else {

      loginArea.style.display =
        "block";

      adminArea.style.display =
        "none";
    }
  }
);


// ====================
// ログアウト
// ====================

const logoutButton =
  $("logout");


if (logoutButton) {

  logoutButton.onclick =
    async () => {

      await signOut(auth);
    };
}


// ====================
// Firebase設定監視
// ====================

onValue(
  ref(
    db,
    "Queue/settings"
  ),
  (snapshot) => {

    settings =
      snapshot.val() || {};


    const start =
      $("start");

    const end =
      $("end");

    const slotMinutes =
      $("slotMinutes");

    const state =
      $("receptionState");

    const toggle =
      $("toggleOpen");


    if (start) {

      start.value =
        settings.start ||
        "09:00";
    }


    if (end) {

      end.value =
        settings.end ||
        "17:00";
    }


    if (slotMinutes) {

      slotMinutes.value =
        String(
          settings.slotMinutes ||
          30
        );
    }


    if (state) {

      state.textContent =
        settings.open === false
          ? "受付停止中"
          : "受付中";
    }


    if (toggle) {

      toggle.textContent =
        settings.open === false
          ? "受付再開"
          : "受付停止";
    }


    render();
  }
);


// ====================
// 枠数監視
// ====================

onValue(
  ref(
    db,
    "Queue/slots"
  ),
  (snapshot) => {

    slots =
      snapshot.val() || {};

    render();
  }
);


// ====================
// 予約監視
// ====================

onValue(
  ref(
    db,
    "Queue/reservations"
  ),
  (snapshot) => {

    reservations =
      snapshot.val() || {};

    render();
  }
);


// ====================
// 受付停止・再開
// ====================

const toggleButton =
  $("toggleOpen");


if (toggleButton) {

  toggleButton.onclick =
    async () => {

      try {

        await update(
          ref(
            db,
            "Queue/settings"
          ),
          {
            open:
              settings.open === false
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
    };
}


// ====================
// 設定保存
// ====================

const saveSettingsButton =
  $("saveSettings");


if (saveSettingsButton) {

  saveSettingsButton.onclick =
    async () => {

      const start =
        $("start")?.value;

      const end =
        $("end")?.value;

      const slotMinutes =
        Number(
          $("slotMinutes")?.value
        );

      const maxGroups =
        Number(
          $("maxGroups")?.value
        );


      if (!start || !end) {

        alert(
          "開始時刻と終了時刻を入力してください。"
        );

        return;
      }


      if (
        toMinutes(end) <=
        toMinutes(start)
      ) {

        alert(
          "終了時刻は開始時刻より後にしてください。"
        );

        return;
      }


      try {

        await update(
          ref(
            db,
            "Queue/settings"
          ),
          {
            start,

            end,

            slotMinutes,

            maxGroups,

            open:
              settings.open !== false
          }
        );


        const message =
          $("settingsMessage");


        if (message) {

          message.textContent =
            "設定を保存しました。";
        }


      } catch (error) {

        console.error(
          "設定保存エラー:",
          error
        );


        alert(
          "設定の保存に失敗しました。"
        );
      }
    };
}


// ====================
// 紙予約の時間変更
// ====================

const paperSlot =
  $("paperSlot");


if (paperSlot) {

  paperSlot.onchange =
    updatePaperSlotInfo;
}


// ====================
// 紙予約追加
// ====================

const addPaperButton =
  $("addPaper");


if (addPaperButton) {

  addPaperButton.onclick =
    async () => {

      const message =
        $("paperMessage");


      if (message) {

        message.textContent =
          "";
      }


      const name =
        $("paperName")?.value.trim() ||
        "";


      const size =
        Number(
          $("paperSize")?.value
        );


      const selectedKey =
        $("paperSlot")?.value;


      const slot =
        createSlots()[
          selectedKey
        ];


      if (!name) {

        if (message) {

          message.textContent =
            "名前を入力してください。";
        }

        return;
      }


      if (!slot) {

        if (message) {

          message.textContent =
            "時間帯を選択してください。";
        }

        return;
      }


      // ====================
      // 枠数を1増やす
      // ====================

      const countRef =
        ref(
          db,
          `Queue/slots/${slot.key}/count`
        );


      const maxGroups =
        Number(
          settings.maxGroups || 5
        );


      const countResult =
        await runTransaction(
          countRef,
          (value) => {

            const count =
              Number(value || 0);


            if (
              count >= maxGroups
            ) {

              return undefined;
            }


            return count + 1;
          }
        );


      if (
        !countResult.committed
      ) {

        if (message) {

          message.textContent =
            "その時間帯は満員です。";
        }

        return;
      }


      // ====================
      // 予約番号を取得
      // ====================

      const lastResult =
        await runTransaction(
          ref(
            db,
            "Queue/reservationLast"
          ),
          (value) =>
            Number(value || 0) + 1
        );


      if (
        !lastResult.committed
      ) {

        await runTransaction(
          countRef,
          (value) =>
            Math.max(
              0,
              Number(value || 0) - 1
            )
        );


        if (message) {

          message.textContent =
            "予約番号の取得に失敗しました。";
        }

        return;
      }


      const number =
        lastResult.snapshot.val();


      // ====================
      // 予約データ保存
      // ====================

      try {

        await set(
          ref(
            db,
            `Queue/reservations/${number}`
          ),
          {
            number,

            name,

            slot:
              slot.key,

            start:
              slot.start,

            end:
              slot.end,

            size,

            type:
              "paper",

            createdAt:
              Date.now()
          }
        );


      } catch (error) {

        console.error(
          "紙予約保存エラー:",
          error
        );


        // 保存失敗時は枠数を戻す

        await runTransaction(
          countRef,
          (value) =>
            Math.max(
              0,
              Number(value || 0) - 1
            )
        );


        if (message) {

          message.textContent =
            "紙予約の保存に失敗しました。";
        }

        return;
      }


      const paperName =
        $("paperName");


      if (paperName) {

        paperName.value =
          "";
      }


      if (message) {

        message.textContent =
          `No.${number} を追加しました。`;
      }
    };
}
