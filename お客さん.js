// ==============================
// お客さんページ
// お客さん.js
// ==============================

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  set
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import {
  firebaseConfig
} from "./Firebase設定.js";


// ==============================
// Firebase 初期化
// ==============================

const app =
  initializeApp(firebaseConfig);

const db =
  getDatabase(app);


// ==============================
// HTML取得
// ==============================

const $ =
  id => document.getElementById(id);


// ==============================
// 設定
// ==============================
//
// スタッフ側と同じく
// 09:00～15:00固定
// ==============================

const FIXED_START = "09:00";
const FIXED_END = "15:00";


// ==============================
// 初期設定
// ==============================

let settings = {

  start:
    FIXED_START,

  end:
    FIXED_END,

  slotMinutes:
    30,

  maxGroups:
    5,

  open:
    true
};


// ==============================
// 時間枠
// ==============================

let slots = {};

let selectedSlot;


// ==============================
// 複数予約
// ==============================

let reservations = [];


// ==============================
// 分に変換
// ==============================

function toMin(time) {

  if (!time) {
    return 0;
  }

  const [
    hour,
    minute
  ] =
    time
      .split(":")
      .map(Number);

  return (
    hour * 60 +
    minute
  );
}


// ==============================
// 分 → 時刻
// ==============================

function formatTime(minutes) {

  const hour =
    Math.floor(minutes / 60);

  const minute =
    minutes % 60;

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );
}


// ==============================
// 時間枠キー
//
// 09:00 → 09-00
// ==============================

function key(minutes) {

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


// ==============================
// 時間枠作成
// ==============================

function createSlots() {

  const result = {};

  const start =
    toMin(FIXED_START);

  const end =
    toMin(FIXED_END);

  const slotMinutes =
    Number(
      settings.slotMinutes
    );


  if (
    !Number.isInteger(slotMinutes) ||
    slotMinutes <= 0
  ) {

    return result;
  }


  for (
    let minutes = start;

    minutes + slotMinutes <= end;

    minutes += slotMinutes
  ) {

    const slotStart =
      formatTime(minutes);

    const slotEnd =
      formatTime(
        minutes + slotMinutes
      );


    result[
      key(minutes)
    ] = {

      key:
        key(minutes),

      start:
        slotStart,

      end:
        slotEnd
    };
  }


  return result;
}


// ==============================
// 搭乗時刻
//
// 予約枠終了の5分後
//
// 例
// 10:00～10:30
// ↓
// 搭乗時刻 10:35
// ==============================

function getBoardingTime(endTime) {

  return formatTime(
    toMin(endTime) + 5
  );
}


// ==============================
// 今日の日付
//
// 例
// 2026/09/08
// ==============================

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


// ==============================
// 便名
//
// 予約番号 1
// ↓
// DREAM001
// ==============================

function getFlightNumber(number) {

  return (
    "DREAM" +
    String(number).padStart(3, "0")
  );
}


// ==============================
// HTMLエスケープ
// ==============================

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ==============================
// 時間枠表示
// ==============================

function render() {

  const slotElement =
    $("slot");


  if (!slotElement) {
    return;
  }


  const generated =
    createSlots();


  slotElement.innerHTML =
    "";


  Object.values(
    generated
  ).forEach(
    slot => {

      const count =
        Number(
          slots[slot.key]?.count || 0
        );


      const max =
        Number(
          settings.maxGroups
        );


      const remaining =
        Math.max(
          0,
          max - count
        );


      const option =
        document.createElement(
          "option"
        );


      option.value =
        slot.key;


      option.textContent =
        `${slot.start}～${slot.end}` +
        `（残り ${remaining}組）`;


      option.disabled =
        count >= max;


      slotElement.appendChild(
        option
      );
    }
  );


  updateInfo();
}


// ==============================
// 選択中の時間枠情報
// ==============================

function updateInfo() {

  const slotElement =
    $("slot");

  const info =
    $("slotInfo");


  if (
    !slotElement ||
    !info
  ) {
    return;
  }


  selectedSlot =
    createSlots()[
      slotElement.value
    ];


  if (!selectedSlot) {

    info.textContent =
      "";

    return;
  }


  const count =
    Number(
      slots[
        selectedSlot.key
      ]?.count || 0
    );


  const max =
    Number(
      settings.maxGroups
    );


  info.textContent =
    `${selectedSlot.start}～${selectedSlot.end}` +
    `：${count}/${max}組`;
}


// ==============================
// Firebase
// 設定監視
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

        // スタッフ側と同じく固定
        start:
          FIXED_START,

        end:
          FIXED_END,

        slotMinutes:
          Number(
            data.slotMinutes
          ) || 30,

        maxGroups:
          Number(
            data.maxGroups
          ) || 5,

        open:
          data.open !== false
      };
    }


    const reserveArea =
      $("reserveArea");

    const closedArea =
      $("closedArea");


    if (reserveArea) {

      // 複数予約があっても
      // 受付中なら予約フォームを表示
      reserveArea.hidden =
        !settings.open;
    }


    if (closedArea) {

      closedArea.hidden =
        !!settings.open;
    }


    render();
  }
);


