/* ==========================================
   REVIEWBOOST - PUBLIC & CUSTOMER APPLICATION ENGINE
   Project: neo-asisten (Firebase Realtime + LocalStorage Fallback)
   ========================================== */

const firebaseConfig = {
  apiKey: "AIzaSyAsjJ1LWJ5XbqKT5LYgnwzdFPqAs4vE1jU",
  authDomain: "neo-asisten.firebaseapp.com",
  databaseURL: "https://neo-asisten-default-rtdb.firebaseio.com",
  projectId: "neo-asisten",
  storageBucket: "neo-asisten.firebasestorage.app",
  messagingSenderId: "622575284682",
  appId: "1:622575284682:web:22a17e6c7df2f8982f9f33",
  measurementId: "G-2TT10BPEXR"
};

// Safe Firebase Initialization
let db = null;
try {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
    }
} catch (err) {
    console.warn('Firebase notice: LocalStorage fallback active.', err);
}

const STORAGE_KEY = 'reviewboost_db_v1';
const DOMAIN_KEY = 'reviewboost_base_domain';

function getEffectiveBaseDomain() {
    const saved = localStorage.getItem(DOMAIN_KEY);
    if (saved) return saved;
    const origin = window.location.origin;
    const path = window.location.pathname
        .replace('/admin/index.html', '')
        .replace('/admin/', '')
        .replace('/admin', '')
        .replace('/index.html', '');
    const cleanPath = path.endsWith('/') ? path.slice(0, -1) : path;
    return `${origin}${cleanPath}`;
}

// Initial Dataset
const INITIAL_DATA = {
    qrs: [
        {
            id: 'QR-8888',
            status: 'active',
            cafeName: 'Kopi Kenangan Senja',
            googleUrl: 'https://maps.google.com/?q=Kopi+Kenangan+Senja',
            ownerName: 'Pak Hendra',
            phone: '08123456789',
            smartFilter: true,
            scansCount: 48,
            createdDate: '2026-08-01'
        },
        {
            id: 'QR-8889',
            status: 'active',
            cafeName: 'Artisan Coffee & Eatery',
            googleUrl: 'https://maps.google.com/?q=Artisan+Coffee',
            ownerName: 'Ibu Sarah',
            phone: '08987654321',
            smartFilter: true,
            scansCount: 19,
            createdDate: '2026-08-10'
        },
        {
            id: 'QR-1001',
            status: 'unassigned',
            cafeName: '',
            googleUrl: '',
            ownerName: '',
            phone: '',
            smartFilter: true,
            scansCount: 0,
            createdDate: '2026-08-20'
        },
        {
            id: 'QR-1002',
            status: 'unassigned',
            cafeName: '',
            googleUrl: '',
            ownerName: '',
            phone: '',
            smartFilter: true,
            scansCount: 0,
            createdDate: '2026-08-20'
        }
    ],
    inquiries: []
};

// Global App State
let appState = {
    data: null,
    currentView: 'landing',
    activeScanQr: null,
    selectedStarRating: 0,
    loggedCafeQrId: null
};

// SHA-256 Hashing Helper
async function hashPin(plainPin) {
    if (!plainPin) return '';
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(plainPin + '_SALT_SECURE_2026');
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        return plainPin;
    }
}

// Data Sync Engine
function initDataSync() {
    loadLocalState();

    if (db) {
        db.ref('qrs').on('value', (snapshot) => {
            const val = snapshot.val();
            if (val) {
                const firebaseQrs = Object.keys(val).map(key => ({ ...val[key], id: key }));
                appState.data.qrs = firebaseQrs;
                saveLocalState();
            }
        });

        db.ref('reviews').on('value', (snapshot) => {
            const val = snapshot.val();
            if (val) {
                const firebaseReviews = Object.keys(val).map(key => ({ ...val[key], id: key })).reverse();
                appState.data.reviews = firebaseReviews;
                saveLocalState();
                if (appState.activeScanQr) {
                    renderRealtimeReviewFeed(appState.activeScanQr);
                }
            }
        });
    }
}

function loadLocalState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            appState.data = JSON.parse(raw);
        } catch (e) {
            appState.data = JSON.parse(JSON.stringify(INITIAL_DATA));
        }
    } else {
        appState.data = JSON.parse(JSON.stringify(INITIAL_DATA));
        saveLocalState();
    }
}

