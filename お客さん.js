import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  set,
  remove
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import { firebaseConfig } from "./Firebase設定.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const $ = (id) => document.getElementById(id);

let settings = {
  start: "09:00",
  end: "15:00",
  slotMinutes: 60,
  maxGroups: 1,
  open: true
};

let slots = {};
let reservations = {};

const STORAGE_KEY = "ib_reservations";


/* =========================
   時間関係
========================= */

function toMinutes(time) {
  if (!time || typeof time !== "string") {
    return 0;
  }

  const [h, m] = time.split(":").map(Number);

  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return 0;
  }

  return h * 60 + m;
}


function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0")
  );
}


function slotKey(minutes) {
  return minutesToTime(minutes).replace(":", "-");
}


/* =========================
   時間帯作成
========================= */

function createSlots() {
  const result = {};

  const start = toMinutes(settings.start || "09:00");
  const end = toMinutes(settings.end || "15:00");

  const slotMinutes = Number(settings.slotMinutes || 60);

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(slotMinutes) ||
    slotMinutes <= 0 ||
    start >= end
  ) {
    return result;
  }

  for (
    let minutes = start;
    minutes + slotMinutes <= end;
    minutes += slotMinutes
  ) {
    const finish = minutes + slotMinutes;

    const key = slotKey(minutes);

    result[key] = {
      key,
      start: minutesToTime(minutes),
      end: minutesToTime(finish)
    };
  }

  return result;
}


/* =========================
   HTML安全化
========================= */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character];
  });
}


/* =========================
   今日の日付
========================= */

