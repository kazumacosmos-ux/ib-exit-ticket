import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  set,
  update,
  remove
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { firebaseConfig } from "./Firebase設定.js";


const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const $ = (id) => document.getElementById(id);

let settings = {};
let slots = {};
let reservations = {};


function toMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}


function slotKey(minutes) {
  return (
    String(Math.floor(minutes / 60)).padStart(2, "0") +
    "-" +
    String(minutes % 60).padStart(2, "0")
  );
}


function createSlots() {
  const result = {};

  const start = toMinutes(settings.start || "09:00");
  const end = toMinutes(settings.end || "17:00");
  const minutes = Number(settings.slotMinutes || 30);

  for (let m = start; m < end; m += minutes) {
    const e = m + minutes;

    result[slotKey(m)] = {
      key: slotKey(m),
      start: slotKey(m).replace("-", ":"),
      end: slotKey(e).replace("-", ":")
    };
  }

  return result;
}


function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}


function render() {
  renderPaperSlots();
  renderReservations();
}


function renderPaperSlots() {
  const select = $("paperSlot");

  if (!select) return;

  select.innerHTML = "";

  Object.values(createSlots()).forEach((slot) => {

    const count = Number(
      slots[slot.key]?.count || 0
    );

    const option = document.createElement("option");

    option.value = slot.key;

    option.textContent =
      `${slot.start}～${slot.end}（${count}/${settings.maxGroups}組）`;

    option.disabled =
      count >= Number(settings.maxGroups);

    select.appendChild(option);
  });

  updatePaperSlotInfo();
}


function updatePaperSlotInfo() {
  const select = $("paperSlot");
  const info = $("paperSlotInfo");

  if (!select || !info) return;

  const slot = createSlots()[select.value];

  info.textContent = slot
    ? `${slot.start}～${slot.end}`
    : "";
}


function renderReservations() {
  const list = $("slotList");

  if (!list) return;

  list.innerHTML = "";

  Object.values(createSlots()).forEach((slot) => {

    const count = Number(
      slots[slot.key]?.count || 0
    );

    const box = document.createElement("div");

    box.className = "slot-box";

    box.innerHTML =
      `<h4>${slot.start}～${slot.end} <span>${count}/${settings.maxGroups}組</span></h4>`;

    const reservationsInSlot =
      Object.values(reservations)
        .filter((r) => r.slot === slot.key)
        .sort(
          (a, b) =>
            Number(a.number) - Number(b.number)
        );

    if (reservationsInSlot.length === 0) {
      box.innerHTML += "<p>予約なし</p>";
    }

    reservationsInSlot.forEach((reservation) => {

      const row = document.createElement("div");

      row.className = "reservation-row";

      const text = document.createElement("div");

      text.innerHTML =
        `<strong>No.${reservation.number}</strong>　` +
        `${escapeHtml(reservation.name || "名前なし")}　` +
        `${reservation.size}人　` +
        `${reservation.type === "paper" ? "紙" : "Web"}`;

      const moveButton =
        document.createElement("button");

      moveButton.textContent = "時間変更";
      moveButton.className = "small";

      moveButton.onclick = () =>
        moveReservation(reservation);


      const deleteButton =
        document.createElement("button");

      deleteButton.textContent = "削除";
      deleteButton.className = "small danger";

      deleteButton.onclick = () =>
        deleteReservation(reservation);


      const actions =
        document.createElement("div");

      actions.appendChild(moveButton);
      actions.appendChild(deleteButton);

      row.appendChild(text);
      row.appendChild(actions);

      box.appendChild(row);
    });

    list.appendChild(box);
  });
}


async function moveReservation(reservation) {

  const available =
    Object.values(createSlots()).filter((slot) => {

      const count =
        Number(slots[slot.key]?.count || 0);

      return (
        slot.key !== reservation.slot &&
        count < Number(settings.maxGroups)
      );
    });


  if (available.length === 0) {

    alert("移動できる空き枠がありません。");

    return;
  }


  const choices =
    available
      .map(
        (slot, index) =>
          `${index + 1}: ${slot.start}～${slot.end} ` +
          `（${Number(slots[slot.key]?.count || 0)}/${settings.maxGroups}）`
      )
      .join("\n");


  const input =
    prompt(
      "移動先の番号を入力してください。\n\n" +
      choices
    );


  if (input === null) return;


  const target =
    available[Number(input) - 1];


  if (!target) {

    alert("正しい番号を入力してください。");

    return;
  }


  const oldRef =
    ref(
      db,
      `Queue/slots/${reservation.slot}/count`
    );


  const newRef =
    ref(
      db,
      `Queue/slots/${target.key}/count`
    );


  const oldResult =
    await runTransaction(
      oldRef,
      (value) =>
        Math.max(
          0,
          Number(value || 0) - 1
        )
    );


  if (!oldResult.committed) {

    alert("元の枠の更新に失敗しました。");

    return;
  }


  const newResult =
    await runTransaction(
      newRef,
      (value) => {

        const count =
          Number(value || 0);

        return count >=
          Number(settings.maxGroups)
          ? undefined
          : count + 1;
      }
    );


  if (!newResult.committed) {

    await runTransaction(
      oldRef,
      (value) =>
        Number(value || 0) + 1
    );

    alert("移動先が満員になりました。");

    return;
  }


  await update(
    ref(
      db,
      `Queue/reservations/${reservation.number}`
    ),
    {
      slot: target.key,
      start: target.start,
      end: target.end
    }
  );
}


