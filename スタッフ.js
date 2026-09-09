// ==============================
// スタッフ管理ページ
// スタッフ.js
// ==============================

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  set,
  update,
  remove
} from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { firebaseConfig } from "./Firebase設定.js";


// ==============================
// Firebase初期化
// ==============================

const app =
  initializeApp(firebaseConfig);

const db =
  getDatabase(app);

const auth =
  getAuth(app);


// ==============================
// スタッフ情報
// ==============================

const STAFF_EMAIL =
  "kazuma.cosmos@gmail.com";


// ==============================
// 現在の設定
// ==============================

let currentSettings = {

  start:
    "09:00",

  end:
    "15:00",

  slotMinutes:
    30,

  maxGroups:
    5,

  open:
    true
};


// ==============================
// HTML取得
// ==============================

function $(id) {

  return document.getElementById(id);

}


// ==============================
// 時刻 → 分
// ==============================

function toMinutes(time) {

  if (!time) {
    return 0;
  }

  const parts =
    time.split(":");

  const hour =
    Number(parts[0]);

  const minute =
    Number(parts[1]);

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
    Math.floor(
      minutes / 60
    );

  const minute =
    minutes % 60;

  return (
    String(hour).padStart(
      2,
      "0"
    ) +
    ":" +
    String(minute).padStart(
      2,
      "0"
    )
  );
}


// ==============================
// スロットキー
// ==============================

function slotKey(time) {

  return time.replace(
    ":",
    "-"
  );
}


// ==============================
// 時間枠作成
// ==============================

function createSlots() {

  const slots = [];

  const startMinutes =
    toMinutes(
      currentSettings.start
    );

  const endMinutes =
    toMinutes(
      currentSettings.end
    );

  const slotMinutes =
    Number(
      currentSettings.slotMinutes
    );

  if (
    !slotMinutes ||
    slotMinutes <= 0
  ) {

    return slots;
  }

  for (
    let minutes =
      startMinutes;

    minutes +
      slotMinutes <=
      endMinutes;

    minutes +=
      slotMinutes
  ) {

    const start =
      formatTime(
        minutes
      );

    const end =
      formatTime(
        minutes +
        slotMinutes
      );

    slots.push({

      key:
        slotKey(start),

      start:
        start,

      end:
        end
    });
  }

  return slots;
}


// ==============================
// HTMLエスケープ
// ==============================

function escapeHtml(value) {

  if (
    value === null ||
    value === undefined
  ) {

    return "";
  }

  return String(value)

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );
}


// ==============================
// ログイン
// ==============================

const loginButton =
  $("login");

if (loginButton) {

  loginButton.addEventListener(
    "click",
    async () => {

      const passwordInput =
        $("password");

      const loginMessage =
        $("loginMessage");

      const password =
        passwordInput
          ? passwordInput.value.trim()
          : "";

      if (loginMessage) {

        loginMessage.textContent =
          "";
      }

      if (!password) {

        if (loginMessage) {

          loginMessage.textContent =
            "パスワードを入力してください。";
        }

        return;
      }

      loginButton.disabled =
        true;

      loginButton.textContent =
        "ログイン中…";

      try {

        await signInWithEmailAndPassword(
          auth,
          STAFF_EMAIL,
          password
        );

      } catch (error) {

        console.error(
          "スタッフログインエラー:",
          error
        );

        if (loginMessage) {

          if (
            error.code ===
            "auth/invalid-credential" ||

            error.code ===
            "auth/wrong-password" ||

            error.code ===
            "auth/user-not-found"
          ) {

            loginMessage.textContent =
              "パスワードが違います。";

          } else {

            loginMessage.textContent =
              "ログインに失敗しました。";
          }
        }

      } finally {

        loginButton.disabled =
          false;

        loginButton.textContent =
          "ログイン";
      }
    }
  );
}


// ==============================
// ページ更新
// ==============================

function render() {

  renderPaperSlots();

  renderReservations();

}


// ==============================
// スタッフ状況パネル
// ==============================

