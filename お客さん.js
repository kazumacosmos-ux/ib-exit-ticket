import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  onChildRemoved,
  runTransaction,
  set,
  remove
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import { firebaseConfig } from "./Firebase設定.js";


/* =========================================
   Firebase
========================================= */

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);


/* =========================================
   共通
========================================= */

const $ = (id) => document.getElementById(id);


/* =========================================
   初期設定
========================================= */

let settings = {
  start: "09:00",
  end: "15:00",
  slotMinutes: 60,
  maxGroups: 1,
  open: true
};


/* =========================================
   Firebaseデータ
========================================= */

let slots = {};
let reservations = {};


/* =========================================
   キャンセル関連
========================================= */

let selfCancelInProgress = false;
let cancellationMessageNumber = null;


/* =========================================
   リセット関連
========================================= */

let lastResetAt = 0;


/* =========================================
   LocalStorage
========================================= */

const RESERVATION_KEY = "ib_reservation";
const RESET_KEY = "ib_resetAt";


function getLocalReservation() {

  try {

    const value =
      localStorage.getItem(
        RESERVATION_KEY
      );

    if (!value) {
      return null;
    }

    return JSON.parse(value);

  } catch (error) {

    console.error(
      "localStorageの読み込みに失敗しました:",
      error
    );

    return null;
  }
}


function saveLocalReservation(
  reservation
) {

  try {

    localStorage.setItem(
      RESERVATION_KEY,
      JSON.stringify(reservation)
    );

  } catch (error) {

    console.error(
      "localStorageの保存に失敗しました:",
      error
    );
  }
}


function clearLocalReservation() {

  try {

    localStorage.removeItem(
      RESERVATION_KEY
    );

  } catch (error) {

    console.error(
      "localStorageの削除に失敗しました:",
      error
    );
  }
}


function getLocalResetAt() {

  try {

    return Number(
      localStorage.getItem(
        RESET_KEY
      ) || 0
    );

  } catch (error) {

    console.error(
      "resetAtの読み込みに失敗しました:",
      error
    );

    return 0;
  }
}


function saveLocalResetAt(
  resetAt
) {

  try {

    localStorage.setItem(
      RESET_KEY,
      String(resetAt)
    );

  } catch (error) {

    console.error(
      "resetAtの保存に失敗しました:",
      error
    );
  }
}


/* =========================================
   画面内通知
========================================= */

function showReservationComplete(
  number,
  start,
  end
) {

  const reservationArea =
    $("reservationArea");


  if (!reservationArea) {

    alert(
      "🎫 予約が完了しました！\n\n" +
      `予約番号：No.${number}\n` +
      `ご来場時間：${start}～${end}`
    );

    return;
  }


  reservationArea.hidden =
    false;


  reservationArea.innerHTML = `

    <div
      class="reservation-complete"
      style="
        text-align:center;
        padding:32px 20px;
        margin:20px 0;
        border-radius:20px;
        background:linear-gradient(
          180deg,
          #eaf7ff 0%,
          #ffffff 100%
        );
        border:2px solid #9bd8ff;
        box-shadow:0 10px 30px rgba(0,80,140,0.12);
      "
    >

      <div
        style="
          font-size:48px;
          margin-bottom:10px;
        "
      >
        🎫
      </div>


      <h2
        style="
          margin:0 0 12px;
          color:#075985;
          font-size:28px;
        "
      >
        予約完了！
      </h2>


      <p
        style="
          margin:0 0 20px;
          color:#334155;
          font-size:16px;
        "
      >
        ご予約ありがとうございます。
      </p>


      <div
        style="
          display:inline-block;
          padding:16px 24px;
          margin-bottom:16px;
          border-radius:14px;
          background:#ffffff;
          border:1px solid #bfdbfe;
        "
      >

        <div
          style="
            font-size:13px;
            color:#64748b;
            margin-bottom:4px;
          "
        >
          予約番号
        </div>


        <strong
          style="
            display:block;
            font-size:30px;
            color:#0369a1;
          "
        >
          No.${escapeHtml(number)}
        </strong>

      </div>


      <div
        style="
          font-size:17px;
          font-weight:bold;
          color:#0f172a;
          margin-bottom:24px;
        "
      >
        ご来場時間
        <br>
        <span
          style="
            font-size:24px;
            color:#0284c7;
          "
        >
          ${escapeHtml(start)}
          ～
          ${escapeHtml(end)}
        </span>
      </div>


      <p
        style="
          margin:0;
          color:#64748b;
          font-size:14px;
        "
      >
        下に搭乗券を表示しています。
      </p>

    </div>

  `;


  setTimeout(
    () => {

      renderReservations();

      reservationArea.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    },
    1200
  );
}


/* =========================================
   時刻処理
========================================= */

