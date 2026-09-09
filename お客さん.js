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
  end: "17:00",
  slotMinutes: 60,
  maxGroups: 1,
  open: true
};

let slots = {};
let reservations = {};

let reservationsLoaded = false;
let cancellationMessageShown = false;


/* =========================
   時間関係
========================= */

function toMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function slotKey(minutes) {
  return (
    String(Math.floor(minutes / 60)).padStart(2, "0") +
    "-" +
    String(minutes % 60).padStart(2, "0")
  );
}

function formatTimeKey(key) {
  return key.replace("-", ":");
}


/* =========================
   時間枠を作る
========================= */

function createSlots() {
  const result = {};

  const start = toMinutes(settings.start || "09:00");
  const end = toMinutes(settings.end || "17:00");

  const minutes = Number(settings.slotMinutes || 60);

  if (!minutes || minutes <= 0) {
    return result;
  }

  for (let m = start; m < end; m += minutes) {
    const e = m + minutes;

    // 終了時刻を超える枠は作らない
    if (e > end) {
      break;
    }

    const key = slotKey(m);

    result[key] = {
      key,
      start: formatTimeKey(key),
      end: formatTimeKey(slotKey(e))
    };
  }

  return result;
}


/* =========================
   HTMLエスケープ
========================= */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}


/* =========================
   今日の日付
========================= */

function getToday() {
  const now = new Date();

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");

  return `${y}/${m}/${d}`;
}


/* =========================
   搭乗時刻
   終了時刻 + 5分
========================= */

function getBoardingTime(endTime) {
  const minutes = toMinutes(endTime) + 5;

  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;

  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0")
  );
}


/* =========================
   予約番号
========================= */

function getFlightNumber(number) {
  return "DREAM" + String(number).padStart(3, "0");
}


/* =========================
   時間枠表示
========================= */

function renderSlots() {
  const select = $("slot");

  if (!select) {
    return;
  }

  const currentValue = select.value;

  select.innerHTML = "";

  const generated = createSlots();

  const slotList = Object.values(generated);

  if (slotList.length === 0) {
    const option = document.createElement("option");

    option.value = "";
    option.textContent = "時間帯を設定できません";
    option.disabled = true;
    option.selected = true;

    select.appendChild(option);

    updateInfo();

    return;
  }

  let firstAvailable = null;

  slotList.forEach((slot) => {
    const count = Number(
      slots[slot.key]?.count || 0
    );

    const maxGroups = Number(
      settings.maxGroups || 1
    );

    const remaining = Math.max(
      0,
      maxGroups - count
    );

    const option = document.createElement("option");

    option.value = slot.key;

    option.textContent =
      `${slot.start}～${slot.end}（残り ${remaining}組）`;

    option.disabled = count >= maxGroups;

    if (
      !option.disabled &&
      firstAvailable === null
    ) {
      firstAvailable = slot.key;
    }

    select.appendChild(option);
  });

  // 以前選択していた枠がまだ使えるなら維持
  const currentOption = [...select.options].find(
    (option) =>
      option.value === currentValue &&
      !option.disabled
  );

  if (currentOption) {
    select.value = currentValue;
  } else if (firstAvailable !== null) {
    select.value = firstAvailable;
  } else {
    select.selectedIndex = 0;
  }

  updateInfo();
}


/* =========================
   選択中の時間情報
========================= */

function updateInfo() {
  const select = $("slot");
  const info = $("slotInfo");

  if (!select || !info) {
    return;
  }

  const generated = createSlots();
  const selected = generated[select.value];

  if (!selected) {
    info.textContent = "";
    return;
  }

  const count = Number(
    slots[selected.key]?.count || 0
  );

  info.textContent =
    `${selected.start}～${selected.end}：` +
    `${count}/${Number(settings.maxGroups || 1)}組`;
}


/* =========================
   予約情報を取得
========================= */

function getSavedReservation() {
  const saved = localStorage.getItem(
    "ib_reservation"
  );

  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved);
  } catch {
    localStorage.removeItem(
      "ib_reservation"
    );

    return null;
  }
}


/* =========================
   搭乗券を表示
========================= */

function renderBoardingPass(reservation) {
  const area = $("reservationArea");

  if (!area) {
    return;
  }

  const number = reservation.number;
  const name = escapeHtml(
    reservation.name || ""
  );

  const size = Number(
    reservation.size || 1
  );

  const start = reservation.start || "";
  const end = reservation.end || "";

  const boardingTime =
    getBoardingTime(end);

  area.hidden = false;

  area.innerHTML = `
    <div class="boarding-pass">

      <div class="boarding-pass-header">

        <div>
          <h2>1-B出口搭乗券</h2>
          <p>出口ドリームスカイライン</p>
        </div>

        <strong>
          ${escapeHtml(getFlightNumber(number))}
        </strong>

      </div>


      <div class="boarding-pass-main">

        <div class="boarding-arrival">
          <span>ご来場時間</span>
          <strong>
            ${escapeHtml(start)}～${escapeHtml(end)}
          </strong>
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
            <strong>${size}名</strong>
          </div>

        </div>


        <div class="boarding-pass-passenger">

          <span>代表者</span>

          <strong>
            ${name}
          </strong>

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
          id="cancelReservation"
        >
          この予約をキャンセル
        </button>

      </div>

    </div>
  `;

  const cancelButton =
    $("cancelReservation");

  if (cancelButton) {
    cancelButton.onclick =
      () => cancelReservation(reservation);
  }
}


