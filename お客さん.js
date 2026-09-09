import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  onChildRemoved,
  runTransaction,
  set,
  remove
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  firebaseConfig
} from "./Firebase設定.js";


/* =========================
   Firebase
========================= */

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);


/* =========================
   設定
========================= */

let settings = {
  start: "09:00",
  end: "15:00",
  slotMinutes: 60,
  maxGroups: 1,
  open: true
};

let slots = {};
let reservations = {};

let selfCancelInProgress = false;
let lastResetAt = 0;

const RESERVATION_KEY = "ib_reservation";
const RESET_KEY = "ib_resetAt";


/* =========================
   localStorage
========================= */

function getLocalReservation() {
  try {
    return JSON.parse(localStorage.getItem(RESERVATION_KEY));
  } catch {
    return null;
  }
}

function saveLocalReservation(data) {
  localStorage.setItem(
    RESERVATION_KEY,
    JSON.stringify(data)
  );
}

function clearLocalReservation() {
  localStorage.removeItem(RESERVATION_KEY);
}

function getLocalResetAt() {
  return Number(
    localStorage.getItem(RESET_KEY) || 0
  );
}

function saveLocalResetAt(value) {
  localStorage.setItem(
    RESET_KEY,
    String(value)
  );
}


/* =========================
   共通
========================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
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

function generateSlots() {
  const result = [];

  const start = timeToMinutes(settings.start);
  const end = timeToMinutes(settings.end);
  const step = Number(settings.slotMinutes);

  if (!step || step <= 0) {
    return result;
  }

  for (
    let current = start;
    current + step <= end;
    current += step
  ) {
    const startTime = minutesToTime(current);
    const endTime = minutesToTime(current + step);

    result.push({
      key: startTime.replace(":", ""),
      start: startTime,
      end: endTime,
      count: Number(
        slots[startTime.replace(":", "")]?.count || 0
      )
    });
  }

  return result;
}

function getToday() {
  const now = new Date();

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");

  return `${y}/${m}/${d}`;
}

function getBoardingTime(endTime) {
  const minutes = timeToMinutes(endTime) + 5;
  return minutesToTime(minutes);
}

function getFlightNumber(number) {
  const numeric = Number(
    String(number).replace(/\D/g, "")
  );

  return `DREAM${String(numeric).padStart(3, "0")}`;
}


/* =========================
   予約エリア表示
========================= */

function showBookingArea() {
  const area = document.getElementById("bookingArea");

  if (!area) return;

  area.hidden = false;
  area.style.display = "";

  const button = document.getElementById("reserveButton");

  if (button) {
    button.disabled = false;
    button.textContent = "搭乗券を予約する";
  }

  renderSlots();
  updateInfo();
}

function hideBookingArea() {
  const area = document.getElementById("bookingArea");

  if (!area) return;

  area.hidden = true;
  area.style.display = "none";
}

function hideReservationArea() {
  const area = document.getElementById("reservationArea");

  if (!area) return;

  area.hidden = true;
  area.style.display = "none";
  area.innerHTML = "";
}


/* =========================
   予約完了表示
========================= */

function showReservationComplete(
  number,
  start,
  end
) {
  const area =
    document.getElementById("reservationArea");

  if (!area) return;

  area.hidden = false;
  area.style.display = "";

  area.innerHTML = `
    <div class="reservation-complete">
      <div class="complete-icon">✓</div>
      <div class="complete-title">
        予約完了！
      </div>
      <div class="complete-number">
        ${escapeHtml(getFlightNumber(number))}
      </div>
      <div class="complete-time">
        ${escapeHtml(start)} ～ ${escapeHtml(end)}
      </div>
    </div>
  `;

  setTimeout(() => {
    renderReservations();
  }, 1200);
}


/* =========================
   時間枠
========================= */

function renderSlots() {
  const select =
    document.getElementById("slotSelect");

  if (!select) return;

  const currentValue = select.value;

  select.innerHTML = `
    <option value="">
      ご来場時間を選択してください
    </option>
  `;

  const generatedSlots = generateSlots();

  generatedSlots.forEach(slot => {
    const count = Number(slot.count || 0);
    const max = Number(settings.maxGroups || 0);
    const full = count >= max;

    const option =
      document.createElement("option");

    option.value = slot.key;
    option.textContent =
      `${slot.start} ～ ${slot.end}` +
      (full
        ? "（満員）"
        : `（残り${max - count}枠）`);

    option.disabled = full;

    select.appendChild(option);
  });

  if (
    currentValue &&
    [...select.options].some(
      option =>
        option.value === currentValue &&
        !option.disabled
    )
  ) {
    select.value = currentValue;
  }
}

