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


  /*
   * Firebase設定が不正だった場合でも
   * 必ず時間帯を表示する。
   */

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


  const slotList =
    Object.values(
      generatedSlots
    );


  /*
   * 絶対に空欄のselectを残さない。
   */

  select.innerHTML = "";


  /*
   * 念のため、生成失敗時にも
   * 標準時間帯をもう一度試す。
   */

  let finalSlotList =
    slotList;


  if (
    finalSlotList.length === 0
  ) {

    finalSlotList =
      Object.values(
        createDefaultSlots()
      );
  }


  /*
   * それでも0件ならエラー表示。
   */

  if (
    finalSlotList.length === 0
  ) {

    const option =
      document.createElement(
        "option"
      );


    option.value = "";


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


  /*
   * 前回の選択がまだ空いているなら維持。
   */

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

    /*
     * 全枠満員でも、
     * select自体は表示する。
     */

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


      /*
       * 既存予約チェック
       */

      const existing =
        getLocalReservation();


      if (existing) {

        if (error) {

          error.textContent =
            "すでに予約があります。";
        }


        render();

        return;
      }


      /*
       * 受付状態
       */

      if (
        settings.open === false
      ) {

        if (error) {

          error.textContent =
            "現在受付停止中です。";
        }

        return;
      }


      const nameInput =
        $("name");

      const sizeInput =
        $("size");

      const slotInput =
        $("slot");


      if (
        !nameInput ||
        !sizeInput ||
        !slotInput
      ) {

        if (error) {

          error.textContent =
            "予約フォームの読み込みに失敗しました。";
        }

        return;
      }


      const name =
        nameInput.value.trim();


      const size =
        Number(
          sizeInput.value
        );


      const selectedSlotKey =
        slotInput.value;


      const generatedSlots =
        createSlots();


      const slot =
        generatedSlots[
          selectedSlotKey
        ];


      if (!name) {

        if (error) {

          error.textContent =
            "代表者の名前を入力してください。";
        }

        return;
      }


      if (!slot) {

        if (error) {

          error.textContent =
            "搭乗時刻を選択してください。";
        }

        return;
      }


      if (
        size < 1 ||
        size > 4
      ) {

        if (error) {

          error.textContent =
            "人数は1～4人で入力してください。";
        }

        return;
      }


      const currentCount =
        Number(
          slots[
            slot.key
          ]?.count || 0
        );


      const maxGroups =
        getMaxGroups();


      if (
        currentCount >= maxGroups
      ) {

        if (error) {

          error.textContent =
            "その時間帯は満員になりました。";
        }


        render();

        return;
      }


      reserveButton.disabled =
        true;


      let countReserved =
        false;


      try {

        /*
         * 枠を確保
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
                Number(
                  value || 0
                );


              const max =
                getMaxGroups();


              if (
                count >= max
              ) {

                return undefined;
              }


              return count + 1;
            }
          );


        if (
          !countResult.committed
        ) {

          if (error) {

            error.textContent =
              "その時間帯は満員になりました。";
          }


          render();

          return;
        }


        countReserved =
          true;


        /*
         * 予約番号
         */

        const lastRef =
          ref(
            db,
            "Queue/reservationLast"
          );


        const lastResult =
          await runTransaction(
            lastRef,
            (value) =>
              Number(
                value || 0
              ) + 1
          );


        if (
          !lastResult.committed
        ) {

          throw new Error(
            "予約番号の取得に失敗しました。"
          );
        }


        const number =
          lastResult.snapshot.val();


        /*
         * 予約データ
         */

        const reservation = {

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
            "web",

          createdAt:
            Date.now()
        };


        /*
         * Firebase保存
         */

        await set(
          ref(
            db,
            `Queue/reservations/${number}`
          ),
          reservation
        );


        /*
         * ローカル保存
         */

        saveLocalReservation(
          reservation
        );


        /*
         * 即座に画面へ反映
         */

        reservations[
          String(number)
        ] = reservation;


        cancellationMessageNumber =
          null;


        if ($("name")) {

          $("name").value =
            "";
        }


        render();


      } catch (firebaseError) {

        console.error(
          "予約保存エラー:",
          firebaseError
        );


        if (countReserved) {

          try {

            await runTransaction(
              ref(
                db,
                `Queue/slots/${slot.key}/count`
              ),
              (value) =>
                Math.max(
                  0,
                  Number(
                    value || 0
                  ) - 1
                )
            );

          } catch (rollbackError) {

            console.error(
              "枠の戻し処理に失敗しました:",
              rollbackError
            );
          }
        }


        if (error) {

          error.textContent =
            "予約に失敗しました。もう一度お試しください。";
        }


        render();


      } finally {

        if (
          !getLocalReservation()
        ) {

          reserveButton.disabled =
            false;
        }
      }
    };
}


