/* ==========================================
   REVIEWBOOST - SUPER ADMIN DASHBOARD ENGINE
   Project: neo-asisten (Firebase Realtime + LocalStorage Fallback)
   Credentials: Username 24214 / Password 160905
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
    ]
};

// Global Admin State
let adminState = {
    data: null,
    isAdminLoggedIn: false,
    baseDomain: ''
};

let html5QrScannerInstance = null;

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

function getEffectiveBaseDomain() {
    const saved = localStorage.getItem(DOMAIN_KEY);
    if (saved) return saved;
    const origin = window.location.origin;
    const path = window.location.pathname.replace('/admin/index.html', '').replace('/admin/', '').replace('/index.html', '');
    return `${origin}${path}`;
}

// Data Sync Engine
function initAdminSync() {
    loadLocalState();
    adminState.baseDomain = getEffectiveBaseDomain();

    const domainInput = document.getElementById('base-domain-input');
    if (domainInput) domainInput.value = adminState.baseDomain;

    if (sessionStorage.getItem('reviewboost_admin_auth') === 'true') {
        adminState.isAdminLoggedIn = true;
    }

    if (db) {
        db.ref('qrs').on('value', (snapshot) => {
            const val = snapshot.val();
            if (val) {
                const firebaseQrs = Object.keys(val).map(key => ({ ...val[key], id: key }));
                adminState.data.qrs = firebaseQrs;
                saveLocalState();
                renderAdminDashboard();
            } else {
                syncFullStateToFirebase();
            }
        });
    }

    renderAdminDashboard();
}

function loadLocalState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            adminState.data = JSON.parse(raw);
        } catch (e) {
            adminState.data = JSON.parse(JSON.stringify(INITIAL_DATA));
        }
    } else {
        adminState.data = JSON.parse(JSON.stringify(INITIAL_DATA));
        saveLocalState();
    }
}

function saveLocalState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(adminState.data));
}

function syncFullStateToFirebase() {
    if (!db) return;
    adminState.data.qrs.forEach(q => {
        db.ref(`qrs/${q.id}`).set(q).catch(e => {});
    });
}

function renderAdminDashboard() {
    const loginView = document.getElementById('admin-login-view');
    const mainDashboard = document.getElementById('admin-main-dashboard');

    if (!adminState.isAdminLoggedIn) {
        if (loginView) loginView.classList.remove('hidden');
        if (mainDashboard) mainDashboard.classList.add('hidden');
    } else {
        if (loginView) loginView.classList.add('hidden');
        if (mainDashboard) mainDashboard.classList.remove('hidden');

        const qrs = adminState.data.qrs;
        const totalQr = qrs.length;
        const activeCafes = qrs.filter(q => q.status === 'active').length;
        const unassignedQr = qrs.filter(q => q.status === 'unassigned').length;
        const totalScans = qrs.reduce((acc, curr) => acc + (curr.scansCount || 0), 0);

        document.getElementById('admin-stat-total-qr').textContent = totalQr;
        document.getElementById('admin-stat-active-cafes').textContent = activeCafes;
        document.getElementById('admin-stat-unassigned-qr').textContent = unassignedQr;
        document.getElementById('admin-stat-total-scans').textContent = totalScans;

        renderAdminQrTable();
    }
}

function renderAdminQrTable() {
    const tbody = document.getElementById('admin-qr-table-body');
    if (!tbody) return;

    const searchInput = document.getElementById('admin-qr-search');
    const searchVal = searchInput ? searchInput.value.toLowerCase() : '';
    const filterStatusSelect = document.getElementById('admin-qr-filter-status');
    const filterStatus = filterStatusSelect ? filterStatusSelect.value : 'all';

    let filtered = adminState.data.qrs.filter(q => {
        const matchesSearch = q.id.toLowerCase().includes(searchVal) || 
                              (q.cafeName && q.cafeName.toLowerCase().includes(searchVal)) ||
                              (q.ownerName && q.ownerName.toLowerCase().includes(searchVal));
        const matchesStatus = filterStatus === 'all' || q.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-dim);">Tidak ada data QR ditemukan.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(q => {
        let statusBadge = '';
        if (q.status === 'active') statusBadge = '<span class="badge badge-success">Aktif</span>';
        else if (q.status === 'unassigned') statusBadge = '<span class="badge badge-warning">Kosong (Belum Terdaftar)</span>';
        else if (q.status === 'paused') statusBadge = '<span class="badge" style="background:rgba(245,158,11,0.2); color:#fbbf24;">Dijeda</span>';
        else if (q.status === 'disabled') statusBadge = '<span class="badge" style="background:rgba(239,68,68,0.2); color:#fca5a5;">Dimatikan (Redirect Public)</span>';

        return `
            <tr>
                <td><span class="highlight-code">${q.id}</span></td>
                <td><strong>${q.cafeName || '<em style="color:var(--text-dim)">Belum Ada Kafe</em>'}</strong></td>
                <td>${q.ownerName ? `${q.ownerName} <br><small style="color:var(--text-muted);">${q.phone}</small>` : '<em style="color:var(--text-dim)">-</em>'}</td>
                <td>${q.googleUrl ? `<a href="${q.googleUrl}" target="_blank" style="color:var(--accent-cyan);"><i class="fa-brands fa-google"></i> Buka Maps</a>` : '<em style="color:var(--text-dim)">-</em>'}</td>
                <td><strong>${q.scansCount || 0}</strong> scan</td>
                <td>${statusBadge}</td>
                <td>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button class="btn btn-outline-sm btn-print-single" data-id="${q.id}" title="Cetak Standee Akrilik"><i class="fa-solid fa-print"></i> Cetak</button>

                        ${q.status === 'unassigned' ? `
                            <button class="btn btn-primary btn-outline-sm btn-fill-web" data-id="${q.id}"><i class="fa-solid fa-pen-to-square"></i> Isi Kafe</button>
                        ` : ''}

                        ${q.status === 'active' ? `
                            <button class="btn btn-outline-sm btn-toggle-pause" data-id="${q.id}" style="color:#fbbf24; border-color:rgba(245,158,11,0.4);"><i class="fa-solid fa-pause"></i> Jeda</button>
                        ` : ''}

                        ${q.status === 'paused' ? `
                            <button class="btn btn-outline-sm btn-toggle-pause" data-id="${q.id}" style="color:#34d399; border-color:rgba(52,211,153,0.4);"><i class="fa-solid fa-play"></i> Aktifkan</button>
                        ` : ''}

                        ${q.status !== 'disabled' ? `
                            <button class="btn btn-glass-danger btn-sm btn-disable-double-check" data-id="${q.id}"><i class="fa-solid fa-power-off"></i> Matikan (2x)</button>
                        ` : `
                            <button class="btn btn-outline-sm btn-reactivate" data-id="${q.id}"><i class="fa-solid fa-rotate-left"></i> Pulihkan</button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-print-single').forEach(btn => {
        btn.addEventListener('click', (e) => openPrintModal(e.currentTarget.getAttribute('data-id')));
    });

    tbody.querySelectorAll('.btn-fill-web').forEach(btn => {
        btn.addEventListener('click', (e) => openWebRegisterModal(e.currentTarget.getAttribute('data-id')));
    });

    tbody.querySelectorAll('.btn-toggle-pause').forEach(btn => {
        btn.addEventListener('click', (e) => togglePauseQr(e.currentTarget.getAttribute('data-id')));
    });

    tbody.querySelectorAll('.btn-disable-double-check').forEach(btn => {
        btn.addEventListener('click', (e) => disableQrDoubleValidation(e.currentTarget.getAttribute('data-id')));
    });

    tbody.querySelectorAll('.btn-reactivate').forEach(btn => {
        btn.addEventListener('click', (e) => reactivateQr(e.currentTarget.getAttribute('data-id')));
    });
}

function generate10BlankQrs() {
    let startNum = 1000 + adminState.data.qrs.length + 1;
    let createdCount = 0;

    for (let i = 0; i < 10; i++) {
        const newId = `QR-${startNum + i}`;
        if (!adminState.data.qrs.some(q => q.id === newId)) {
            const newQrObj = {
                id: newId,
                status: 'unassigned',
                cafeName: '',
                googleUrl: '',
                ownerName: '',
                phone: '',
                smartFilter: true,
                scansCount: 0,
                createdDate: new Date().toISOString().split('T')[0]
            };
            adminState.data.qrs.push(newQrObj);
            if (db) db.ref(`qrs/${newId}`).set(newQrObj).catch(e => {});
            createdCount++;
        }
    }

    saveLocalState();
    renderAdminDashboard();
    alert(`🎉 Berhasil generate ${createdCount} stok QR Kosong baru! Siap dicetak.`);
}

function openWebRegisterModal(preselectQrId = null) {
    const modal = document.getElementById('modal-web-register-cafe');
    const select = document.getElementById('web-qr-select');
    if (!modal || !select) return;

    const unassignedQrs = adminState.data.qrs.filter(q => q.status === 'unassigned' || q.id === preselectQrId);
    
    if (unassignedQrs.length === 0) {
        alert('Belum ada stok QR Kosong. Silakan klik "Generate 10 QR Kosong" terlebih dahulu!');
        generate10BlankQrs();
        openWebRegisterModal(preselectQrId);
        return;
    }

    select.innerHTML = unassignedQrs.map(q => `
        <option value="${q.id}" ${q.id === preselectQrId ? 'selected' : ''}>Kode ID: ${q.id} (Status: Kosong)</option>
    `).join('');

    modal.classList.add('active');
}

function openCameraScannerModal() {
    const modal = document.getElementById('modal-scan-camera');
    if (!modal) return;
    modal.classList.add('active');

    if (typeof Html5Qrcode !== 'undefined') {
        const html5QrCode = new Html5Qrcode("qr-reader");
        html5QrScannerInstance = html5QrCode;
        
        Html5Qrcode.getCameras().then(devices => {
            if (devices && devices.length) {
                const cameraId = devices[0].id;
                html5QrCode.start(
                    cameraId, 
                    { fps: 10, qrbox: { width: 200, height: 200 } },
                    (decodedText) => {
                        handleScannedQrResult(decodedText);
                    },
                    (errorMessage) => {}
                ).catch(err => console.log('Camera fallback'));
            }
        }).catch(err => console.log('Manual input ready'));
    }
}

function handleScannedQrResult(qrResultText) {
    closeModals();
    if (html5QrScannerInstance) {
        try { html5QrScannerInstance.stop(); } catch(e){}
    }

    let matchedId = qrResultText.trim();
    if (matchedId.includes('#scan/')) matchedId = matchedId.split('#scan/')[1];
    else if (matchedId.includes('#activate/')) matchedId = matchedId.split('#activate/')[1];

    let targetQr = adminState.data.qrs.find(q => q.id.toUpperCase() === matchedId.toUpperCase());
    
    if (!targetQr) {
        targetQr = {
            id: matchedId,
            status: 'unassigned',
            cafeName: '',
            googleUrl: '',
            ownerName: '',
            phone: '',
            smartFilter: true,
            scansCount: 0,
            createdDate: new Date().toISOString().split('T')[0]
        };
        adminState.data.qrs.push(targetQr);
        if (db) db.ref(`qrs/${matchedId}`).set(targetQr).catch(e => {});
        saveLocalState();
    }

    openWebRegisterModal(targetQr.id);
}

function togglePauseQr(qrId) {
    const qr = adminState.data.qrs.find(q => q.id === qrId);
    if (!qr) return;

    const newStatus = (qr.status === 'active') ? 'paused' : 'active';
    qr.status = newStatus;

    if (db) db.ref(`qrs/${qrId}`).update({ status: newStatus }).catch(e => {});
    saveLocalState();
    renderAdminDashboard();
}

function disableQrDoubleValidation(qrId) {
    const qr = adminState.data.qrs.find(q => q.id === qrId);
    if (!qr) return;

    const confirm1 = confirm(`⚠️ KONFIRMASI 1 DARI 2:\n\nApakah Anda yakin ingin mematikan QR "${qr.id}" (${qr.cafeName || 'Kosong'})?\n\nJika dimatikan, saat dipindai QR ini TIDAK AKAN mengarahkan ke Google Review lagi, melainkan otomatis dialihkan ke halaman utama perkenalan/pendaftaran index.html.`);
    if (!confirm1) return;

    const confirm2 = prompt(`🛑 KONFIRMASI 2 (FINAL):\n\nKetik kata MATIKAN di bawah ini untuk mengonfirmasi penutupan akses QR kafe ini:`);
    if (confirm2 && confirm2.trim().toUpperCase() === 'MATIKAN') {
        qr.status = 'disabled';
        if (db) db.ref(`qrs/${qrId}`).update({ status: 'disabled' }).catch(e => {});
        saveLocalState();
        renderAdminDashboard();
        alert(`✅ QR Code "${qrId}" telah BERHASIL DIMATIKAN.\n\nSetiap scan di meja kafe sekarang akan otomatis dialihkan ke index.html.`);
    } else {
        alert('❌ Pembatalan: Kata kunci konfirmasi salah. QR tetap aktif.');
    }
}

function reactivateQr(qrId) {
    const qr = adminState.data.qrs.find(q => q.id === qrId);
    if (!qr) return;

    const targetStatus = qr.cafeName ? 'active' : 'unassigned';
    qr.status = targetStatus;

    if (db) db.ref(`qrs/${qrId}`).update({ status: targetStatus }).catch(e => {});
    saveLocalState();
    renderAdminDashboard();
    alert(`QR Code "${qrId}" berhasil dipulihkan.`);
}

// Print Standee Modal Renderer (Uses Effective Base Domain)
function openPrintModal(qrId) {
    const modal = document.getElementById('modal-print-standee');
    const container = document.getElementById('single-standee-container');
    if (!modal || !container) return;

    const baseDomain = getEffectiveBaseDomain();
    const fullPublicUrl = `${baseDomain.endsWith('/') ? baseDomain.slice(0, -1) : baseDomain}/index.html#scan/${qrId}`;

    container.innerHTML = `
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
                    <div id="qr-canvas-admin-${qrId}"></div>
                </div>

                <div class="card-footer-url" style="font-size:0.65rem; word-break:break-all;">
                    ID: ${qrId} &bull; ${fullPublicUrl.replace('https://', '').replace('http://', '')}
                </div>
            </div>
        </div>
    `;

    const canvasEl = document.getElementById(`qr-canvas-admin-${qrId}`);
    if (canvasEl) {
        canvasEl.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            new QRCode(canvasEl, {
                text: fullPublicUrl,
                width: 128,
                height: 128,
                colorDark: "#111827",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        }
    }

    modal.classList.add('active');
}

function closeModals() {
    if (html5QrScannerInstance) {
        try { html5QrScannerInstance.stop(); } catch(e){}
    }
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

// Event Listeners Setup
function setupAdminEventListeners() {
    // Save Domain Configuration
    const formDomain = document.getElementById('form-domain-config');
    if (formDomain) {
        formDomain.addEventListener('submit', (e) => {
            e.preventDefault();
            const inputVal = document.getElementById('base-domain-input').value.trim();
            if (inputVal) {
                localStorage.setItem(DOMAIN_KEY, inputVal);
                adminState.baseDomain = inputVal;
                alert(`✅ Domain website berhasil disimpan: "${inputVal}"\n\nSetiap cetakan QR sekarang akan dikodekan dengan domain ini sehingga Google Lens & Kamera HP bisa langsung mengarahkannya!`);
            }
        });
    }

    // Admin Login Submit (USN 24214, PWD 160905)
    const formAdminLogin = document.getElementById('form-admin-login');
    if (formAdminLogin) {
        formAdminLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const enteredUsn = document.getElementById('admin-usn').value.trim();
            const enteredPwd = document.getElementById('admin-pwd').value.trim();

            const hashedUsn = await hashPin(enteredUsn);
            const hashedPwd = await hashPin(enteredPwd);

            const targetUsnHash = await hashPin('24214');
            const targetPwdHash = await hashPin('160905');

            if (hashedUsn === targetUsnHash && hashedPwd === targetPwdHash) {
                adminState.isAdminLoggedIn = true;
                sessionStorage.setItem('reviewboost_admin_auth', 'true');
                renderAdminDashboard();
            } else {
                alert('❌ Username atau Password Admin Salah!');
            }
        });
    }

    // Admin Logout
    const logoutBtn = document.getElementById('btn-logout-admin');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            adminState.isAdminLoggedIn = false;
            sessionStorage.removeItem('reviewboost_admin_auth');
            renderAdminDashboard();
        });
    }

    // Camera Scan Triggers
    const btnNavScan = document.getElementById('btn-admin-nav-scan');
    if (btnNavScan) btnNavScan.addEventListener('click', (e) => { e.preventDefault(); openCameraScannerModal(); });

    const btnHeaderCam = document.getElementById('btn-header-cam-scan');
    if (btnHeaderCam) btnHeaderCam.addEventListener('click', openCameraScannerModal);

    const btnTopCam = document.getElementById('btn-admin-top-camera-scan');
    if (btnTopCam) btnTopCam.addEventListener('click', openCameraScannerModal);

    // Manual QR Code Form Submit inside Scanner Modal
    const formManualQr = document.getElementById('form-manual-qr-register');
    if (formManualQr) {
        formManualQr.addEventListener('submit', (e) => {
            e.preventDefault();
            const val = document.getElementById('manual-qr-id-input').value.trim();
            if (val) handleScannedQrResult(val);
        });
    }

    // Web Manual Register Modal Trigger
    const btnOpenWebReg = document.getElementById('btn-open-web-register-modal');
    if (btnOpenWebReg) {
        btnOpenWebReg.addEventListener('click', () => openWebRegisterModal());
    }

    // Web Registration Form Submit
    const formWebReg = document.getElementById('form-web-register-cafe');
    if (formWebReg) {
        formWebReg.addEventListener('submit', (e) => {
            e.preventDefault();
            const qrId = document.getElementById('web-qr-select').value;
            const cafeName = document.getElementById('web-cafe-name').value;
            const googleUrl = document.getElementById('web-google-url').value;
            const ownerName = document.getElementById('web-owner-name').value;
            const phone = document.getElementById('web-phone').value;

            let qrObj = adminState.data.qrs.find(q => q.id === qrId);
            const updatedData = {
                id: qrId,
                status: 'active',
                cafeName: cafeName,
                googleUrl: googleUrl,
                ownerName: ownerName,
                phone: phone,
                smartFilter: true,
                scansCount: qrObj ? (qrObj.scansCount || 0) : 0,
                createdDate: new Date().toISOString().split('T')[0]
            };

            if (db) db.ref(`qrs/${qrId}`).set(updatedData).catch(e => {});

            if (!qrObj) adminState.data.qrs.push(updatedData);
            else Object.assign(qrObj, updatedData);

            saveLocalState();
            closeModals();
            renderAdminDashboard();
            alert(`🎉 BERHASIL! QR "${qrId}" telah dihubungkan ke kafe "${cafeName}".`);
        });
    }

    // Google Maps Search Helper in Web Modal
    const btnSearchMaps = document.getElementById('btn-admin-search-maps');
    if (btnSearchMaps) {
        btnSearchMaps.addEventListener('click', () => {
            const cafeName = document.getElementById('web-cafe-name').value.trim();
            if (!cafeName) {
                alert('Ketikkan Nama Kafe terlebih dahulu!');
                document.getElementById('web-cafe-name').focus();
                return;
            }

            const encodedQuery = encodeURIComponent(cafeName);
            const searchMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
            document.getElementById('web-google-url').value = searchMapsUrl;
            window.open(`https://www.google.com/maps/search/${encodedQuery}`, '_blank');
        });
    }

    // Generate 10 QR Kosong Button
    const btnGen10 = document.getElementById('btn-generate-10-qr');
    if (btnGen10) btnGen10.addEventListener('click', generate10BlankQrs);

    // Search and Filter Handlers
    const qrSearchInput = document.getElementById('admin-qr-search');
    if (qrSearchInput) qrSearchInput.addEventListener('input', renderAdminQrTable);

    const qrFilterStatusSelect = document.getElementById('admin-qr-filter-status');
    if (qrFilterStatusSelect) qrFilterStatusSelect.addEventListener('change', renderAdminQrTable);

    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', closeModals));
}

// Initialize Admin Module
window.addEventListener('DOMContentLoaded', () => {
    initAdminSync();
    setupAdminEventListeners();
});
