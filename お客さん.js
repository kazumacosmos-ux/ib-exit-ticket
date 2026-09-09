/* =========================================
   1-B出口 AIRLINES
   PREMIUM BOARDING PASS
   ========================================= */

* {
  box-sizing: border-box;
}

html {
  margin: 0;
  padding: 0;
  background: #06111f;
}

body {
  margin: 0;
  min-height: 100vh;
  padding: 0;

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Helvetica Neue",
    "Noto Sans JP",
    sans-serif;

  color: #182334;

  background:
    radial-gradient(
      circle at 50% -15%,
      #41698f 0%,
      #19334f 32%,
      #0a1829 67%,
      #050d17 100%
    );
}


/* =========================================
   全体
   ========================================= */

.container {
  width: 100%;
  max-width: 480px;

  margin: 0 auto;

  padding:
    32px
    18px
    60px;
}


/* =========================================
   メインタイトル
   ========================================= */

.container > h1 {
  margin: 0 0 30px;

  color: #ffffff;

  text-align: center;

  font-size: 28px;
  font-weight: 900;

  letter-spacing: 0.08em;

  text-shadow:
    0 3px 15px rgba(0, 0, 0, 0.25);
}

.container > h1::before {
  content: "✈";

  display: block;

  margin-bottom: 10px;

  font-size: 30px;
}

.container > h1::after {
  content: "1-B AIRLINES";

  display: block;

  margin-top: 10px;

  color: #a9bfd7;

  font-size: 9px;
  font-weight: 700;

  letter-spacing: 0.35em;
}


/* =========================================
   予約フォーム
   ========================================= */

#reserveArea {
  padding: 26px 22px 24px;

  border:
    1px solid
    rgba(255, 255, 255, 0.7);

  border-radius: 26px;

  background:
    rgba(255, 255, 255, 0.97);

  box-shadow:
    0 25px 60px rgba(0, 0, 0, 0.28);

  backdrop-filter: blur(15px);
}


/* =========================================
   フォーム見出し
   ========================================= */

#reserveArea h2 {
  margin: 0 0 24px;

  color: #0d1d31;

  font-size: 21px;
  font-weight: 900;

  letter-spacing: 0.03em;
}

#reserveArea h2::after {
  content: "BOOK YOUR FLIGHT";

  display: block;

  margin-top: 5px;

  color: #8493a5;

  font-size: 8px;
  font-weight: 800;

  letter-spacing: 0.22em;
}


/* =========================================
   ラベル
   ========================================= */

label {
  display: block;

  margin:
    19px
    0
    8px;

  color: #667487;

  font-size: 11px;
  font-weight: 800;

  letter-spacing: 0.1em;
}

label:first-of-type {
  margin-top: 0;
}


/* =========================================
   入力・選択
   ========================================= */

input,
select {
  width: 100%;
  height: 55px;

  padding:
    0
    16px;

  border:
    1px solid
    #dbe2ea;

  border-radius: 14px;

  outline: none;

  background: #f6f8fb;

  color: #162337;

  font-family: inherit;

  font-size: 16px;
  font-weight: 700;

  transition:
    0.2s ease;
}

input::placeholder {
  color: #a0aab8;
  font-weight: 500;
}

input:focus,
select:focus {
  border-color: #2d5d8d;

  background: #ffffff;

  box-shadow:
    0 0 0 4px
    rgba(45, 93, 141, 0.11);
}


/* =========================================
   時間選択
   ========================================= */

#slot {
  font-size: 17px;
  font-weight: 900;
}


/* =========================================
   時間枠情報
   ========================================= */

.slot-info {
  min-height: 20px;

  margin:
    9px
    3px
    0;

  color: #68778a;

  font-size: 12px;
  font-weight: 700;
}


/* =========================================
   予約ボタン
   ========================================= */

#reserve {
  width: 100%;

  min-height: 59px;

  margin-top: 21px;

  border: 0;

  border-radius: 16px;

  background:
    linear-gradient(
      135deg,
      #0c2038 0%,
      #245986 52%,
      #3477aa 100%
    );

  color: #ffffff;

  font-family: inherit;

  font-size: 16px;
  font-weight: 900;

  letter-spacing: 0.04em;

  box-shadow:
    0 12px 25px
    rgba(20, 61, 96, 0.3);

  cursor: pointer;

  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    opacity 0.15s ease;
}