/* =========================================
   キャンセル
========================================= */

async function cancelReservation(
  reservation
) {

  if (!reservation) {
    return;
  }


  const ok =
    confirm(
      "予約をキャンセルしますか？"
    );


  if (!ok) {
    return;
  }


  selfCancelInProgress =
    true;


  try {

    await remove(
      ref(
        db,
        `Queue/reservations/${reservation.number}`
      )
    );


    await runTransaction(
      ref(
        db,
        `Queue/slots/${reservation.slot}/count`
      ),
      (value) =>
        Math.max(
          0,
          Number(
            value || 0
          ) - 1
        )
    );


    clearLocalReservation();


    const reservationArea =
      $("reservationArea");


    if (reservationArea) {

      reservationArea.hidden =
        true;

      reservationArea.innerHTML =
        "";
    }


    render();


  } catch (error) {

    console.error(
      "キャンセル処理に失敗しました:",
      error
    );


    alert(
      "キャンセルに失敗しました。もう一度お試しください。"
    );


    render();

  } finally {

    setTimeout(
      () => {

        selfCancelInProgress =
          false;

      },
      1500
    );
  }
}


/* =========================================
   Firebase：設定
========================================= */

onValue(
  ref(
    db,
    "Queue/settings"
  ),
  (snapshot) => {

    const data =
      snapshot.val();


    if (
      data &&
      typeof data === "object"
    ) {

      settings = {

        start:
          typeof data.start === "string" &&
          toMinutes(data.start) >= 0
            ? data.start
            : "09:00",

        end:
          typeof data.end === "string" &&
          toMinutes(data.end) > 0
            ? data.end
            : "15:00",

        slotMinutes:
          Number(data.slotMinutes) > 0
            ? Number(data.slotMinutes)
            : 60,

        maxGroups:
          Number(data.maxGroups) > 0
            ? Number(data.maxGroups)
            : 1,

        open:
          data.open !== false
      };

    }


    render();
  }
);


/* =========================================
   Firebase：枠
========================================= */

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


/* =========================================
   Firebase：予約
========================================= */

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


/* =========================================
   Firebase：予約削除
========================================= */

onChildRemoved(
  ref(
    db,
    "Queue/reservations"
  ),
  (snapshot) => {

    const removedReservation =
      snapshot.val();


    if (!removedReservation) {
      return;
    }


    if (
      selfCancelInProgress
    ) {

      return;
    }


    const localReservation =
      getLocalReservation();


    if (!localReservation) {
      return;
    }


    if (
      String(
        localReservation.number
      ) !==
      String(
        removedReservation.number
      )
    ) {

      return;
    }


    clearLocalReservation();


    const reservationArea =
      $("reservationArea");


    if (reservationArea) {

      reservationArea.hidden =
        true;

      reservationArea.innerHTML =
        "";
    }


    alert(
      "予約がキャンセルされました。"
    );


    render();
  }
);


/* =========================================
   Firebase：全体リセット
========================================= */

onValue(
  ref(
    db,
    "Queue/resetAt"
  ),
  (snapshot) => {

    const resetAt =
      Number(
        snapshot.val() || 0
      );


    if (!resetAt) {
      return;
    }


    const savedResetAt =
      getLocalResetAt();


    if (
      savedResetAt === 0
    ) {

      saveLocalResetAt(
        resetAt
      );

      lastResetAt =
        resetAt;

      return;
    }


    if (
      resetAt > savedResetAt
    ) {

      saveLocalResetAt(
        resetAt
      );


      lastResetAt =
        resetAt;


      clearLocalReservation();


      cancellationMessageNumber =
        null;


      render();

      return;
    }


    lastResetAt =
      resetAt;
  }
);


/* =========================================
   画面描画
========================================= */

function render() {

  const localReservation =
    getLocalReservation();


  /*
   * 予約済み
   */

  if (localReservation) {

    renderReservations();

    return;
  }


  /*
   * 予約前
   */

  renderSlots();

  updateInfo();

  updateReserveButton();


  const closedArea =
    $("closedArea");


  if (closedArea) {

    closedArea.hidden =
      settings.open !== false;
  }


  const reservationArea =
    $("reservationArea");


  if (reservationArea) {

    reservationArea.hidden =
      true;

    reservationArea.innerHTML =
      "";
  }
}


/* =========================================
   時間変更
========================================= */

const slotSelect =
  $("slot");


if (slotSelect) {

  slotSelect.addEventListener(
    "change",
    () => {

      updateInfo();

      updateReserveButton();
    }
  );
}


/* =========================================
   初回描画
========================================= */

render();