async function deleteReservation(reservation) {

  const ok =
    confirm(
      `No.${reservation.number}「${reservation.name || "名前なし"}」を削除しますか？`
    );


  if (!ok) return;


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
        Number(value || 0) - 1
      )
  );
}


$("login").onclick = async () => {

  $("loginMessage").textContent = "";

  try {

    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );

  } catch (error) {

    $("loginMessage").textContent =
      "ログインできませんでした。メールアドレスとパスワードを確認してください。";
  }
};


onAuthStateChanged(auth, (user) => {

  $("loginArea").hidden = !!user;

  $("controlArea").hidden = !user;
});


$("logout").onclick = () =>
  signOut(auth);


onValue(
  ref(db, "Queue/settings"),
  (snapshot) => {

    settings =
      snapshot.val() || {};

    $("start").value =
      settings.start || "09:00";

    $("end").value =
      settings.end || "17:00";

    $("slotMinutes").value =
      String(settings.slotMinutes || 30);

    $("maxGroups").value =
      String(settings.maxGroups || 5);


    $("state").textContent =
      settings.open === false
        ? "受付停止中"
        : "受付中";


    $("toggle").textContent =
      settings.open === false
        ? "受付再開"
        : "受付停止";


    render();
  }
);


onValue(
  ref(db, "Queue/slots"),
  (snapshot) => {

    slots =
      snapshot.val() || {};

    render();
  }
);


onValue(
  ref(db, "Queue/reservations"),
  (snapshot) => {

    reservations =
      snapshot.val() || {};

    render();
  }
);


$("toggle").onclick = async () => {

  await update(
    ref(db, "Queue/settings"),
    {
      open:
        settings.open === false
    }
  );
};


$("saveSettings").onclick = async () => {

  await update(
    ref(db, "Queue/settings"),
    {
      start: $("start").value,
      end: $("end").value,
      slotMinutes:
        Number($("slotMinutes").value),
      maxGroups:
        Number($("maxGroups").value),
      open:
        settings.open !== false
    }
  );


  $("settingsMessage").textContent =
    "設定を保存しました。";
};


$("paperSlot").onchange =
  updatePaperSlotInfo;


$("addPaper").onclick = async () => {

  $("paperMessage").textContent = "";

  const name =
    $("paperName").value.trim();

  const size =
    Number($("paperSize").value);

  const slot =
    createSlots()[$("paperSlot").value];


  if (!name) {

    $("paperMessage").textContent =
      "名前を入力してください。";

    return;
  }


  if (!slot) {

    $("paperMessage").textContent =
      "時間帯を選択してください。";

    return;
  }


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

        return count >=
          Number(settings.maxGroups)
          ? undefined
          : count + 1;
      }
    );


  if (!countResult.committed) {

    $("paperMessage").textContent =
      "その時間帯は満員です。";

    return;
  }


  const lastResult =
    await runTransaction(
      ref(
        db,
        "Queue/reservationLast"
      ),
      (value) =>
        Number(value || 0) + 1
    );


  if (!lastResult.committed) {

    await runTransaction(
      countRef,
      (value) =>
        Math.max(
          0,
          Number(value || 0) - 1
        )
    );


    $("paperMessage").textContent =
      "予約番号の取得に失敗しました。";

    return;
  }


  const number =
    lastResult.snapshot.val();


  await set(
    ref(
      db,
      `Queue/reservations/${number}`
    ),
    {
      number,
      name,
      slot: slot.key,
      start: slot.start,
      end: slot.end,
      size,
      type: "paper",
      createdAt: Date.now()
    }
  );


  $("paperName").value = "";

  $("paperMessage").textContent =
    `No.${number} を追加しました。`;
};
