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
} from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const settingsRef = ref(db, "Queue/settings");
const slotsRef = ref(db, "Queue/slots");

const sizeEl = document.getElementById("size");
const slotEl = document.getElementById("slot");
const slotInfoEl = document.getElementById("slotInfo");
const reserveBtn = document.getElementById("reserve");

const reserveArea = document.getElementById("reserveArea");
const reservationArea = document.getElementById("reservationArea");
const closedArea = document.getElementById("closedArea");

const myNumberEl = document.getElementById("myNumber");
const mySlotEl = document.getElementById("mySlot");
const mySizeEl = document.getElementById("mySize");

const errorEl = document.getElementById("error");
const error2El = document.getElementById("error2");

let settings = {
  start: "09:00",
  end: "17:00",
  slotMinutes: 30,
  maxGroups: 5,
  open: true
};

let slots = {};
let myReservation = null;

const savedReservation =
  localStorage.getItem("ib_reservation");

if (savedReservation) {
  try {
    myReservation = JSON.parse(savedReservation);
  } catch {
    localStorage.removeItem("ib_reservation");
  }
}

function timeToMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );
}

function createSlots() {
  const result = [];

  const start = timeToMinutes(settings.start);
  const end = timeToMinutes(settings.end);
  const duration = Number(settings.slotMinutes);

  if (!duration || duration <= 0) {
    return result;
  }

  for (
    let time = start;
    time < end;
    time += duration
  ) {
    const slotStart = minutesToTime(time);
    const slotEnd = minutesToTime(
      Math.min(time + duration, end)
    );

    result.push({
      key: slotStart.replace(":", "-"),
      start: slotStart,
      end: slotEnd
    });
  }

  return result;
}

function renderSlots() {
  const generatedSlots = createSlots();
  const previousValue = slotEl.value;

  slotEl.innerHTML = "";

  let firstAvailable = null;

  for (const slot of generatedSlots) {
    const data = slots[slot.key] || {};

    const count = Number(data.count || 0);
    const maxGroups = Number(settings.maxGroups || 0);
    const full = count >= maxGroups;

    const option = document.createElement("option");

    option.value = slot.key;
    option.textContent =
      `${slot.start}〜${slot.end}　${count}/${maxGroups}組`;

    option.disabled = full;

    slotEl.appendChild(option);

    if (!full && firstAvailable === null) {
      firstAvailable = slot.key;
    }
  }

  const previousOption = [...slotEl.options].find(
    option =>
      option.value === previousValue &&
      !option.disabled
  );

  if (previousOption) {
    slotEl.value = previousValue;
  } else if (firstAvailable !== null) {
    slotEl.value = firstAvailable;
  }

  updateSlotInfo();
}

function updateSlotInfo() {
  const selected = slotEl.value;

  if (!selected) {
    slotInfoEl.textContent =
      "予約できる時間帯がありません。";

    reserveBtn.disabled = true;
    return;
  }

  const data = slots[selected] || {};
  const count = Number(data.count || 0);
  const maxGroups = Number(settings.maxGroups || 0);

  slotInfoEl.textContent =
    `現在 ${count}組 / ${maxGroups}組`;

  reserveBtn.disabled =
    count >= maxGroups;
}

function renderReservation() {
  if (!myReservation) {
    reservationArea.hidden = true;
    return;
  }

  reserveArea.hidden = true;
  closedArea.hidden = true;
  reservationArea.hidden = false;

  myNumberEl.textContent =
    myReservation.number;

  mySlotEl.textContent =
    `${myReservation.start}〜${myReservation.end}`;

  mySizeEl.textContent =
    myReservation.size;
}

function renderOpenState() {
  if (myReservation) {
    renderReservation();
    return;
  }

  const open = settings.open !== false;

  reserveArea.hidden = !open;
  closedArea.hidden = open;

  if (open) {
    renderSlots();
  }
}

onValue(
  settingsRef,
  snapshot => {
    const data = snapshot.val();

    if (data) {
      settings = {
        ...settings,
        ...data
      };
    }

    renderOpenState();
  },
  error => {
    error2El.textContent =
      "設定の読み込みに失敗しました。";

    console.error(error);
  }
);

onValue(
  slotsRef,
  snapshot => {
    slots = snapshot.val() || {};

    if (!myReservation) {
      renderSlots();
    }
  },
  error => {
    error2El.textContent =
      "予約状況の読み込みに失敗しました。";

    console.error(error);
  }
);

slotEl.addEventListener(
  "change",
  updateSlotInfo
);

reserveBtn.onclick = async () => {
  errorEl.textContent = "";

  if (settings.open === false) {
    errorEl.textContent =
      "現在、予約受付を停止しています。";
    return;
  }

  const selectedKey = slotEl.value;

  if (!selectedKey) {
    errorEl.textContent =
      "時間帯を選択してください。";
    return;
  }

  const selectedSlot = createSlots().find(
    slot => slot.key === selectedKey
  );

  if (!selectedSlot) {
    errorEl.textContent =
      "選択した時間帯が見つかりません。";
    return;
  }

  const size = Number(sizeEl.value);

  reserveBtn.disabled = true;

  try {

    /*
     * ① まず時間帯の空きを確保する。
     *
     * Transactionなので、
     * 複数人が同時に予約しても
     * maxGroupsを超えないようにする。
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
          const count = Number(current || 0);
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
      errorEl.textContent =
        "申し訳ありません。この時間帯は満員になりました。別の時間帯を選んでください。";

      renderSlots();
      return;
    }


    /*
     * ② 空きを確保できたら
     *    通し予約番号を発行する。
     */

    const lastRef =
      ref(db, "Queue/reservationLast");

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
      Number(numberResult.snapshot.val());


    /*
     * ③ 予約データを保存する。
     */

    const reservation = {
      number: reservationNumber,
      slot: selectedKey,
      start: selectedSlot.start,
      end: selectedSlot.end,
      size: size,
      type: "web",
      createdAt: Date.now()
    };

    await set(
      ref(
        db,
        `Queue/reservations/${reservationNumber}`
      ),
      reservation
    );


    /*
     * ④ お客さんの端末にも保存。
     */

    myReservation = reservation;

    localStorage.setItem(
      "ib_reservation",
      JSON.stringify(reservation)
    );

    renderReservation();

  } catch (e) {

    console.error(e);

    errorEl.textContent =
      "予約中にエラーが発生しました。時間をおいてもう一度お試しください。";

  } finally {

    reserveBtn.disabled = false;
  }
};

if (myReservation) {
  renderReservation();
}