#reserve:active {
  transform: translateY(2px);

  box-shadow:
    0 6px 13px
    rgba(20, 61, 96, 0.25);
}

#reserve:disabled {
  opacity: 0.5;
}


/* =========================================
   エラー・完了メッセージ
   ========================================= */

.error {
  margin:
    13px
    2px
    0;

  color: #b33a35;

  font-size: 12px;
  font-weight: 700;

  line-height: 1.6;
}


/* =========================================
   予約済みエリア
   ========================================= */

#reservationArea {
  margin-top: 26px;

  padding: 0;

  background: transparent;

  box-shadow: none;
}

#reservationArea > h2 {
  margin:
    0
    0
    14px;

  color: #ffffff;

  font-size: 17px;
  font-weight: 800;

  letter-spacing: 0.05em;
}


/* =========================================
   搭乗券
   ========================================= */

.boarding-pass {
  position: relative;

  overflow: hidden;

  margin-bottom: 22px;

  border-radius: 25px;

  background: #ffffff;

  box-shadow:
    0 25px 60px
    rgba(0, 0, 0, 0.34);
}


/* =========================================
   搭乗券ヘッダー
   ========================================= */

.boarding-pass-header {
  display: flex;

  align-items: center;
  justify-content: space-between;

  min-height: 100px;

  padding:
    22px
    22px
    20px;

  color: #ffffff;

  background:
    linear-gradient(
      135deg,
      #061426 0%,
      #102d4b 48%,
      #245c86 100%
    );
}

.boarding-pass-header h2 {
  margin: 0;

  color: #ffffff;

  font-size: 15px;
  font-weight: 900;

  letter-spacing: 0.1em;
}

.boarding-pass-header p {
  margin: 7px 0 0;

  color: #9eb8d1;

  font-size: 8px;
  font-weight: 700;

  letter-spacing: 0.16em;
}

.boarding-pass-header strong {
  color: #ffffff;

  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;

  font-size: 19px;
  font-weight: 900;

  letter-spacing: 0.04em;
}


/* =========================================
   搭乗券メイン
   ========================================= */

.boarding-pass-main {
  padding:
    26px
    22px
    24px;
}


/* =========================================
   ご来場時間
   ========================================= */

.boarding-arrival {
  padding:
    4px
    0
    23px;

  border-bottom:
    1px solid
    #e8edf2;
}

.boarding-arrival span {
  display: block;

  margin-bottom: 8px;

  color: #8290a0;

  font-size: 9px;
  font-weight: 900;

  letter-spacing: 0.18em;
}

.boarding-arrival strong {
  display: block;

  color: #0a1b2e;

  font-size: 32px;
  font-weight: 950;

  letter-spacing: -0.04em;

  line-height: 1.05;
}


/* =========================================
   情報グリッド
   ========================================= */

.boarding-info-grid {
  display: grid;

  grid-template-columns:
    1fr
    1fr;

  gap:
    20px
    12px;

  padding:
    23px
    0
    21px;
}

.boarding-info-grid > div {
  min-width: 0;
}

.boarding-info-grid span {
  display: block;

  margin-bottom: 6px;

  color: #8995a4;

  font-size: 8px;
  font-weight: 900;

  letter-spacing: 0.15em;
}

.boarding-info-grid strong {
  display: block;

  overflow: hidden;

  color: #17263a;

  font-size: 16px;
  font-weight: 900;

  text-overflow: ellipsis;

  white-space: nowrap;
}


/* =========================================
   ゲートを目立たせる
   ========================================= */

.boarding-info-grid > div:nth-child(2) strong {
  display: inline-flex;

  align-items: center;
  justify-content: center;

  min-width: 62px;
  min-height: 30px;

  padding:
    3px
    11px;

  border-radius: 8px;

  color: #ffffff;

  background: #102d49;

  font-size: 15px;

  letter-spacing: 0.04em;
}


/* =========================================
   代表者
   ========================================= */

.boarding-pass-passenger {
  display: flex;

  align-items: center;
  justify-content: space-between;

  gap: 15px;

  padding:
    17px
    16px;

  border-radius: 13px;

  background:
    #f4f7fa;
}

