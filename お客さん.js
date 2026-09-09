// ==============================
// お客さん予約ページ
// お客さん.js
// ==============================

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


// ==============================
// Firebase
// ==============================

const app =
  initializeApp(firebaseConfig);

const db =
  getDatabase(app);

const auth =
  getAuth(app);


// ==============================
// 初期設定
// ==============================

let settings = {

  start:
    "09:00",

  end:
    "15:00",

  slotMinutes:
    60,

  maxGroups:
    1,

  open:
    true
};


let slots = {};

let reservations = {};

let selfCancelInProgress =
  false;

let lastResetAt =
  0;


const RESERVATION_KEY =
  "ib_reservation";

const RESET_KEY =
  "ib_resetAt";


// ==============================
// localStorage
// ==============================

function getLocalReservation() {

  try {

    return JSON.parse(
      localStorage.getItem(
        RESERVATION_KEY
      )
    );

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

  localStorage.removeItem(
    RESERVATION_KEY
  );

}


function getLocalResetAt() {

  return Number(
    localStorage.getItem(
      RESET_KEY
    ) || 0
  );

}


function saveLocalResetAt(value) {

  localStorage.setItem(
    RESET_KEY,
    String(value)
  );

}


// ==============================
// 共通関数
// ==============================

function escapeHtml(value) {

  return String(value ?? "")

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}


function timeToMinutes(time) {

  const [h, m] =
    time
      .split(":")
      .map(Number);

  return (
    h * 60 +
    m
  );

}


function minutesToTime(minutes) {

  const h =
    Math.floor(
      minutes / 60
    );

  const m =
    minutes % 60;

  return (
    String(h).padStart(
      2,
      "0"
    ) +
    ":" +
    String(m).padStart(
      2,
      "0"
    )
  );

}


function generateSlots() {

  const result = [];

  const start =
    timeToMinutes(
      settings.start
    );

  const end =
    timeToMinutes(
      settings.end
    );

  const step =
    Number(
      settings.slotMinutes
    );

  if (
    !step ||
    step <= 0
  ) {

    return result;

  }


  for (
    let current = start;

    current + step <= end;

    current += step
  ) {

    const startTime =
      minutesToTime(
        current
      );

    const endTime =
      minutesToTime(
        current + step
      );

    const key =
      startTime.replace(
        ":",
        ""
      );

    result.push({

      key:
        key,

      start:
        startTime,

      end:
        endTime,

      count:
        Number(
          slots[key]?.count || 0
        )

    });

  }


  return result;

}


function getToday() {

  const now =
    new Date();

  const y =
    now.getFullYear();

  const m =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const d =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );

  return (
    `${y}/${m}/${d}`
  );

}


function getBoardingTime(endTime) {

  const minutes =
    timeToMinutes(
      endTime
    ) + 5;

  return minutesToTime(
    minutes
  );

}


function getFlightNumber(number) {

  const numeric =
    Number(
      String(number)
        .replace(
          /\D/g,
          ""
        )
    );

  return (
    "DREAM" +
    String(numeric).padStart(
      3,
      "0"
    )
  );

}


// ==============================
// 時間枠の状態
// ==============================

function getSlotStatus(
  count,
  max
) {

  const remaining =
    Math.max(
      0,
      max - count
    );


  if (
    remaining <= 0
  ) {

    return {
      type:
        "full",

      icon:
        "🔴",

      text:
        "満員",

      disabled:
        true
    };

  }


  if (
    remaining <= 2
  ) {

    return {
      type:
        "low",

      icon:
        "🟡",

      text:
        `残り${remaining}枠`,

      disabled:
        false
    };

  }


  return {
    type:
      "available",

    icon:
      "🟢",

    text:
      `残り${remaining}枠`,

    disabled:
      false
  };

}


// ==============================
// 予約フォーム表示
// ==============================

function showBookingArea() {

  const area =
    document.getElementById(
      "bookingArea"
    );

  if (!area) return;

  area.hidden =
    false;

  area.style.display =
    "";


  const button =
    document.getElementById(
      "reserve"
    );

  if (button) {

    button.disabled =
      false;

    button.textContent =
      "搭乗券を予約する";

  }


  renderSlots();

  updateInfo();

}


// ==============================
// 予約フォーム非表示
// ==============================

function hideBookingArea() {

  const area =
    document.getElementById(
      "bookingArea"
    );

  if (!area) return;

  area.hidden =
    true;

  area.style.display =
    "none";

}


