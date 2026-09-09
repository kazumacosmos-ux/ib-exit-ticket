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
   DOM
========================================= */

const $ = (id) => document.getElementById(id);


/* =========================================
   データ
========================================= */

let settings = {
  start: "09:00",
  end: "15:00",
  slotMinutes: 60,
  maxGroups: 1,
  open: true
};

let slots = {};
let reservations = {};


/* =========================================
   キャンセル処理状態
========================================= */

/*
  お客さん自身がキャンセルボタンを押した場合、

  remove()
      ↓
  Firebaseの削除通知
      ↓
  onChildRemoved()

  という流れになります。

  そのため、キャンセル処理中だけ
  onChildRemoved()側のメッセージを
  出さないようにします。
*/

let selfCancelInProgress = false;


/*
  同じキャンセルについて
  完了メッセージを2回出さないためのフラグ
*/

let cancellationMessageShown = false;


/* =========================================
   localStorage
========================================= */

const RESERVATION_KEY =
  "ib_reservation";


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


/* =========================================
   キャンセル完了メッセージ
========================================= */

function showCancellationMessage() {

  if (
    cancellationMessageShown
  ) {
    return;
  }

  cancellationMessageShown = true;

  alert(
    "予約がキャンセルされました。"
  );
}


/* =========================================
   時間計算
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


function slotKey(minutes) {

  return (
    String(
      Math.floor(minutes / 60)
    ).padStart(2, "0") +
    "-" +
    String(
      minutes % 60
    ).padStart(2, "0")
  );
}


/* =========================================
   時間帯作成
========================================= */