function renderDashboard(
  reservations = {}
) {

  const adminArea =
    $("adminArea");

  if (!adminArea) {
    return;
  }


  let dashboard =
    $("staffDashboard");


  /*
   * 初回だけ作成
   */

  if (!dashboard) {

    dashboard =
      document.createElement(
        "section"
      );

    dashboard.id =
      "staffDashboard";

    dashboard.style.cssText = `
      margin: 0 0 24px 0;
      padding: 18px;
      border-radius: 16px;
      background: #f4f8fb;
      border: 1px solid #d5e1e9;
    `;


    /*
     * adminAreaの先頭に追加
     */

    adminArea.insertBefore(
      dashboard,
      adminArea.firstChild
    );
  }


  /*
   * 予約集計
   */

  const reservationList =
    Object.values(
      reservations || {}
    ).filter(
      reservation =>
        reservation
    );


  const total =
    reservationList.length;


  const completed =
    reservationList.filter(
      reservation =>
        reservation.status ===
        "completed"
    ).length;


  const reserved =
    reservationList.filter(
      reservation =>
        reservation.status !==
        "completed"
    ).length;


  /*
   * 時間枠集計
   */

  const slots =
    createSlots();


  const maxGroups =
    Number(
      currentSettings.maxGroups
    ) || 0;


  let totalCapacity =
    0;

  let usedCapacity =
    0;

  let fullSlots =
    0;


  for (
    const slot of slots
  ) {

    const count =
      Number(
        window.staffSlotsData?.[
          slot.key
        ]?.count || 0
      );


    totalCapacity +=
      maxGroups;

    usedCapacity +=
      count;


    if (
      count >= maxGroups &&
      maxGroups > 0
    ) {

      fullSlots++;

    }

  }


  const remaining =
    Math.max(
      0,
      totalCapacity -
      usedCapacity
    );


  /*
   * 更新
   */

  dashboard.innerHTML = `

    <div
      style="
        font-size:20px;
        font-weight:700;
        margin-bottom:14px;
      "
    >
      📊 現在の予約状況
    </div>


    <div
      style="
        display:grid;
        grid-template-columns:
          repeat(
            auto-fit,
            minmax(130px, 1fr)
          );
        gap:10px;
      "
    >

      <div
        style="
          background:#ffffff;
          border-radius:12px;
          padding:14px;
          border:1px solid #dbe5eb;
        "
      >
        <div
          style="
            font-size:13px;
            color:#657783;
          "
        >
          📊 予約総数
        </div>

        <div
          style="
            font-size:27px;
            font-weight:700;
            margin-top:4px;
          "
        >
          ${total}組
        </div>
      </div>


      <div
        style="
          background:#ffffff;
          border-radius:12px;
          padding:14px;
          border:1px solid #dbe5eb;
        "
      >
        <div
          style="
            font-size:13px;
            color:#657783;
          "
        >
          🟢 未搭乗
        </div>

        <div
          style="
            font-size:27px;
            font-weight:700;
            margin-top:4px;
          "
        >
          ${reserved}組
        </div>
      </div>


      <div
        style="
          background:#ffffff;
          border-radius:12px;
          padding:14px;
          border:1px solid #dbe5eb;
        "
      >
        <div
          style="
            font-size:13px;
            color:#657783;
          "
        >
          🔵 搭乗済み
        </div>

        <div
          style="
            font-size:27px;
            font-weight:700;
            margin-top:4px;
          "
        >
          ${completed}組
        </div>
      </div>


      <div
        style="
          background:#ffffff;
          border-radius:12px;
          padding:14px;
          border:1px solid #dbe5eb;
        "
      >
        <div
          style="
            font-size:13px;
            color:#657783;
          "
        >
          🪑 残り枠
        </div>

        <div
          style="
            font-size:27px;
            font-weight:700;
            margin-top:4px;
          "
        >
          ${remaining}組
        </div>
      </div>


      <div
        style="
          background:#ffffff;
          border-radius:12px;
          padding:14px;
          border:1px solid #dbe5eb;
        "
      >
        <div
          style="
            font-size:13px;
            color:#657783;
          "
        >
          🔴 満員枠
        </div>

        <div
          style="
            font-size:27px;
            font-weight:700;
            margin-top:4px;
          "
        >
          ${fullSlots}枠
        </div>
      </div>

    </div>


    <div
      style="
        margin-top:12px;
        font-size:13px;
        color:#657783;
      "
    >
      全${slots.length}枠・
      最大${totalCapacity}組
    </div>

  `;

}


