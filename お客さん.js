import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  set,
  remove
} from
  "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import { firebaseConfig } from "./Firebase設定.js";


/* =========================================
   Firebase
   ========================================= */

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);


/* =========================================
   基本設定
   ========================================= */

const FIXED_START = "09:00";
const FIXED_END = "15:00";

let settings = {
  start: FIXED_START,
  end: FIXED_END,
  slotMinutes: 60,
  maxGroups: 1,
  open: true
};

let slots = {};
let reservations = {};


/* =========================================
   HTML取得
   ========================================= */

const nameInput = document.getElementById("name");
const sizeSelect = document.getElementById("size");
const slotSelect = document.getElementById("slot");
const slotInfo = document.getElementById("slotInfo");
const reserveButton = document.getElementById("reserve");
const errorMessage = document.getElementById("error");

const reserveArea = document.getElementById("reserveArea");
const reservationArea = document.getElementById("reservationArea");
const closedArea = document.getElementById("closedArea");


/* =========================================
   時刻計算
   ========================================= */

function toMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);

  return hour * 60 + minute;
}


function formatTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );
}


/* =========================================
   スロットキー
   ========================================= */

function slotKey(start) {
  return start.replace(":", "-");
}


/* =========================================
   時間帯作成
   ========================================= */

function createSlots() {

  const result = {};

  const startMinutes = toMinutes(
    settings.start || FIXED_START
  );

  const endMinutes = toMinutes(
    settings.end || FIXED_END
  );

  const slotMinutes =
    Number(settings.slotMinutes) || 60;

  if (slotMinutes <= 0) {
    return result;
  }

  for (
    let current = startMinutes;
    current + slotMinutes <= endMinutes;
    current += slotMinutes
  ) {

    const start = formatTime(current);
    const end = formatTime(
      current + slotMinutes
    );

    const key = slotKey(start);

    result[key] = {
      key,
      start,
      end
    };
  }

  return result;
}


/* =========================================
   HTMLエスケープ
   ========================================= */

