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


function getLocalReservation() {
  try {
    const value = localStorage.getItem(RESERVATION_KEY);

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


function saveLocalReservation(reservation) {
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


/* =========================================
   キャンセルメッセージ
   ========================================= */

function showCancellationMessage(number) {

  const currentNumber = String(number);

  if (
    cancellationMessageNumber !== null &&
    String(cancellationMessageNumber) === currentNumber
  ) {
    return;
  }

  cancellationMessageNumber = currentNumber;

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

  const parts = time.split(":");

  const hour = Number(parts[0]);
  const minute = Number(parts[1]);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return 0;
  }

  return hour * 60 + minute;
}


function formatTime(totalMinutes) {

  const hour =
    Math.floor(totalMinutes / 60);

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

function slotKey(minutes) {

  return (
    String(
      Math.floor(minutes / 60)
    ).padStart(2, "0") +
    "-" +
    String(minutes % 60).padStart(2, "0")
  );
}


/* =========================================
   時間帯生成
   ========================================= */

function createSlots() {

  const result = {};

  const start =
    toMinutes(
      settings.start || "09:00"
    );

  const end =
    toMinutes(
      settings.end || "15:00"
    );

  const slotMinutes =
    Number(
      settings.slotMinutes || 60
    );

  if (
    slotMinutes <= 0 ||
    end <= start
  ) {
    return result;
  }

  for (
    let minutes = start;
    minutes < end;
    minutes += slotMinutes
  ) {

    const slotEnd =
      minutes + slotMinutes;

    if (slotEnd > end) {
      break;
    }

    const key =
      slotKey(minutes);

    result[key] = {
      key,
      start: formatTime(minutes),
      end: formatTime(slotEnd)
    };
  }

  return result;
}


/* =========================================
   今日の日付
   ========================================= */

function getToday() {

  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return (
    `${year}/${month}/${day}`
  );
}


/* =========================================
   搭乗時刻
   ========================================= */

function getBoardingTime(endTime) {

  const minutes =
    toMinutes(endTime);

  return formatTime(
    minutes + 5
  );
}


/* =========================================
   便名
   ========================================= */

function getFlightNumber(number) {

  return (
    "DREAM" +
    String(number).padStart(3, "0")
  );
}


/* =========================================
   HTMLエスケープ
   ========================================= */

function escapeHtml(value) {

  return String(value).replace(
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
    return;
  }

  select.innerHTML = "";

  const generatedSlots =
    createSlots();

  const slotList =
    Object.values(
      generatedSlots
    );

  if (
    slotList.length === 0
  ) {

    const option =
      document.createElement(
        "option"
      );

    option.value = "";

    option.textContent =
      "時間帯を設定できません";

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
          slots[slot.key]?.count || 0
        );

      const maxGroups =
        Number(
          settings.maxGroups || 1
        );

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

  if (
    firstAvailable !== null
  ) {

    select.value =
      firstAvailable;

  } else {

    select.value =
      slotList[0].key;
  }
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

    info.textContent = "";

    return;
  }

  const count =
    Number(
      slots[slot.key]?.count || 0
    );

  const maxGroups =
    Number(
      settings.maxGroups || 1
    );

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
    return;
  }

  const generatedSlots =
    createSlots();

  const slot =
    generatedSlots[
      select.value
    ];

  if (!slot) {

    button.disabled = true;

    return;
  }

  const count =
    Number(
      slots[slot.key]?.count || 0
    );

  const maxGroups =
    Number(
      settings.maxGroups || 1
    );

  if (
    settings.open === false ||
    count >= maxGroups
  ) {

    button.disabled = true;

  } else {

    button.disabled = false;
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
   * 重要：
   * Firebaseからまだ reservations が
   * 更新されていない場合でも、
   * localStorageに保存されている予約を
   * 一時的に使えるようにする。
   */

  const remoteReservation =
    reservations[number];

  const reservation =
    remoteReservation ||
    localReservation;

  if (!reservation) {

    reservationArea.hidden =
      true;

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

      const name =
        $("name").value.trim();

      const size =
        Number(
          $("size").value
        );

      const selectedSlotKey =
        $("slot").value;

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
            "時間帯を選択してください。";

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
         ボタン連打防止
         ------------------------- */

      const reserveButton =
        $("reserve");

      if (reserveButton) {

        reserveButton.disabled =
          true;
      }


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
                Number(value || 0);

              const maxGroups =
                Number(
                  settings.maxGroups || 1
                );

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

          if (error) {

            error.textContent =
              "その時間帯は満員になりました。";

          }

          render();

          return;
        }


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


          if (error) {

            error.textContent =
              "予約番号の取得に失敗しました。";

          }

          return;
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
         * 重要修正
         *
         * FirebaseのonValueが返ってくる前でも
         * 今作った予約を画面側のreservationsへ
         * 即座に入れる。
         */

        reservations[
          String(number)
        ] = reservation;


        cancellationMessageNumber =
          null;


        /* =========================
           入力欄をクリア
           ========================= */

        if ($("name")) {

          $("name").value =
            "";

        }


        /* =========================
           搭乗券を即表示
           ========================= */

        render();


      } catch (firebaseError) {

        console.error(
          "予約保存エラー:",
          firebaseError
        );


        /*
         * 予約保存に失敗した場合は
         * 確保した枠を戻す
         */

        try {

          await runTransaction(
            ref(
              db,
              `Queue/slots/${slot.key}/count`
            ),
            (value) =>
              Math.max(
                0,
                Number(value || 0) - 1
              )
          );

        } catch (rollbackError) {

          console.error(
            "枠の戻し処理に失敗しました:",
            rollbackError
          );
        }


        if (error) {

          error.textContent =
            "予約に失敗しました。もう一度お試しください。";

        }

        render();


      } finally {

        /*
         * 予約成功時は搭乗券表示中なので
         * ボタン自体は非表示。
         *
         * 失敗時だけ再び押せるようにする。
         */

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
          Number(value || 0) - 1
        )
    );


    /* =========================
       LocalStorage削除
       ========================= */

    clearLocalReservation();


    /*
     * 自分の予約を削除した場合は
     * FirebaseのonChildRemovedから
     * メッセージを出さない。
     *
     * 予約者本人のキャンセル時は
     * ここではメッセージを出さず、
     * 画面だけ更新する。
     */

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


  /*
   * onChildRemovedの監視処理が
   * 完全に終了してからフラグを解除する。
   */

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
          data.start ||
          "09:00",

        end:
          data.end ||
          "15:00",

        slotMinutes:
          Number(
            data.slotMinutes ||
            60
          ),

        maxGroups:
          Number(
            data.maxGroups ||
            1
          ),

        open:
          data.open !== false
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
     * ここでは何もしない。
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
     * 削除された場合だけ処理する。
     */

    if (
      localNumber !==
      removedNumber
    ) {
      return;
    }


    /* =========================
       LocalStorage削除
       ========================= */

    clearLocalReservation();


    /* =========================
       画面を予約前に戻す
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


    /* =========================
       キャンセルメッセージ
       ========================= */

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


    /*
     * 初回読み込み時は
     * ただ値を記録するだけ。
     *
     * これにより、昔のresetAtを見て
     * いきなり予約を消すことを防ぐ。
     */

    if (lastResetAt === 0) {

      lastResetAt =
        resetAt;

      return;
    }


    /*
     * 新しいリセットが発生した場合
     */

    if (
      resetAt > lastResetAt
    ) {

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
    }
  }
);


/* =========================================
   画面描画
   ========================================= */

function render() {

  const localReservation =
    getLocalReservation();


  /*
   * 予約がある場合
   */

  if (localReservation) {

    const number =
      String(
        localReservation.number
      );


    const remoteReservation =
      reservations[number];


    /*
     * Firebase上に予約が存在する
     */

    if (remoteReservation) {

      renderReservations();

      return;
    }


    /*
     * Firebaseの更新待ちの場合
     *
     * localStorageの予約を使って
     * 搭乗券を表示する。
     */

    renderReservations();

    return;
  }


  /* =========================
     予約前画面
     ========================= */

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