// ==============================
// Firebase
// 時間枠監視
// ==============================

onValue(
  ref(
    db,
    "Queue/slots"
  ),
  snapshot => {

    slots =
      snapshot.val() || {};


    render();
  }
);


// ==============================
// 時間枠変更
// ==============================

if ($("slot")) {

  $("slot").onchange =
    updateInfo;
}


// ==============================
// 以前の予約を取得
// ==============================
//
// 新方式：
// ib_reservations
//
// 旧方式：
// ib_reservation
//
// 旧方式があれば自動的に
// 新方式へ移行する
// ==============================

function loadReservations() {

  const newSaved =
    localStorage.getItem(
      "ib_reservations"
    );


  if (newSaved) {

    try {

      const data =
        JSON.parse(
          newSaved
        );


      if (
        Array.isArray(data)
      ) {

        reservations =
          data.filter(
            reservation =>
              reservation &&
              reservation.number
          );

      } else {

        reservations = [];
      }

    } catch (error) {

      console.error(
        "複数予約の読み込みエラー:",
        error
      );

      reservations = [];
    }

  } else {

    // ==========================
    // 旧形式から移行
    // ==========================

    const oldSaved =
      localStorage.getItem(
        "ib_reservation"
      );


    if (oldSaved) {

      try {

        const oldReservation =
          JSON.parse(
            oldSaved
          );


        if (
          oldReservation &&
          oldReservation.number
        ) {

          reservations = [
            oldReservation
          ];


          saveReservations();
        }

      } catch (error) {

        console.error(
          "旧予約の読み込みエラー:",
          error
        );

        reservations = [];
      }
    }
  }


  renderReservations();
}


// ==============================
// 予約を保存
// ==============================

function saveReservations() {

  localStorage.setItem(
    "ib_reservations",
    JSON.stringify(
      reservations
    )
  );
}


// ==============================
// 搭乗券一覧を表示
// ==============================

function renderReservations() {

  const area =
    $("reservationArea");


  if (!area) {
    return;
  }


  // ==========================
  // 予約がない場合
  // ==========================

  if (
    !reservations.length
  ) {

    area.hidden =
      true;

    return;
  }


  // ==========================
  // 搭乗券を全部作成
  // ==========================

  area.innerHTML = `

    <h2>予約済みの搭乗券</h2>

    <div id="boardingPassList"></div>

  `;


  const list =
    $("boardingPassList");


  if (!list) {
    return;
  }


  reservations.forEach(
    reservation => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "boarding-pass";


      const flight =
        getFlightNumber(
          reservation.number
        );


      const boardingTime =
        getBoardingTime(
          reservation.end
        );


      card.innerHTML = `

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
            ${escapeHtml(flight)}
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

        </div>

      `;


      list.appendChild(
        card
      );
    }
  );


  area.hidden =
    false;
}


// ==============================
// 最初に予約を読み込む
// ==============================

loadReservations();


// ==============================
// 予約画面を表示
// ==============================
//
// 1件だけ表示する方式は廃止。
// 複数予約を renderReservations()
// でまとめて表示する。
// ==============================

function showReservation() {

  renderReservations();


  // 受付停止表示は隠す
  if ($("closedArea")) {

    $("closedArea").hidden =
      true;
  }
}


// ==============================
// 予約ボタン
// ==============================