// ==============================
// 紙予約の時間枠一覧
// ==============================

function renderPaperSlots() {

  const paperSlot =
    $("paperSlot");

  if (!paperSlot) {

    return;
  }

  const slots =
    createSlots();

  paperSlot.innerHTML =
    "";

  for (
    const slot of slots
  ) {

    const option =
      document.createElement(
        "option"
      );

    option.value =
      slot.key;

    option.textContent =
      `${slot.start}〜${slot.end}`;

    paperSlot.appendChild(
      option
    );
  }

  updatePaperSlotInfo();
}


// ==============================
// 紙予約の枠情報
// ==============================

function updatePaperSlotInfo() {

  const paperSlot =
    $("paperSlot");

  const info =
    $("paperSlotInfo");

  if (
    !paperSlot ||
    !info
  ) {

    return;
  }

  const selectedSlot =
    paperSlot.value;

  if (!selectedSlot) {

    info.textContent =
      "";

    return;
  }

  const slot =
    createSlots().find(
      item =>
        item.key ===
        selectedSlot
    );

  if (!slot) {

    info.textContent =
      "";

    return;
  }

  const countRef =
    ref(
      db,
      `Queue/slots/${slot.key}/count`
    );

  onValue(
    countRef,
    snapshot => {

      const count =
        snapshot.exists()
          ? Number(
              snapshot.val()
            )
          : 0;

      const max =
        Number(
          currentSettings.maxGroups
        );

      info.textContent =
        `現在 ${count} / ${max} 組`;
    }
  );
}


// ==============================
// 予約一覧
// ==============================

