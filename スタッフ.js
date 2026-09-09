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
// Firebase 初期化
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
// 時刻設定
// ==============================
//
// 開始時刻・終了時刻は固定
//
// 09:00 ～ 15:00
//
// スタッフ画面から変更できません。
// ==============================

const FIXED_START =
  "09:00";


const FIXED_END =
  "15:00";


// ==============================
// 現在の設定
// ==============================

let currentSettings = {

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
// HTML取得用
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
//
// 09:00 → 09-00
// 09:30 → 09-30
// ==============================

function slotKey(time) {

  return time.replace(
    ":",
    "-"
  );
}


// ==============================
// 時間枠を作成
// ==============================

function createSlots() {

  const slots = [];


  const startMinutes =
    toMinutes(
      FIXED_START
    );


  const endMinutes =
    toMinutes(
      FIXED_END
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
// 最大組数を画面に反映
// ==============================

function setupMaxGroups() {

  const element =
    $("maxGroups");


  if (!element) {

    return;
  }


  const value =
    Number(
      currentSettings.maxGroups
    );


  if (
    value >= 1 &&
    value <= 10
  ) {

    element.value =
      String(value);
  }
}


// ==============================
// ページを更新
// ==============================

function render() {

  setupMaxGroups();

  renderPaperSlots();

  renderReservations();
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


        // ==========================
        // 予約なし
        // ==========================

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

        }


        // ==========================
        // 予約あり
        // ==========================

        else {

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

    // ==========================
    // 移動先を1組増やす
    // ==========================

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


    // ==========================
    // 予約情報を変更
    // ==========================

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


    // ==========================
    // 元の枠を1組減らす
    // ==========================

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


    // ==========================
    // ロールバック
    // ==========================

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

    // ==========================
    // 予約を削除
    // ==========================

    await remove(
      reservationRef
    );


    // ==========================
    // 枠数を1減らす
    // ==========================

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
// ★ 全体リセット
// ==============================
//
// リセット対象
//
// ・Queue/reservations
// ・Queue/slots
// ・Queue/reservationLast
//
// 設定は残す
//
// ・09:00
// ・15:00
// ・1枠の時間
// ・最大組数
// ・受付状態
//
// ==============================

async function resetAllData() {

  // ============================
  // 1回目の確認
  // ============================

  const firstConfirm =
    confirm(
      "予約データをすべてリセットします。\n\n" +
      "Web予約・紙予約・予約番号がすべて消えます。\n\n" +
      "本当に実行しますか？"
    );


  if (!firstConfirm) {

    return;
  }


  // ============================
  // 2回目の確認
  // ============================

  const secondConfirm =
    confirm(
      "【最終確認】\n\n" +
      "現在の予約をすべて削除し、" +
      "予約番号をDREAM001から再スタートします。\n\n" +
      "実行しますか？"
    );


  if (!secondConfirm) {

    return;
  }


  const resetButton =
    $("resetAll");


  const resetMessage =
    $("resetMessage");


  if (resetButton) {

    resetButton.disabled =
      true;

    resetButton.textContent =
      "リセットしています……";
  }


  if (resetMessage) {

    resetMessage.textContent =
      "データをリセットしています……";
  }


  try {

    // ==========================
    // まとめてリセット
    // ==========================

    await update(
      ref(
        db,
        "Queue"
      ),
      {

        /*
          予約をすべて削除
        */

        reservations:
          null,


        /*
          時間枠の人数をすべて削除

          → 存在しない枠は
            お客さん側・スタッフ側で
            0組として扱われます。
        */

        slots:
          null,


        /*
          予約番号を0へ戻す

          次の予約
          → DREAM001
        */

        reservationLast:
          0,


        /*
          リセットした時刻を保存。

          お客さん側が古いlocalStorageを
          持っている場合に、
          後で自動的に判定できるようにする。
        */

        resetAt:
          Date.now()
      }
    );


    // ==========================
    // 完了
    // ==========================

    if (resetMessage) {

      resetMessage.textContent =
        "予約データをリセットしました。";
    }


    alert(
      "予約データをリセットしました。\n\n" +
      "次の予約番号はDREAM001です。"
    );


    render();


  } catch (error) {

    console.error(
      "全体リセットエラー:",
      error
    );


    if (resetMessage) {

      resetMessage.textContent =
        "リセットに失敗しました。";
    }


    alert(
      "リセットに失敗しました。\n" +
      "もう一度お試しください。"
    );

  } finally {

    if (resetButton) {

      resetButton.disabled =
        false;

      resetButton.textContent =
        "全体リセット";
    }
  }
}


// ==============================
// ログイン
// ==============================

$("login").addEventListener(
  "click",
  async () => {

    const password =
      $("password").value;


    const loginMessage =
      $("loginMessage");


    if (!password) {

      loginMessage.textContent =
        "パスワードを入力してください。";

      return;
    }


    loginMessage.textContent =
      "ログインしています……";


    try {

      await signInWithEmailAndPassword(
        auth,
        STAFF_EMAIL,
        password
      );


      loginMessage.textContent =
        "";

    } catch (error) {

      console.error(
        "ログインエラー:",
        error
      );


      loginMessage.textContent =
        "パスワードが違います。";
    }
  }
);


// ==============================
// Enterキーでログイン
// ==============================

$("password").addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Enter"
    ) {

      $("login").click();
    }
  }
);


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


    // ==========================
    // 1枠の時間
    // ==========================

    const slotMinutes =
      $("slotMinutes");


    if (slotMinutes) {

      slotMinutes.value =
        String(
          currentSettings.slotMinutes
        );
    }


    // ==========================
    // 最大組数
    // ==========================

    const maxGroups =
      $("maxGroups");


    if (maxGroups) {

      maxGroups.value =
        String(
          currentSettings.maxGroups
        );
    }


    // ==========================
    // 受付状態
    // ==========================

    const receptionState =
      $("receptionState");


    const toggleOpen =
      $("toggleOpen");


    if (
      currentSettings.open
    ) {

      if (receptionState) {

        receptionState.textContent =
          "受付中";
      }


      if (toggleOpen) {

        toggleOpen.textContent =
          "受付停止";
      }

    } else {

      if (receptionState) {

        receptionState.textContent =
          "受付停止中";
      }


      if (toggleOpen) {

        toggleOpen.textContent =
          "受付再開";
      }
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
  () => {

    renderPaperSlots();

    renderReservations();
  }
);


// ==============================
// 受付停止・再開
// ==============================

$("toggleOpen").addEventListener(
  "click",
  async () => {

    const newOpen =
      !currentSettings.open;


    try {

      await update(
        ref(
          db,
          "Queue/settings"
        ),
        {
          open:
            newOpen
        }
      );

    } catch (error) {

      console.error(
        "受付状態変更エラー:",
        error
      );


      alert(
        "受付状態の変更に失敗しました。"
      );
    }
  }
);


// ==============================
// 設定を保存
// ==============================
//
// ・開始時刻 → 09:00固定
// ・終了時刻 → 15:00固定
// ・1枠の時間 → 変更可能
// ・最大組数 → 変更可能
// ==============================

$("saveSettings").addEventListener(
  "click",
  async () => {

    const settingsMessage =
      $("settingsMessage");


    const slotMinutes =
      Number(
        $("slotMinutes").value
      );


    const maxGroups =
      Number(
        $("maxGroups").value
      );


    // ==========================
    // 1枠の時間チェック
    // ==========================

    if (
      !Number.isInteger(
        slotMinutes
      ) ||
      slotMinutes <= 0
    ) {

      settingsMessage.textContent =
        "1枠の時間は1分以上の整数にしてください。";

      return;
    }


    // ==========================
    // 最大組数チェック
    // ==========================

    if (
      !Number.isInteger(
        maxGroups
      ) ||
      maxGroups < 1 ||
      maxGroups > 10
    ) {

      settingsMessage.textContent =
        "最大組数は1〜10組にしてください。";

      return;
    }


    // ==========================
    // 09:00〜15:00
    // ==========================

    const totalMinutes =
      toMinutes(FIXED_END) -
      toMinutes(FIXED_START);


    // ==========================
    // 長すぎる場合
    // ==========================

    if (
      slotMinutes >
      totalMinutes
    ) {

      settingsMessage.textContent =
        "1枠の時間が長すぎます。";

      return;
    }


    // ==========================
    // 6時間に割り切れるか
    // ==========================

    if (
      totalMinutes %
      slotMinutes !== 0
    ) {

      settingsMessage.textContent =
        "1枠の時間は、09:00〜15:00の6時間にきれいに収まる値にしてください。";

      return;
    }


    settingsMessage.textContent =
      "保存しています……";


    try {

      await update(
        ref(
          db,
          "Queue/settings"
        ),
        {

          start:
            FIXED_START,

          end:
            FIXED_END,

          slotMinutes:
            slotMinutes,

          maxGroups:
            maxGroups,

          open:
            currentSettings.open
        }
      );


      currentSettings = {

        start:
          FIXED_START,

        end:
          FIXED_END,

        slotMinutes:
          slotMinutes,

        maxGroups:
          maxGroups,

        open:
          currentSettings.open
      };


      settingsMessage.textContent =
        "設定を保存しました。";


      render();


    } catch (error) {

      console.error(
        "設定保存エラー:",
        error
      );


      settingsMessage.textContent =
        "設定の保存に失敗しました。";
    }
  }
);


// ==============================
// 紙予約の時間枠変更
// ==============================

$("paperSlot").addEventListener(
  "change",
  () => {

    updatePaperSlotInfo();
  }
);


// ==============================
// 紙予約追加
// ==============================

$("addPaper").addEventListener(
  "click",
  async () => {

    const paperName =
      $("paperName")
        .value
        .trim();


    const paperSize =
      Number(
        $("paperSize").value
      );


    const paperSlot =
      $("paperSlot").value;


    const paperMessage =
      $("paperMessage");


    // ==========================
    // 名前チェック
    // ==========================

    if (!paperName) {

      paperMessage.textContent =
        "名前を入力してください。";

      return;
    }


    // ==========================
    // 人数チェック
    // ==========================

    if (
      !Number.isInteger(
        paperSize
      ) ||
      paperSize < 1 ||
      paperSize > 4
    ) {

      paperMessage.textContent =
        "人数は1〜4人にしてください。";

      return;
    }


    // ==========================
    // 時間枠チェック
    // ==========================

    if (!paperSlot) {

      paperMessage.textContent =
        "時間枠を選択してください。";

      return;
    }


    const slot =
      createSlots().find(
        item =>
          item.key ===
          paperSlot
      );


    if (!slot) {

      paperMessage.textContent =
        "時間枠が見つかりません。";

      return;
    }


    paperMessage.textContent =
      "追加しています……";


    // ==========================
    // 枠数
    // ==========================

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


      paperMessage.textContent =
        "時間枠の更新に失敗しました。";

      return;
    }


    // ==========================
    // 満員
    // ==========================

    if (
      !countTransaction.committed
    ) {

      paperMessage.textContent =
        "その時間枠は満員です。";

      return;
    }


    // ==========================
    // 予約番号
    // ==========================

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


      // ========================
      // 枠数を戻す
      // ========================

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


      paperMessage.textContent =
        "予約番号の発行に失敗しました。";

      return;
    }


    // ==========================
    // 予約データ
    // ==========================

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

      createdAt:
        Date.now()
    };


    // ==========================
    // 予約保存
    // ==========================

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


      paperMessage.textContent =
        `予約を追加しました。予約番号：${reservationNumber}`;


      $("paperName").value =
        "";


      updatePaperSlotInfo();


    } catch (error) {

      console.error(
        "紙予約保存エラー:",
        error
      );


      // ========================
      // 枠数ロールバック
      // ========================

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


      paperMessage.textContent =
        "紙予約の保存に失敗しました。";
    }
  }
);


// ==============================
// ★ 全体リセットボタン
// ==============================

$("resetAll").addEventListener(
  "click",
  async () => {

    await resetAllData();

  }
);


// ==============================
// ログアウト
// ==============================

$("logout").addEventListener(
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


// ==============================
// 初期表示
// ==============================

render();