if ($("reserve")) {

  $("reserve").onclick =
    async () => {

      const error =
        $("error");


      if (error) {

        error.textContent =
          "";
      }


      // 二重クリック防止
      $("reserve").disabled =
        true;


      try {

        // ========================
        // 入力値
        // ========================

        const name =
          $("name")
            .value
            .trim();


        const size =
          Number(
            $("size").value
          );


        const slotKey =
          $("slot").value;


        const slot =
          createSlots()[
            slotKey
          ];


        // ========================
        // 名前チェック
        // ========================

        if (!name) {

          if (error) {

            error.textContent =
              "名前を入力してください。";
          }

          return;
        }


        // ========================
        // 人数チェック
        // ========================

        if (
          !Number.isInteger(size) ||
          size < 1 ||
          size > 4
        ) {

          if (error) {

            error.textContent =
              "人数は1〜4人にしてください。";
          }

          return;
        }


        // ========================
        // 時間枠チェック
        // ========================

        if (!slot) {

          if (error) {

            error.textContent =
              "時間枠を選択してください。";
          }

          return;
        }


        // ========================
        // 受付状態チェック
        // ========================

        if (!settings.open) {

          if (error) {

            error.textContent =
              "現在は受付停止中です。";
          }

          return;
        }


        // ========================
        // 枠数を1増やす
        // ========================

        const countRef =
          ref(
            db,
            `Queue/slots/${slot.key}/count`
          );


        const countResult =
          await runTransaction(
            countRef,
            current => {

              const count =
                current === null
                  ? 0
                  : Number(current);


              const max =
                Number(
                  settings.maxGroups
                );


              if (
                count >= max
              ) {

                return;
              }


              return count + 1;
            }
          );


        // ========================
        // 満員
        // ========================

        if (
          !countResult.committed
        ) {

          if (error) {

            error.textContent =
              "その時間帯は満員です。";
          }

          return;
        }


        // ========================
        // 予約番号発行
        // ========================

        const lastRef =
          ref(
            db,
            "Queue/reservationLast"
          );


        let reservationNumber;


        try {

          const lastResult =
            await runTransaction(
              lastRef,
              current =>
                Number(current || 0) + 1
            );


          if (
            !lastResult.committed
          ) {

            throw new Error(
              "予約番号を取得できませんでした。"
            );
          }


          reservationNumber =
            Number(
              lastResult.snapshot.val()
            );

        } catch (numberError) {

          console.error(
            "予約番号発行エラー:",
            numberError
          );


          // 枠数を戻す
          await runTransaction(
            countRef,
            current =>
              Math.max(
                0,
                Number(current || 0) - 1
              )
          );


          if (error) {

            error.textContent =
              "予約番号の取得に失敗しました。";
          }

          return;
        }


        // ========================
        // 予約データ
        // ========================

        const reservation = {

          number:
            reservationNumber,

          name:
            name,

          slot:
            slot.key,

          start:
            slot.start,

          end:
            slot.end,

          size:
            size,

          type:
            "web",

          createdAt:
            Date.now()
        };


        // ========================
        // Firebase保存
        // ========================

        try {

          await set(
            ref(
              db,
              `Queue/reservations/${reservationNumber}`
            ),
            reservation
          );

        } catch (saveError) {

          console.error(
            "予約保存エラー:",
            saveError
          );


          // 枠数を戻す
          await runTransaction(
            countRef,
            current =>
              Math.max(
                0,
                Number(current || 0) - 1
              )
          );


          if (error) {

            error.textContent =
              "予約の保存に失敗しました。";
          }

          return;
        }


        // ========================
        // 複数予約に追加
        // ========================

        reservations.push(
          reservation
        );


        // ========================
        // 端末に保存
        // ========================

        saveReservations();


        // ========================
        // 搭乗券一覧を更新
        // ========================

        showReservation();


        // ========================
        // 入力欄をリセット
        // ========================

        if ($("name")) {

          $("name").value =
            "";
        }


        if ($("size")) {

          $("size").value =
            "1";
        }


        // ========================
        // 完了メッセージ
        // ========================

        if (error) {

          error.textContent =
            "予約しました。下に搭乗券が表示されています。";
        }

      } catch (reservationError) {

        console.error(
          "予約処理エラー:",
          reservationError
        );


        if (error) {

          error.textContent =
            "予約に失敗しました。もう一度お試しください。";
        }

      } finally {

        $("reserve").disabled =
          false;
      }
    };
}