// ==============================
// 搭乗券エリア非表示
// ==============================

function hideReservationArea() {

  const area =
    document.getElementById(
      "reservationArea"
    );

  if (!area) return;

  area.hidden =
    true;

  area.style.display =
    "none";

  area.innerHTML =
    "";

}


// ==============================
// 予約完了表示
// ==============================

function showReservationComplete(
  number,
  start,
  end
) {

  const area =
    document.getElementById(
      "reservationArea"
    );

  if (!area) return;


  area.hidden =
    false;

  area.style.display =
    "";


  area.innerHTML = `

    <div class="reservation-complete">

      <div class="complete-icon">
        ✓
      </div>

      <div class="complete-title">
        予約完了！
      </div>

      <div class="complete-number">
        ${escapeHtml(
          getFlightNumber(number)
        )}
      </div>

      <div class="complete-time">
        ${escapeHtml(start)}
        ～
        ${escapeHtml(end)}
      </div>

    </div>

  `;


  setTimeout(() => {

    renderReservations();

  }, 1200);

}


// ==============================
// 時間枠表示
// ==============================

function renderSlots() {

  const select =
    document.getElementById(
      "slot"
    );

  if (!select) return;


  const currentValue =
    select.value;


  select.innerHTML = `

    <option value="">
      ご来場時間を選択してください
    </option>

  `;


  const generatedSlots =
    generateSlots();


  generatedSlots.forEach(
    slot => {

      const count =
        Number(
          slot.count || 0
        );

      const max =
        Number(
          settings.maxGroups || 0
        );


      const status =
        getSlotStatus(
          count,
          max
        );


      const option =
        document.createElement(
          "option"
        );


      option.value =
        slot.key;


      option.textContent =
        `${status.icon} ` +
        `${slot.start} ～ ${slot.end}` +
        `（${status.text}）`;


      option.disabled =
        status.disabled;


      select.appendChild(
        option
      );

    }
  );


  if (
    currentValue &&
    [...select.options].some(
      option =>
        option.value ===
          currentValue &&
        !option.disabled
    )
  ) {

    select.value =
      currentValue;

  }

}


// ==============================
// 枠情報
// ==============================

function updateInfo() {

  const info =
    document.getElementById(
      "slotInfo"
    );

  if (!info) return;


  const generatedSlots =
    generateSlots();


  const total =
    generatedSlots.reduce(
      (sum, slot) =>
        sum +
        Number(
          slot.count || 0
        ),
      0
    );


  const max =
    generatedSlots.reduce(
      (sum, slot) =>
        sum +
        Number(
          settings.maxGroups || 0
        ),
      0
    );


  info.textContent =
    `現在 ${total}組 / 最大 ${max}組`;

}


// ==============================
// 予約ボタン状態
// ==============================

function updateReserveButton() {

  const button =
    document.getElementById(
      "reserve"
    );

  if (!button) return;


  const localReservation =
    getLocalReservation();


  if (localReservation) {

    button.disabled =
      true;

    button.textContent =
      "予約済み";

    return;

  }


  button.disabled =
    false;

  button.textContent =
    "搭乗券を予約する";

}


// ==============================
// 搭乗券表示
// ==============================

