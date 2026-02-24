import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  signOut as firebaseSignOut, deleteUser
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  getFirestore,
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, getDocs,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyDkujQjqy2JwNVw8nEmXvPMa4gruKu1DWQ",
  authDomain:        "gradienttrade-1.firebaseapp.com",
  projectId:         "gradienttrade-1",
  storageBucket:     "gradienttrade-1.firebasestorage.app",
  messagingSenderId: "623944101785",
  appId:             "1:623944101785:web:c0e670159c9835ed04ed08"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

const STARTING_BALANCE = 10000;

// ── REQUIRE AUTH ──────────────────────────────────────────────────────────────
// Fires callback IMMEDIATELY with cached/Google data so the UI never hangs,
// then fires again once Firestore responds with fresh data.
export function requireAuth(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    // ── Step 1: Fire immediately with what we know right now ──
    const instant = {
      uid:             user.uid,
      displayName:     localStorage.getItem('gt_display_name') || user.displayName || 'Trader',
      email:           user.email || '',
      photo:           localStorage.getItem('gt_photo') || user.photoURL || '',
      balance:         parseFloat(localStorage.getItem('gt_balance') || String(STARTING_BALANCE)),
      startingBalance: STARTING_BALANCE,
      totalTrades:     0, wins: 0, losses: 0,
    };
    callback(user, instant);

    // ── Step 2: Try Firestore and call back again with real data ──
    try {
      const userRef = doc(db, 'users', user.uid);
      let snap      = await getDoc(userRef);

      if (!snap.exists()) {
        await setDoc(userRef, {
          uid:             user.uid,
          displayName:     user.displayName || 'Trader',
          email:           user.email,
          photo:           user.photoURL || '',
          balance:         STARTING_BALANCE,
          startingBalance: STARTING_BALANCE,
          totalTrades: 0, tradeCount: 0,
          wins: 0, winCount: 0, losses: 0,
          createdAt: serverTimestamp(),
        });
        snap = await getDoc(userRef);
      }

      const userData = snap.data();

      // Update localStorage cache
      localStorage.setItem('gt_display_name', userData.displayName || user.displayName || 'Trader');
      localStorage.setItem('gt_email',        userData.email        || user.email || '');
      localStorage.setItem('gt_balance',      String(userData.balance ?? STARTING_BALANCE));
      if (userData.photo || user.photoURL) {
        localStorage.setItem('gt_photo', userData.photo || user.photoURL);
      }

      // Fire again with real Firestore data — mark it so sidebar knows it's confirmed
      callback(user, { ...userData, _fromFirestore: true });

    } catch (err) {
      // Firestore failed — the instant callback already ran so UI is not stuck.
      // Most likely cause: Firestore Security Rules. Fix them in Firebase Console:
      //
      //   rules_version = '2';
      //   service cloud.firestore {
      //     match /databases/{database}/documents {
      //       match /users/{userId} {
      //         allow read, write: if request.auth != null && request.auth.uid == userId;
      //       }
      //       match /trades/{tradeId} {
      //         allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      //         allow create: if request.auth != null;
      //       }
      //     }
      //   }
      console.warn('[GradientTrade] Firestore unavailable (' + err.code + '). UI loaded from cache. Fix your Firestore Security Rules if trades/balance are not persisting.');
    }
  });
}

// ── LOAD SIDEBAR ──────────────────────────────────────────────────────────────
export function loadSidebar(user, userData) {
  const nameEl    = document.querySelector('.user-name');
  const balanceEl = document.querySelector('.user-balance');
  const avatarEl  = document.getElementById('user-avatar') || document.querySelector('.user-avatar');

  if (nameEl) nameEl.textContent = userData.displayName || user?.displayName || 'Trader';

  const cashBalance = userData.balance ?? STARTING_BALANCE;
  if (balanceEl) {
    // Keep showing '—' until we have the real total (cash + holdings).
    // Only set to cash-only if Firestore already confirmed this is real data
    // (i.e. userData came from Firestore, not just the instant localStorage pass).
    // We detect this by checking if userData has a uid field from Firestore.
    if (userData._fromFirestore) {
      // Firestore data confirmed — enrich with live holdings in background
      balanceEl.textContent = '—';
      _updateSidebarTotal(user, cashBalance, balanceEl);
    } else {
      // Still waiting on Firestore — keep showing placeholder
      if (balanceEl.textContent === '—' || balanceEl.textContent === '') {
        balanceEl.textContent = '—';
      }
    }
  }

  if (avatarEl) {
    const photo = localStorage.getItem('gt_avatar') || userData.photo || user?.photoURL;
    if (photo) {
      avatarEl.style.overflow = 'hidden';
      avatarEl.style.position = 'relative';
      avatarEl.innerHTML      = `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;position:absolute;inset:0;">`;
    } else {
      const name     = userData.displayName || user?.displayName || 'Trader';
      const parts    = name.split(' ');
      const initials = parts.length >= 2
        ? parts[0][0] + parts[parts.length - 1][0]
        : name.slice(0, 2);
      avatarEl.textContent = initials.toUpperCase();
    }
  }
}