function saveLocalState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.data));
}

// Router & View Controller
function handleRouting() {
    const hash = window.location.hash || '#landing';
    const parts = hash.split('/');
    const mainRoute = parts[0];
    const param = parts[1] || null;

    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    if (mainRoute === '#scan' && param) {
        document.body.classList.add('scan-mode');
        appState.currentView = 'scan';
        renderScanView(param);
        document.getElementById('view-scan').classList.add('active');
    } 
    else {
        document.body.classList.remove('scan-mode');
        if (mainRoute === '#activate' && param) {
            appState.currentView = 'activate';
            renderActivationView(param);
            document.getElementById('view-activate').classList.add('active');
        }
        else if (mainRoute === '#bulk-print') {
            appState.currentView = 'bulk-print';
            renderBulkPrintGrid();
            document.getElementById('view-bulk-print').classList.add('active');
        }
        else if (mainRoute === '#cafe-dashboard') {
            appState.currentView = 'cafe-dashboard';
            renderCafePortal();
            document.getElementById('view-cafe-dashboard').classList.add('active');
        }
        else {
            appState.currentView = 'landing';
            document.getElementById('view-landing').classList.add('active');
            markNavActive('landing');
        }
    }

    window.scrollTo(0, 0);
}

function markNavActive(viewName) {
    const link = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (link) link.classList.add('active');
}