function toMinutes(time) {

  if (
    typeof time !== "string"
  ) {

    return NaN;
  }


  const parts =
    time.trim().split(":");


  if (
    parts.length !== 2
  ) {

    return NaN;
  }


  const hour =
    Number(parts[0]);

  const minute =
    Number(parts[1]);


  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {

    return NaN;
  }


  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {

    return NaN;
  }


  return (
    hour * 60 +
    minute
  );
}


function formatTime(
  totalMinutes
) {

  const hour =
    Math.floor(
      totalMinutes / 60
    );

  const minute =
    totalMinutes % 60;


  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );
}


/* =========================================
   スロットキー
========================================= */

function slotKey(
  minutes
) {

  return (
    String(
      Math.floor(
        minutes / 60
      )
    ).padStart(2, "0") +
    "-" +
    String(
      minutes % 60
    ).padStart(2, "0")
  );
}


/* =========================================
   設定値
========================================= */

function getStartMinutes() {

  const value =
    toMinutes(
      settings.start
    );


  if (
    Number.isFinite(value)
  ) {

    return value;
  }


  return 9 * 60;
}


function getEndMinutes() {

  const value =
    toMinutes(
      settings.end
    );


  if (
    Number.isFinite(value)
  ) {

    return value;
  }


  return 15 * 60;
}


function getSlotMinutes() {

  const value =
    Number(
      settings.slotMinutes
    );


  if (
    Number.isFinite(value) &&
    value > 0
  ) {

    return value;
  }


  return 60;
}


function getMaxGroups() {

  const value =
    Number(
      settings.maxGroups
    );


  if (
    Number.isFinite(value) &&
    value > 0
  ) {

    return value;
  }


  return 1;
}


/* =========================================
   時間帯生成
========================================= */

function buildSlots(
  startMinutes,
  endMinutes,
  slotMinutes
) {

  const result = {};


  if (
    !Number.isFinite(startMinutes) ||
    !Number.isFinite(endMinutes) ||
    !Number.isFinite(slotMinutes)
  ) {

    return result;
  }


  if (
    endMinutes <= startMinutes
  ) {

    return result;
  }


  if (
    slotMinutes <= 0
  ) {

    return result;
  }


  for (
    let minutes = startMinutes;
    minutes < endMinutes;
    minutes += slotMinutes
  ) {

    const slotEnd =
      minutes + slotMinutes;


    if (
      slotEnd > endMinutes
    ) {

      break;
    }


    const key =
      slotKey(minutes);


    result[key] = {

      key,

      start:
        formatTime(
          minutes
        ),

      end:
        formatTime(
          slotEnd
        )
    };
  }


  return result;
}


/* =========================================
   標準時間帯
========================================= */

function createDefaultSlots() {

  return buildSlots(
    9 * 60,
    15 * 60,
    60
  );
}


/* =========================================
   現在の設定から時間帯を作成
========================================= */

function createSlots() {

  const start =
    getStartMinutes();

  const end =
    getEndMinutes();

  const minutes =
    getSlotMinutes();


  let result =
    buildSlots(
      start,
      end,
      minutes
    );


  if (
    Object.keys(result).length === 0
  ) {

    result =
      createDefaultSlots();
  }


  return result;
}


/* =========================================
   今日の日付
========================================= */

function getToday() {

  const now =
    new Date();


  const year =
    now.getFullYear();


  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );


  return (
    `${year}/${month}/${day}`
  );
}


/* =========================================
   搭乗時刻
========================================= */

function getBoardingTime(
  endTime
) {

  const minutes =
    toMinutes(
      endTime
    );


  if (
    !Number.isFinite(minutes)
  ) {

    return "";
  }


  return formatTime(
    minutes + 5
  );
}


/* =========================================
   便名
========================================= */

function getFlightNumber(
  number
) {

  return (
    "DREAM" +
    String(
      number
    ).padStart(
      3,
      "0"
    )
  );
}


/* =========================================
   HTMLエスケープ
========================================= */

function escapeHtml(
  value
) {

  return String(
    value
  ).replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character])
  );
}


/* =========================================
   時間帯表示
========================================= */

function renderSlots() {

  const select =
    $("slot");


  if (!select) {

    console.error(
      "id=\"slot\" が見つかりません。"
    );

    return;
  }


  const previousValue =
    select.value;


  const generatedSlots =
    createSlots();


  let finalSlotList =
    Object.values(
      generatedSlots
    );


  select.innerHTML =
    "";


  if (
    finalSlotList.length === 0
  ) {

    finalSlotList =
      Object.values(
        createDefaultSlots()
      );
  }


  if (
    finalSlotList.length === 0
  ) {

    const option =
      document.createElement(
        "option"
      );


    option.value =
      "";


    option.textContent =
      "搭乗時間を読み込めません";


    option.disabled =
      true;


    option.selected =
      true;


    select.appendChild(
      option
    );


    updateInfo();

    updateReserveButton();

    return;
  }


  let previousStillAvailable =
    false;


  let firstAvailable =
    null;


  finalSlotList.forEach(
    (slot) => {

      const count =
        Number(
          slots[
            slot.key
          ]?.count || 0
        );


      const maxGroups =
        getMaxGroups();


      const isFull =
        count >= maxGroups;


      const option =
        document.createElement(
          "option"
        );


      option.value =
        slot.key;


      option.textContent =
        `${slot.start} ～ ${slot.end}`;


      option.disabled =
        isFull;


      if (
        !isFull &&
        firstAvailable === null
      ) {

        firstAvailable =
          slot.key;
      }


      if (
        slot.key === previousValue
      ) {

        previousStillAvailable =
          !isFull;
      }


      select.appendChild(
        option
      );
    }
  );


  if (
    previousStillAvailable
  ) {

    select.value =
      previousValue;

  } else if (
    firstAvailable !== null
  ) {

    select.value =
      firstAvailable;

  } else {

    select.selectedIndex =
      0;
  }


  updateInfo();

  updateReserveButton();
}