async function _updateSidebarTotal(user, cashBalance, balanceEl) {
  if (!user?.uid) return;
  try {
    const coinIdMap = { Bitcoin: 'bitcoin', Ethereum: 'ethereum', Solana: 'solana', Avalanche: 'avalanche-2' };

    // Get trades and compute net holdings
    const snap   = await getDocs(query(collection(db, 'trades'), where('userId','==', user.uid)));
    const trades = snap.docs.map(d => d.data());

    const holdings = {};
    trades.forEach(t => {
      if (!holdings[t.coinName]) holdings[t.coinName] = 0;
      if (t.type === 'buy')  holdings[t.coinName] += t.coinAmount;
      if (t.type === 'sell') holdings[t.coinName] -= t.coinAmount;
    });
    Object.keys(holdings).forEach(k => { if (holdings[k] <= 0.000001) delete holdings[k]; });

    const coinNames = Object.keys(holdings);
    if (!coinNames.length) return; // all cash, no update needed

    // Fetch live prices
    const ids    = coinNames.map(n => coinIdMap[n]).filter(Boolean).join(',');
    const res    = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd');
    const prices = await res.json();

    let holdingsValue = 0;
    coinNames.forEach(name => {
      const price = prices[coinIdMap[name]]?.usd || 0;
      holdingsValue += holdings[name] * price;
    });

    const total = cashBalance + holdingsValue;
    balanceEl.textContent = '$' + total
      .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  } catch(e) {
    console.warn('Sidebar total error:', e.message);
  }
}

// ── PLACE A TRADE ─────────────────────────────────────────────────────────────
export async function placeTrade(userId, { coin, coinName, symbol, type, amountUSD, coinAmount, priceAtTrade }) {
  if (!userId) {
    const trades  = JSON.parse(localStorage.getItem('gt_trades') || '[]');
    const balance = parseFloat(localStorage.getItem('gt_balance') || String(STARTING_BALANCE));
    const newBal  = type === 'buy' ? balance - amountUSD : balance + amountUSD;
    trades.unshift({ coin, coinName, symbol, type, amountUSD, coinAmount, priceAtTrade, pnl: 0, pnlPct: 0, date: { seconds: Date.now() / 1000 } });
    localStorage.setItem('gt_trades',  JSON.stringify(trades));
    localStorage.setItem('gt_balance', newBal.toFixed(2));
    return { balance: newBal };
  }

  let pnl = 0, pnlPct = 0;
  if (type === 'sell') {
    try {
      const buySnap = await getDocs(query(collection(db, 'trades'),
        where('userId','==',userId), where('coin','==',coin), where('type','==','buy')));
      if (!buySnap.empty) {
        const buys   = buySnap.docs.map(d => d.data());
        const avgBuy = buys.reduce((s, b) => s + b.priceAtTrade, 0) / buys.length;
        pnl    = (priceAtTrade - avgBuy) * coinAmount;
        pnlPct = ((priceAtTrade - avgBuy) / avgBuy) * 100;
      }
    } catch (e) { console.warn('P&L calc error:', e.message); }
  }

  await addDoc(collection(db, 'trades'), {
    userId, coin, coinName, symbol, type,
    amountUSD, coinAmount, priceAtTrade,
    pnl, pnlPct, date: serverTimestamp(),
  });

  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    balance:     increment(type === 'buy' ? -amountUSD : amountUSD),
    totalTrades: increment(1),
    tradeCount:  increment(1),
    ...(type === 'sell' && pnl > 0  && { wins: increment(1), winCount: increment(1) }),
    ...(type === 'sell' && pnl <= 0 && { losses: increment(1) }),
  });

  const updated = await getDoc(userRef);
  const newData = updated.data();
  localStorage.setItem('gt_balance', String(newData.balance));
  return newData;
}