function renderReservations() {

  const area =
    document.getElementById(
      "reservationArea"
    );

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
   * Firebase上の予約
   */

  const remoteReservation =
    reservations[
      localReservation.number
    ];


  /*
   * 搭乗済み
   */

  if (
    remoteReservation &&
    remoteReservation.status ===
      "completed"
  ) {

    clearLocalReservation();

    hideReservationArea();

    showBookingArea();

    return;

  }


  /*
   * Firebaseにまだ存在しない場合
   *
   * 予約直後の同期待ち
   */

  if (!remoteReservation) {

    return;

  }


  /*
   * 予約フォームを消す
   */

  hideBookingArea();


  area.hidden =
    false;

  area.style.display =
    "";


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
    getFlightNumber(
      number
    );


  const boardingTime =
    getBoardingTime(
      end
    );


  area.innerHTML = `

    <div class="boarding-pass">


      <div class="boarding-pass-header">

        <div>

          <h2>
            1-B出口 搭乗券
          </h2>

          <p>
            出口ドリームスカイライン
          </p>

        </div>


        <strong>
          ${escapeHtml(flight)}
        </strong>

      </div>


      <div class="boarding-pass-main">


        <div class="boarding-arrival">

          <span>
            ご来場時間
          </span>

          <strong>
            ${escapeHtml(start)}
            ～
            ${escapeHtml(end)}
          </strong>

        </div>


        <div class="boarding-info-grid">


          <div>

            <span>
              DATE
            </span>

            <strong>
              ${escapeHtml(
                getToday()
              )}
            </strong>

          </div>


          <div>

            <span>
              GATE
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
              ${escapeHtml(size)}名
            </strong>

          </div>


        </div>


        <div class="boarding-pass-passenger">

          <span>
            代表者
          </span>

          <strong>
            ${escapeHtml(name)}
          </strong>

        </div>


      </div>


      <div class="boarding-pass-footer">


        <div
          class="boarding-note"
          style="
            color: #315d78;
          "
        >

          <div>
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
          id="cancel-reservation"
          class="cancel-reservation"
          type="button"
        >
          予約をキャンセルする
        </button>


      </div>


    </div>

  `;


  const cancelButton =
    document.getElementById(
      "cancel-reservation"
    );


  if (cancelButton) {

    cancelButton.addEventListener(
      "click",
      cancelReservation
    );

  }

}


// ==============================
// 予約処理
// ==============================

async function reserve() {

  const error =
    document.getElementById(
      "error"
    );


  if (error) {

    error.textContent =
      "";

  }


  /*
   * Firebase匿名ログイン
   */

  if (!auth.currentUser) {

    try {

      await signInAnonymously(
        auth
      );

    } catch (e) {

      if (error) {

        error.textContent =
          "接続できませんでした。もう一度お試しください。";

      }

      return;

    }

  }


  /*
   * すでに予約済み
   */

  const existing =
    getLocalReservation();


  if (existing) {

    renderReservations();

    return;

  }


  /*
   * 受付停止
   */

  if (!settings.open) {

    if (error) {

      error.textContent =
        "現在、予約受付を停止しています。";

    }

    return;

  }


  /*
   * 入力取得
   */

  const nameInput =
    document.getElementById(
      "name"
    );


  const sizeInput =
    document.getElementById(
      "size"
    );


  const slotSelect =
    document.getElementById(
      "slot"
    );


  const name =
    nameInput?.value.trim() ||
    "";


  const size =
    Number(
      sizeInput?.value || 0
    );


  const slotKey =
    slotSelect?.value ||
    "";


  /*
   * 名前チェック
   */

  if (!name) {

    if (error) {

      error.textContent =
        "代表者名を入力してください。";

    }

    return;

  }


  /*
   * 人数チェック
   */

  if (
    size < 1 ||
    size > 4
  ) {

    if (error) {

      error.textContent =
        "人数は1〜4名で入力してください。";

    }

    return;

  }


  /*
   * 時間チェック
   */

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
      slot =>
        slot.key ===
        slotKey
    );


  if (!selectedSlot) {

    if (error) {

      error.textContent =
        "選択した時間枠が見つかりません。";

    }

    return;

  }


  /*
   * すでに満員になっていないか確認
   */

  const latestCount =
    Number(
      slots[slotKey]?.count || 0
    );

  const maxGroups =
    Number(
      settings.maxGroups || 0
    );


  if (
    latestCount >= maxGroups
  ) {

    if (error) {

      error.textContent =
        "申し訳ありません。この時間枠は満員になりました。";

    }

    renderSlots();

    return;

  }


  const slotRef =
    ref(
      db,
      `Queue/slots/${slotKey}/count`
    );


  /*
   * ボタンを処理中にする
   */

  const button =
    document.getElementById(
      "reserve"
    );


  if (button) {

    button.disabled =
      true;

    button.textContent =
      "予約処理中…";

  }


  let slotIncremented =
    false;


  try {

    /*
     * 枠を確保
     */

    const slotResult =
      await runTransaction(
        slotRef,
        current => {

          const count =
            Number(
              current || 0
            );


          if (
            count >=
            maxGroups
          ) {

            return;

          }


          return count + 1;

        }
      );


    if (
      !slotResult.committed
    ) {

      throw new Error(
        "この時間枠は満員です。"
      );

    }


    slotIncremented =
      true;


    /*
     * 予約番号
     */

    const lastRef =
      ref(
        db,
        "Queue/reservationLast"
      );


    const numberResult =
      await runTransaction(
        lastRef,
        current =>
          Number(
            current || 0
          ) + 1
      );


    if (
      !numberResult.committed
    ) {

      throw new Error(
        "予約番号の発行に失敗しました。"
      );

    }


    const reservationNumber =
      Number(
        numberResult.snapshot.val()
      );


    /*
     * 予約データ
     */

    const reservation = {

      number:
        reservationNumber,

      name:
        name,

      slot:
        slotKey,

      start:
        selectedSlot.start,

      end:
        selectedSlot.end,

      size:
        size,

      type:
        "web",

      status:
        "reserved",

      createdAt:
        Date.now()

    };


    /*
     * Firebaseへ保存
     */

    await set(
      ref(
        db,
        `Queue/reservations/${reservationNumber}`
      ),
      reservation
    );


    /*
     * 自分の予約を保存
     */

    saveLocalReservation(
      reservation
    );


    reservations[
      reservationNumber
    ] =
      reservation;


    /*
     * 名前入力をクリア
     */

    if (nameInput) {

      nameInput.value =
        "";

    }


    /*
     * 予約フォームを消す
     */

    hideBookingArea();


    /*
     * 搭乗券表示
     */

    renderReservations();


  } catch (e) {

    /*
     * 失敗した場合は枠を戻す
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
              Number(
                current || 0
              );

            return Math.max(
              0,
              count - 1
            );

          }
        );

      } catch {

        // 何もしない

      }

    }


    if (error) {

      error.textContent =
        e?.message ||
        "予約できませんでした。もう一度お試しください。";

    }


    renderSlots();


  } finally {

    /*
     * 予約が残っていない場合だけ
     * ボタンを元に戻す
     */

    if (
      !getLocalReservation()
    ) {

      updateReserveButton();

    }

  }

}