function updateInfo() {
  const info =
    document.getElementById("slotInfo");

  if (!info) return;

  const generatedSlots = generateSlots();

  const total = generatedSlots.reduce(
    (sum, slot) =>
      sum + Number(slot.count || 0),
    0
  );

  const max = generatedSlots.reduce(
    (sum, slot) =>
      sum + Number(settings.maxGroups || 0),
    0
  );

  info.textContent =
    `現在 ${total}組 / 最大 ${max}組`;
}

function updateReserveButton() {
  const button =
    document.getElementById("reserveButton");

  if (!button) return;

  const localReservation =
    getLocalReservation();

  if (localReservation) {
    button.disabled = true;
    button.textContent = "予約済み";
    return;
  }

  button.disabled = false;
  button.textContent = "搭乗券を予約する";
}


/* =========================
   搭乗券表示
========================= */

function renderReservations() {
  const area =
    document.getElementById("reservationArea");

  if (!area) return;

  const localReservation =
    getLocalReservation();

  /*
   * 自分の予約がない
   */
  if (!localReservation) {
    hideReservationArea();

    if (settings.open) {
      showBookingArea();
    } else {
      hideBookingArea();
    }

    return;
  }

  /*
   * Firebase上の予約を取得
   */
  const remoteReservation =
    reservations[localReservation.number];

  /*
   * 搭乗済みになった場合
   *
   * Firebase上の予約は残す。
   * お客さん側の表示だけリセットする。
   */
  if (
    remoteReservation &&
    remoteReservation.status === "completed"
  ) {
    clearLocalReservation();

    hideReservationArea();
    showBookingArea();

    return;
  }

  /*
   * 予約がFirebaseから削除された場合
   */
  if (!remoteReservation) {
    /*
     * 予約直後など、一時的に同期が
     * 間に合っていない可能性があるため、
     * 少し待ってから判断する。
     */
    return;
  }

  hideBookingArea();

  area.hidden = false;
  area.style.display = "";

  const number =
    remoteReservation.number ||
    localReservation.number;

  const name =
    remoteReservation.name ||
    localReservation.name ||
    "";

  const start =
    remoteReservation.start ||
    localReservation.start;

  const end =
    remoteReservation.end ||
    localReservation.end;

  const size =
    remoteReservation.size ||
    localReservation.size ||
    1;

  const flight =
    getFlightNumber(number);

  const boardingTime =
    getBoardingTime(end);

  area.innerHTML = `
    <div class="boarding-pass">

      <div class="boarding-pass-top">
        <div class="boarding-title">
          1-B出口 搭乗券
        </div>

        <div class="boarding-airline">
          出口ドリームスカイライン
        </div>
      </div>


      <div class="boarding-flight">

        <div class="flight-block">
          <div class="flight-label">
            FLIGHT
          </div>

          <div class="flight-value">
            ${escapeHtml(flight)}
          </div>
        </div>

        <div class="flight-block">
          <div class="flight-label">
            GATE
          </div>

          <div class="flight-value">
            1-B
          </div>
        </div>

      </div>


      <div class="boarding-main">

        <div class="boarding-row">
          <div>
            <div class="boarding-label">
              ご来場時間
            </div>

            <div class="boarding-value">
              ${escapeHtml(start)}
              ～
              ${escapeHtml(end)}
            </div>
          </div>

          <div>
            <div class="boarding-label">
              日付
            </div>

            <div class="boarding-value">
              ${escapeHtml(getToday())}
            </div>
          </div>
        </div>


        <div class="boarding-row">

          <div>
            <div class="boarding-label">
              FROM
            </div>

            <div class="boarding-value">
              1-B
            </div>
          </div>

          <div>
            <div class="boarding-label">
              搭乗時刻
            </div>

            <div class="boarding-value">
              ${escapeHtml(boardingTime)}
            </div>
          </div>

        </div>


        <div class="boarding-row">

          <div>
            <div class="boarding-label">
              人数
            </div>

            <div class="boarding-value">
              ${escapeHtml(size)}名
            </div>
          </div>

          <div>
            <div class="boarding-label">
              代表者
            </div>

            <div class="boarding-value">
              ${escapeHtml(name)}
            </div>
          </div>

        </div>

      </div>


      <div class="boarding-barcode">
        <div class="barcode-lines">
          || ||| | |||| || | ||| |||| |
        </div>

        <div class="barcode-number">
          ${escapeHtml(flight)}
        </div>
      </div>


      <div
        class="boarding-note"
        style="
          color: #315d78;
          margin-top: 18px;
          font-size: 13px;
          line-height: 1.8;
          text-align: left;
        "
      >
        <div
          style="
            font-weight: bold;
            margin-bottom: 5px;
          "
        >
          【ご予約にあたっての注意】
        </div>

        <div>
          ・搭乗時刻前になりましたら、受付までお越しください。
        </div>

        <div>
          ・予約後に時間を変更する場合は、一度キャンセルしてから再度ご予約いただくか、受付スタッフまでお申し出ください。
        </div>

        <div>
          ・搭乗券は代表者のスマートフォンでご提示ください。万が一に備え、スクリーンショットを保存しておくことをおすすめします。
        </div>

        <div>
          ・混雑状況により、お待ちいただく場合がございます。
        </div>
      </div>


      <button
        id="cancelReservationButton"
        class="cancel-button"
      >
        予約をキャンセルする
      </button>

    </div>
  `;


  const cancelButton =
    document.getElementById(
      "cancelReservationButton"
    );

  if (cancelButton) {
    cancelButton.addEventListener(
      "click",
      cancelReservation
    );
  }
}


