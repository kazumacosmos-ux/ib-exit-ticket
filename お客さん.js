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
   設定
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
   キャンセルメッセージ
   ========================================= */

function showCancellationMessage(
  number
) {

  const currentNumber =
    String(number);

  if (
    cancellationMessageNumber !== null &&
    String(
      cancellationMessageNumber
    ) === currentNumber
  ) {

    return;
  }

  cancellationMessageNumber =
    currentNumber;

  alert(
    "予約がキャンセルされました。"
  );
}


/* =========================================
   時刻処理
   ========================================= */

function toMinutes(time) {

  if (
    !time ||
    typeof time !== "string"
  ) {

    return 0;
  }

  const parts =
    time.split(":");

  if (parts.length < 2) {
    return 0;
  }

  const hour =
    Number(parts[0]);

  const minute =
    Number(parts[1]);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {

    return 0;
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
   設定値の安全取得
   ========================================= */

function getStartMinutes() {

  const value =
    toMinutes(
      settings.start
    );

  if (
    value >= 0 &&
    value < 24 * 60
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
    value > 0 &&
    value <= 24 * 60
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

function createSlots() {

  const result = {};

  const start =
    getStartMinutes();

  const end =
    getEndMinutes();

  const slotMinutes =
    getSlotMinutes();


  /*
   * 開始時刻・終了時刻がおかしい場合でも
   * 必ず標準設定へ戻す。
   */

  if (
    end <= start ||
    slotMinutes <= 0
  ) {

    return createDefaultSlots();
  }


  for (
    let minutes = start;
    minutes < end;
    minutes += slotMinutes
  ) {

    const slotEnd =
      minutes + slotMinutes;


    /*
     * 終了時刻を超える中途半端な枠は作らない。
     */

    if (
      slotEnd > end
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


  /*
   * 何らかの理由で0件になった場合、
   * 標準設定を表示する。
   */

  if (
    Object.keys(result).length === 0
  ) {

    return createDefaultSlots();
  }


  return result;
}


/* =========================================
   標準時間帯
   ========================================= */

function createDefaultSlots() {

  const result = {};

  const start = 9 * 60;
  const end = 15 * 60;
  const slotMinutes = 60;


  for (
    let minutes = start;
    minutes < end;
    minutes += slotMinutes
  ) {

    const slotEnd =
      minutes + slotMinutes;

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
   予約フォームの時間帯表示
   ========================================= */

function renderSlots() {

  const select =
    $("slot");


  if (!select) {

    console.warn(
      "HTMLに id=\"slot\" がありません。"
    );

    return;
  }


  /*
   * 現在選択されている値を保存。
   * Firebase更新時に毎回09:00へ
   * 戻ってしまうのを防ぐ。
   */

  const previousValue =
    select.value;


  /*
   * 一旦すべて削除。
   */

  select.innerHTML =
    "";


  /*
   * 時間帯を生成。
   */

  const generatedSlots =
    createSlots();


  const slotList =
    Object.values(
      generatedSlots
    );


  /*
   * 時間帯が作れない場合の保険。
   */

  if (
    slotList.length === 0
  ) {

    const option =
      document.createElement(
        "option"
      );

    option.value = "";

    option.textContent =
      "搭乗時刻を選択できません";

    option.disabled = true;

    option.selected = true;

    select.appendChild(
      option
    );

    return;
  }


  let firstAvailable = null;


  slotList.forEach(
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
        `${slot.start}～${slot.end}`;


      option.disabled =
        isFull;


      /*
       * 前回選択していた時間帯が
       * まだ存在していて空いていれば維持。
       */

      if (
        slot.key === previousValue &&
        !isFull
      ) {

        option.selected =
          true;
      }


      if (
        !isFull &&
        firstAvailable === null
      ) {

        firstAvailable =
          slot.key;
      }


      select.appendChild(
        option
      );
    }
  );


  /*
   * 前回の選択が使えなかった場合は
   * 最初の空き枠を選択。
   */

  if (
    !generatedSlots[
      previousValue
    ] ||
    Number(
      slots[
        previousValue
      ]?.count || 0
    ) >= getMaxGroups()
  ) {

    if (
      firstAvailable !== null
    ) {

      select.value =
        firstAvailable;

    } else {

      /*
       * 全枠満員の場合は
       * 最初の枠を表示。
       */

      select.value =
        slotList[0].key;
    }
  }


  /*
   * HTMLのselectを強制的に
   * 再描画させる。
   */

  select.dispatchEvent(
    new Event(
      "change",
      {
        bubbles: true
      }
    )
  );
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

    const remaining =
      maxGroups - count;


    info.textContent =
      `残り ${remaining} 組`;
  }
}


/* =========================================
   予約ボタン状態
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


  if (
    settings.open === false ||
    count >= maxGroups
  ) {

    button.disabled =
      true;

  } else {

    button.disabled =
      false;
  }
}


/* =========================================
   搭乗券表示
   ========================================= */

function renderReservations() {

  const reservationArea =
    $("reservationArea");

  const reserveArea =
    $("reserveArea");


  if (
    !reservationArea ||
    !reserveArea
  ) {

    return;
  }


  const localReservation =
    getLocalReservation();


  if (!localReservation) {

    reservationArea.hidden =
      true;

    reservationArea.innerHTML =
      "";

    reserveArea.hidden =
      settings.open === false;

    return;
  }


  const number =
    String(
      localReservation.number
    );


  /*
   * Firebaseの最新データを優先。
   * まだ取得できていなければ
   * LocalStorageを使う。
   */

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

    reserveArea.hidden =
      settings.open === false;

    return;
  }


  reservationArea.hidden =
    false;

  reserveArea.hidden =
    true;


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

if ($("reserve")) {

  $("reserve").onclick =
    async () => {

      const error =
        $("error");


      if (error) {

        error.textContent =
          "";
      }


      /* -------------------------
         既存予約チェック
         ------------------------- */

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


      /* -------------------------
         受付状態
         ------------------------- */

      if (
        settings.open === false
      ) {

        if (error) {

          error.textContent =
            "現在受付停止中です。";
        }

        return;
      }


      /* -------------------------
         入力取得
         ------------------------- */

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
            "予約フォームの読み込みに失敗しました。ページを再読み込みしてください。";
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


      /* -------------------------
         入力チェック
         ------------------------- */

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


      /* -------------------------
         最新の空き状況確認
         ------------------------- */

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


      /* -------------------------
         ボタン連打防止
         ------------------------- */

      const reserveButton =
        $("reserve");


      if (reserveButton) {

        reserveButton.disabled =
          true;
      }


      let countReserved =
        false;


      try {

        /* =========================
           枠を確保
           ========================= */

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


        /* =========================
           予約番号取得
           ========================= */

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


        /* =========================
           予約データ作成
           ========================= */

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


        /* =========================
           Firebaseへ保存
           ========================= */

        await set(
          ref(
            db,
            `Queue/reservations/${number}`
          ),
          reservation
        );


        /* =========================
           LocalStorage保存
           ========================= */

        saveLocalReservation(
          reservation
        );


        /*
         * FirebaseのonValueが返ってくる前でも
         * 今作った予約を即座に画面へ反映。
         */

        reservations[
          String(number)
        ] = reservation;


        cancellationMessageNumber =
          null;


        /* =========================
           入力欄クリア
           ========================= */

        if ($("name")) {

          $("name").value =
            "";
        }


        /* =========================
           搭乗券表示
           ========================= */

        render();


      } catch (firebaseError) {

        console.error(
          "予約保存エラー:",
          firebaseError
        );


        /*
         * 枠を確保済みなら戻す。
         */

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

          if (
            firebaseError.message ===
            "予約番号の取得に失敗しました。"
          ) {

            error.textContent =
              "予約番号の取得に失敗しました。もう一度お試しください。";

          } else {

            error.textContent =
              "予約に失敗しました。もう一度お試しください。";
          }
        }


        render();


      } finally {

        const currentReservation =
          getLocalReservation();


        if (
          !currentReservation &&
          reserveButton
        ) {

          reserveButton.disabled =
            false;
        }
      }
    };
}


/* =========================================
   予約キャンセル
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

  cancellationMessageNumber =
    null;


  try {

    /* =========================
       Firebaseから予約削除
       ========================= */

    await remove(
      ref(
        db,
        `Queue/reservations/${reservation.number}`
      )
    );


    /* =========================
       枠を1つ戻す
       ========================= */

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


    /* =========================
       LocalStorage削除
       ========================= */

    clearLocalReservation();


    /* =========================
       画面更新
       ========================= */

    if ($("reservationArea")) {

      $("reservationArea").hidden =
        true;

      $("reservationArea").innerHTML =
        "";
    }


    if ($("reserveArea")) {

      $("reserveArea").hidden =
        settings.open === false;
    }


    renderSlots();

    updateInfo();

    updateReserveButton();


  } catch (error) {

    console.error(
      "キャンセル処理に失敗しました:",
      error
    );


    selfCancelInProgress =
      false;


    alert(
      "キャンセルに失敗しました。もう一度お試しください。"
    );


    render();
  }


  setTimeout(
    () => {

      selfCancelInProgress =
        false;

    },
    1500
  );
}


/* =========================================
   Firebase：設定監視
   ========================================= */

onValue(
  ref(
    db,
    "Queue/settings"
  ),
  (snapshot) => {

    const data =
      snapshot.val();


    if (data) {

      settings = {

        start:
          typeof data.start ===
          "string"
            ? data.start
            : "09:00",

        end:
          typeof data.end ===
          "string"
            ? data.end
            : "15:00",

        slotMinutes:
          Number(
            data.slotMinutes
          ) > 0
            ? Number(
                data.slotMinutes
              )
            : 60,

        maxGroups:
          Number(
            data.maxGroups
          ) > 0
            ? Number(
                data.maxGroups
              )
            : 1,

        open:
          data.open !== false
      };

    } else {

      /*
       * Firebaseに設定が無い場合も
       * 標準設定で動かす。
       */

      settings = {

        start: "09:00",

        end: "15:00",

        slotMinutes: 60,

        maxGroups: 1,

        open: true
      };
    }


    render();
  }
);


/* =========================================
   Firebase：枠監視
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
   Firebase：予約監視
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
   Firebase：予約削除監視
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


    const removedNumber =
      String(
        removedReservation.number
      );


    /*
     * 自分自身がキャンセルした場合は
     * メッセージを表示しない。
     */

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


    const localNumber =
      String(
        localReservation.number
      );


    /*
     * 自分の予約がスタッフによって
     * 削除された場合だけ処理。
     */

    if (
      localNumber !==
      removedNumber
    ) {

      return;
    }


    clearLocalReservation();


    if ($("reservationArea")) {

      $("reservationArea").hidden =
        true;

      $("reservationArea").innerHTML =
        "";
    }


    if ($("reserveArea")) {

      $("reserveArea").hidden =
        settings.open === false;
    }


    showCancellationMessage(
      removedNumber
    );


    renderSlots();

    updateInfo();

    updateReserveButton();
  }
);


/* =========================================
   Firebase：全体リセット監視
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


    /*
     * 初回アクセス時。
     *
     * Firebaseの現在のresetAtが
     * LocalStorageに記録されていない場合、
     * その値を保存する。
     */

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


    /*
     * 以前より新しいリセットなら
     * この端末の古い予約を削除する。
     */

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


      if ($("reservationArea")) {

        $("reservationArea").hidden =
          true;

        $("reservationArea").innerHTML =
          "";
      }


      if ($("reserveArea")) {

        $("reserveArea").hidden =
          settings.open === false;
      }


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
   * 予約済みの場合
   */

  if (localReservation) {

    renderReservations();

    return;
  }


  /*
   * 予約前画面
   */

  renderSlots();

  updateInfo();

  updateReserveButton();


  if ($("closedArea")) {

    $("closedArea").hidden =
      settings.open !== false;
  }


  if ($("reserveArea")) {

    $("reserveArea").hidden =
      settings.open === false;
  }


  if ($("reservationArea")) {

    $("reservationArea").hidden =
      true;

    $("reservationArea").innerHTML =
      "";
  }
}


/* =========================================
   時間帯変更
   ========================================= */

if ($("slot")) {

  $("slot").addEventListener(
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