function renderReservations() {

  const slotList =
    $("slotList");

  if (!slotList) {

    return;
  }

  const reservationsRef =
    ref(
      db,
      "Queue/reservations"
    );

  onValue(
    reservationsRef,
    snapshot => {

      const data =
        snapshot.val();

      const reservations =
        [];

      if (data) {

        for (
          const key of
          Object.keys(data)
        ) {

          const reservation =
            data[key];

          if (!reservation) {

            continue;
          }

          reservations.push(
            reservation
          );
        }
      }

      /*
       * 状況パネル更新
       */

      renderDashboard(
        data || {}
      );


      reservations.sort(
        (a, b) =>
          Number(a.number) -
          Number(b.number)
      );

      const slots =
        createSlots();

      slotList.innerHTML =
        "";

      for (
        const slot of slots
      ) {

        const slotReservations =
          reservations.filter(
            reservation =>
              reservation.slot ===
              slot.key
          );

        const section =
          document.createElement(
            "section"
          );

        section.className =
          "slot-section";

        const title =
          document.createElement(
            "h3"
          );

        title.textContent =
          `${slot.start}〜${slot.end} ` +
          `（${slotReservations.length}/${currentSettings.maxGroups}組）`;

        section.appendChild(
          title
        );

        if (
          slotReservations.length === 0
        ) {

          const empty =
            document.createElement(
              "p"
            );

          empty.textContent =
            "予約はありません。";

          section.appendChild(
            empty
          );

        } else {

          for (
            const reservation
            of slotReservations
          ) {

            const item =
              document.createElement(
                "div"
              );

            item.className =
              "reservation-item";


            // ========================
            // 予約情報
            // ========================

            const name =
              reservation.name
                ? escapeHtml(
                    reservation.name
                  )
                : "名前なし";

            const size =
              Number(
                reservation.size
              );

            const type =
              reservation.type ===
              "paper"
                ? "紙予約"
                : "Web予約";

            item.innerHTML = `
              <strong>
                ${name}
              </strong>

              <br>

              ${size}人
              ・
              ${type}
              ・
              予約番号 ${reservation.number}
            `;


            // ========================
            // 搭乗状態
            // ========================

            const isCompleted =
              reservation.status ===
              "completed";

            const status =
              document.createElement(
                "span"
              );

            status.className =
              "reservation-status " +
              (
                isCompleted
                  ? "completed"
                  : "reserved"
              );

            status.textContent =
              isCompleted
                ? "🔵 搭乗済み"
                : "🟢 予約済み";

            item.appendChild(
              status
            );


            // ========================
            // 搭乗状態変更ボタン
            // ========================

            if (!isCompleted) {

              const completeButton =
                document.createElement(
                  "button"
                );

              completeButton.type =
                "button";

              completeButton.className =
                "complete-reservation-button";

              completeButton.textContent =
                "搭乗済みにする";


              completeButton.addEventListener(
                "click",
                async () => {

                  const confirmed =
                    confirm(
                      `予約番号 ${reservation.number} を搭乗済みにしますか？`
                    );

                  if (!confirmed) {

                    return;
                  }

                  completeButton.disabled =
                    true;

                  completeButton.textContent =
                    "変更中…";


                  const success =
                    await markReservationCompleted(
                      reservation
                    );


                  if (!success) {

                    completeButton.disabled =
                      false;

                    completeButton.textContent =
                      "搭乗済みにする";
                  }
                }
              );


              item.appendChild(
                document.createElement(
                  "br"
                )
              );

              item.appendChild(
                completeButton
              );

            } else {

              // ========================
              // 搭乗済みを取り消す
              // ========================

              const undoButton =
                document.createElement(
                  "button"
                );

              undoButton.type =
                "button";

              undoButton.className =
                "complete-reservation-button";

              undoButton.textContent =
                "搭乗済みを取り消す";


              undoButton.addEventListener(
                "click",
                async () => {

                  const confirmed =
                    confirm(
                      `予約番号 ${reservation.number} の搭乗済みを取り消しますか？`
                    );

                  if (!confirmed) {

                    return;
                  }

                  undoButton.disabled =
                    true;

                  undoButton.textContent =
                    "変更中…";


                  const success =
                    await markReservationReserved(
                      reservation
                    );


                  if (!success) {

                    undoButton.disabled =
                      false;

                    undoButton.textContent =
                      "搭乗済みを取り消す";
                  }
                }
              );


              item.appendChild(
                document.createElement(
                  "br"
                )
              );

              item.appendChild(
                undoButton
              );
            }


            // ========================
            // 時間枠変更
            // ========================

            const moveSelect =
              document.createElement(
                "select"
              );

            const defaultOption =
              document.createElement(
                "option"
              );

            defaultOption.value =
              "";

            defaultOption.textContent =
              "時間枠を変更";

            moveSelect.appendChild(
              defaultOption
            );

            for (
              const targetSlot
              of slots
            ) {

              if (
                targetSlot.key ===
                reservation.slot
              ) {

                continue;
              }

              const option =
                document.createElement(
                  "option"
                );

              option.value =
                targetSlot.key;

              option.textContent =
                `${targetSlot.start}〜${targetSlot.end}`;

              moveSelect.appendChild(
                option
              );
            }

            moveSelect.addEventListener(
              "change",
              async () => {

                const targetSlot =
                  moveSelect.value;

                if (!targetSlot) {

                  return;
                }

                await moveReservation(
                  reservation,
                  targetSlot
                );

                moveSelect.value =
                  "";
              }
            );

            item.appendChild(
              document.createElement(
                "br"
              )
            );

            item.appendChild(
              moveSelect
            );


            // ========================
            // 削除ボタン
            // ========================

            const deleteButton =
              document.createElement(
                "button"
              );

            deleteButton.textContent =
              "削除";

            deleteButton.type =
              "button";

            deleteButton.addEventListener(
              "click",
              async () => {

                await deleteReservation(
                  reservation
                );
              }
            );

            item.appendChild(
              document.createTextNode(
                " "
              )
            );

            item.appendChild(
              deleteButton
            );

            section.appendChild(
              item
            );
          }
        }

        slotList.appendChild(
          section
        );
      }
    }
  );
}


