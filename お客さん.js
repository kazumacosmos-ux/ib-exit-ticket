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
   localStorage
========================================= */

const RESERVATION_KEY = "ib_reservation";

/*
  お客さん自身がキャンセルした予約番号を
  一時的に保存する。

  Firebaseから削除されたとき、
  「スタッフによってキャンセルされました」
  を表示しないために使う。
*/
const SELF_CANCELLED_KEY = "ib_self_cancelled_reservation";


function getLocalReservation() {
  try {
    const value = localStorage.getItem(RESERVATION_KEY);

    if (!value) {
      return null;
    }

    return JSON.parse(value);

  } catch (error) {
    console.error("localStorageの読み込みに失敗しました:", error);
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
    console.error("localStorageの保存に失敗しました:", error);
  }
}


function clearLocalReservation() {
  try {
    localStorage.removeItem(RESERVATION_KEY);

  } catch (error) {
    console.error("localStorageの削除に失敗しました:", error);
  }
}


function getSelfCancelledNumber() {
  try {
    return localStorage.getItem(SELF_CANCELLED_KEY);

  } catch (error) {
    console.error(
      "キャンセル情報の読み込みに失敗しました:",
      error
    );

    return null;
  }
}


function setSelfCancelledNumber(number) {
  try {
    localStorage.setItem(
      SELF_CANCELLED_KEY,
      String(number)
    );

  } catch (error) {
    console.error(
      "キャンセル情報の保存に失敗しました:",
      error
    );
  }
}


function clearSelfCancelledNumber() {
  try {
    localStorage.removeItem(SELF_CANCELLED_KEY);

  } catch (error) {
    console.error(
      "キャンセル情報の削除に失敗しました:",
      error
    );
  }
}


/* =========================================
   時間計算
========================================= */