/* =========================
   予約表示を消す
========================= */

function hideBoardingPass() {
  const area = $("reservationArea");

  if (!area) {
    return;
  }

  area.innerHTML = "";
  area.hidden = true;
}


/* =========================
   予約画面を表示
========================= */

function showReserveArea() {
  const reserveArea = $("reserveArea");
  const closedArea = $("closedArea");

  if (reserveArea) {
    reserveArea.hidden =
      settings.open === false;
  }

  if (closedArea) {
    closedArea.hidden =
      settings.open !== false;
  }
}


/* =========================
   保存中の予約を表示
========================= */

function renderSavedReservation() {
  const reservation =
    getSavedReservation();

  if (!reservation) {
    hideBoardingPass();

    return;
  }

  const reserveArea =
    $("reserveArea");

  if (reserveArea) {
    reserveArea.hidden = true;
  }

  renderBoardingPass(reservation);
}


/* =========================
   Firebase上の予約と
   端末保存データを同期
========================= */

function syncLocalReservation() {
  // Firebaseの最初の読み込みが
  // 完了するまでは何もしない
  if (!reservationsLoaded) {
    return;
  }

  const saved =
    getSavedReservation();

  if (!saved) {
    return;
  }

  const number = String(
    saved.number
  );

  const remote =
    reservations[number];

  /*
   * Firebaseから予約が消えている
   * ↓
   * スタッフが削除した
   * ↓
   * お客さん側の搭乗券も削除
   */
  if (!remote) {

    localStorage.removeItem(
      "ib_reservation"
    );

    hideBoardingPass();

    const reserveArea =
      $("reserveArea");

    if (reserveArea) {
      reserveArea.hidden =
        settings.open === false;
    }

    if (!cancellationMessageShown) {

      cancellationMessageShown = true;

      alert(
        "スタッフによって予約がキャンセルされました。"
      );
    }

    return;
  }


  /*
   * スタッフが時間変更した場合
   * ↓
   * お客さん側の保存データも更新
   */
  const updated = {
    ...saved,
    slot: remote.slot,
    start: remote.start,
    end: remote.end,
    size: remote.size,
    name: remote.name,
    number: remote.number
  };

  localStorage.setItem(
    "ib_reservation",
    JSON.stringify(updated)
  );

  renderBoardingPass(updated);
}


/* =========================
   全体表示
========================= */

function render() {
  showReserveArea();

  const saved =
    getSavedReservation();

  if (saved) {

    const reserveArea =
      $("reserveArea");

    if (reserveArea) {
      reserveArea.hidden = true;
    }

    renderBoardingPass(saved);

  } else {

    const reservationArea =
      $("reservationArea");

    if (reservationArea) {
      reservationArea.hidden = true;
    }

    const reserveArea =
      $("reserveArea");

    if (reserveArea) {
      reserveArea.hidden =
        settings.open === false;
    }
  }

  renderSlots();
  updateInfo();
}


/* =========================
   時間帯変更
========================= */

if ($("slot")) {
  $("slot").onchange =
    updateInfo;
}


/* =========================
   Firebase：設定
========================= */

onValue(
  ref(db, "Queue/settings"),
  (snapshot) => {

    settings = {
      ...settings,
      ...(snapshot.val() || {})
    };

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
   ★ここが今回の修正ポイント
========================= */

onValue(
  ref(db, "Queue/reservations"),
  (snapshot) => {

    reservations =
      snapshot.val() || {};

    // Firebaseの初回読み込み完了
    reservationsLoaded = true;

    /*
     * スタッフによる削除・時間変更を
     * お客さん側へ反映
     */
    syncLocalReservation();

    render();
  }
);


/* =========================
   予約ボタン
========================= */

if ($("reserve")) {

  $("reserve").onclick =
    async () => {

      $("error").textContent = "";

      const name =
        $("name").value.trim();

      const size =
        Number($("size").value);

      const slot =
        createSlots()[
          $("slot").value
        ];


      if (!name) {

        $("error").textContent =
          "名前を入力してください。";

        return;
      }


      if (!slot) {

        $("error").textContent =
          "時間帯を選択してください。";

        return;
      }


      const maxGroups =
        Number(settings.maxGroups || 1);


      /*
       * 時間枠の人数を増やす
       */
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

            if (
              count >= maxGroups
            ) {
              return undefined;
            }

            return count + 1;
          }
        );


      if (!countResult.committed) {

        $("error").textContent =
          "その時間帯は満員です。";

        return;
      }


      /*
       * 予約番号を取得
       */
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

        $("error").textContent =
          "予約番号の取得に失敗しました。";

        return;
      }


      const number =
        lastResult.snapshot.val();


      /*
       * 予約データ
       */
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


      /*
       * Firebaseへ保存
       */
      await set(
        ref(
          db,
          `Queue/reservations/${number}`
        ),
        reservation
      );


      /*
       * この端末にも保存
       */
      localStorage.setItem(
        "ib_reservation",
        JSON.stringify(reservation)
      );


      /*
       * 画面表示
       */
      cancellationMessageShown = false;

      const reserveArea =
        $("reserveArea");

      if (reserveArea) {
        reserveArea.hidden = true;
      }

      renderBoardingPass(
        reservation
      );
    };
}


/* =========================
   初期表示
========================= */

renderSavedReservation();