/* =========================
   予約
========================= */

async function reserve() {
  const error =
    document.getElementById("reserveError");

  if (error) {
    error.textContent = "";
  }

  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch (e) {
      if (error) {
        error.textContent =
          "接続できませんでした。もう一度お試しください。";
      }
      return;
    }
  }

  const existing =
    getLocalReservation();

  if (existing) {
    renderReservations();
    return;
  }

  if (!settings.open) {
    if (error) {
      error.textContent =
        "現在、予約受付を停止しています。";
    }
    return;
  }

  const nameInput =
    document.getElementById("name");

  const sizeInput =
    document.getElementById("size");

  const slotSelect =
    document.getElementById("slotSelect");

  const name =
    nameInput?.value.trim() || "";

  const size =
    Number(sizeInput?.value || 0);

  const slotKey =
    slotSelect?.value || "";

  if (!name) {
    if (error) {
      error.textContent =
        "代表者名を入力してください。";
    }
    return;
  }

  if (size < 1 || size > 4) {
    if (error) {
      error.textContent =
        "人数は1〜4名で入力してください。";
    }
    return;
  }

  if (!slotKey) {
    if (error) {
      error.textContent =
        "搭乗時間を選択してください。";
    }
    return;
  }

  const generatedSlots =
    generateSlots();

  const selectedSlot =
    generatedSlots.find(
      slot => slot.key === slotKey
    );

  if (!selectedSlot) {
    if (error) {
      error.textContent =
        "選択した時間枠が見つかりません。";
    }
    return;
  }

  const slotRef =
    ref(db, `Queue/slots/${slotKey}/count`);

  const maxGroups =
    Number(settings.maxGroups || 0);

  const button =
    document.getElementById("reserveButton");

  if (button) {
    button.disabled = true;
    button.textContent = "予約処理中…";
  }

  let slotIncremented = false;
  let reservationNumber = null;

  try {

    /*
     * 枠数を確保
     */
    const slotResult =
      await runTransaction(
        slotRef,
        current => {
          const count =
            Number(current || 0);

          if (count >= maxGroups) {
            return;
          }

          return count + 1;
        }
      );

    if (!slotResult.committed) {
      throw new Error(
        "この時間枠は満員です。"
      );
    }

    slotIncremented = true;


    /*
     * 予約番号
     */
    const lastRef =
      ref(db, "Queue/reservationLast");

    const numberResult =
      await runTransaction(
        lastRef,
        current => Number(current || 0) + 1
      );

    reservationNumber =
      Number(numberResult.snapshot.val());


    /*
     * 予約データ
     */
    const reservation = {
      number: reservationNumber,
      name: name,
      slot: slotKey,
      start: selectedSlot.start,
      end: selectedSlot.end,
      size: size,
      type: "web",
      status: "reserved",
      createdAt: Date.now()
    };


    /*
     * Firebaseに保存
     */
    await set(
      ref(
        db,
        `Queue/reservations/${reservationNumber}`
      ),
      reservation
    );


    /*
     * 自分の予約として保存
     */
    saveLocalReservation(
      reservation
    );

    reservations[reservationNumber] =
      reservation;


    /*
     * 入力欄をクリア
     */
    if (nameInput) {
      nameInput.value = "";
    }

    /*
     * 予約フォームを消す
     */
    hideBookingArea();

    /*
     * 搭乗券を表示
     */
    renderReservations();

  } catch (e) {

    /*
     * 予約失敗時は確保した枠を戻す
     */
    if (
      slotIncremented &&
      slotKey
    ) {
      try {
        await runTransaction(
          slotRef,
          current => {
            const count =
              Number(current || 0);

            return Math.max(
              0,
              count - 1
            );
          }
        );
      } catch {
        // ここでは何もしない
      }
    }

    if (error) {
      error.textContent =
        e?.message ||
        "予約できませんでした。もう一度お試しください。";
    }

  } finally {

    /*
     * 予約が残っていなければ
     * ボタンを元に戻す
     */
    if (!getLocalReservation()) {
      updateReserveButton();
    }
  }
}