function escapeHtml(value) {

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================
   今日の日付
   ========================================= */

function getToday() {

  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  return `${year}/${month}/${day}`;
}


/* =========================================
   搭乗時刻
   ========================================= */

function getBoardingTime(endTime) {

  const minutes =
    toMinutes(endTime) + 5;

  return formatTime(minutes);
}


/* =========================================
   搭乗券番号
   ========================================= */

function getFlightNumber(number) {

  return (
    "DREAM" +
    String(number).padStart(3, "0")
  );
}


/* =========================================
   スロット表示
   ========================================= */

function renderSlots() {

  if (!slotSelect) return;

  const slotData = createSlots();

  const keys = Object.keys(slotData);

  slotSelect.innerHTML = "";

  if (keys.length === 0) {

    const option =
      document.createElement("option");

    option.value = "";

    option.textContent =
      "時間帯を設定できません";

    option.disabled = true;

    option.selected = true;

    slotSelect.appendChild(option);

    return;
  }


  keys.forEach((key) => {

    const slot = slotData[key];

    const count =
      Number(slots[key]?.count || 0);

    const maxGroups =
      Number(settings.maxGroups) || 1;

    const remaining =
      Math.max(0, maxGroups - count);

    const option =
      document.createElement("option");

    option.value = key;

    option.textContent =
      `${slot.start}～${slot.end}（残り ${remaining}組）`;

    if (count >= maxGroups) {
      option.disabled = true;
    }

    slotSelect.appendChild(option);
  });


  /* 最初に選べる空き枠を選択 */

  const firstAvailable =
    Array.from(slotSelect.options)
      .find(option => !option.disabled);

  if (firstAvailable) {
    slotSelect.value =
      firstAvailable.value;
  }
}


/* =========================================
   選択中の時間帯情報
   ========================================= */

function updateInfo() {

  if (!slotSelect || !slotInfo) {
    return;
  }

  const selectedKey =
    slotSelect.value;

  const slot =
    createSlots()[selectedKey];

  if (!slot) {

    slotInfo.textContent = "";

    return;
  }

  const count =
    Number(
      slots[selectedKey]?.count || 0
    );

  const maxGroups =
    Number(settings.maxGroups) || 1;

  slotInfo.textContent =
    `${slot.start}～${slot.end}：${count}/${maxGroups}組`;
}


/* =========================================
   画面描画
   ========================================= */

function render() {

  const isOpen =
    settings.open !== false;


  /* 受付中 */

  if (isOpen) {

    reserveArea.hidden = false;

    closedArea.hidden = true;

  } else {

    reserveArea.hidden = true;

    closedArea.hidden = false;
  }


  renderSlots();

  updateInfo();

  renderReservations();
}


/* =========================================
   予約ボタン
   ========================================= */

if (reserveButton) {

  reserveButton.onclick = async () => {

    errorMessage.textContent = "";

    const name =
      nameInput.value.trim();

    const size =
      Number(sizeSelect.value);

    const selectedKey =
      slotSelect.value;

    const slot =
      createSlots()[selectedKey];


    /* 名前チェック */

    if (!name) {

      errorMessage.textContent =
        "代表者の名前を入力してください。";

      return;
    }


    /* 時間チェック */

    if (!slot) {

      errorMessage.textContent =
        "ご来場時間を選択してください。";

      return;
    }


    /* 人数チェック */

    if (
      !Number.isInteger(size) ||
      size < 1 ||
      size > 4
    ) {

      errorMessage.textContent =
        "人数は1～4人で選択してください。";

      return;
    }


    reserveButton.disabled = true;


    try {

      /* -------------------------------
         枠の人数を増やす
         ------------------------------- */

      const countRef =
        ref(
          db,
          `Queue/slots/${selectedKey}/count`
        );


      const countResult =
        await runTransaction(
          countRef,
          (value) => {

            const count =
              Number(value || 0);

            const maxGroups =
              Number(settings.maxGroups) || 1;

            if (count >= maxGroups) {
              return undefined;
            }

            return count + 1;
          }
        );


      if (!countResult.committed) {

        errorMessage.textContent =
          "申し訳ありません。この時間帯は満員になりました。";

        render();

        return;
      }


      /* -------------------------------
         予約番号を増やす
         ------------------------------- */

      const lastRef =
        ref(
          db,
          "Queue/reservationLast"
        );


      const lastResult =
        await runTransaction(
          lastRef,
          (value) => {

            return Number(value || 0) + 1;

          }
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

        errorMessage.textContent =
          "予約番号の取得に失敗しました。";

        return;
      }


      const number =
        Number(lastResult.snapshot.val());


      /* -------------------------------
         予約データ
         ------------------------------- */

      const reservation = {

        number,

        name,

        slot: selectedKey,

        start: slot.start,

        end: slot.end,

        size,

        type: "web",

        createdAt:
          Date.now()
      };


      /* -------------------------------
         Firebaseに保存
         ------------------------------- */

      await set(
        ref(
          db,
          `Queue/reservations/${number}`
        ),
        reservation
      );


      /* -------------------------------
         自分の端末にも保存
         ------------------------------- */

      const localReservations =
        JSON.parse(
          localStorage.getItem(
            "ib_reservations"
          ) || "[]"
        );


      localReservations.push(
        reservation
      );


      localStorage.setItem(
        "ib_reservations",
        JSON.stringify(
          localReservations
        )
      );


      /* -------------------------------
         入力欄をクリア
         ------------------------------- */

      nameInput.value = "";

      sizeSelect.value = "1";


      /* -------------------------------
         搭乗券表示
         ------------------------------- */

      renderBoardingPass(
        reservation
      );

    } catch (error) {

      console.error(error);

      errorMessage.textContent =
        "予約に失敗しました。もう一度お試しください。";

    } finally {

      reserveButton.disabled = false;

    }
  };
}


/* =========================================
   時間変更時
   ========================================= */

if (slotSelect) {

  slotSelect.onchange = () => {
    updateInfo();
  };

}


/* =========================================
   搭乗券表示
   ========================================= */

function renderBoardingPass(
  reservation
) {

  reservationArea.hidden = false;


  reservationArea.innerHTML = `

    <h2>
      予約済みの搭乗券
    </h2>

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
          ${getFlightNumber(
            reservation.number
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
              ゲート
            </span>

            <strong>
              1-B
            </strong>

          </div>


          <div>

            <span>
              搭乗時刻
            </span>

            <strong>
              ${getBoardingTime(
                reservation.end
              )}
            </strong>

          </div>


          <div>

            <span>
              人数
            </span>

            <strong>
              ${reservation.size}名
            </strong>

          </div>

        </div>


        <div class="boarding-pass-passenger">

          <span>
            代表者
          </span>

          <strong>
            ${escapeHtml(
              reservation.name
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
          data-number="${reservation.number}"
        >
          この予約をキャンセル
        </button>

      </div>

    </div>
  `;


  const cancelButton =
    reservationArea.querySelector(
      ".cancel-reservation"
    );


  if (cancelButton) {

    cancelButton.onclick = () => {

      cancelReservation(
        reservation
      );

    };

  }
}


/* =========================================
   自分の予約を表示
   ========================================= */

function renderReservations() {

  const localReservations =
    JSON.parse(
      localStorage.getItem(
        "ib_reservations"
      ) || "[]"
    );


  if (
    !localReservations ||
    localReservations.length === 0
  ) {

    reservationArea.hidden = true;

    reservationArea.innerHTML = "";

    return;
  }


  const latest =
    localReservations[
      localReservations.length - 1
    ];


  /* Firebase上に存在するか確認 */

  const exists =
    reservations[
      latest.number
    ];


  if (!exists) {

    localReservations.pop();

    localStorage.setItem(
      "ib_reservations",
      JSON.stringify(
        localReservations
      )
    );

    reservationArea.hidden = true;

    reservationArea.innerHTML = "";

    return;
  }


  renderBoardingPass(
    latest
  );
}


/* =========================================
   キャンセル
   ========================================= */

async function cancelReservation(
  reservation
) {

  const ok =
    confirm(
      "この予約をキャンセルしますか？"
    );


  if (!ok) {
    return;
  }


  try {

    /* 予約削除 */

    await remove(
      ref(
        db,
        `Queue/reservations/${reservation.number}`
      )
    );


    /* 枠の人数を1減らす */

    await runTransaction(
      ref(
        db,
        `Queue/slots/${reservation.slot}/count`
      ),
      (value) => {

        return Math.max(
          0,
          Number(value || 0) - 1
        );

      }
    );


    /* 端末保存から削除 */

    const localReservations =
      JSON.parse(
        localStorage.getItem(
          "ib_reservations"
        ) || "[]"
      );


    const newReservations =
      localReservations.filter(
        (item) =>
          Number(item.number) !==
          Number(reservation.number)
      );


    localStorage.setItem(
      "ib_reservations",
      JSON.stringify(
        newReservations
      )
    );


    reservationArea.hidden = true;

    reservationArea.innerHTML = "";

    errorMessage.textContent =
      "予約をキャンセルしました。";

    render();

  } catch (error) {

    console.error(error);

    errorMessage.textContent =
      "キャンセルに失敗しました。";

  }
}


/* =========================================
   Firebase：設定監視
   ========================================= */

onValue(
  ref(db, "Queue/settings"),
  (snapshot) => {

    const data =
      snapshot.val();

    if (data) {

      settings = {

        start:
          data.start || FIXED_START,

        end:
          data.end || FIXED_END,

        slotMinutes:
          Number(
            data.slotMinutes
          ) || 60,

        maxGroups:
          Number(
            data.maxGroups
          ) || 1,

        open:
          data.open !== false

      };

    }


    render();
  }
);


/* =========================================
   Firebase：時間帯監視
   ========================================= */

onValue(
  ref(db, "Queue/slots"),
  (snapshot) => {

    slots =
      snapshot.val() || {};

    render();

  }
);


/* =========================================
   Firebase：予約監視
   ========================================= */

onValue(
  ref(db, "Queue/reservations"),
  (snapshot) => {

    reservations =
      snapshot.val() || {};

    render();

  }
);


/* =========================================
   初期表示
   ========================================= */

render();
