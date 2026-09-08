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


const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const $ = (id) => document.getElementById(id);

let settings = {};
let slots = {};
let reservations = {};


// ====================
// 時間関連
// ====================

function toMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}


function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0")
  );
}


function slotKey(minutes) {
  return (
    String(Math.floor(minutes / 60)).padStart(2, "0") +
    "-" +
    String(minutes % 60).padStart(2, "0")
  );
}


function createSlots() {
  const result = {};

  const start = toMinutes(
    settings.start || "09:00"
  );

  const end = toMinutes(
    settings.end || "17:00"
  );

  const minutes =
    Number(settings.slotMinutes || 30);


  for (
    let m = start;
    m < end;
    m += minutes
  ) {

    const e = m + minutes;

    result[slotKey(m)] = {
      key: slotKey(m),
      start: formatTime(m),
      end: formatTime(e)
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
// 最大組数の選択肢を作る
// ====================

function setupMaxGroups() {

  const select = $("maxGroups");

  if (!select) return;

  select.innerHTML = "";

  for (let i = 1; i <= 10; i++) {

    const option =
      document.createElement("option");

    option.value = String(i);

    option.textContent = `${i}組`;

    select.appendChild(option);
  }

  select.value =
    String(settings.maxGroups || 5);
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
// 紙予約の時間帯表示
// ====================

function renderPaperSlots() {

  const select = $("paperSlot");

  if (!select) return;

  select.innerHTML = "";


  Object.values(createSlots())
    .forEach((slot) => {

      const count =
        Number(
          slots[slot.key]?.count || 0
        );


      const option =
        document.createElement("option");

      option.value = slot.key;

      option.textContent =
        `${slot.start}～${slot.end}（${count}/${settings.maxGroups}組）`;

      option.disabled =
        count >= Number(settings.maxGroups);

      select.appendChild(option);
    });


  updatePaperSlotInfo();
}


// ====================
// 紙予約の時間帯情報
// ====================

function updatePaperSlotInfo() {

  const select = $("paperSlot");

  const info = $("paperSlotInfo");

  if (!select || !info) return;


  const slot =
    createSlots()[select.value];


  info.textContent =
    slot
      ? `${slot.start}～${slot.end}`
      : "";
}


// ====================
// 予約一覧表示
// ====================

function renderReservations() {

  const list = $("slotList");

  if (!list) return;

  list.innerHTML = "";


  Object.values(createSlots())
    .forEach((slot) => {

      const count =
        Number(
          slots[slot.key]?.count || 0
        );


      const box =
        document.createElement("div");

      box.className = "slot-box";


      box.innerHTML =
        `<h4>${slot.start}～${slot.end} <span>${count}/${settings.maxGroups}組</span></h4>`;


      const reservationsInSlot =
        Object.values(reservations)
          .filter(
            (r) =>
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


      reservationsInSlot
        .forEach((reservation) => {

          const row =
            document.createElement("div");

          row.className =
            "reservation-row";


          const text =
            document.createElement("div");


          text.innerHTML =
            `<strong>No.${reservation.number}</strong>　` +
            `${escapeHtml(reservation.name || "名前なし")}　` +
            `${reservation.size}人　` +
            `${reservation.type === "paper" ? "紙" : "Web"}`;


          const moveButton =
            document.createElement("button");

          moveButton.textContent =
            "時間変更";

          moveButton.className =
            "small";

          moveButton.onclick =
            () =>
              moveReservation(
                reservation
              );


          const deleteButton =
            document.createElement("button");

          deleteButton.textContent =
            "削除";

          deleteButton.className =
            "small danger";

          deleteButton.onclick =
            () =>
              deleteReservation(
                reservation
              );


          const actions =
            document.createElement("div");

          actions.appendChild(
            moveButton
          );

          actions.appendChild(
            deleteButton
          );


          row.appendChild(text);

          row.appendChild(actions);

          box.appendChild(row);
        });


      list.appendChild(box);
    });
}


// ====================
// 予約時間変更
// ====================

async function moveReservation(
  reservation
) {

  const available =
    Object.values(createSlots())
      .filter((slot) => {

        const count =
          Number(
            slots[slot.key]?.count || 0
          );

        return (
          slot.key !== reservation.slot &&
          count <
            Number(settings.maxGroups)
        );
      });


  if (available.length === 0) {

    alert(
      "移動できる空き枠がありません。"
    );

    return;
  }


  const choices =
    available
      .map(
        (slot, index) =>
          `${index + 1}: ${slot.start}～${slot.end} ` +
          `（${Number(slots[slot.key]?.count || 0)}/${settings.maxGroups}）`
      )
      .join("\n");


  const input =
    prompt(
      "移動先の番号を入力してください。\n\n" +
      choices
    );


  if (input === null) return;


  const target =
    available[
      Number(input) - 1
    ];


  if (!target) {

    alert(
      "正しい番号を入力してください。"
    );

    return;
  }


  const oldRef =
    ref(
      db,
      `Queue/slots/${reservation.slot}/count`
    );


  const newRef =
    ref(
      db,
      `Queue/slots/${target.key}/count`
    );


  // 元の枠を1減らす

  const oldResult =
    await runTransaction(
      oldRef,
      (value) =>
        Math.max(
          0,
          Number(value || 0) - 1
        )
    );


  if (!oldResult.committed) {

    alert(
      "元の枠の更新に失敗しました。"
    );

    return;
  }


  // 新しい枠を1増やす

  const newResult =
    await runTransaction(
      newRef,
      (value) => {

        const count =
          Number(value || 0);

        return (
          count >=
          Number(settings.maxGroups)
        )
          ? undefined
          : count + 1;
      }
    );


  if (!newResult.committed) {

    // 失敗したら元に戻す

    await runTransaction(
      oldRef,
      (value) =>
        Number(value || 0) + 1
    );


    alert(
      "移動先が満員になりました。"
    );

    return;
  }


  // 予約データを変更

  await update(
    ref(
      db,
      `Queue/reservations/${reservation.number}`
    ),
    {
      slot: target.key,
      start: target.start,
      end: target.end
    }
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


  // 予約を削除

  await remove(
    ref(
      db,
      `Queue/reservations/${reservation.number}`
    )
  );


  // 枠の人数を1減らす

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
}


// ====================
// ログイン
// ====================

$("login").onclick =
  async () => {

    $("loginMessage").textContent =
      "";


    try {

      await signInWithEmailAndPassword(
        auth,
        $("email").value.trim(),
        $("password").value
      );

    } catch (error) {

      console.error(error);

      $("loginMessage").textContent =
        "ログインできませんでした。メールアドレスとパスワードを確認してください。";
    }
  };


// ====================
// ログイン状態
// ====================

onAuthStateChanged(
  auth,
  (user) => {

    $("loginArea").hidden =
      !!user;

    $("controlArea").hidden =
      !user;
  }
);


// ====================
// ログアウト
// ====================

$("logout").onclick =
  () =>
    signOut(auth);


// ====================
// Firebase設定監視
// ====================

onValue(
  ref(db, "Queue/settings"),
  (snapshot) => {

    settings =
      snapshot.val() || {};


    $("start").value =
      settings.start ||
      "09:00";


    $("end").value =
      settings.end ||
      "17:00";


    $("slotMinutes").value =
      String(
        settings.slotMinutes || 30
      );


    $("state").textContent =
      settings.open === false
        ? "受付停止中"
        : "受付中";


    $("toggle").textContent =
      settings.open === false
        ? "受付再開"
        : "受付停止";


    render();
  }
);


// ====================
// 枠数監視
// ====================

onValue(
  ref(db, "Queue/slots"),
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
  ref(db, "Queue/reservations"),
  (snapshot) => {

    reservations =
      snapshot.val() || {};

    render();
  }
);


// ====================
// 受付停止・再開
// ====================

$("toggle").onclick =
  async () => {

    await update(
      ref(db, "Queue/settings"),
      {
        open:
          settings.open === false
      }
    );
  };


// ====================
// 設定保存
// ====================

$("saveSettings").onclick =
  async () => {

    await update(
      ref(db, "Queue/settings"),
      {
        start:
          $("start").value,

        end:
          $("end").value,

        slotMinutes:
          Number(
            $("slotMinutes").value
          ),

        maxGroups:
          Number(
            $("maxGroups").value
          ),

        open:
          settings.open !== false
      }
    );


    $("settingsMessage").textContent =
      "設定を保存しました。";
  };


// ====================
// 紙予約の時間変更
// ====================

$("paperSlot").onchange =
  updatePaperSlotInfo;


// ====================
// 紙予約追加
// ====================

$("addPaper").onclick =
  async () => {

    $("paperMessage").textContent =
      "";


    const name =
      $("paperName").value.trim();


    const size =
      Number(
        $("paperSize").value
      );


    const slot =
      createSlots()[
        $("paperSlot").value
      ];


    if (!name) {

      $("paperMessage").textContent =
        "名前を入力してください。";

      return;
    }


    if (!slot) {

      $("paperMessage").textContent =
        "時間帯を選択してください。";

      return;
    }


    // 枠数を1増やす

    const countRef =
      ref(
        db,
        `Queue/slots/${slot.key}/count`
      );


    const countResult =
      await runTransaction(
        countRef,
        (value) => {

          const count =
            Number(value || 0);

          return (
            count >=
            Number(settings.maxGroups)
          )
            ? undefined
            : count + 1;
        }
      );


    if (!countResult.committed) {

      $("paperMessage").textContent =
        "その時間帯は満員です。";

      return;
    }


    // 予約番号を取得

    const lastResult =
      await runTransaction(
        ref(
          db,
          "Queue/reservationLast"
        ),
        (value) =>
          Number(value || 0) + 1
      );


    if (!lastResult.committed) {

      await runTransaction(
        countRef,
        (value) =>
          Math.max(
            0,
            Number(value || 0) - 1
          )
      );


      $("paperMessage").textContent =
        "予約番号の取得に失敗しました。";

      return;
    }


    const number =
      lastResult.snapshot.val();


    // 予約データ保存

    await set(
      ref(
        db,
        `Queue/reservations/${number}`
      ),
      {
        number,
        name,
        slot: slot.key,
        start: slot.start,
        end: slot.end,
        size,
        type: "paper",
        createdAt: Date.now()
      }
    );


    $("paperName").value =
      "";


    $("paperMessage").textContent =
      `No.${number} を追加しました。`;
  };