.boarding-pass-passenger span {
  color: #8995a4;

  font-size: 9px;
  font-weight: 900;

  letter-spacing: 0.15em;

  white-space: nowrap;
}

.boarding-pass-passenger strong {
  overflow: hidden;

  color: #16253a;

  font-size: 15px;
  font-weight: 900;

  text-align: right;

  text-overflow: ellipsis;

  white-space: nowrap;
}


/* =========================================
   ミシン目
   ========================================= */

.boarding-pass::after {
  content: "";

  display: block;

  height: 2px;

  margin:
    0
    20px;

  background:
    repeating-linear-gradient(
      90deg,
      #d5dce4 0,
      #d5dce4 7px,
      transparent 7px,
      transparent 13px
    );
}


/* =========================================
   搭乗券フッター
   ========================================= */

.boarding-pass-footer {
  padding:
    20px
    22px
    22px;
}

.boarding-note {
  margin:
    0
    0
    17px;

  color: #657386;

  font-size: 11px;
  font-weight: 600;

  line-height: 1.8;

  text-align: center;
}


/* =========================================
   バーコード風の装飾
   ========================================= */

.boarding-pass-footer::before {
  content: "";

  display: block;

  width: 100%;
  height: 38px;

  margin:
    0
    0
    17px;

  opacity: 0.72;

  background:
    repeating-linear-gradient(
      90deg,

      #111c2b 0,
      #111c2b 2px,

      transparent 2px,
      transparent 5px,

      #111c2b 5px,
      #111c2b 6px,

      transparent 6px,
      transparent 9px,

      #111c2b 9px,
      #111c2b 12px,

      transparent 12px,
      transparent 15px
    );
}


/* =========================================
   キャンセルボタン
   ========================================= */

.cancel-reservation {
  width: 100%;

  min-height: 47px;

  border:
    1px solid
    #d9dfe7;

  border-radius: 12px;

  background: #ffffff;

  color: #697687;

  font-family: inherit;

  font-size: 12px;
  font-weight: 800;

  cursor: pointer;

  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.cancel-reservation:active {
  background: #f1f4f7;

  border-color: #c8d0da;
}


/* =========================================
   受付停止
   ========================================= */

#closedArea {
  padding:
    28px
    22px;

  border-radius: 24px;

  background:
    rgba(255, 255, 255, 0.97);

  text-align: center;

  box-shadow:
    0 20px 50px
    rgba(0, 0, 0, 0.28);
}

#closedArea h2 {
  margin:
    0
    0
    10px;

  color: #17263a;

  font-size: 19px;
  font-weight: 900;
}

#closedArea p {
  margin: 0;

  color: #6d7989;

  font-size: 13px;

  line-height: 1.8;
}


/* =========================================
   スマートフォン
   ========================================= */

@media (max-width: 420px) {

  .container {
    padding:
      24px
      14px
      45px;
  }

  .container > h1 {
    margin-bottom: 24px;

    font-size: 24px;
  }

  #reserveArea {
    padding:
      23px
      18px
      21px;

    border-radius: 22px;
  }

  .boarding-pass {
    border-radius: 22px;
  }

  .boarding-pass-header {
    min-height: 92px;

    padding:
      20px
      18px;
  }

  .boarding-pass-header h2 {
    font-size: 13px;
  }

  .boarding-pass-header strong {
    font-size: 16px;
  }

  .boarding-pass-main {
    padding:
      23px
      18px
      21px;
  }

  .boarding-arrival strong {
    font-size: 29px;
  }

  .boarding-info-grid {
    gap:
      18px
      8px;
  }

  .boarding-pass-footer {
    padding:
      18px
      18px
      20px;
  }
}


/* =========================================
   小さいスマホ
   ========================================= */

@media (max-width: 340px) {

  .container {
    padding-left: 10px;
    padding-right: 10px;
  }

  .container > h1 {
    font-size: 22px;
  }

  .boarding-pass-header strong {
    font-size: 14px;
  }

  .boarding-arrival strong {
    font-size: 25px;
  }

  .boarding-info-grid strong {
    font-size: 14px;
  }
}