/* =========================
   キャンセル
========================= */

async function cancelReservation() {
  const localReservation =
    getLocalReservation();

  if (!localReservation) {
    return;
  }

  const confirmed =
    confirm(
      "この予約をキャンセルしますか？"
    );

  if (!confirmed) {
    return;
  }

  selfCancelInProgress = true;

  try {

    /*
     * Firebaseから予約削除
     */
    await remove(
      ref(
        db,
        `Queue/reservations/${localReservation.number}`
      )
    );


    /*
     * 時間枠を1つ戻す
     */
    const slotRef =
      ref(
        db,
        `Queue/slots/${localReservation.slot}/count`
      );

    await runTransaction(
      slotRef,
      current => {
        const count =
          Number(current || 0);

        return Math.max(
          0,
          count - 1
        );
      }
    );


    /*
     * 自分の予約情報を削除
     */
    clearLocalReservation();

    delete reservations[
      localReservation.number
    ];


    /*
     * 搭乗券を消す
     */
    hideReservationArea();


    /*
     * 予約フォームを戻す
     */
    showBookingArea();

  } catch (e) {

    alert(
      "キャンセルできませんでした。\nもう一度お試しください。"
    );

  } finally {

    setTimeout(() => {
      selfCancelInProgress = false;
    }, 500);
  }
}


/* =========================
   Firebase：設定
========================= */

onValue(
  ref(db, "Queue/settings"),
  snapshot => {

    const data =
      snapshot.val();

    if (data) {
      settings = {
        ...settings,
        ...data
      };
    }

    renderSlots();
    updateInfo();
    renderReservations();
  }
);


/* =========================
   Firebase：枠
========================= */

onValue(
  ref(db, "Queue/slots"),
  snapshot => {

    slots =
      snapshot.val() || {};

    renderSlots();
    updateInfo();
  }
);


/* =========================
   Firebase：予約
========================= */

onValue(
  ref(db, "Queue/reservations"),
  snapshot => {

    reservations =
      snapshot.val() || {};

    const localReservation =
      getLocalReservation();

    /*
     * 搭乗済みになった場合も
     * ここで検知する
     */
    if (localReservation) {
      const remote =
        reservations[
          localReservation.number
        ];

      if (
        remote &&
        remote.status === "completed"
      ) {
        clearLocalReservation();
        hideReservationArea();
        showBookingArea();
        return;
      }
    }

    renderReservations();
  }
);


/* =========================
   Firebase：予約削除
========================= */

onChildRemoved(
  ref(db, "Queue/reservations"),
  snapshot => {

    const removedNumber =
      snapshot.key;

    const localReservation =
      getLocalReservation();

    if (
      localReservation &&
      String(localReservation.number) ===
        String(removedNumber)
    ) {

      if (selfCancelInProgress) {
        return;
      }

      clearLocalReservation();

      hideReservationArea();
      showBookingArea();

      alert(
        "予約がキャンセルされました。"
      );
    }
  }
);


/* =========================
   Firebase：全体リセット
========================= */

onValue(
  ref(db, "Queue/resetAt"),
  snapshot => {

    const value =
      Number(snapshot.val() || 0);

    const localValue =
      getLocalResetAt();

    if (
      value > 0 &&
      value > localValue
    ) {
      lastResetAt = value;

      saveLocalResetAt(value);
      clearLocalReservation();

      hideReservationArea();
      showBookingArea();
    }
  }
);


/* =========================
   ボタン
========================= */

const reserveButton =
  document.getElementById(
    "reserveButton"
  );

if (reserveButton) {
  reserveButton.addEventListener(
    "click",
    reserve
  );
}


/* =========================
   初期表示
========================= */

const localReservation =
  getLocalReservation();

if (localReservation) {
  hideBookingArea();
  renderReservations();
} else {
  hideReservationArea();
  showBookingArea();
}