// ==============================
// キャンセル
// ==============================

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


  selfCancelInProgress =
    true;


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
     * 枠を1つ戻す
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
          Number(
            current || 0
          );

        return Math.max(
          0,
          count - 1
        );

      }
    );


    /*
     * 自分の予約を削除
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

      selfCancelInProgress =
        false;

    }, 500);

  }

}


// ==============================
// Firebase：設定
// ==============================

onValue(
  ref(
    db,
    "Queue/settings"
  ),
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


// ==============================
// Firebase：時間枠
// ==============================

onValue(
  ref(
    db,
    "Queue/slots"
  ),
  snapshot => {

    slots =
      snapshot.val() ||
      {};


    renderSlots();

    updateInfo();

  }
);


// ==============================
// Firebase：予約
// ==============================

onValue(
  ref(
    db,
    "Queue/reservations"
  ),
  snapshot => {

    reservations =
      snapshot.val() ||
      {};


    const localReservation =
      getLocalReservation();


    /*
     * 搭乗済みになった場合
     */

    if (localReservation) {

      const remote =
        reservations[
          localReservation.number
        ];


      if (
        remote &&
        remote.status ===
          "completed"
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


// ==============================
// Firebase：予約削除
// ==============================

onChildRemoved(
  ref(
    db,
    "Queue/reservations"
  ),
  snapshot => {

    const removedNumber =
      snapshot.key;


    const localReservation =
      getLocalReservation();


    if (
      localReservation &&
      String(
        localReservation.number
      ) ===
        String(
          removedNumber
        )
    ) {

      if (
        selfCancelInProgress
      ) {

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


// ==============================
// Firebase：全体リセット
// ==============================

onValue(
  ref(
    db,
    "Queue/resetAt"
  ),
  snapshot => {

    const value =
      Number(
        snapshot.val() ||
        0
      );


    const localValue =
      getLocalResetAt();


    if (
      value > 0 &&
      value > localValue
    ) {

      lastResetAt =
        value;


      saveLocalResetAt(
        value
      );


      clearLocalReservation();


      hideReservationArea();

      showBookingArea();

    }

  }
);


// ==============================
// 予約ボタン
// ==============================

const reserveButton =
  document.getElementById(
    "reserve"
  );


if (reserveButton) {

  reserveButton.addEventListener(
    "click",
    reserve
  );

}


// ==============================
// 初期表示
// ==============================

const localReservation =
  getLocalReservation();


if (localReservation) {

  hideBookingArea();

  renderReservations();

} else {

  hideReservationArea();

  showBookingArea();

}