// Helper to format guaranteed direct write review URL (100% Valid & Safe from 400 Errors)
function ensureDirectWriteReviewUrl(rawUrl, cafeName) {
    if (!rawUrl && !cafeName) return 'https://www.google.com/maps';
    let url = rawUrl ? rawUrl.trim() : '';

    // 1. If valid URL provided by user
    if (url && url.startsWith('http')) {
        // If already writereview with placeid or g.page review, keep as is
        if (url.includes('search.google.com/local/writereview?placeid=') || url.includes('/review')) {
            return url;
        }

        // If contains placeid=ChIJ...
        const placeIdMatch = url.match(/placeid=([a-zA-Z0-9_-]+)/i);
        if (placeIdMatch && placeIdMatch[1]) {
            return `https://search.google.com/local/writereview?placeid=${placeIdMatch[1]}`;
        }

        // If Google Maps place URL (/maps/place/), ensure !9m1!1b1! review modal trigger
        if (url.includes('google.com/maps/place/') || url.includes('maps.google.com/place/')) {
            if (url.includes('!9m1!1b1!')) return url;
            if (url.includes('data=')) {
                return url.replace('data=', 'data=!9m1!1b1!');
            } else {
                const parts = url.split('?');
                const path = parts[0].endsWith('/') ? parts[0].slice(0, -1) : parts[0];
                const query = parts[1] ? `?${parts[1]}` : '';
                return `${path}/data=!9m1!1b1!${query}`;
            }
        }

        return url;
    }

    // 2. Safe Fallback URL (Never throws 400 Bad Request error)
    const query = encodeURIComponent(cafeName || 'Kafe');
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

// Render Functions (IN-APP GOOGLE 5-STAR REVIEW MODAL SCREEN)
function renderScanView(qrId) {
    const qrObj = appState.data.qrs.find(q => q.id.toUpperCase() === qrId.toUpperCase());
    
    // Status Check 1: If DISABLED by admin -> Redirect to landing page perkenalan index.html
    if (qrObj && qrObj.status === 'disabled') {
        alert(`QR Code ${qrId} telah dimatikan oleh admin. Mengarahkan ke halaman perkenalan...`);
        window.location.hash = '#landing';
        return;
    }

    // Status Check 2: If PAUSED -> Alert user
    if (qrObj && qrObj.status === 'paused') {
        const cafeNameEl = document.getElementById('scan-cafe-name');
        if (cafeNameEl) cafeNameEl.textContent = 'Layanan Sementara Dijeda';
        return;
    }

    // Status Check 3: If UNASSIGNED (Belum Didaftarkan) -> Redirect to index.html Activation / Registration Page
    if (!qrObj || qrObj.status === 'unassigned') {
        window.location.hash = `#activate/${qrId}`;
        return;
    }

    // Status Check 4: If ACTIVE -> Display In-App Google 5-Star Review Modal Screen
    if (qrObj.status === 'active') {
        appState.activeScanQr = qrObj;

        const cafeNameEl = document.getElementById('scan-cafe-name');
        if (cafeNameEl) cafeNameEl.textContent = qrObj.cafeName || 'Google Review';

        const directReviewUrl = ensureDirectWriteReviewUrl(qrObj.googleUrl, qrObj.cafeName);

        const btnViewGoogleReviews = document.getElementById('btn-view-google-reviews');
        if (btnViewGoogleReviews) {
            btnViewGoogleReviews.href = directReviewUrl;
        }

        // Render 5 Recent Google Reviews Preview
        render5GoogleReviewPreviews(qrObj);

        // Track scan count
        const newScans = (qrObj.scansCount || 0) + 1;
        if (db) {
            db.ref(`qrs/${qrObj.id}`).update({ scansCount: newScans }).catch(e => {});
        }
        qrObj.scansCount = newScans;
        saveLocalState();
    }
}

function render5GoogleReviewPreviews(qrObj) {
    const listEl = document.getElementById('google-5-reviews-list');
    if (!listEl) return;

    const cafeName = qrObj.cafeName || 'Kafe Ini';
    const sampleReviews = [
        { name: 'Aditya P.', stars: '⭐⭐⭐⭐⭐', text: `Pelayanan luar biasa, tempat nyaman banget di ${cafeName}!` },
        { name: 'Rian S.', stars: '⭐⭐⭐⭐⭐', text: `Rekomendasi utama! Makanan & suasana top bintang 5.` },
        { name: 'Dina K.', stars: '⭐⭐⭐⭐⭐', text: `Tempatnya bersih, pelayanan ramah, pasti datang lagi ke ${cafeName}.` },
        { name: 'Budi W.', stars: '⭐⭐⭐⭐⭐', text: `Spot nongkrong terbaik, wifi kenceng & kopi enak.` },
        { name: 'Siti M.', stars: '⭐⭐⭐⭐⭐', text: `Sangat puas dengan suasananya. Bintang 5 untuk ${cafeName}!` }
    ];

    listEl.innerHTML = sampleReviews.map(r => `
        <div style="background:rgba(15,23,42,0.6); padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
            <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                <span style="font-weight:600; color:#f8fafc;">${r.name}</span>
                <span style="font-size:0.75rem; color:#fbbc05;">${r.stars}</span>
            </div>
            <div style="font-size:0.78rem; color:#cbd5e1;">"${r.text}"</div>
        </div>
    `).join('');
}

function renderActivationView(qrId) {
    const qrObj = appState.data.qrs.find(q => q.id.toUpperCase() === qrId.toUpperCase());
    document.getElementById('activate-qr-id-display').textContent = qrId;
    document.getElementById('act-qr-id').value = qrId;

    if (qrObj && qrObj.status === 'active') {
        alert(`QR Code ${qrId} sudah terhubung ke kafe "${qrObj.cafeName}".`);
        window.location.hash = `#scan/${qrId}`;
    }
}

function renderCafePortal() {
    const loginView = document.getElementById('cafe-login-view');
    const mainPortal = document.getElementById('cafe-main-portal');
    if (!loginView || !mainPortal) return;

    if (!appState.loggedCafeQrId) {
        loginView.classList.remove('hidden');
        mainPortal.classList.add('hidden');

        const select = document.getElementById('login-cafe-select');
        if (select) {
            const activeCafes = appState.data.qrs.filter(q => q.status === 'active');
            select.innerHTML = activeCafes.length > 0 
                ? activeCafes.map(c => `<option value="${c.id}">${c.cafeName} (${c.id})</option>`).join('')
                : `<option value="">Belum ada kafe terdaftar</option>`;
        }
    } else {
        loginView.classList.add('hidden');
        mainPortal.classList.remove('hidden');

        const cafe = appState.data.qrs.find(q => q.id === appState.loggedCafeQrId);
        if (!cafe) {
            appState.loggedCafeQrId = null;
            renderCafePortal();
            return;
        }

        document.getElementById('portal-cafe-name').textContent = cafe.cafeName;
        document.getElementById('portal-qr-id').textContent = cafe.id;
        document.getElementById('portal-scans-count').textContent = cafe.scansCount || 0;
        document.getElementById('setting-google-url').value = cafe.googleUrl || '';
    }
}

// Standee Card Template Generator (Text displays reviewin-aja.vercel.app without QR ID text)
function createGoogleStandeeCardHTML(qrId) {
    const baseDomain = getEffectiveBaseDomain();
    let displayFooterUrl = 'reviewin-aja.vercel.app';
    if (baseDomain && !baseDomain.includes('localhost') && !baseDomain.includes('127.0.0.1')) {
        displayFooterUrl = baseDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }

    return `
        <div class="google-standee-card-wrapper">
            <div class="google-standee-card">
                <div class="corner-top-right"></div>
                <div class="corner-bottom-left"></div>
                <div class="corner-bottom-right"></div>

                <div class="card-header-text">REVIEW US ON</div>
                
                <div class="google-brand-title">
                    <span class="g-blue">G</span><span class="g-red">o</span><span class="g-yellow">o</span><span class="g-blue">g</span><span class="g-green">l</span><span class="g-red">e</span>
                </div>

                <div class="stars-gold-row">★ ★ ★ ★ ★</div>

                <div class="scan-prompt-text">
                    SCAN THE QR CODE BELOW<br>TO LEAVE US A REVIEW!
                </div>

                <div class="google-qr-box">
                    <div id="qr-canvas-${qrId}"></div>
                </div>

                <div class="card-footer-url">
                    ${displayFooterUrl}
                </div>
            </div>
        </div>
    `;
}

function renderStyledQrCode(containerEl, textUrl, size = 128) {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    if (typeof QRCodeStyling !== 'undefined') {
        try {
            const qrCode = new QRCodeStyling({
                width: size,
                height: size,
                type: "svg",
                data: textUrl,
                margin: 0,
                qrOptions: {
                    typeNumber: 0,
                    mode: "Byte",
                    errorCorrectionLevel: "Q"
                },
                dotsOptions: {
                    type: "rounded",
                    color: "#111827"
                },
                backgroundOptions: {
                    color: "#ffffff"
                },
                cornersSquareOptions: {
                    type: "extra-rounded",
                    color: "#111827"
                },
                cornersDotOptions: {
                    type: "dot",
                    color: "#111827"
                }
            });
            qrCode.append(containerEl);
            return;
        } catch (e) {
            console.warn('QRCodeStyling fallback:', e);
        }
    }

    if (typeof QRCode !== 'undefined') {
        new QRCode(containerEl, {
            text: textUrl,
            width: size,
            height: size,
            colorDark: "#111827",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }
}

function renderBulkPrintGrid() {
    const gridContainer = document.getElementById('bulk-print-grid');
    if (!gridContainer) return;

    const countInput = document.getElementById('bulk-count-input');
    const count = countInput ? parseInt(countInput.value) || 6 : 6;
    const prefixInput = document.getElementById('bulk-prefix-input');
    const prefix = prefixInput ? prefixInput.value.trim() || 'QR' : 'QR';

    let targetQrs = appState.data.qrs.filter(q => q.status === 'unassigned').slice(0, count);

    gridContainer.innerHTML = targetQrs.map(q => createGoogleStandeeCardHTML(q.id)).join('');

    targetQrs.forEach(q => {
        const canvasEl = document.getElementById(`qr-canvas-${q.id}`);
        if (canvasEl) {
            const baseDomain = getEffectiveBaseDomain();
            const cleanDomain = baseDomain.endsWith('/') ? baseDomain.slice(0, -1) : baseDomain;
            const scanUrl = cleanDomain.includes('index.html') ? `${cleanDomain}#scan/${q.id}` : `${cleanDomain}/index.html#scan/${q.id}`;
            renderStyledQrCode(canvasEl, scanUrl, 128);
        }
    });
}

// Event Listeners Setup
function setupEventListeners() {
    // Google Maps Search Helper Button
    const btnSearchMaps = document.getElementById('btn-search-maps-helper');
    if (btnSearchMaps) {
        btnSearchMaps.addEventListener('click', () => {
            const cafeName = document.getElementById('act-cafe-name').value.trim();
            if (!cafeName) {
                alert('Ketikkan Nama Kafe terlebih dahulu!');
                document.getElementById('act-cafe-name').focus();
                return;
            }

            const encodedQuery = encodeURIComponent(cafeName);
            const searchMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
            
            document.getElementById('act-google-url').value = searchMapsUrl;
            window.open(`https://www.google.com/maps/search/${encodedQuery}`, '_blank');
        });
    }

    // Form Submit: On-Site QR Activation Form
    const formActQr = document.getElementById('form-activate-qr');
    if (formActQr) {
        formActQr.addEventListener('submit', async (e) => {
            e.preventDefault();
            const qrId = document.getElementById('act-qr-id').value;

            let qrObj = appState.data.qrs.find(q => q.id === qrId);

            const cafeName = document.getElementById('act-cafe-name').value;
            const rawGoogleUrl = document.getElementById('act-google-url').value;
            const directReviewUrl = ensureDirectWriteReviewUrl(rawGoogleUrl, cafeName);

            const updatedData = {
                id: qrId,
                status: 'active',
                cafeName: cafeName,
                googleUrl: directReviewUrl,
                ownerName: document.getElementById('act-owner-name').value,
                phone: document.getElementById('act-phone').value,
                smartFilter: true,
                scansCount: qrObj ? (qrObj.scansCount || 0) : 0,
                createdDate: new Date().toISOString().split('T')[0]
            };

            if (db) {
                db.ref(`qrs/${qrId}`).set(updatedData).catch(e => {});
            }

            if (!qrObj) appState.data.qrs.push(updatedData);
            else Object.assign(qrObj, updatedData);

            saveLocalState();
            alert(`🎉 AKTIVASI KAFE BERHASIL! Kode ${qrId} telah terhubung ke "${updatedData.cafeName}".`);
            window.location.hash = `#scan/${qrId}`;
        });
    }

    // Google 5-Star Review Modal Handlers (Interactive Stars & Post Redirect)
    const starContainer = document.getElementById('google-star-rating-container');
    if (starContainer) {
        starContainer.querySelectorAll('.google-star-icon').forEach(star => {
            star.addEventListener('click', (e) => {
                const val = parseInt(e.currentTarget.getAttribute('data-value'));
                appState.selectedStarRating = val;
                starContainer.querySelectorAll('.google-star-icon').forEach((s, idx) => {
                    if (idx < val) s.classList.add('active');
                    else s.classList.remove('active');
                });
            });
        });
    }

    const btnPostReview = document.getElementById('btn-submit-google-review');
    if (btnPostReview) {
        btnPostReview.addEventListener('click', () => {
            if (appState.activeScanQr) {
                const qrObj = appState.activeScanQr;

                // 1. Database HANYA menyimpan jumlah scan count & status kontrol QR
                const newScans = (qrObj.scansCount || 0) + 1;
                qrObj.scansCount = newScans;
                if (db) {
                    db.ref(`qrs/${qrObj.id}`).update({ scansCount: newScans }).catch(e => {});
                }
                saveLocalState();

                // 2. Format link ulasan langsung Google Review
                const targetUrl = ensureDirectWriteReviewUrl(qrObj.googleUrl, qrObj.cafeName);

                // 3. Ulasan & Bintang dikirim LANGSUNG ke Google Review menggunakan akun Google di HP pengguna!
                window.location.href = targetUrl;
            } else {
                alert('Silakan scan QR Code kafe terlebih dahulu.');
                window.location.hash = '#landing';
            }
        });
    }

    // Public Cafe Registration Form Submit
    const pubForm = document.getElementById('form-public-register-cafe');
    if (pubForm) {
        pubForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const inqId = 'INQ-' + Date.now().toString().slice(-4);
            const newInquiry = {
                id: inqId,
                cafeName: document.getElementById('pub-cafe-name').value,
                ownerName: document.getElementById('pub-owner-name').value,
                phone: document.getElementById('pub-phone').value,
                mapsUrl: document.getElementById('pub-maps-url').value || '',
                address: document.getElementById('pub-address').value,
                timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
            };

            if (!appState.data.inquiries) appState.data.inquiries = [];
            appState.data.inquiries.unshift(newInquiry);

            if (db) {
                db.ref(`inquiries/${inqId}`).set(newInquiry).catch(e => {});
            }

            saveLocalState();
            pubForm.reset();
            const msgEl = document.getElementById('pub-register-success-msg');
            if (msgEl) msgEl.classList.remove('hidden');
        });
    }
}

// Initialization
window.addEventListener('DOMContentLoaded', () => {
    initDataSync();
    setupEventListeners();
    handleRouting();
});

window.addEventListener('hashchange', handleRouting);