function getToday() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}.${month}.${day}`;
}


/* =========================
   搭乗時刻
========================= */

function getBoardingTime(endTime) {
  const minutes = toMinutes(endTime);

  if (!Number.isFinite(minutes)) {
    return endTime;
  }

  return minutesToTime(minutes + 5);
}


/* =========================
   便名
========================= */

function getFlightNumber(number) {
  return "DREAM" + String(number).padStart(3, "0");
}


/* =========================
   LocalStorage
========================= */

function getLocalReservations() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);

    if (!value) {
      return [];
    }

    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("LocalStorage読み込みエラー:", error);
    return [];
  }
}


function saveLocalReservations(list) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(list)
  );
}


/* =========================
   時間帯セレクト
========================= */

function renderSlots() {
  const select = $("slot");

  if (!select) {
    return;
  }

  const currentValue = select.value;

  select.innerHTML = "";

  const createdSlots = createSlots();

  const slotList = Object.values(createdSlots);

  if (slotList.length === 0) {
    const option = document.createElement("option");

    option.value = "";
    option.textContent = "時間帯を設定できません";

    select.appendChild(option);

    select.disabled = true;

    return;
  }

  select.disabled = false;

  slotList.forEach((slot) => {
    const count = Number(
      slots[slot.key]?.count || 0
    );

    const maxGroups = Number(
      settings.maxGroups || 1
    );

    const option = document.createElement("option");

    option.value = slot.key;

    option.textContent =
      `${slot.start}～${slot.end}（${count}/${maxGroups}組）`;

    option.disabled = count >= maxGroups;

    select.appendChild(option);
  });

  const currentOption = [...select.options].find(
    (option) =>
      option.value === currentValue &&
      !option.disabled
  );

  if (currentOption) {
    select.value = currentValue;
  } else {
    const firstAvailable = [...select.options].find(
      (option) => !option.disabled
    );

    if (firstAvailable) {
      select.value = firstAvailable.value;
    }
  }
}


/* =========================
   選択時間帯の説明
========================= */

function updateInfo() {
  const select = $("slot");
  const info = $("slotInfo");

  if (!select || !info) {
    return;
  }

  const selected = createSlots()[select.value];

  if (!selected) {
    info.textContent = "";
    return;
  }

  const count = Number(
    slots[selected.key]?.count || 0
  );

  const maxGroups = Number(
    settings.maxGroups || 1
  );

  if (count >= maxGroups) {
    info.textContent =
      `${selected.start}～${selected.end} は満員です。`;
  } else {
    info.textContent =
      `${selected.start}～${selected.end}　空きがあります。`;
  }
}


/* =========================
   搭乗券表示
========================= */

function renderReservations() {
  const area = $("reservationArea");

  if (!area) {
    return;
  }

  area.innerHTML = "";

  const localReservations =
    getLocalReservations();

  if (localReservations.length === 0) {
    area.hidden = true;
    return;
  }

  area.hidden = false;

  localReservations.forEach((reservation) => {
    const boardingPass =
      document.createElement("div");

    boardingPass.className = "boarding-pass";

    const start =
      reservation.start || "";

    const end =
      reservation.end || "";

    const size =
      Number(reservation.size || 1);

    const name =
      reservation.name || "名前なし";

    const number =
      reservation.number;

    const flightNumber =
      getFlightNumber(number);

    const boardingTime =
      getBoardingTime(end);

    boardingPass.innerHTML = `
      <div class="boarding-pass-header">
        <div>
          <h2>1-B出口搭乗券</h2>
          <p>出口ドリームスカイライン</p>
        </div>

        <strong>${flightNumber}</strong>
      </div>

      <div class="boarding-pass-main">

        <div class="boarding-arrival">
          <span>ご来場時間</span>
          <strong>${escapeHtml(start)}～${escapeHtml(end)}</strong>
        </div>

        <div class="boarding-info-grid">

          <div>
            <span>日付</span>
            <strong>${getToday()}</strong>
          </div>

          <div>
            <span>ゲート</span>
            <strong>1-B</strong>
          </div>

          <div>
            <span>搭乗時刻</span>
            <strong>${escapeHtml(boardingTime)}</strong>
          </div>

          <div>
            <span>人数</span>
            <strong>${size}人</strong>
          </div>

        </div>

        <div class="boarding-pass-passenger">
          <span>代表者</span>
          <strong>${escapeHtml(name)}</strong>
        </div>

      </div>

      <div class="boarding-pass-footer">

        <p class="boarding-note">
          ご来場時間になりましたら<br>
          1-B出口へお越しください。
        </p>

        <button
          class="cancel-reservation"
          type="button"
          data-number="${escapeHtml(number)}"
        >
          この予約をキャンセル
        </button>

      </div>
    `;

    area.appendChild(boardingPass);
  });

  document
    .querySelectorAll(".cancel-reservation")
    .forEach((button) => {

      button.addEventListener(
        "click",
        async () => {

          const number =
            button.dataset.number;

          await cancelReservation(number);
        }
      );
    });
}


/* =========================
   全体表示
========================= */

function render() {
  renderSlots();
  updateInfo();
  renderReservations();

  const reserveArea =
    $("reserveArea");

  const closedArea =
    $("closedArea");

  if (
    reserveArea &&
    closedArea
  ) {
    if (settings.open === false) {
      reserveArea.hidden = true;
      closedArea.hidden = false;
    } else {
      reserveArea.hidden = false;
      closedArea.hidden = true;
    }
  }
}


/* =========================
   予約
========================= */

async function makeReservation() {
  const error =
    $("error");

  if (error) {
    error.textContent = "";
  }

  const name =
    $("name")?.value.trim();

  const size =
    Number($("size")?.value);

  const selectedSlot =
    $("slot")?.value;

  if (!name) {
    if (error) {
      error.textContent =
        "代表者の名前を入力してください。";
    }

    return;
  }

  if (
    !Number.isFinite(size) ||
    size < 1 ||
    size > 4
  ) {
    if (error) {
      error.textContent =
        "人数は1～4人で選択してください。";
    }

    return;
  }

  const slot =
    createSlots()[selectedSlot];

  if (!slot) {
    if (error) {
      error.textContent =
        "時間帯を選択してください。";
    }

    return;
  }

  if (settings.open === false) {
    if (error) {
      error.textContent =
        "現在受付停止中です。";
    }

    return;
  }

  const maxGroups =
    Number(settings.maxGroups || 1);

  /* -------------------------
     枠を確保
  ------------------------- */

  const countRef =
    ref(
      db,
      `Queue/slots/${slot.key}/count`
    );

  let countResult;

  try {
    countResult =
      await runTransaction(
        countRef,
        (value) => {

          const count =
            Number(value || 0);

          if (count >= maxGroups) {
            return undefined;
          }

          return count + 1;
        }
      );
  } catch (transactionError) {
    console.error(
      "枠確保エラー:",
      transactionError
    );

    if (error) {
      error.textContent =
        "予約に失敗しました。もう一度お試しください。";
    }

    return;
  }

  if (!countResult.committed) {
    if (error) {
      error.textContent =
        "その時間帯は満員になりました。";
    }

    return;
  }

  /* -------------------------
     予約番号を取得
  ------------------------- */

  let lastResult;

  try {
    lastResult =
      await runTransaction(
        ref(db, "Queue/reservationLast"),
        (value) => {
          return Number(value || 0) + 1;
        }
      );
  } catch (lastError) {
    console.error(
      "予約番号取得エラー:",
      lastError
    );

    await runTransaction(
      countRef,
      (value) =>
        Math.max(
          0,
          Number(value || 0) - 1
        )
    );

    if (error) {
      error.textContent =
        "予約番号の取得に失敗しました。";
    }

    return;
  }

  if (!lastResult.committed) {

    await runTransaction(
      countRef,
      (value) =>
        Math.max(
          0,
          Number(value || 0) - 1
        )
    );

    if (error) {
      error.textContent =
        "予約番号の取得に失敗しました。";
    }

    return;
  }

  const number =
    lastResult.snapshot.val();

  /* -------------------------
     予約データ保存
  ------------------------- */

  const reservation = {
    number,
    name,
    slot: slot.key,
    start: slot.start,
    end: slot.end,
    size,
    type: "web",
    createdAt: Date.now()
  };

  try {
    await set(
      ref(
        db,
        `Queue/reservations/${number}`
      ),
      reservation
    );
  } catch (saveError) {
    console.error(
      "予約保存エラー:",
      saveError
    );

    /* 予約保存に失敗したら枠を戻す */

    await runTransaction(
      countRef,
      (value) =>
        Math.max(
          0,
          Number(value || 0) - 1
        )
    );

    if (error) {
      error.textContent =
        "予約の保存に失敗しました。";
    }

    return;
  }

  /* -------------------------
     LocalStorage保存
  ------------------------- */

  const localReservations =
    getLocalReservations();

  localReservations.push(
    reservation
  );

  saveLocalReservations(
    localReservations
  );

  /* -------------------------
     入力欄リセット
  ------------------------- */

  if ($("name")) {
    $("name").value = "";
  }

  if ($("size")) {
    $("size").value = "1";
  }

  if (error) {
    error.textContent = "";
  }

  render();
}


/* =========================
   キャンセル
========================= */

async function cancelReservation(number) {

  const localReservations =
    getLocalReservations();

  const reservation =
    localReservations.find(
      (item) =>
        String(item.number) ===
        String(number)
    );

  if (!reservation) {
    alert(
      "この予約は見つかりませんでした。"
    );

    return;
  }

  const confirmed =
    confirm(
      `No.${reservation.number}「${reservation.name || "名前なし"}」の予約をキャンセルしますか？`
    );

  if (!confirmed) {
    return;
  }

  /* 二重クリック防止 */

  const buttons =
    document.querySelectorAll(
      ".cancel-reservation"
    );

  buttons.forEach((button) => {
    button.disabled = true;
    button.textContent =
      "キャンセル処理中...";
  });

  const reservationRef =
    ref(
      db,
      `Queue/reservations/${reservation.number}`
    );

  const countRef =
    ref(
      db,
      `Queue/slots/${reservation.slot}/count`
    );

  let countResult;

  try {

    /*
     * 先に枠を1つ戻す。
     * ここで失敗したら予約は消さない。
     */

    countResult =
      await runTransaction(
        countRef,
        (value) => {

          const count =
            Number(value || 0);

          if (count <= 0) {
            return 0;
          }

          return count - 1;
        }
      );

    if (!countResult.committed) {
      throw new Error(
        "slot count transaction was not committed"
      );
    }

    /*
     * 次に予約そのものを削除。
     */

    try {

      await remove(
        reservationRef
      );

    } catch (removeError) {

      console.error(
        "予約削除エラー:",
        removeError
      );

      /*
       * 予約削除に失敗したので、
       * 先ほど減らした枠を元に戻す。
       */

      await runTransaction(
        countRef,
        (value) =>
          Number(value || 0) + 1
      );

      throw removeError;
    }

  } catch (cancelError) {

    console.error(
      "キャンセルエラー:",
      cancelError
    );

    alert(
      "キャンセルに失敗しました。\n予約はそのまま残っています。"
    );

    render();

    return;
  }

  /*
   * Firebaseで完全に成功してから
   * LocalStorageから削除する。
   */

  const newLocalReservations =
    localReservations.filter(
      (item) =>
        String(item.number) !==
        String(number)
    );

  saveLocalReservations(
    newLocalReservations
  );

  alert(
    "予約をキャンセルしました。"
  );

  render();
}


/* =========================
   Firebase：設定
========================= */

onValue(
  ref(db, "Queue/settings"),
  (snapshot) => {

    const value =
      snapshot.val();

    if (value) {
      settings = {
        start:
          value.start || "09:00",

        end:
          value.end || "15:00",

        slotMinutes:
          Number(
            value.slotMinutes || 60
          ),

        maxGroups:
          Number(
            value.maxGroups || 1
          ),

        open:
          value.open !== false
      };
    }

    render();
  }
);


/* =========================
   Firebase：時間枠
========================= */

onValue(
  ref(db, "Queue/slots"),
  (snapshot) => {

    slots =
      snapshot.val() || {};

    render();
  }
);


/* =========================
   Firebase：予約
========================= */

onValue(
  ref(db, "Queue/reservations"),
  (snapshot) => {

    reservations =
      snapshot.val() || {};

    render();
  }
);


/* =========================
   イベント
========================= */

if ($("slot")) {

  $("slot").addEventListener(
    "change",
    updateInfo
  );
}


if ($("reserve")) {

  $("reserve").addEventListener(
    "click",
    makeReservation
  );
}


/* =========================
   初期表示
========================= */

render();