// ==============================
// 搭乗済みにする
// ==============================

async function markReservationCompleted(
  reservation
) {

  const number =
    reservation.number;

  if (
    number === undefined
  ) {

    return false;
  }

  const reservationRef =
    ref(
      db,
      `Queue/reservations/${number}`
    );

  try {

    await update(
      reservationRef,
      {

        status:
          "completed",

        completedAt:
          Date.now()
      }
    );

    return true;

  } catch (error) {

    console.error(
      "搭乗済み更新エラー:",
      error
    );

    alert(
      "搭乗済みへの変更に失敗しました。"
    );

    return false;
  }
}


// ==============================
// 搭乗済みを取り消す
// ==============================

async function markReservationReserved(
  reservation
) {

  const number =
    reservation.number;

  if (
    number === undefined
  ) {

    return false;
  }

  const reservationRef =
    ref(
      db,
      `Queue/reservations/${number}`
    );

  try {

    await update(
      reservationRef,
      {

        status:
          "reserved",

        completedAt:
          null
      }
    );

    return true;

  } catch (error) {

    console.error(
      "搭乗済み取り消しエラー:",
      error
    );

    alert(
      "搭乗済みの取り消しに失敗しました。"
    );

    return false;
  }
}


// ==============================
// 予約の時間枠変更
// ==============================

async function moveReservation(
  reservation,
  targetSlotKey
) {

  const oldSlotKey =
    reservation.slot;

  if (
    !oldSlotKey ||
    !targetSlotKey ||
    oldSlotKey === targetSlotKey
  ) {

    return;
  }

  const targetSlot =
    createSlots().find(
      slot =>
        slot.key ===
        targetSlotKey
    );

  if (!targetSlot) {

    alert(
      "変更先の時間枠が見つかりません。"
    );

    return;
  }

  const targetCountRef =
    ref(
      db,
      `Queue/slots/${targetSlotKey}/count`
    );

  let targetIncremented =
    false;

  try {

    const transactionResult =
      await runTransaction(
        targetCountRef,
        current => {

          const count =
            current === null
              ? 0
              : Number(current);

          const maxGroups =
            Number(
              currentSettings.maxGroups
            );

          if (
            count >= maxGroups
          ) {

            return;
          }

          return count + 1;
        }
      );

    if (
      !transactionResult.committed
    ) {

      alert(
        "変更先の時間枠が満員です。"
      );

      return;
    }

    targetIncremented =
      true;

    const reservationRef =
      ref(
        db,
        `Queue/reservations/${reservation.number}`
      );

    await update(
      reservationRef,
      {

        slot:
          targetSlot.key,

        start:
          targetSlot.start,

        end:
          targetSlot.end
      }
    );

    const oldCountRef =
      ref(
        db,
        `Queue/slots/${oldSlotKey}/count`
      );

    await runTransaction(
      oldCountRef,
      current => {

        const count =
          current === null
            ? 0
            : Number(current);

        return Math.max(
          0,
          count - 1
        );
      }
    );

    alert(
      "時間枠を変更しました。"
    );

  } catch (error) {

    console.error(
      "予約移動エラー:",
      error
    );

    if (
      targetIncremented
    ) {

      try {

        await runTransaction(
          targetCountRef,
          current => {

            const count =
              current === null
                ? 0
                : Number(current);

            return Math.max(
              0,
              count - 1
            );
          }
        );

      } catch (
        rollbackError
      ) {

        console.error(
          "ロールバックエラー:",
          rollbackError
        );
      }
    }

    alert(
      "時間枠の変更に失敗しました。"
    );
  }
}


// ==============================
// 予約削除
// ==============================