function toMinutes(time) {

  if (!time || typeof time !== "string") {
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


function slotKey(minutes) {

  return (
    String(Math.floor(minutes / 60)).padStart(2, "0") +
    "-" +
    String(minutes % 60).padStart(2, "0")
  );
}


/* =========================================
   時間帯作成
========================================= */

function createSlots() {

  const result = {};

  const start =
    toMinutes(settings.start || "09:00");

  const end =
    toMinutes(settings.end || "15:00");

  const slotMinutes =
    Number(settings.slotMinutes || 60);

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

    /*
      終了時刻を超える時間帯は作らない
    */
    if (slotEnd > end) {
      break;
    }

    const key = slotKey(minutes);

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
    String(now.getMonth() + 1).padStart(2, "0");

  const day =
    String(now.getDate()).padStart(2, "0");

  return `${year}/${month}/${day}`;
}


/* =========================================
   搭乗時刻
========================================= */

function getBoardingTime(endTime) {

  const minutes =
    toMinutes(endTime);

  return formatTime(minutes + 5);
}


/* =========================================
   予約番号
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
   時間帯セレクト
========================================= */

function renderSlots() {

  const select = $("slot");

  if (!select) {
    return;
  }

  select.innerHTML = "";

  const generatedSlots =
    createSlots();

  const slotList =
    Object.values(generatedSlots);

  if (slotList.length === 0) {

    const option =
      document.createElement("option");

    option.value = "";

    option.textContent =
      "時間帯を設定できません";

    option.disabled = true;

    option.selected = true;

    select.appendChild(option);

    return;
  }


  let firstAvailable = null;


  slotList.forEach((slot) => {

    const count =
      Number(
        slots[slot.key]?.count || 0
      );

    const maxGroups =
      Number(settings.maxGroups || 1);

    const isFull =
      count >= maxGroups;


    const option =
      document.createElement("option");

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


    select.appendChild(option);
  });


  /*
    空きがある時間帯を最初に選択
  */

  if (firstAvailable !== null) {

    select.value =
      firstAvailable;

  } else {

    /*
      全部満員の場合は
      最初の時間帯を表示する
    */

    select.value =
      slotList[0].key;
  }
}


/* =========================================
   選択中の時間帯情報
========================================= */

function updateInfo() {

  const select = $("slot");
  const info = $("slotInfo");

  if (!select || !info) {
    return;
  }

  const generatedSlots =
    createSlots();

  const slot =
    generatedSlots[select.value];

  if (!slot) {

    info.textContent = "";

    return;
  }


  const count =
    Number(
      slots[slot.key]?.count || 0
    );

  const maxGroups =
    Number(settings.maxGroups || 1);


  if (count >= maxGroups) {

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
    generatedSlots[select.value];

  if (!slot) {

    button.disabled = true;

    return;
  }


  const count =
    Number(
      slots[slot.key]?.count || 0
    );

  const maxGroups =
    Number(settings.maxGroups || 1);


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


  /*
    localStorageに予約が残っていない場合
  */

  if (!localReservation) {

    reservationArea.hidden = true;

    reservationArea.innerHTML = "";

    reserveArea.hidden =
      settings.open === false;

    return;
  }


  /*
    Firebase上に予約が存在するか確認
  */

  const number =
    String(localReservation.number);

  const remoteReservation =
    reservations[number];


  /*
    Firebaseに存在しない場合
  */

  if (!remoteReservation) {

    handleRemoteReservationRemoved(
      localReservation
    );

    return;
  }


  /*
    Firebase側の最新情報を使う
  */

  const reservation =
    remoteReservation;


  reservationArea.hidden = false;

  reserveArea.hidden = true;


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
          ${escapeHtml(flightNumber)}
        </strong>

      </div>


      <div class="boarding-pass-main">

        <div class="boarding-arrival">

          <span>
            ご来場時間
          </span>

          <strong>
            ${escapeHtml(reservation.start)}
            ～
            ${escapeHtml(reservation.end)}
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
              ${escapeHtml(boardingTime)}
            </strong>

          </div>


          <div>

            <span>
              人数
            </span>

            <strong>
              ${escapeHtml(reservation.size)}名
            </strong>

          </div>

        </div>


        <div class="boarding-pass-passenger">

          <span>
            代表者
          </span>

          <strong>
            ${escapeHtml(
              reservation.name || "名前なし"
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
      () => cancelReservation(
        reservation
      );
  }
}


/* =========================================
   Firebaseから予約が削除された場合
========================================= */

function handleRemoteReservationRemoved(
  reservation
) {

  if (!reservation) {
    return;
  }


  const cancelledNumber =
    getSelfCancelledNumber();


  /*
    ★重要

    自分自身がキャンセルした直後なら、
    スタッフによるキャンセルではない。

    そのためメッセージを出さずに終了する。
  */

  if (
    cancelledNumber !== null &&
    String(cancelledNumber) ===
      String(reservation.number)
  ) {

    clearLocalReservation();

    clearSelfCancelledNumber();

    return;
  }


  /*
    本当にスタッフ側から削除された場合
  */

  clearLocalReservation();

  $("reservationArea").hidden = true;

  $("reservationArea").innerHTML = "";

  $("reserveArea").hidden =
    settings.open === false;


  alert(
    "スタッフによって予約がキャンセルされました。"
  );
}


/* =========================================
   localStorageとFirebaseの同期
========================================= */

function syncLocalReservation() {

  const localReservation =
    getLocalReservation();


  if (!localReservation) {
    return;
  }


  const number =
    String(localReservation.number);


  const remoteReservation =
    reservations[number];


  if (!remoteReservation) {

    const cancelledNumber =
      getSelfCancelledNumber();


    /*
      自分でキャンセルした場合
    */

    if (
      cancelledNumber !== null &&
      String(cancelledNumber) === number
    ) {

      clearLocalReservation();

      clearSelfCancelledNumber();

      return;
    }


    /*
      スタッフが削除した場合
    */

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


    alert(
      "スタッフによって予約がキャンセルされました。"
    );

    return;
  }
}


/* =========================================
   全体描画
========================================= */

function render() {

  /*
    自分でキャンセルした記録が
    残っていたら、まず処理を整理する。
  */

  const cancelledNumber =
    getSelfCancelledNumber();

  if (cancelledNumber !== null) {

    const localReservation =
      getLocalReservation();

    if (
      !localReservation ||
      String(localReservation.number) !==
        String(cancelledNumber)
    ) {

      clearSelfCancelledNumber();
    }
  }


  syncLocalReservation();


  /*
    予約がある場合
  */

  const localReservation =
    getLocalReservation();


  if (localReservation) {

    renderReservations();

  } else {

    renderSlots();

    updateInfo();

    updateReserveButton();


    /*
      受付停止中
    */

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
   予約する
========================================= */

if ($("reserve")) {

  $("reserve").onclick =
    async () => {

      const error =
        $("error");

      if (error) {
        error.textContent = "";
      }


      /*
        すでに予約がある場合
      */

      const existing =
        getLocalReservation();

      if (existing) {

        if (error) {

          error.textContent =
            "すでに予約があります。";
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


      const name =
        $("name").value.trim();


      const size =
        Number($("size").value);


      const slotKeyValue =
        $("slot").value;


      const generatedSlots =
        createSlots();


      const slot =
        generatedSlots[slotKeyValue];


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


      /*
        人数チェック
      */

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


      const countRef =
        ref(
          db,
          `Queue/slots/${slot.key}/count`
        );


      /*
        枠を1組確保
      */

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


      if (!countResult.committed) {

        if (error) {

          error.textContent =
            "その時間帯は満員になりました。";
        }

        return;
      }


      /*
        予約番号を発行
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
            Number(value || 0) + 1
        );


      if (!lastResult.committed) {

        /*
          番号取得失敗時は
          枠を戻す
        */

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


      /*
        予約データ
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


      try {

        /*
          Firebaseに予約を保存
        */

        await set(
          ref(
            db,
            `Queue/reservations/${number}`
          ),
          reservation
        );


        /*
          localStorageにも保存
        */

        saveLocalReservation(
          reservation
        );


        /*
          古いキャンセル情報があれば消す
        */

        clearSelfCancelledNumber();


        /*
          入力欄をクリア
        */

        $("name").value = "";


        /*
          予約画面を表示
        */

        render();


      } catch (firebaseError) {

        console.error(
          "予約保存エラー:",
          firebaseError
        );


        /*
          予約保存失敗時は
          枠を戻す
        */

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


  /*
    ① まず確認
  */

  const ok =
    confirm(
      "予約をキャンセルしますか？"
    );


  if (!ok) {
    return;
  }


  /*
    ★ここが重要

    Firebaseの削除より先に、
    「自分でキャンセルした」という
    印をlocalStorageに保存する。

    これによってFirebaseの削除通知が
    先に届いても、
    スタッフキャンセル扱いにならない。
  */

  setSelfCancelledNumber(
    reservation.number
  );


  try {

    /*
      ② Firebaseから予約を削除
    */

    await remove(
      ref(
        db,
        `Queue/reservations/${reservation.number}`
      )
    );


    /*
      ③ 時間枠の人数を1減らす
    */

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


    /*
      ④ localStorageの予約を削除
    */

    clearLocalReservation();


    /*
      ⑤ キャンセル処理済みの印も削除
    */

    clearSelfCancelledNumber();


    /*
      ⑥ 予約画面を閉じる
    */

    if ($("reservationArea")) {

      $("reservationArea").hidden =
        true;

      $("reservationArea").innerHTML =
        "";
    }


    /*
      ⑦ 受付画面を戻す
    */

    if ($("reserveArea")) {

      $("reserveArea").hidden =
        settings.open === false;
    }


    /*
      ⑧ 時間帯を再表示
    */

    renderSlots();

    updateInfo();

    updateReserveButton();


    /*
      ⑨ 最後に1回だけ表示

      「スタッフによってキャンセル」
      は絶対に表示しない。
    */

    alert(
      "予約がキャンセルされました。"
    );


  } catch (error) {

    console.error(
      "キャンセル処理に失敗しました:",
      error
    );


    /*
      失敗した場合は
      自分でキャンセルした印を消す。
    */

    clearSelfCancelledNumber();


    alert(
      "キャンセルに失敗しました。もう一度お試しください。"
    );


    /*
      画面を元に戻す
    */

    render();
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
          data.start || "09:00",

        end:
          data.end || "15:00",

        slotMinutes:
          Number(
            data.slotMinutes || 60
          ),

        maxGroups:
          Number(
            data.maxGroups || 1
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
   Firebase：予約削除監視
========================================= */

onChildRemoved(
  ref(db, "Queue/reservations"),
  (snapshot) => {

    const removedReservation =
      snapshot.val();


    if (!removedReservation) {
      return;
    }


    const localReservation =
      getLocalReservation();


    /*
      自分の予約ではない
    */

    if (
      !localReservation ||
      String(localReservation.number) !==
        String(removedReservation.number)
    ) {

      return;
    }


    /*
      自分でキャンセルした場合は
      スタッフキャンセル通知を出さない。
    */

    const cancelledNumber =
      getSelfCancelledNumber();


    if (
      cancelledNumber !== null &&
      String(cancelledNumber) ===
        String(removedReservation.number)
    ) {

      return;
    }


    /*
      ここまで来た場合だけ
      スタッフによる削除と判断する。
    */

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


    alert(
      "スタッフによって予約がキャンセルされました。"
    );
  }
);


/* =========================================
   初期表示
========================================= */

render();