function createSlots() {

  const result = {};

  const start =
    toMinutes(
      settings.start ||
      "09:00"
    );

  const end =
    toMinutes(
      settings.end ||
      "15:00"
    );

  const slotMinutes =
    Number(
      settings.slotMinutes ||
      60
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
      minutes +
      slotMinutes;

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

function getBoardingTime(
  endTime
) {

  const minutes =
    toMinutes(endTime);

  return formatTime(
    minutes + 5
  );
}


/* =========================================
   予約番号
========================================= */

function getFlightNumber(
  number
) {

  return (
    "DREAM" +
    String(number).padStart(
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
   時間帯セレクト
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
          slots[
            slot.key
          ]?.count || 0
        );

      const maxGroups =
        Number(
          settings.maxGroups ||
          1
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
   選択中の時間帯情報
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
      slots[
        slot.key
      ]?.count || 0
    );

  const maxGroups =
    Number(
      settings.maxGroups ||
      1
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
   予約ボタンの状態
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
      slots[
        slot.key
      ]?.count || 0
    );

  const maxGroups =
    Number(
      settings.maxGroups ||
      1
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
   予約表示
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

  const remoteReservation =
    reservations[number];

  /*
    Firebaseから予約が消えた直後は
    onChildRemoved()が処理するので、
    ここではメッセージを出さない。
  */

  if (!remoteReservation) {

    reservationArea.hidden =
      true;

    return;
  }

  const reservation =
    remoteReservation;

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
      () =>
        cancelReservation(
          reservation
        );
  }
}


/* =========================================
   予約する
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


      const existing =
        getLocalReservation();

      if (existing) {

        if (error) {

          error.textContent =
            "すでに予約があります。";
        }

        return;
      }


      if (
        settings.open === false
      ) {

        if (error) {

          error.textContent =
            "現在受付停止中です。";
        }

        return;
      }


      const name =
        $("name")
          .value
          .trim();

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


      /* -----------------------------
         時間枠の人数を確保
      ----------------------------- */

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

            const maxGroups =
              Number(
                settings.maxGroups ||
                1
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


      /* -----------------------------
         予約番号を取得
      ----------------------------- */

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

        await runTransaction(
          countRef,
          (value) =>
            Math.max(
              0,
              Number(
                value || 0
              ) - 1
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


      /* -----------------------------
         Firebaseに予約保存
      ----------------------------- */

      try {

        await set(
          ref(
            db,
            `Queue/reservations/${number}`
          ),
          reservation
        );


        saveLocalReservation(
          reservation
        );


        $("name").value =
          "";


        render();


      } catch (firebaseError) {

        console.error(
          "予約保存エラー:",
          firebaseError
        );


        await runTransaction(
          countRef,
          (value) =>
            Math.max(
              0,
              Number(
                value || 0
              ) - 1
            )
        );


        if (error) {

          error.textContent =
            "予約に失敗しました。もう一度お試しください。";
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


  /* -----------------------------
     キャンセル確認
  ----------------------------- */

  const ok =
    confirm(
      "予約をキャンセルしますか？"
    );


  if (!ok) {
    return;
  }


  /*
    ★重要

    Firebaseの削除通知が先に
    メッセージを出さないようにする。
  */

  selfCancelInProgress =
    true;


  /*
    次のキャンセル完了メッセージを
    1回だけ許可する。
  */

  cancellationMessageShown =
    false;


  try {

    /* -----------------------------
       Firebaseから予約を削除
    ----------------------------- */

    await remove(
      ref(
        db,
        `Queue/reservations/${reservation.number}`
      )
    );


    /* -----------------------------
       時間枠の人数を1減らす
    ----------------------------- */

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


    /* -----------------------------
       localStorageの予約を削除
    ----------------------------- */

    clearLocalReservation();


    /* -----------------------------
       予約画面を消す
    ----------------------------- */

    if (
      $("reservationArea")
    ) {

      $("reservationArea").hidden =
        true;

      $("reservationArea").innerHTML =
        "";
    }


    /* -----------------------------
       予約画面を戻す
    ----------------------------- */

    if (
      $("reserveArea")
    ) {

      $("reserveArea").hidden =
        settings.open === false;
    }


    /* -----------------------------
       時間帯を更新
    ----------------------------- */

    renderSlots();

    updateInfo();

    updateReserveButton();


    /*
      ★ここで1回だけ表示
    */

    showCancellationMessage();


  } catch (error) {

    console.error(
      "キャンセル処理に失敗しました:",
      error
    );


    /*
      エラーの場合は
      キャンセル処理中フラグを解除
    */

    selfCancelInProgress =
      false;


    alert(
      "キャンセルに失敗しました。もう一度お試しください。"
    );


    render();

    return;
  }


  /*
    Firebaseの削除イベントが
    すでに発生している可能性があるため、
    少しだけ待ってから解除する。

    これにより、
    onChildRemoved()が
    もう一度メッセージを出すことを防ぐ。
  */

  setTimeout(
    () => {

      selfCancelInProgress =
        false;

      cancellationMessageShown =
        false;

    },
    1000
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
   Firebase：時間枠監視
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

    /*
      ★お客さん自身がキャンセル中なら
      ここでは何もしない。

      cancelReservation()側で
      1回だけメッセージを出す。
    */

    if (
      selfCancelInProgress
    ) {

      return;
    }


    const removedReservation =
      snapshot.val();

    if (!removedReservation) {
      return;
    }


    const localReservation =
      getLocalReservation();

    if (!localReservation) {
      return;
    }


    /*
      自分の予約番号と違う削除なら
      何もしない。
    */

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


    /* -----------------------------
       ローカルの予約を削除
    ----------------------------- */

    clearLocalReservation();


    /* -----------------------------
       予約画面を消す
    ----------------------------- */

    if (
      $("reservationArea")
    ) {

      $("reservationArea").hidden =
        true;

      $("reservationArea").innerHTML =
        "";
    }


    /* -----------------------------
       予約画面を戻す
    ----------------------------- */

    if (
      $("reserveArea")
    ) {

      $("reserveArea").hidden =
        settings.open === false;
    }


    /*
      ★スタッフ削除の場合も
      同じメッセージを1回だけ表示
    */

    showCancellationMessage();
  }
);


/* =========================================
   全体描画
========================================= */

function render() {

  const localReservation =
    getLocalReservation();


  if (localReservation) {

    const number =
      String(
        localReservation.number
      );

    const remoteReservation =
      reservations[number];


    if (
      remoteReservation
    ) {

      renderReservations();

    } else {

      /*
        Firebaseから削除された直後は
        onChildRemoved()が処理するため、
        ここではメッセージを出さない。
      */

      if (
        $("reservationArea")
      ) {

        $("reservationArea").hidden =
          true;
      }
    }

    return;
  }


  renderSlots();

  updateInfo();

  updateReserveButton();


  if (
    $("closedArea")
  ) {

    $("closedArea").hidden =
      settings.open !== false;
  }


  if (
    $("reserveArea")
  ) {

    $("reserveArea").hidden =
      settings.open === false;
  }


  if (
    $("reservationArea")
  ) {

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
   初期表示
========================================= */

render();