async function deleteReservation(
  reservation
) {

  const number =
    reservation.number;

  if (
    number === undefined
  ) {

    return;
  }

  const confirmed =
    confirm(
      `予約番号 ${number} を削除しますか？`
    );

  if (!confirmed) {

    return;
  }

  const reservationRef =
    ref(
      db,
      `Queue/reservations/${number}`
    );

  try {

    await remove(
      reservationRef
    );

    if (
      reservation.slot
    ) {

      const countRef =
        ref(
          db,
          `Queue/slots/${reservation.slot}/count`
        );

      await runTransaction(
        countRef,
        current => {

          const count =
            current === null
              ? 0
              : Number(current);

          return Math.max(
            0,
            count - 1
          );
        }
      );
    }

    alert(
      "予約を削除しました。"
    );

  } catch (error) {

    console.error(
      "予約削除エラー:",
      error
    );

    alert(
      "予約の削除に失敗しました。"
    );
  }
}


// ==============================
// Firebase設定を監視
// ==============================

const settingsRef =
  ref(
    db,
    "Queue/settings"
  );

onValue(
  settingsRef,
  snapshot => {

    const data =
      snapshot.val();

    if (data) {

      currentSettings = {

        start:
          data.start ||
          "09:00",

        end:
          data.end ||
          "15:00",

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

    const receptionState =
      $("receptionState");

    if (receptionState) {

      receptionState.textContent =
        currentSettings.open
          ? "🟢 受付中"
          : "🔴 受付停止中";
    }

    render();
  }
);


// ==============================
// 時間枠を監視
// ==============================

const slotsRef =
  ref(
    db,
    "Queue/slots"
  );

onValue(
  slotsRef,
  snapshot => {

    /*
     * 現在の時間枠データを保存
     */

    window.staffSlotsData =
      snapshot.val() || {};


    renderPaperSlots();

    renderReservations();
  }
);


// ==============================
// 管理者設定ページを開く
// ==============================

const openAdminSettingsButton =
  $("openAdminSettings");

if (openAdminSettingsButton) {

  openAdminSettingsButton.addEventListener(
    "click",
    () => {

      window.location.href =
        "./管理者設定.html";
    }
  );
}


// ==============================
// 紙予約の時間枠変更
// ==============================

const paperSlotSelect =
  $("paperSlot");

if (paperSlotSelect) {

  paperSlotSelect.addEventListener(
    "change",
    () => {

      updatePaperSlotInfo();
    }
  );
}


// ==============================
// 紙予約追加
// ==============================

const addPaperButton =
  $("addPaper");

if (addPaperButton) {

  addPaperButton.addEventListener(
    "click",
    async () => {

      const paperNameInput =
        $("paperName");

      const paperSizeInput =
        $("paperSize");

      const paperSlotInput =
        $("paperSlot");

      const paperMessage =
        $("paperMessage");

      const paperName =
        paperNameInput
          ? paperNameInput.value.trim()
          : "";

      const paperSize =
        paperSizeInput
          ? Number(
              paperSizeInput.value
            )
          : 0;

      const paperSlot =
        paperSlotInput
          ? paperSlotInput.value
          : "";

      if (!paperName) {

        if (paperMessage) {

          paperMessage.textContent =
            "名前を入力してください。";
        }

        return;
      }

      if (
        !Number.isInteger(
          paperSize
        ) ||
        paperSize < 1 ||
        paperSize > 4
      ) {

        if (paperMessage) {

          paperMessage.textContent =
            "人数は1〜4人にしてください。";
        }

        return;
      }

      if (!paperSlot) {

        if (paperMessage) {

          paperMessage.textContent =
            "時間枠を選択してください。";
        }

        return;
      }

      const slot =
        createSlots().find(
          item =>
            item.key ===
            paperSlot
        );

      if (!slot) {

        if (paperMessage) {

          paperMessage.textContent =
            "時間枠が見つかりません。";
        }

        return;
      }

      if (paperMessage) {

        paperMessage.textContent =
          "追加しています……";
      }

      const countRef =
        ref(
          db,
          `Queue/slots/${slot.key}/count`
        );

      let countTransaction;

      try {

        countTransaction =
          await runTransaction(
            countRef,
            current => {

              const count =
                current === null
                  ? 0
                  : Number(current);

              const maxGroups =
                Number(
                  currentSettings.maxGroups
                );

              if (
                count >= maxGroups
              ) {

                return;
              }

              return count + 1;
            }
          );

      } catch (error) {

        console.error(
          "枠数更新エラー:",
          error
        );

        if (paperMessage) {

          paperMessage.textContent =
            "時間枠の更新に失敗しました。";
        }

        return;
      }

      if (
        !countTransaction.committed
      ) {

        if (paperMessage) {

          paperMessage.textContent =
            "その時間枠は満員です。";
        }

        return;
      }

      const lastRef =
        ref(
          db,
          "Queue/reservationLast"
        );

      let reservationNumber;

      try {

        const result =
          await runTransaction(
            lastRef,
            current => {

              const value =
                current === null
                  ? 0
                  : Number(current);

              return value + 1;
            }
          );

        if (
          !result.committed
        ) {

          throw new Error(
            "予約番号の発行に失敗しました。"
          );
        }

        reservationNumber =
          result.snapshot.val();

      } catch (error) {

        console.error(
          "予約番号発行エラー:",
          error
        );

        try {

          await runTransaction(
            countRef,
            current => {

              const count =
                current === null
                  ? 0
                  : Number(current);

              return Math.max(
                0,
                count - 1
              );
            }
          );

        } catch (
          rollbackError
        ) {

          console.error(
            "枠数ロールバックエラー:",
            rollbackError
          );
        }

        if (paperMessage) {

          paperMessage.textContent =
            "予約番号の発行に失敗しました。";
        }

        return;
      }

      const reservationData = {

        number:
          Number(
            reservationNumber
          ),

        name:
          paperName,

        slot:
          slot.key,

        start:
          slot.start,

        end:
          slot.end,

        size:
          paperSize,

        type:
          "paper",

        status:
          "reserved",

        createdAt:
          Date.now()
      };

      const reservationRef =
        ref(
          db,
          `Queue/reservations/${reservationNumber}`
        );

      try {

        await set(
          reservationRef,
          reservationData
        );

        if (paperMessage) {

          paperMessage.textContent =
            `予約を追加しました。予約番号：${reservationNumber}`;
        }

        if (paperNameInput) {

          paperNameInput.value =
            "";
        }

        updatePaperSlotInfo();

      } catch (error) {

        console.error(
          "紙予約保存エラー:",
          error
        );

        try {

          await runTransaction(
            countRef,
            current => {

              const count =
                current === null
                  ? 0
                  : Number(current);

              return Math.max(
                0,
                count - 1
              );
            }
          );

        } catch (
          rollbackError
        ) {

          console.error(
            "枠数ロールバックエラー:",
            rollbackError
          );
        }

        if (paperMessage) {

          paperMessage.textContent =
            "紙予約の保存に失敗しました。";
        }
      }
    }
  );
}


// ==============================
// ログアウト
// ==============================

const logoutButton =
  $("logout");

if (logoutButton) {

  logoutButton.addEventListener(
    "click",
    async () => {

      try {

        await signOut(
          auth
        );

      } catch (error) {

        console.error(
          "ログアウトエラー:",
          error
        );

        alert(
          "ログアウトに失敗しました。"
        );
      }
    }
  );
}


// ==============================
// 認証状態
// ==============================

onAuthStateChanged(
  auth,
  user => {

    const loginArea =
      $("loginArea");

    const adminArea =
      $("adminArea");

    if (user) {

      loginArea.style.display =
        "none";

      adminArea.style.display =
        "block";

      render();

    } else {

      loginArea.style.display =
        "block";

      adminArea.style.display =
        "none";
    }
  }
);


// ==============================
// 初期表示
// ==============================

window.staffSlotsData =
  {};

render();