/* =========================================
   時間帯情報
========================================= */

function updateInfo() {

  const select =
    $("slot");

  const info =
    $("slotInfo");


  if (
    !select ||
    !info
  ) {

    return;
  }


  const generatedSlots =
    createSlots();


  const slot =
    generatedSlots[
      select.value
    ];


  if (!slot) {

    info.textContent =
      "";

    return;
  }


  const count =
    Number(
      slots[
        slot.key
      ]?.count || 0
    );


  const maxGroups =
    getMaxGroups();


  if (
    count >= maxGroups
  ) {

    info.textContent =
      "この時間帯は満員です。";

  } else {

    info.textContent =
      `残り ${maxGroups - count} 組`;
  }
}


/* =========================================
   予約ボタン
========================================= */

function updateReserveButton() {

  const button =
    $("reserve");


  if (!button) {
    return;
  }


  const select =
    $("slot");


  if (!select) {

    button.disabled =
      true;

    return;
  }


  const generatedSlots =
    createSlots();


  const slot =
    generatedSlots[
      select.value
    ];


  if (!slot) {

    button.disabled =
      true;

    return;
  }


  const count =
    Number(
      slots[
        slot.key
      ]?.count || 0
    );


  const maxGroups =
    getMaxGroups();


  button.disabled =
    (
      settings.open === false ||
      count >= maxGroups
    );
}


/* =========================================
   予約後の搭乗券表示
========================================= */

function renderReservations() {

  const reservationArea =
    $("reservationArea");


  if (!reservationArea) {
    return;
  }


  const localReservation =
    getLocalReservation();


  if (!localReservation) {

    reservationArea.hidden =
      true;

    reservationArea.innerHTML =
      "";

    return;
  }


  const number =
    String(
      localReservation.number
    );


  const remoteReservation =
    reservations[number];


  const reservation =
    remoteReservation ||
    localReservation;


  if (!reservation) {

    reservationArea.hidden =
      true;

    reservationArea.innerHTML =
      "";

    return;
  }


  reservationArea.hidden =
    false;


  const boardingTime =
    getBoardingTime(
      reservation.end
    );


  const flightNumber =
    getFlightNumber(
      reservation.number
    );


  reservationArea.innerHTML = `

    <div class="boarding-pass">

      <div class="boarding-pass-header">

        <div>

          <h2>
            1-B出口搭乗券
          </h2>

          <p>
            出口ドリームスカイライン
          </p>

        </div>

        <strong>
          ${escapeHtml(
            flightNumber
          )}
        </strong>

      </div>


      <div class="boarding-pass-main">

        <div class="boarding-arrival">

          <span>
            ご来場時間
          </span>

          <strong>
            ${escapeHtml(
              reservation.start
            )}
            ～
            ${escapeHtml(
              reservation.end
            )}
          </strong>

        </div>


        <div class="boarding-info-grid">

          <div>

            <span>
              日付
            </span>

            <strong>
              ${getToday()}
            </strong>

          </div>


          <div>

            <span>
              FROM
            </span>

            <strong>
              1-B
            </strong>

          </div>


          <div>

            <span>
              TO
            </span>

            <strong>
              ？？？
            </strong>

          </div>


          <div>

            <span>
              搭乗時刻
            </span>

            <strong>
              ${escapeHtml(
                boardingTime
              )}
            </strong>

          </div>


          <div>

            <span>
              人数
            </span>

            <strong>
              ${escapeHtml(
                reservation.size
              )}名
            </strong>

          </div>

        </div>


        <div class="boarding-pass-passenger">

          <span>
            代表者
          </span>

          <strong>
            ${escapeHtml(
              reservation.name ||
              "名前なし"
            )}
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
      () => {

        cancelReservation(
          reservation
        );
      };
  }
}


/* =========================================
   予約処理
========================================= */

const reserveButton =
  $("reserve");


if (reserveButton) {

  reserveButton.onclick =
    async () => {

      const error =
        $("error");


      if (error) {

        error.textContent =
          "";
      }


      const existing =
        getLocalReservation();


      if (existing) {

        if (error) {

          error.text