// ── GET USER TRADES ───────────────────────────────────────────────────────────
export async function getUserTrades(userId) {
  if (!userId) return JSON.parse(localStorage.getItem('gt_trades') || '[]');
  try {
    const snap = await getDocs(query(collection(db, 'trades'),
      where('userId','==',userId), orderBy('date','desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('getUserTrades error:', e.message);
    return [];
  }
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
export async function getLeaderboard() {
  try {
    // Fetch all users
    const snap = await getDocs(query(collection(db, 'users'), orderBy('balance', 'desc')));
    const users = snap.docs.map(d => d.data());

    if (!users.length) return [];

    // Fetch all trades in one query, grouped by userId
    const tradesSnap = await getDocs(collection(db, 'trades'));
    const tradesByUser = {};
    tradesSnap.docs.forEach(d => {
      const t = d.data();
      if (!tradesByUser[t.userId]) tradesByUser[t.userId] = [];
      tradesByUser[t.userId].push(t);
    });

    // Compute net holdings per user
    const coinIdMap = { Bitcoin: 'bitcoin', Ethereum: 'ethereum', Solana: 'solana', Avalanche: 'avalanche-2' };
    const holdingsByUser = {};
    Object.keys(tradesByUser).forEach(uid => {
      const h = {};
      tradesByUser[uid].forEach(t => {
        if (!h[t.coinName]) h[t.coinName] = 0;
        if (t.type === 'buy')  h[t.coinName] += t.coinAmount;
        if (t.type === 'sell') h[t.coinName] -= t.coinAmount;
      });
      Object.keys(h).forEach(k => { if (h[k] <= 0.000001) delete h[k]; });
      holdingsByUser[uid] = h;
    });

    // Fetch live prices once for all coins
    let livePrices = {};
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,avalanche-2&vs_currencies=usd');
      livePrices = await r.json();
    } catch(e) { console.warn('Leaderboard price fetch failed:', e.message); }

    // Compute real total portfolio value (cash + coin holdings) per user
    const enriched = users.map(u => {
      const cash = u.balance ?? 0;
      const holdings = holdingsByUser[u.uid] || {};
      let coinValue = 0;
      Object.keys(holdings).forEach(name => {
        const price = livePrices[coinIdMap[name]]?.usd || 0;
        coinValue += holdings[name] * price;
      });
      return { ...u, totalPortfolioValue: cash + coinValue };
    });

    // Re-sort by real portfolio value (not just cash balance)
    enriched.sort((a, b) => b.totalPortfolioValue - a.totalPortfolioValue);

    return enriched.map((u, i) => ({ rank: i + 1, ...u }));

  } catch (e) {
    console.error('getLeaderboard error:', e.message);
    // Return helpful error info so the UI can show the right message
    if (e.code === 'permission-denied') {
      throw new Error('PERMISSION_DENIED');
    }
    return [];
  }
}

// ── RESET BALANCE ─────────────────────────────────────────────────────────────
export async function resetBalance(userId) {
  if (!userId) {
    localStorage.setItem('gt_balance', String(STARTING_BALANCE));
    localStorage.removeItem('gt_trades');
    return;
  }
  try {
    const snap = await getDocs(query(collection(db, 'trades'), where('userId','==',userId)));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    await updateDoc(doc(db, 'users', userId), {
      balance: STARTING_BALANCE, totalTrades: 0, tradeCount: 0,
      wins: 0, winCount: 0, losses: 0,
    });
    localStorage.setItem('gt_balance', String(STARTING_BALANCE));
  } catch (e) { console.error('resetBalance error:', e.message); }
}

// ── SIGN OUT ──────────────────────────────────────────────────────────────────
export async function signOut() {
  try { await firebaseSignOut(auth); } catch(e) {}
  localStorage.clear();
}

// ── DELETE ACCOUNT ────────────────────────────────────────────────────────────
export async function deleteUserAccount(userId) {
  try {
    if (userId) {
      const snap = await getDocs(query(collection(db, 'trades'), where('userId','==',userId)));
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'users', userId));
    }
    const user = auth.currentUser;
    if (user) await deleteUser(user);
  } catch (e) { console.error('deleteUserAccount error:', e.message); }
  localStorage.clear();
}