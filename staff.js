import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  update,
  set
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import {
  firebaseConfig
} from "./firebase-config.js";


/* =========================
   Firebase
========================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);


/* =========================
   Firebase References
========================= */

const settingsRef = ref(db, "Queue/settings");
const slotsRef = ref(db, "Queue/slots");


/* =========================
   HTML
========================= */

const loginArea =
  document.getElementById("loginArea");

const controlArea =
  document.getElementById("controlArea");

const email =
  document.getElementById("email");

const password =
  document.getElementById("password");

const login =
  document.getElementById("login");

const loginError =
  document.getElementById("loginError");

const stateEl =
  document.getElementById("state");

const toggle =
  document.getElementById("toggle");

const startEl =
  document.getElementById("start");

const endEl =
  document.getElementById("end");

const slotMinutesEl =
  document.getElementById("slotMinutes");

const maxGroupsEl =
  document.getElementById("maxGroups");

const saveSettings =
  document.getElementById("saveSettings");

const settingsMessage =
  document.getElementById("settingsMessage");

const paperSize =
  document.getElementById("paperSize");

const paperSlot =
  document.getElementById("paperSlot");

const paperSlotInfo =
  document.getElementById("paperSlotInfo");

const addPaper =
  document.getElementById("addPaper");

const paperMessage =
  document.getElementById("paperMessage");

const slotList =
  document.getElementById("slotList");

const logout =
  document.getElementById("logout");


/* =========================
   State
========================= */

let settings = {
  start: "09:00",
  end: "17:00",
  slotMinutes: 30,
  maxGroups: 5,
  open: true
};

let slots = {};


/* =========================
   時刻処理
========================= */

function timeToMinutes(time) {
  const [hour, minute] =
    time.split(":").map(Number);

  return hour * 60 + minute;
}


