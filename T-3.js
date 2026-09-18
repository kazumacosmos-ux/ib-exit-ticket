/* 1-B出口 プッシュ通知 Service Worker */
importScripts("https://www.gstatic.com/firebasejs/12.1.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.1.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA6xBMX14Z4gO4KE8Dy0qtTrQayDh9Fuzc",
  authDomain: "bdeguchi-1666f.firebaseapp.com",
  databaseURL: "https://bdeguchi-1666f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bdeguchi-1666f",
  storageBucket: "bdeguchi-1666f.firebasestorage.app",
  messagingSenderId: "578146539417",
  appId: "1:578146539417:web:159ff465f65a3fdfeea508"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "1-B出口";
  const body = payload?.notification?.body || "予約に変動があります。";

  self.registration.showNotification(title, {
    body,
    tag: "ib-exit-reservation",
    renotify: true
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = "https://kazumacosmos-ux.github.io/ib-exit-ticket/T-1.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