function minutesToTime(minutes) {
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


function createSlots() {
  const result = [];

  const start =
    timeToMinutes(settings.start);

  const end =
    timeToMinutes(settings.end);

  const duration =
    Number(settings.slotMinutes);

  if (!duration || duration <= 0) {
    return result;
  }

  for (
    let time = start;
    time < end;
    time += duration
  ) {
    const slotStart =
      minutesToTime(time);

    const slotEnd =
      minutesToTime(
        Math.min(
          time + duration,
          end
        )
      );

    result.push({
      key: slotStart.replace(":", "-"),
      start: slotStart,
      end: slotEnd
    });
  }

  return result;
}


/* =========================
   ログイン状態
========================= */

onAuthStateChanged(
  auth,
  user => {
    loginArea.hidden = !!user;
    controlArea.hidden = !user;
  }
);


/* =========================
   ログイン
========================= */

login.onclick = async () => {

  loginError.textContent = "";
  login.disabled = true;

  try {

    await signInWithEmailAndPassword(
      auth,
      email.value.trim(),
      password.value
    );

  } catch (e) {

    console.error(e);

    loginError.textContent =
      "ログインできませんでした。";

  } finally {

    login.disabled = false;
  }
};


/* =========================
   Settings監視
========================= */

onValue(
  settingsRef,
  snapshot => {

    const data =
      snapshot.val();

    if (data) {
      settings = {
        ...settings,
        ...data
      };
    }

    startEl.value =
      settings.start;

    endEl.value =
      settings.end;

    slotMinutesEl.value =
      String(settings.slotMinutes);

    maxGroupsEl.value =
      String(settings.maxGroups);

    renderState();
    renderPaperSlots();
    renderSlotList();

  }
);


/* =========================
   Slots監視
========================= */

onValue(
  slotsRef,
  snapshot => {

    slots =
      snapshot.val() || {};

    renderPaperSlots();
    renderSlotList();

  }
);


/* =========================
   受付状態表示
========================= */

function renderState() {

  const open =
    settings.open !== false;

  stateEl.textContent =
    open ? "受付中" : "受付停止中";

  toggle.textContent =
    open ? "受付停止" : "受付再開";
}


/* =========================
   受付停止・再開
========================= */

toggle.onclick = async () => {

  const newOpen =
    settings.open === false;

  try {

    await update(
      settingsRef,
      {
        open: newOpen
      }
    );

  } catch (e) {

    console.error(e);

    alert(
      "受付状態の変更に失敗しました。"
    );
  }
};


/* =========================
   設定保存
========================= */

saveSettings.onclick = async () => {

  settingsMessage.textContent = "";

  const start =
    startEl.value;

  const end =
    endEl.value;

  const slotMinutes =
    Number(slotMinutesEl.value);

  const maxGroups =
    Number(maxGroupsEl.value);


  if (!start || !end) {

    settingsMessage.textContent =
      "開始時刻と終了時刻を入力してください。";

    return;
  }


  if (
    timeToMinutes(start) >=
    timeToMinutes(end)
  ) {

    settingsMessage.textContent =
      "終了時刻は開始時刻より後にしてください。";

    return;
  }


  try {

    await update(
      settingsRef,
      {
        start,
        end,
        slotMinutes,
        maxGroups
      }
    );

    settingsMessage.textContent =
      "設定を保存しました。";

  } catch (e) {

    console.error(e);

    settingsMessage.textContent =
      "設定の保存に失敗しました。";
  }
};


/* =========================
   紙予約 時間帯表示
========================= */

function renderPaperSlots() {

  const generated =
    createSlots();

  const previous =
    paperSlot.value;

  paperSlot.innerHTML = "";

  let firstAvailable = null;

  for (const slot of generated) {

    const data =
      slots[slot.key] || {};

    const count =
      Number(data.count || 0);

    const max =
      Number(settings.maxGroups || 0);

    const full =
      count >= max;

    const option =
      document.createElement("option");

    option.value =
      slot.key;

    option.textContent =
      `${slot.start}〜${slot.end}　${count}/${max}組`;

    option.disabled =
      full;

    paperSlot.appendChild(option);

    if (!full && firstAvailable === null) {
      firstAvailable = slot.key;
    }
  }


  const previousOption =
    [...paperSlot.options].find(
      option =>
        option.value === previous &&
        !option.disabled
    );


  if (previousOption) {

    paperSlot.value =
      previous;

  } else if (firstAvailable !== null) {

    paperSlot.value =
      firstAvailable;
  }


  updatePaperSlotInfo();
}


/* =========================
   紙予約 時間帯情報
========================= */

paperSlot.addEventListener(
  "change",
  updatePaperSlotInfo
);


function updatePaperSlotInfo() {

  const key =
    paperSlot.value;

  if (!key) {

    paperSlotInfo.textContent =
      "予約できる時間帯がありません。";

    addPaper.disabled = true;

    return;
  }

  const data =
    slots[key] || {};

  const count =
    Number(data.count || 0);

  const max =
    Number(settings.maxGroups || 0);

  paperSlotInfo.textContent =
    `現在 ${count}組 / ${max}組`;

  addPaper.disabled =
    count >= max;
}


/* =========================
   紙予約追加
========================= */

addPaper.onclick = async () => {

  paperMessage.textContent = "";

  const selectedKey =
    paperSlot.value;

  const size =
    Number(paperSize.value);

  if (!selectedKey) {

    paperMessage.textContent =
      "時間帯を選択してください。";

    return;
  }

  addPaper.disabled = true;

  try {

    /*
     * ① 先に時間帯の空きを確保
     */

    const countRef =
      ref(
        db,
        `Queue/slots/${selectedKey}/count`
      );

    const countResult =
      await runTransaction(
        countRef,
        current => {

          const count =
            Number(current || 0);

          const max =
            Number(settings.maxGroups || 0);

          if (count >= max) {
            return;
          }

          return count + 1;
        },
        {
          applyLocally: false
        }
      );


    if (!countResult.committed) {

      paperMessage.textContent =
        "この時間帯は満員になりました。";

      renderPaperSlots();

      return;
    }


    /*
     * ② 空きを確保できたら
     *    予約番号を発行
     */

    const lastRef =
      ref(
        db,
        "Queue/reservationLast"
      );


    const numberResult =
      await runTransaction(
        lastRef,
        current => {

          return Number(current || 0) + 1;

        },
        {
          applyLocally: false
        }
      );


    if (!numberResult.committed) {

      throw new Error(
        "予約番号を発行できませんでした。"
      );
    }


    const reservationNumber =
      Number(
        numberResult.snapshot.val()
      );


    /*
     * ③ 時間帯情報
     */

    const selectedSlot =
      createSlots().find(
        slot =>
          slot.key === selectedKey
      );


    if (!selectedSlot) {

      throw new Error(
        "時間帯情報を取得できませんでした。"
      );
    }


    /*
     * ④ 予約データ保存
     */

    const reservation = {

      number:
        reservationNumber,

      slot:
        selectedKey,

      start:
        selectedSlot.start,

      end:
        selectedSlot.end,

      size:
        size,

      type:
        "paper",

      createdAt:
        Date.now(),

      createdBy:
        auth.currentUser?.uid || ""
    };


    await set(
      ref(
        db,
        `Queue/reservations/${reservationNumber}`
      ),
      reservation
    );


    paperMessage.textContent =
      `紙予約を追加しました。予約番号：${reservationNumber}`;


  } catch (e) {

    console.error(e);

    paperMessage.textContent =
      "紙予約の追加に失敗しました。";

  } finally {

    addPaper.disabled = false;
  }
};


/* =========================
   時間帯一覧
========================= */

function renderSlotList() {

  const generated =
    createSlots();

  slotList.innerHTML = "";

  if (generated.length === 0) {

    slotList.textContent =
      "時間帯がありません。";

    return;
  }


  for (const slot of generated) {

    const data =
      slots[slot.key] || {};

    const count =
      Number(data.count || 0);

    const max =
      Number(settings.maxGroups || 0);

    const div =
      document.createElement("div");

    div.className =
      "slot-row";


    const name =
      document.createElement("strong");

    name.textContent =
      `${slot.start}〜${slot.end}`;


    const countEl =
      document.createElement("span");

    countEl.textContent =
      `${count} / ${max}組`;


    div.appendChild(name);
    div.appendChild(countEl);

    slotList.appendChild(div);
  }
}


/* =========================
   ログアウト
========================= */

logout.onclick = async () => {

  try {

    await signOut(auth);

  } catch (e) {

    console.error(e);
  }
};
