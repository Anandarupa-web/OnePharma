/**
 * PatientHome.js – Patient Portal (full feature set)
 *
 * Architecture:
 *  – Injects `patientBridge` from root App for shared state with Navbar.
 *  – All patient auth, cart, and order logic lives here; bridge is kept in sync.
 *
 * Responsive layout:
 *  – Mobile (<md): sticky bottom nav with 5 tabs; chatbot FAB above it.
 *  – Desktop (≥md): no bottom nav; top Navbar handles search + cart + account.
 *
 * Fix log (vs previous version):
 *  1. Carousel: slides are position:absolute inside fixed-height container → no layout shift.
 *  2. Portal tabs removed (handled in Navbar / URL hash routing).
 *  3. AI Chatbot: floating FAB in bottom-right → full-screen mobile / anchored desktop panel.
 *  4. Me section: app-like "My Account" list with avatar header and row items.
 *  5. Desktop: no bottom nav; better grid layouts; desktop search in top Navbar.
 */
import { defineComponent, ref, computed, reactive, watch, onMounted, onUnmounted, inject, nextTick } from 'vue';
import ScannerModal from '../components/ScannerModal.js';
import {
  getInventory, getPharmacies, getPharmacyInv,
  getDosageSlips, getSlots, saveSlots,
  getPatients, savePatients,
  getCarts, saveCarts, getOrders, saveOrders,
  getPatientAuth, savePatientAuth, clearPatientAuth,
} from '../app.js';

// ── AI Chatbot Knowledge Base ───────────────────────────────────────────────
const CHAT_KB = [
  { p: ['hello','hi','hey','namaste','start'], r: "Hello! 👋 I'm PharmAI, your personal medicine assistant.\n\nI can help with:\n• Medicine info & uses\n• Side effects & dosage\n• Finding medicines near you\n• Cart & QR order system\n\nJust type your question!" },
  { p: ['paracetamol','crocin','fever','headache'], r: "💊 Paracetamol (Crocin)\nUses: Fever, headache, mild pain\nDose: 1 tablet (500 mg) every 4–6 hrs\nMax: 4 tablets per day\n⚠️ Avoid alcohol. Don't exceed recommended dose." },
  { p: ['amoxicillin','mox','antibiotic','infection','bacterial'], r: "💊 Amoxicillin (Mox)\nUses: Bacterial infections (ear, throat, UTI)\nDose: As prescribed\n⚠️ Complete the full course. Report allergic reactions immediately." },
  { p: ['metformin','glycomet','diabetes','blood sugar','diabetic'], r: "💊 Metformin (Glycomet)\nUses: Type 2 Diabetes\nDose: With meals, as prescribed\n⚠️ Monitor blood sugar. Report muscle pain or nausea to your doctor." },
  { p: ['cetirizine','zyrtec','allergy','sneezing','itching','antihistamine'], r: "💊 Cetirizine (Zyrtec)\nUses: Allergies, hay fever, hives\nDose: 1 tablet (10 mg) once daily at night\n⚠️ May cause drowsiness — avoid driving." },
  { p: ['ibuprofen','brufen','pain','inflammation','nsaid'], r: "💊 Ibuprofen (Brufen)\nUses: Pain, inflammation, fever\nDose: 400 mg every 6–8 hrs WITH food\n⚠️ Avoid if you have stomach ulcers or kidney issues." },
  { p: ['omeprazole','omez','acidity','acid reflux','gastric','antacid'], r: "💊 Omeprazole (Omez)\nUses: Acidity, GERD, stomach ulcers\nDose: 1 capsule (20 mg) before breakfast\n⚠️ Long-term use requires medical supervision." },
  { p: ['vitamin d','vitamin d3','d-rise','bone','cholecalciferol'], r: "💊 Vitamin D3 (D-Rise)\nUses: Vitamin D deficiency, bone health\nDose: 1000–2000 IU daily with a fatty meal\n✅ Generally well-tolerated at prescribed doses." },
  { p: ['amlodipine','amlovas','blood pressure','bp','hypertension'], r: "💊 Amlodipine (Amlovas)\nUses: High blood pressure, angina\nDose: 5–10 mg once daily\n⚠️ Do not stop suddenly. May cause ankle swelling." },
  { p: ['losartan','repace'], r: "💊 Losartan (Repace)\nUses: Hypertension, heart failure\nDose: 25–100 mg once daily\n⚠️ Avoid potassium supplements unless prescribed." },
  { p: ['side effect','side effects','adverse','reaction'], r: "⚠️ Side effects vary by medicine:\n• Antibiotics → nausea, diarrhoea\n• NSAIDs → stomach upset\n• Antihistamines → drowsiness\n• BP meds → dizziness\n\nAsk about a specific medicine for details!" },
  { p: ['dosage','dose','how to take','when to take','timing'], r: "📋 General timing:\n• Before meals: antacids, thyroid meds\n• With meals: metformin, NSAIDs, antibiotics\n• At bedtime: antihistamines, statins\n\nAlways follow your doctor's instructions!" },
  { p: ['price','cost','how much','expensive'], r: "💰 Prices vary by pharmacy. In the Find tab, search a medicine to compare prices at each nearby pharmacy. Generics are often significantly cheaper!" },
  { p: ['available','availability','stock','find','search'], r: "🔍 To check availability:\n1. Use the Search tab or top search bar\n2. Type the medicine name or category\n3. See which nearby pharmacies carry it\n\nAlso browse a specific pharmacy under Find → Pharmacies!" },
  { p: ['cart','add to cart','order','qr','pickup','buy'], r: "🛒 To order medicines:\n1. Find a medicine → tap + Cart\n2. Up to 3 carts (one per pharmacy)\n3. Go to Cart → review items\n4. Tap Place Order → get a QR code 📱\n5. Show QR at the pharmacy counter for quick pickup!" },
  { p: ['pharmacy','pharmacies','near','nearby','location','store'], r: "�� Nearby pharmacies:\n• Saha Pharmacy – 0.3 km ✅ Open\n• MedPlus – 1.1 km ✅ Open\n• Apollo Pharmacy – 2.0 km ❌ Closed\n• LifeCare Pharmacy – 3.5 km ✅ Open\n\nBrowse them in Find → Pharmacies!" },
  { p: ['prescription','rx','scan','upload'], r: "📷 Scanning a prescription:\n1. Tap the 📷 Scan Rx button in the nav\n2. Photograph or upload your prescription\n3. AI extracts medicine names automatically\n4. Check availability near you instantly!" },
  { p: ['generic','brand','alternative','cheaper'], r: "💡 Generic medicines contain the same active ingredient as brand-name drugs but cost much less. Ask your pharmacist about generic alternatives!" },
  { p: ['thank','thanks','bye','goodbye','ok','okay'], r: "😊 You're welcome! Stay healthy and feel free to ask anytime. 💚" },
];

// ── Homepage carousel slides ────────────────────────────────────────────────
const HERO_SLIDES = [
  { bg: 'bg-gradient-to-br from-green-600 to-emerald-700', icon: '💊', title: 'Your Medicines, Nearby',      sub: 'Search availability at all pharmacies within 5 km — instantly.',         cta: 'find'    },
  { bg: 'bg-gradient-to-br from-teal-600 to-cyan-700',     icon: '📋', title: 'Scan Your Prescription',     sub: 'Upload or photograph your Rx and let AI read it for you.',              cta: 'scanner' },
  { bg: 'bg-gradient-to-br from-blue-600 to-indigo-700',   icon: '🛒', title: 'Order Ahead, Skip the Wait', sub: 'Build a cart, get a QR code, and collect at the counter.',             cta: 'cart'    },
];

const CATEGORIES = [
  { id: 'Analgesic',        icon: '🩹', label: 'Pain Relief'   },
  { id: 'Antibiotic',       icon: '🦠', label: 'Antibiotics'   },
  { id: 'Antidiabetic',     icon: '🩸', label: 'Diabetes Care' },
  { id: 'Antihypertensive', icon: '❤️', label: 'Heart & BP'    },
  { id: 'Antacid',          icon: '🧪', label: 'Acidity'       },
  { id: 'Supplement',       icon: '🌿', label: 'Supplements'   },
  { id: 'Antihistamine',    icon: '🤧', label: 'Allergy'       },
  { id: 'Bronchodilator',   icon: '🫁', label: 'Respiratory'   },
];

/** Carousel auto-advance delay in ms. */
const CAROUSEL_INTERVAL_MS = 4500;

/** Fixed height (px) of the hero carousel container. Using a constant prevents magic numbers and ensures the absolute-positioned slide pattern stays consistent. */
const CAROUSEL_HEIGHT_PX = 210;

export default defineComponent({
  name: 'PatientHome',
  components: { ScannerModal },

  setup() {

    // ── Inject shared bridge from root App ────────────────────────────────────
    const patientBridge = inject('patientBridge');

    // ── Patient auth state  (kept locally; synced ONE-WAY to bridge) ──────────
    const patientUser   = ref(patientBridge.user);
    const showAuthModal = ref(false);
    const authMode      = ref('login');
    const authForm      = reactive({ name: '', phone: '', password: '' });
    const authError     = ref('');
    const authLoading   = ref(false);

    // Keep bridge.user in sync whenever local patientUser changes
    watch(patientUser, (u) => { patientBridge.user = u; }, { deep: true });

    // ── Phone verification ────────────────────────────────────────────────────
    const showVerifyModal = ref(false);
    const verifyOtpInput  = ref('');
    const generatedOtp    = ref('');
    const verifyError     = ref('');
    const pendingCartAdd  = ref(null);

    // ── Core UI state ─────────────────────────────────────────────────────────
    const activeTab   = ref(patientBridge.activeTab || 'home');
    const showScanner = ref(false);

    // Two-way sync: bridge.activeTab ↔ local activeTab
    watch(() => patientBridge.activeTab, (tab) => {
      if (tab === 'login') { openAuthModal('login'); patientBridge.activeTab = 'home'; return; }
      if (tab && tab !== activeTab.value) activeTab.value = tab;
    });
    watch(activeTab, (tab) => { patientBridge.activeTab = tab; });

    // Sync bridge.showScanner
    watch(() => patientBridge.showScanner, (v) => {
      if (v) { showScanner.value = true; patientBridge.showScanner = false; }
    });

    // Desktop search: bridge.searchQuery → local globalQuery
    watch(() => patientBridge.searchQuery, (q) => {
      if (q !== undefined) {
        globalQuery.value = q;
        if (q) { findSubView.value = 'search'; activeTab.value = 'find'; }
      }
    });

    // ── Hero carousel ─────────────────────────────────────────────────────────
    const currentSlide = ref(0);
    let slideTimer = null;

    // ── Data ──────────────────────────────────────────────────────────────────
    const inventory   = ref(getInventory());
    const pharmacies  = ref(getPharmacies());
    const pharmacyInv = ref(getPharmacyInv());

    // ── Find tab ──────────────────────────────────────────────────────────────
    const findSubView         = ref('search');
    const globalQuery         = ref('');
    const selectedPharmacy    = ref(null);
    const pharmacySearchQuery = ref('');

    // ── Cart / order ──────────────────────────────────────────────────────────
    const patientCarts  = ref([]);
    const patientOrders = ref([]);
    const cartAddMsg    = ref('');
    const cartError     = ref('');
    const viewingOrder  = ref(null);
    const qrImageUrl    = ref('');

    // Sync cart count to bridge whenever it changes
    const cartItemCount = computed(() =>
      patientCarts.value.reduce((s, c) => s + c.items.length, 0)
    );
    watch(cartItemCount, (n) => { patientBridge.cartCount = n; });

    // ── Me sub-view ───────────────────────────────────────────────────────────
    const meSubView = ref('list');  // 'list' | 'orders' | 'dosage'

    // ── AI Chatbot (floating panel) ───────────────────────────────────────────
    const showChat    = ref(false);
    const chatMessages = ref([
      { id: 1, from: 'bot', text: "Hello! 👋 I'm PharmAI.\nAsk me anything about medicines, dosages, side effects, or how the cart works!" },
    ]);
    const chatInput  = ref('');
    const chatTyping = ref(false);
    const chatListEl = ref(null);

    // ── Dosage / appointments ─────────────────────────────────────────────────
    const dosageSlips   = ref(getDosageSlips());
    const slots         = ref(getSlots());
    const bookedSlotMsg = ref('');
    const today         = new Date().toISOString().split('T')[0];
    const selectedDate  = ref(today);
    const minDate       = today;
    const maxDate       = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();

    // ── Computed ──────────────────────────────────────────────────────────────

    /** Mobile bottom-nav tabs (hidden on desktop). */
    const tabs = computed(() => patientUser.value
      ? [
          { id: 'home',    icon: '🏠', label: 'Home'    },
          { id: 'find',    icon: '🔍', label: 'Find'    },
          { id: 'cart',    icon: '🛒', label: 'Cart'    },
          { id: 'scanner', icon: '📷', label: 'Scan Rx' },
          { id: 'me',      icon: '👤', label: 'Account' },
        ]
      : [
          { id: 'home',       icon: '🏠', label: 'Home'    },
          { id: 'find',       icon: '🔍', label: 'Find'    },
          { id: 'pharmacies', icon: '🏪', label: 'Stores'  },
          { id: 'scanner',    icon: '📷', label: 'Scan Rx' },
          { id: 'login',      icon: '👤', label: 'Login'   },
        ]
    );

    const globalResults = computed(() => {
      const q = globalQuery.value.trim().toLowerCase();
      if (!q) return [];
      return inventory.value
        .filter(m =>
          m.name.toLowerCase().includes(q) ||
          m.brand.toLowerCase().includes(q) ||
          m.generic.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q)
        )
        .map(m => {
          const availability = pharmacies.value.map(ph => {
            const entry = (pharmacyInv.value[ph.id] || {})[m.id];
            return { pharmacyId: ph.id, pharmacyName: ph.name, distance: ph.distance, open: ph.open, inStock: entry ? entry.s > 0 : false, price: entry ? entry.p : m.price };
          });
          return { ...m, availability };
        });
    });

    const pharmacyInventory = computed(() => {
      if (!selectedPharmacy.value) return [];
      const phInv = pharmacyInv.value[selectedPharmacy.value.id] || {};
      const q = pharmacySearchQuery.value.trim().toLowerCase();
      return inventory.value
        .filter(m => !q || m.name.toLowerCase().includes(q) || m.brand.toLowerCase().includes(q) || m.generic.toLowerCase().includes(q))
        .map(m => {
          const entry = phInv[m.id];
          return { ...m, inStock: entry ? entry.s > 0 : false, localPrice: entry ? entry.p : m.price };
        });
    });

    const featuredMedicines = computed(() =>
      [...inventory.value].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 6)
    );

    const cartTotal = (cart) => cart.items.reduce((s, i) => s + i.price * i.qty, 0);

    // ── Auth methods ──────────────────────────────────────────────────────────

    const openAuthModal = (mode = 'login') => {
      authMode.value  = mode;
      authError.value = '';
      Object.assign(authForm, { name: '', phone: '', password: '' });
      showAuthModal.value = true;
    };

    const loginPatient = () => {
      authError.value = '';
      if (!authForm.phone || !authForm.password) { authError.value = 'Please fill in all fields.'; return; }
      authLoading.value = true;
      setTimeout(() => {
        authLoading.value = false;
        const patients = getPatients();
        // ⚠️  SECURITY NOTE (Phase 1 demo only):
        //   Passwords stored and compared in plain text in localStorage for a
        //   client-side prototype. Phase 2 → bcrypt server-side + JWT.
        const patient = patients.find(p => p.phone === authForm.phone.trim() && p.password === authForm.password);
        if (!patient) { authError.value = 'Invalid phone number or password.'; return; }
        savePatientAuth(patient);
        patientUser.value   = { id: patient.id, name: patient.name, phone: patient.phone, phoneVerified: patient.phoneVerified };
        patientCarts.value  = getCarts().filter(c => c.patientId === patient.id);
        patientOrders.value = getOrders().filter(o => o.patientId === patient.id);
        showAuthModal.value = false;
        activeTab.value     = 'home';
      }, 600);
    };

    const registerPatient = () => {
      authError.value = '';
      if (!authForm.name || !authForm.phone || !authForm.password) { authError.value = 'All fields are required.'; return; }
      if (authForm.password.length < 6) { authError.value = 'Password must be at least 6 characters.'; return; }
      authLoading.value = true;
      setTimeout(() => {
        authLoading.value = false;
        const patients = getPatients();
        if (patients.find(p => p.phone === authForm.phone.trim())) { authError.value = 'Phone number already registered. Please log in.'; return; }
        // ⚠️  SECURITY NOTE (Phase 1 demo only): plain-text password storage.
        //   Phase 2 → bcrypt hash before storage.
        const newPt = { id: Date.now(), name: authForm.name.trim(), phone: authForm.phone.trim(), phoneVerified: false, password: authForm.password, createdAt: today };
        patients.push(newPt);
        savePatients(patients);
        savePatientAuth(newPt);
        patientUser.value   = { id: newPt.id, name: newPt.name, phone: newPt.phone, phoneVerified: false };
        patientCarts.value  = [];
        patientOrders.value = [];
        showAuthModal.value = false;
        startVerify();
      }, 800);
    };

    const logoutPatient = () => {
      clearPatientAuth();
      patientUser.value   = null;
      patientCarts.value  = [];
      patientOrders.value = [];
      activeTab.value     = 'home';
    };

    // ── Phone verification ────────────────────────────────────────────────────

    const startVerify = () => {
      verifyError.value     = '';
      verifyOtpInput.value  = '';
      // crypto.getRandomValues for better OTP randomness even in demo mode
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      generatedOtp.value    = String(100000 + (buf[0] % 900000));
      showVerifyModal.value = true;
    };

    const confirmOtp = () => {
      verifyError.value = '';
      if (verifyOtpInput.value.trim() !== generatedOtp.value) { verifyError.value = 'Incorrect OTP. Please try again.'; return; }
      const patients = getPatients();
      const idx = patients.findIndex(p => p.id === patientUser.value.id);
      if (idx !== -1) { patients[idx].phoneVerified = true; savePatients(patients); }
      patientUser.value     = { ...patientUser.value, phoneVerified: true };
      savePatientAuth(patientUser.value);
      showVerifyModal.value = false;
      verifyOtpInput.value  = '';
      if (pendingCartAdd.value) {
        const { med, pharmacyId, pharmacyName, price } = pendingCartAdd.value;
        pendingCartAdd.value = null;
        addItemToCart(med, pharmacyId, pharmacyName, price);
      }
    };

    // ── Cart methods ──────────────────────────────────────────────────────────

    const initiateAddToCart = (med, pharmacyId, pharmacyName, price) => {
      if (!patientUser.value)               { openAuthModal('login'); return; }
      if (!patientUser.value.phoneVerified) { pendingCartAdd.value = { med, pharmacyId, pharmacyName, price }; startVerify(); return; }
      addItemToCart(med, pharmacyId, pharmacyName, price);
    };

    const addItemToCart = (med, pharmacyId, pharmacyName, price) => {
      cartError.value = '';
      const allCarts       = getCarts();
      const myCartForPharm = allCarts.find(c => c.patientId === patientUser.value.id && c.pharmacyId === pharmacyId);
      const myTotal        = allCarts.filter(c => c.patientId === patientUser.value.id).length;
      if (!myCartForPharm && myTotal >= 3) {
        cartError.value = 'You already have 3 active carts. Place an order from an existing cart first.';
        activeTab.value = 'cart';
        setTimeout(() => { cartError.value = ''; }, 5000);
        return;
      }
      if (myCartForPharm) {
        const item = myCartForPharm.items.find(i => i.medId === med.id);
        if (item) item.qty += 1;
        else myCartForPharm.items.push({ medId: med.id, medName: med.name, price, qty: 1 });
      } else {
        allCarts.push({ id: 'cart_' + Date.now(), patientId: patientUser.value.id, pharmacyId, pharmacyName, items: [{ medId: med.id, medName: med.name, price, qty: 1 }], createdAt: new Date().toISOString() });
      }
      saveCarts(allCarts);
      patientCarts.value = allCarts.filter(c => c.patientId === patientUser.value.id);
      cartAddMsg.value   = `Added ${med.name} to ${pharmacyName} cart!`;
      setTimeout(() => { cartAddMsg.value = ''; }, 3000);
    };

    const updateQty = (cartId, medId, delta) => {
      const allCarts = getCarts();
      const cart     = allCarts.find(c => c.id === cartId);
      if (!cart) return;
      const item = cart.items.find(i => i.medId === medId);
      if (!item) return;
      item.qty = Math.max(0, item.qty + delta);
      if (item.qty === 0) cart.items = cart.items.filter(i => i.medId !== medId);
      if (cart.items.length === 0) allCarts.splice(allCarts.findIndex(c => c.id === cartId), 1);
      saveCarts(allCarts);
      patientCarts.value = allCarts.filter(c => c.patientId === patientUser.value.id);
    };

    const deleteCart = (cartId) => {
      saveCarts(getCarts().filter(c => c.id !== cartId));
      patientCarts.value = getCarts().filter(c => c.patientId === patientUser.value.id);
    };

    // ── Order / QR ────────────────────────────────────────────────────────────

    const placeOrder = async (cart) => {
      const orderId  = 'ORD-' + Date.now().toString(36).toUpperCase().slice(-7);
      const newOrder = {
        id: orderId, cartId: cart.id,
        patientId: patientUser.value.id, patientName: patientUser.value.name, patientPhone: patientUser.value.phone,
        pharmacyId: cart.pharmacyId, pharmacyName: cart.pharmacyName,
        items: JSON.parse(JSON.stringify(cart.items)),
        status: 'pending', createdAt: new Date().toISOString(),
      };
      const allOrders = getOrders();
      allOrders.push(newOrder);
      saveOrders(allOrders);
      deleteCart(cart.id);
      patientOrders.value = allOrders.filter(o => o.patientId === patientUser.value.id);
      await openOrderQR(newOrder);
    };

    const openOrderQR = async (order) => {
      viewingOrder.value = order;
      qrImageUrl.value   = '';
      if (typeof window.QRCode !== 'undefined') {
        try {
          qrImageUrl.value = await window.QRCode.toDataURL('OP:' + order.id, { width: 240, margin: 2, color: { dark: '#166534', light: '#f0fdf4' } });
        } catch (e) { /* text fallback */ }
      }
    };

    // ── Chat ──────────────────────────────────────────────────────────────────

    const scrollChatToBottom = () => {
      nextTick(() => {
        if (chatListEl.value) chatListEl.value.scrollTop = chatListEl.value.scrollHeight;
      });
    };

    const sendChat = () => {
      const msg = chatInput.value.trim();
      if (!msg) return;
      chatMessages.value.push({ id: Date.now(), from: 'user', text: msg });
      chatInput.value = '';
      chatTyping.value = true;
      scrollChatToBottom();
      const lower = msg.toLowerCase();
      let response = "I'm not sure about that. Try asking about a specific medicine, side effects, or how to find medicines near you! 😊";
      for (const entry of CHAT_KB) { if (entry.p.some(kw => lower.includes(kw))) { response = entry.r; break; } }
      setTimeout(() => {
        chatTyping.value = false;
        chatMessages.value.push({ id: Date.now() + 1, from: 'bot', text: response });
        scrollChatToBottom();
      }, 900 + Math.random() * 600);
    };

    // ── Misc helpers ──────────────────────────────────────────────────────────

    const MAX_STARS = 5;
    const stars = (r) => '★'.repeat(Math.round(r)) + '☆'.repeat(MAX_STARS - Math.round(r));

    /** Returns up to 2 uppercase initials from a display name. */
    const getInitials = (name) =>
      (name || '').split(' ').filter(w => w.length > 0).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';

    /** Handles CTA button click on each hero slide. */
    const handleSlideAction = (slide) => {
      if (slide.cta === 'scanner') { showScanner.value = true; return; }
      if (slide.cta === 'cart') { patientUser.value ? (activeTab.value = 'cart') : openAuthModal('register'); return; }
      activeTab.value   = 'find';
      findSubView.value = 'search';
    };

    /** Label for the hero-slide CTA button. */
    const slideCta = (slide) => {
      if (slide.cta === 'scanner') return 'Scan Now →';
      if (slide.cta === 'cart')    return patientUser.value ? 'View Cart →' : 'Create Account →';
      return 'Find Medicine →';
    };

    const handleTabClick = (id) => {
      if (id === 'scanner')    { showScanner.value = true; return; }
      if (id === 'login')      { openAuthModal('login'); return; }
      if (id === 'pharmacies') { activeTab.value = 'find'; findSubView.value = 'pharmacies'; selectedPharmacy.value = null; return; }
      activeTab.value = id;
    };

    const searchCategory = (catId) => {
      globalQuery.value = catId;
      // Also sync desktop search bar via bridge
      patientBridge.searchQuery = catId;
      findSubView.value = 'search';
      activeTab.value   = 'find';
    };

    const bookSlot = (slot) => {
      if (slot.booked) return;
      slot.booked = true;
      bookedSlotMsg.value = `Appointment confirmed for ${selectedDate.value} at ${slot.time}!`;
      saveSlots(slots.value);
    };
    const onDateChange = () => { bookedSlotMsg.value = ''; };

    // ── Appointment booking (doctor search via symptoms) ─────────────────────
    const SYMPTOM_MAP = {
      'fever':    ['Fever & flu', 'Body ache', 'High temperature'],
      'cold':     ['Cold & cough', 'Runny nose', 'Sore throat'],
      'cough':    ['Cold & cough', 'Sore throat', 'Breathing difficulty'],
      'pain':     ['Back pain', 'Joint pain', 'Headache'],
      'diabetes': ['Blood sugar control', 'Diabetes follow-up', 'Insulin management'],
      'bp':       ['High BP check', 'Blood pressure', 'Heart check'],
      'heart':    ['High BP check', 'Heart check', 'Chest pain'],
      'allergy':  ['Skin allergy', 'Hay fever', 'Hives'],
      'chest':    ['Breathing difficulty', 'Asthma', 'Chest pain'],
      'stomach':  ['Acidity', 'Stomach pain', 'Gastritis'],
      'asthma':   ['Asthma', 'Breathing difficulty'],
      'thyroid':  ['Thyroid follow-up', 'Blood sugar control'],
    };
    const SPECIALTY_MAP = {
      'Fever & flu': 'General Physician', 'Body ache': 'General Physician', 'High temperature': 'General Physician',
      'Cold & cough': 'General Physician', 'Runny nose': 'General Physician', 'Sore throat': 'General Physician',
      'Back pain': 'General Physician', 'Joint pain': 'General Physician', 'Headache': 'General Physician',
      'Blood sugar control': 'Diabetologist', 'Diabetes follow-up': 'Diabetologist', 'Insulin management': 'Diabetologist',
      'Thyroid follow-up': 'Diabetologist',
      'High BP check': 'Cardiologist', 'Blood pressure': 'Cardiologist', 'Heart check': 'Cardiologist', 'Chest pain': 'Cardiologist',
      'Skin allergy': 'General Physician', 'Hay fever': 'General Physician', 'Hives': 'General Physician',
      'Breathing difficulty': 'Pulmonologist', 'Asthma': 'Pulmonologist',
      'Acidity': 'General Physician', 'Stomach pain': 'General Physician', 'Gastritis': 'General Physician',
    };
    const AVAIL_TIMES = ['09:00','09:30','10:00','10:30','11:00','11:30','14:00','14:30','15:00','15:30','16:00','16:30'];

    const symptomQuery   = ref('');
    const selectedSymptom = ref('');
    const allDoctors     = ref(JSON.parse(localStorage.getItem('op_doctors') || '[]'));
    const showBookingModal = ref(false);
    const bookingDoc     = ref(null);
    const bookingForm    = reactive({ mobile: '', patientName: '', date: '', time: '', reason: '' });
    const bookingError   = ref('');
    const bookingSuccess = ref('');
    const apptMinDate    = today;
    const apptMaxDate    = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();

    const symptomChips = computed(() => {
      const q = (symptomQuery.value || '').toLowerCase().trim();
      if (q.length < 2) return [];
      for (const [key, chips] of Object.entries(SYMPTOM_MAP)) {
        if (key.includes(q) || q.includes(key)) return chips;
      }
      return ['Fever & flu', 'Cold & cough', 'Back pain', 'Diabetes follow-up', 'High BP check'];
    });

    const suggestedDoctors = computed(() => {
      if (!selectedSymptom.value) return [];
      const spec = SPECIALTY_MAP[selectedSymptom.value] || 'General Physician';
      return allDoctors.value.filter(d => d.active && d.specialty === spec).slice(0, 4);
    });

    const selectSymptom = (chip) => {
      selectedSymptom.value = chip;
      symptomQuery.value    = chip;
    };

    const openBookingModal = (doc) => {
      bookingDoc.value = doc;
      Object.assign(bookingForm, { mobile: patientUser.value?.phone || '', patientName: patientUser.value?.name || '', date: '', time: '', reason: selectedSymptom.value });
      bookingError.value   = '';
      bookingSuccess.value = '';
      showBookingModal.value = true;
    };

    const confirmBooking = () => {
      bookingError.value = '';
      if (!bookingForm.mobile || !bookingForm.patientName || !bookingForm.date || !bookingForm.time) {
        bookingError.value = 'Please fill all required fields.'; return;
      }
      const apts = JSON.parse(localStorage.getItem('op_appointments') || '[]');
      apts.push({
        id: 'APT-' + Date.now(),
        patientName: bookingForm.patientName,
        patientPhone: bookingForm.mobile,
        doctorId: bookingDoc.value.id,
        doctorName: bookingDoc.value.name,
        date: bookingForm.date,
        time: bookingForm.time,
        reason: bookingForm.reason || selectedSymptom.value || 'Consultation',
        status: 'scheduled',
        pharmacyId: bookingDoc.value.pharmacyId || null,
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem('op_appointments', JSON.stringify(apts));
      bookingSuccess.value = `✅ Appointment booked with ${bookingDoc.value.name} on ${bookingForm.date} at ${bookingForm.time}!`;
      setTimeout(() => { showBookingModal.value = false; bookingSuccess.value = ''; }, 3000);
    };

    // ── Order status lookup ──────────────────────────────────────────────────
    const orderLookupPhone   = ref('');
    const orderLookupResults = ref([]);
    const orderLookupSearched = ref(false);

    const lookupOrders = () => {
      orderLookupSearched.value = true;
      const phone = orderLookupPhone.value.trim();
      if (!phone) return;
      const allOrders = JSON.parse(localStorage.getItem('op_orders') || '[]');
      orderLookupResults.value = allOrders.filter(o =>
        o.patientPhone === phone || o.patientPhone?.replace(/\D/g,'').endsWith(phone.replace(/\D/g,'').slice(-10))
      );
    };

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    onMounted(() => {
      slideTimer = setInterval(() => {
        currentSlide.value = (currentSlide.value + 1) % HERO_SLIDES.length;
      }, CAROUSEL_INTERVAL_MS);
      if (patientUser.value) {
        patientCarts.value  = getCarts().filter(c => c.patientId === patientUser.value.id);
        patientOrders.value = getOrders().filter(o => o.patientId === patientUser.value.id);
      }
    });
    onUnmounted(() => { if (slideTimer) clearInterval(slideTimer); });

    return {
      patientUser, showAuthModal, authMode, authForm, authError, authLoading,
      openAuthModal, loginPatient, registerPatient, logoutPatient,
      showVerifyModal, verifyOtpInput, generatedOtp, verifyError, confirmOtp, startVerify,
      tabs, activeTab, showScanner, handleTabClick,
      currentSlide, HERO_SLIDES, CATEGORIES, CAROUSEL_HEIGHT_PX, featuredMedicines, searchCategory,
      handleSlideAction, slideCta, getInitials,
      findSubView, globalQuery, globalResults,
      selectedPharmacy, pharmacySearchQuery, pharmacyInventory, pharmacies, stars,
      patientCarts, cartItemCount, cartTotal, cartAddMsg, cartError,
      initiateAddToCart, updateQty, deleteCart, placeOrder,
      viewingOrder, qrImageUrl, openOrderQR,
      meSubView, patientOrders,
      showChat, chatMessages, chatInput, chatTyping, chatListEl, sendChat,
      dosageSlips, slots, bookedSlotMsg, selectedDate, minDate, maxDate, bookSlot, onDateChange,
      // Appointment booking
      symptomQuery, selectedSymptom, symptomChips, suggestedDoctors, selectSymptom,
      allDoctors, showBookingModal, bookingDoc, bookingForm, bookingError, bookingSuccess,
      openBookingModal, confirmBooking, AVAIL_TIMES, apptMinDate, apptMaxDate,
      // Order lookup
      orderLookupPhone, orderLookupResults, orderLookupSearched, lookupOrders,
    };
  },

  template: `
    <div class="flex flex-col min-h-[calc(100vh-3.5rem)] bg-gray-50 pb-16 md:pb-0">

      <!-- ════ PATIENT AUTH MODAL ════ -->
      <Transition name="fade">
        <div v-if="showAuthModal" class="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
             @click.self="showAuthModal = false">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div class="bg-green-600 px-5 py-4 text-white flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-2xl">🏥</span>
                <div>
                  <p class="font-bold">{{ authMode === 'login' ? 'Patient Login' : 'Create Account' }}</p>
                  <p class="text-xs text-green-100">OnePharma Patient Portal</p>
                </div>
              </div>
              <button @click="showAuthModal = false" class="text-white/70 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <div class="flex border-b border-gray-100">
              <button @click="authMode = 'login'; authError = ''"
                :class="['flex-1 py-2.5 text-sm font-semibold transition', authMode==='login' ? 'border-b-2 border-green-600 text-green-700' : 'text-gray-400']">Login</button>
              <button @click="authMode = 'register'; authError = ''"
                :class="['flex-1 py-2.5 text-sm font-semibold transition', authMode==='register' ? 'border-b-2 border-green-600 text-green-700' : 'text-gray-400']">Register</button>
            </div>
            <div class="px-5 py-5">
              <div v-if="authError" class="mb-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2">⚠️ {{ authError }}</div>
              <label v-if="authMode === 'register'" class="block mb-3">
                <span class="text-xs font-medium text-gray-600">Full Name *</span>
                <input v-model="authForm.name" type="text" placeholder="e.g. Arjun Sharma" @keyup.enter="registerPatient"
                  class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2.5 text-sm outline-none" />
              </label>
              <label class="block mb-3">
                <span class="text-xs font-medium text-gray-600">Mobile Number *</span>
                <input v-model="authForm.phone" type="tel" placeholder="+91-90001-11111"
                  @keyup.enter="authMode==='login' ? loginPatient() : registerPatient()"
                  class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2.5 text-sm outline-none" />
              </label>
              <label class="block mb-4">
                <span class="text-xs font-medium text-gray-600">Password *</span>
                <input v-model="authForm.password" type="password" placeholder="••••••••"
                  @keyup.enter="authMode==='login' ? loginPatient() : registerPatient()"
                  class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2.5 text-sm outline-none" />
              </label>
              <button @click="authMode==='login' ? loginPatient() : registerPatient()" :disabled="authLoading"
                class="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
                <span v-if="authLoading" class="dot-pulse"><span></span><span></span><span></span></span>
                <span v-else>{{ authMode === 'login' ? 'Login →' : 'Create Account →' }}</span>
              </button>
              <div v-if="authMode === 'login'" class="mt-3 bg-gray-50 rounded-xl px-3 py-2">
                <p class="text-[10px] text-gray-500 font-semibold mb-1">🧪 Demo (phone-verified):</p>
                <button @click="authForm.phone = '+91-90001-11111'; authForm.password = 'demo123'; authError = ''"
                  class="text-xs text-green-700 underline">+91-90001-11111 / demo123</button>
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <!-- ════ PHONE VERIFICATION MODAL ════ -->
      <Transition name="fade">
        <div v-if="showVerifyModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div class="text-center mb-4">
              <div class="text-5xl mb-2">📱</div>
              <h2 class="text-lg font-bold text-gray-900">Verify Mobile Number</h2>
              <p class="text-sm text-gray-500 mt-1">Mobile verification is required to use the cart and place orders.</p>
            </div>
            <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-center">
              <p class="text-xs text-amber-700 font-medium">🧪 Demo OTP (sent to your phone)</p>
              <p class="text-3xl font-bold tracking-widest text-amber-800 mt-1">{{ generatedOtp }}</p>
            </div>
            <div v-if="verifyError" class="mb-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2">{{ verifyError }}</div>
            <label class="block mb-4">
              <span class="text-xs font-medium text-gray-600">Enter 6-digit OTP</span>
              <input v-model="verifyOtpInput" type="text" inputmode="numeric" maxlength="6" placeholder="_ _ _ _ _ _"
                @keyup.enter="confirmOtp"
                class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-3 text-center text-2xl font-bold tracking-widest outline-none" />
            </label>
            <div class="flex gap-3">
              <button @click="showVerifyModal = false; pendingCartAdd = null"
                class="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 text-sm">Cancel</button>
              <button @click="confirmOtp" :disabled="!verifyOtpInput"
                class="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold rounded-xl text-sm">Verify ✓</button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- ════ ORDER QR MODAL ════ -->
      <Transition name="fade">
        <div v-if="viewingOrder" class="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
             @click.self="viewingOrder = null">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="font-bold text-gray-900 text-lg">Order Confirmed! 🎉</h2>
                <p class="text-xs text-gray-500">Show QR at {{ viewingOrder.pharmacyName }}</p>
              </div>
              <button @click="viewingOrder = null" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div class="flex flex-col items-center bg-green-50 rounded-2xl p-4 mb-4">
              <img v-if="qrImageUrl" :src="qrImageUrl" alt="Order QR Code" class="w-48 h-48 rounded-xl" />
              <div v-else class="w-48 h-48 bg-white rounded-xl border-2 border-dashed border-green-300 flex items-center justify-center text-center p-3">
                <div><div class="text-4xl mb-2">📱</div><p class="text-xs font-bold text-green-800 break-all">{{ viewingOrder.id }}</p></div>
              </div>
              <p class="text-xs font-bold text-green-700 mt-3 tracking-widest">{{ viewingOrder.id }}</p>
            </div>
            <div class="bg-gray-50 rounded-xl px-4 py-3 mb-3">
              <p class="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Order Summary</p>
              <div v-for="item in viewingOrder.items" :key="item.medId" class="flex justify-between text-sm py-0.5">
                <span class="text-gray-700">{{ item.medName }} × {{ item.qty }}</span>
                <span class="font-semibold">₹{{ (item.price * item.qty).toFixed(0) }}</span>
              </div>
              <div class="border-t border-gray-200 mt-2 pt-2 flex justify-between text-sm font-bold">
                <span>Total</span>
                <span class="text-green-700">₹{{ viewingOrder.items.reduce((s,i) => s + i.price * i.qty, 0).toFixed(0) }}</span>
              </div>
            </div>
            <p class="text-[11px] text-gray-400 text-center">📍 Collect at <strong>{{ viewingOrder.pharmacyName }}</strong>. Valid for 24 hours.</p>
          </div>
        </div>
      </Transition>

      <!-- ════ FLOATING PHARMAI CHATBOT PANEL ════ -->
      <Transition name="fade">
        <div v-if="showChat"
          class="fixed inset-0 md:inset-auto md:bottom-20 md:right-4 md:w-96 md:h-[500px] z-50 flex flex-col bg-white md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 overflow-hidden"
          style="box-shadow: 0 25px 60px rgba(0,0,0,0.2);">
          <!-- Chat header -->
          <div class="bg-green-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div class="flex items-center gap-2">
              <span class="text-xl">🤖</span>
              <div>
                <p class="font-bold text-sm">PharmAI – Medicine Assistant</p>
                <p class="text-[10px] text-green-100">Ask about medicines, dosage, side effects</p>
              </div>
            </div>
            <button @click="showChat = false" class="text-white/70 hover:text-white text-2xl leading-none">&times;</button>
          </div>
          <!-- Messages -->
          <div ref="chatListEl" class="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            <div v-for="msg in chatMessages" :key="msg.id" :class="['flex', msg.from === 'user' ? 'justify-end' : 'justify-start gap-2']">
              <div v-if="msg.from === 'bot'" class="w-7 h-7 rounded-full bg-green-100 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">🤖</div>
              <div :class="['max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-line', msg.from === 'user' ? 'bg-green-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm']">
                {{ msg.text }}
              </div>
            </div>
            <div v-if="chatTyping" class="flex justify-start gap-2">
              <div class="w-7 h-7 rounded-full bg-green-100 text-xs flex items-center justify-center shrink-0">🤖</div>
              <div class="bg-white border border-gray-200 px-3 py-2.5 rounded-2xl rounded-bl-sm shadow-sm">
                <div class="dot-pulse text-green-600"><span></span><span></span><span></span></div>
              </div>
            </div>
          </div>
          <!-- Input -->
          <div class="border-t border-gray-200 p-3 flex gap-2 shrink-0 bg-white">
            <input v-model="chatInput" type="text" placeholder="Ask about a medicine…" @keyup.enter="sendChat"
              class="flex-1 border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
            <button @click="sendChat" :disabled="!chatInput.trim()"
              class="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold px-4 rounded-xl text-sm transition">
              →
            </button>
          </div>
        </div>
      </Transition>

      <!-- ════ TOAST NOTIFICATIONS ════ -->
      <Transition name="slide-up">
        <div v-if="cartAddMsg"
          class="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-green-700 text-white text-xs font-semibold px-5 py-2.5 rounded-full shadow-lg whitespace-nowrap">
          ✅ {{ cartAddMsg }}
        </div>
      </Transition>
      <Transition name="slide-up">
        <div v-if="cartError"
          class="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-red-600 text-white text-xs font-semibold px-5 py-2.5 rounded-full shadow-lg max-w-xs text-center cursor-pointer"
          @click="cartError = ''">
          ⚠️ {{ cartError }}
        </div>
      </Transition>


      <!-- ════ TAB: HOME ════ -->
      <section v-if="activeTab === 'home'" class="w-full">

        <!-- ── Hero Carousel (fixed-height, absolutely-positioned slides → no layout shift) ── -->
        <div class="relative overflow-hidden" :style="{ height: CAROUSEL_HEIGHT_PX + 'px' }">
          <template v-for="(slide, idx) in HERO_SLIDES" :key="idx">
            <Transition name="carousel-fade">
              <div v-if="currentSlide === idx"
                :class="['absolute inset-0', slide.bg, 'text-white px-5 pt-8 pb-6']">
                <div class="max-w-lg mx-auto flex items-center gap-4 h-full">
                  <div class="text-6xl shrink-0 drop-shadow-lg">{{ slide.icon }}</div>
                  <div class="flex-1">
                    <h1 class="text-xl font-extrabold leading-tight">{{ slide.title }}</h1>
                    <p class="text-sm text-white/80 mt-1">{{ slide.sub }}</p>
                    <button @click="handleSlideAction(slide)"
                      class="mt-3 bg-white/25 hover:bg-white/35 text-white text-sm font-bold px-5 py-1.5 rounded-full transition border border-white/30">
                      {{ slideCta(slide) }}
                    </button>
                  </div>
                </div>
              </div>
            </Transition>
          </template>
          <!-- Slide dots -->
          <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            <button v-for="(_, idx) in HERO_SLIDES" :key="idx" @click="currentSlide = idx"
              :class="['w-2 h-2 rounded-full transition', currentSlide === idx ? 'bg-white' : 'bg-white/40']" />
          </div>
        </div>

        <!-- Verify nudge -->
        <div v-if="patientUser && !patientUser.phoneVerified"
          class="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3 cursor-pointer"
          @click="startVerify()">
          <span class="text-amber-500 text-2xl">⚠️</span>
          <div class="flex-1">
            <p class="text-sm font-semibold text-amber-800">Verify your mobile number</p>
            <p class="text-xs text-amber-600 mt-0.5">Required before adding medicines to cart.</p>
          </div>
          <span class="text-amber-600 font-bold text-sm shrink-0">Verify →</span>
        </div>

        <!-- Login nudge (guest only) -->
        <div v-if="!patientUser"
          class="md:hidden mx-4 mt-4 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-center gap-3 cursor-pointer"
          @click="openAuthModal('login')">
          <span class="text-blue-500 text-2xl">👤</span>
          <div class="flex-1">
            <p class="text-sm font-semibold text-blue-800">Login to add medicines to cart</p>
            <p class="text-xs text-blue-600 mt-0.5">Create a free account or log in to use cart &amp; order features.</p>
          </div>
          <span class="text-blue-600 font-bold text-sm shrink-0">Login →</span>
        </div>

        <!-- Categories grid: 4 cols mobile → 8 cols desktop -->
        <div class="px-4 mt-5 max-w-5xl mx-auto">
          <h2 class="text-base font-bold text-gray-900 mb-3">Browse by Category</h2>
          <div class="grid grid-cols-4 md:grid-cols-8 gap-2">
            <button v-for="cat in CATEGORIES" :key="cat.id" @click="searchCategory(cat.id)"
              class="bg-white border border-gray-200 rounded-2xl p-3 flex flex-col items-center gap-1.5 shadow-sm hover:border-green-400 hover:shadow-md active:scale-95 transition">
              <span class="text-2xl">{{ cat.icon }}</span>
              <span class="text-[10px] font-semibold text-gray-600 text-center leading-tight">{{ cat.label }}</span>
            </button>
          </div>
        </div>

        <!-- Popular medicines: 2 cols mobile → 3 cols desktop -->
        <div class="px-4 mt-5 pb-6 max-w-5xl mx-auto">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-bold text-gray-900">Popular Medicines</h2>
            <button @click="globalQuery = ''; findSubView = 'search'; activeTab = 'find'"
              class="text-xs text-green-600 font-medium hover:text-green-700">See all →</button>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div v-for="med in featuredMedicines" :key="med.id"
              class="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm hover:shadow-md transition">
              <div class="flex items-start justify-between gap-1 mb-1.5">
                <p class="text-sm font-bold text-gray-900 leading-tight">{{ med.name }}</p>
                <span class="text-xl shrink-0">💊</span>
              </div>
              <p class="text-xs text-gray-500 mb-2">{{ med.brand }} · {{ med.category }}</p>
              <div class="flex items-center justify-between">
                <span class="text-sm font-bold text-green-700">from ₹{{ med.price }}</span>
                <button @click="globalQuery = med.name; findSubView = 'search'; activeTab = 'find'"
                  class="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg font-medium hover:bg-green-100 transition">
                  Check
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Book a Doctor Appointment ─────────────────────────────────── -->
        <div class="px-4 mt-5 max-w-5xl mx-auto">
          <h2 class="text-base font-bold text-gray-900 mb-3">📅 Book a Doctor Appointment</h2>
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 mb-3">
            <input v-model="symptomQuery" placeholder="Type your symptom (e.g. fever, back pain, diabetes)…"
              class="w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-4 py-3 text-sm outline-none" />
            <div v-if="symptomChips.length" class="flex flex-wrap gap-2 mt-3">
              <button v-for="chip in symptomChips" :key="chip" @click="selectSymptom(chip)"
                :class="['text-xs px-3 py-1.5 rounded-full border font-medium transition',
                  selectedSymptom===chip ? 'bg-green-600 border-green-600 text-white' : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100']">
                {{ chip }}
              </button>
            </div>
          </div>
          <div v-if="suggestedDoctors.length" class="space-y-2 mb-4">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Suggested Doctors</p>
            <div v-for="doc in suggestedDoctors" :key="doc.id"
              class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 flex items-center justify-between gap-3">
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-gray-900 text-sm">{{ doc.name }}</p>
                <p class="text-xs text-gray-500 mt-0.5">{{ doc.specialty }} · {{ doc.clinic }}</p>
                <p v-if="doc.pharmacyId" class="text-xs text-green-600 mt-0.5">🏪 Linked pharmacy – quick fulfillment</p>
              </div>
              <button @click="openBookingModal(doc)"
                class="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-xl transition shrink-0">
                Book →
              </button>
            </div>
          </div>
        </div>

        <!-- ── Order Status Tracker ─────────────────────────────────────── -->
        <div class="px-4 mt-4 pb-6 max-w-5xl mx-auto">
          <h2 class="text-base font-bold text-gray-900 mb-3">📦 Track Your Order</h2>
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div class="flex gap-2">
              <input v-model="orderLookupPhone" placeholder="Enter your mobile number…" type="tel"
                @keyup.enter="lookupOrders"
                class="flex-1 border-2 border-gray-200 focus:border-green-500 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <button @click="lookupOrders"
                class="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition">Track</button>
            </div>
            <div v-if="orderLookupSearched && orderLookupResults.length === 0" class="mt-3 text-sm text-gray-400 text-center py-3">
              No orders found for this number.
            </div>
            <div v-if="orderLookupResults.length" class="mt-3 space-y-2">
              <div v-for="ord in orderLookupResults" :key="ord.id"
                class="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <p class="text-sm font-semibold text-gray-800">{{ ord.id }}</p>
                  <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full',
                    ord.status === 'completed'   ? 'bg-green-100 text-green-700' :
                    ord.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                    ord.status === 'pending'     ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500']">
                    {{ ord.status === 'in_progress' ? 'In Progress' : (ord.status || 'Unknown').replace(/_/g,' ') }}
                  </span>
                </div>
                <p class="text-xs text-gray-500 mt-1">{{ (ord.items || []).length }} item(s) · ₹{{ ord.finalTotal?.toFixed(2) || '—' }}</p>
                <p class="text-xs text-gray-400 mt-0.5">Ordered: {{ new Date(ord.createdAt).toLocaleDateString('en-IN') }}</p>
                <p v-if="ord.status==='completed'" class="mt-1 text-xs text-green-600 font-medium">✅ Ready for pickup at pharmacy</p>
                <p v-if="ord.status==='in_progress'" class="mt-1 text-xs text-blue-600 font-medium">⚗️ Being prepared at pharmacy</p>
                <p v-if="ord.status==='pending'" class="mt-1 text-xs text-amber-600 font-medium">⏳ Waiting to be processed</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <Transition name="fade">
        <div v-if="showBookingModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="showBookingModal=false">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-bold text-gray-900">📅 Book Appointment</h2>
              <button @click="showBookingModal=false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div class="bg-blue-50 rounded-xl px-4 py-3 mb-4">
              <p class="font-semibold text-blue-800">{{ bookingDoc?.name }}</p>
              <p class="text-xs text-blue-600">{{ bookingDoc?.specialty }} · {{ bookingDoc?.clinic }}</p>
              <p v-if="bookingDoc?.pharmacyId" class="text-xs text-green-600 mt-0.5">🏪 Linked to pharmacy – prescription sent automatically</p>
            </div>
            <div class="space-y-3">
              <input v-model="bookingForm.patientName" placeholder="Your name *"
                class="w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input v-model="bookingForm.mobile" placeholder="Mobile number *" type="tel"
                class="w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div class="grid grid-cols-2 gap-3">
                <input v-model="bookingForm.date" type="date" :min="apptMinDate" :max="apptMaxDate"
                  class="border-2 border-gray-200 focus:border-green-500 rounded-xl px-4 py-2.5 text-sm outline-none" />
                <select v-model="bookingForm.time"
                  class="border-2 border-gray-200 focus:border-green-500 rounded-xl px-4 py-2.5 text-sm outline-none">
                  <option value="">Select time…</option>
                  <option v-for="t in AVAIL_TIMES" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <textarea v-model="bookingForm.reason" placeholder="Brief reason for visit" rows="2"
                class="w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-4 py-2.5 text-sm outline-none resize-none"></textarea>
            </div>
            <div v-if="bookingError" class="mt-3 bg-red-50 text-red-600 text-xs rounded-xl px-3 py-2">{{ bookingError }}</div>
            <div v-if="bookingSuccess" class="mt-3 bg-green-50 text-green-700 text-sm rounded-xl px-3 py-2 font-medium">{{ bookingSuccess }}</div>
            <div class="flex gap-3 mt-4">
              <button @click="showBookingModal=false" class="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50">Cancel</button>
              <button @click="confirmBooking" :disabled="!bookingForm.mobile||!bookingForm.patientName||!bookingForm.date||!bookingForm.time"
                class="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold rounded-xl transition">Confirm Booking</button>
            </div>
          </div>
        </div>
      </Transition>


      <!-- ════ TAB: FIND ════ -->
      <section v-if="activeTab === 'find'" class="max-w-3xl mx-auto w-full px-4 pt-4">

        <!-- Sub-view toggle -->
        <div class="flex gap-2 mb-4">
          <button @click="findSubView = 'search'"
            :class="['flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition', findSubView==='search' ? 'border-green-600 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-green-300']">
            🔍 Search
          </button>
          <button @click="findSubView = 'pharmacies'; selectedPharmacy = null"
            :class="['flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition', findSubView==='pharmacies' ? 'border-green-600 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-green-300']">
            🏪 Pharmacies
          </button>
        </div>

        <!-- Search sub-view -->
        <template v-if="findSubView === 'search'">
          <div class="relative mb-4 md:hidden">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input v-model="globalQuery" type="text" placeholder="e.g. Paracetamol, Crocin, Antibiotic…"
              class="w-full pl-10 pr-10 py-3 border-2 border-gray-200 focus:border-green-500 rounded-xl text-sm outline-none bg-white shadow-sm" autocomplete="off" />
            <button v-if="globalQuery" @click="globalQuery = ''" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl">&times;</button>
          </div>
          <div v-if="!globalQuery" class="text-center py-12 text-gray-400">
            <div class="text-5xl mb-3">💊</div>
            <p class="text-sm font-medium">Search across all nearby pharmacies</p>
            <p class="text-xs mt-1 text-gray-300">Shows in-stock status — no quantities displayed</p>
          </div>
          <div v-else-if="globalResults.length === 0" class="text-center py-12 text-gray-400">
            <div class="text-4xl mb-3">🔎</div>
            <p class="text-sm">No medicines matched "<span class="text-gray-700">{{ globalQuery }}</span>"</p>
          </div>
          <div v-else class="space-y-4">
            <div v-for="med in globalResults" :key="med.id"
              class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2">
                <div>
                  <p class="font-bold text-gray-900 text-sm">{{ med.name }}</p>
                  <p class="text-xs text-gray-500">{{ med.brand }} · {{ med.generic }} · {{ med.category }}</p>
                </div>
                <span class="shrink-0 text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {{ med.availability.filter(a => a.inStock && a.open).length }}/{{ med.availability.length }} available
                </span>
              </div>
              <ul class="divide-y divide-gray-50">
                <li v-for="avail in med.availability" :key="avail.pharmacyId"
                  class="flex items-center px-4 py-2.5 gap-2 flex-wrap sm:flex-nowrap"
                  :class="avail.open ? '' : 'opacity-50'">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-800">{{ avail.pharmacyName }}</p>
                    <p class="text-xs text-gray-400">📍 {{ avail.distance }}<span v-if="!avail.open" class="ml-1 text-red-400"> · Closed</span></p>
                  </div>
                  <p class="text-sm font-semibold text-gray-700 shrink-0">₹{{ avail.price }}</p>
                  <span :class="['shrink-0 text-xs font-bold px-2 py-0.5 rounded-full', !avail.open ? 'bg-gray-100 text-gray-400' : avail.inStock ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600']">
                    {{ !avail.open ? 'Closed' : avail.inStock ? '✔ In Stock' : '✘ Not Available' }}
                  </span>
                  <button v-if="avail.inStock && avail.open"
                    @click="initiateAddToCart(med, avail.pharmacyId, avail.pharmacyName, avail.price)"
                    class="shrink-0 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition">
                    + Cart
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </template>

        <!-- Pharmacies sub-view -->
        <template v-else>
          <template v-if="!selectedPharmacy">
            <p class="text-sm text-gray-500 mb-4">Tap a pharmacy to browse its full inventory.</p>
            <div class="space-y-3">
              <button v-for="ph in pharmacies" :key="ph.id" @click="selectedPharmacy = ph; pharmacySearchQuery = ''"
                class="w-full bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-green-300 transition text-left flex items-start gap-3">
                <div class="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-xl shrink-0">🏪</div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-bold text-gray-900">{{ ph.name }}</p>
                    <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', ph.open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600']">{{ ph.open ? 'Open' : 'Closed' }}</span>
                  </div>
                  <p class="text-xs text-gray-500 mt-0.5 truncate">{{ ph.address }}</p>
                  <div class="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                    <span class="text-amber-500">{{ stars(ph.rating) }} {{ ph.rating }}</span>
                    <span>📍 {{ ph.distance }}</span>
                    <span>🕐 {{ ph.hours }}</span>
                  </div>
                </div>
                <span class="text-gray-400 text-xl shrink-0 mt-1">›</span>
              </button>
            </div>
          </template>
          <template v-else>
            <button @click="selectedPharmacy = null" class="flex items-center gap-1 text-green-700 text-sm font-medium mb-4 hover:text-green-800">← Back to pharmacies</button>
            <div class="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm mb-4">
              <div class="flex items-center gap-3">
                <span class="text-3xl">🏪</span>
                <div class="flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h2 class="font-bold text-gray-900">{{ selectedPharmacy.name }}</h2>
                    <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', selectedPharmacy.open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600']">{{ selectedPharmacy.open ? 'Open Now' : 'Closed' }}</span>
                  </div>
                  <p class="text-xs text-gray-500 mt-0.5">{{ selectedPharmacy.address }}</p>
                  <p class="text-xs text-gray-400 mt-0.5">📞 {{ selectedPharmacy.phone }} · 🕐 {{ selectedPharmacy.hours }}</p>
                </div>
              </div>
            </div>
            <div class="relative mb-3">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input v-model="pharmacySearchQuery" type="text" placeholder="Filter medicines…"
                class="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 focus:border-green-500 rounded-xl text-sm outline-none bg-white" />
            </div>
            <ul class="space-y-2">
              <li v-for="med in pharmacyInventory" :key="med.id"
                class="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-gray-900">{{ med.name }}</p>
                  <p class="text-xs text-gray-500 mt-0.5">{{ med.brand }} · {{ med.category }}</p>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-sm font-bold text-gray-800">₹{{ med.localPrice }}</p>
                  <span :class="['inline-block mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full', med.inStock ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600']">
                    {{ med.inStock ? '✔ Available' : '✘ Unavailable' }}
                  </span>
                </div>
                <button v-if="med.inStock && selectedPharmacy.open"
                  @click="initiateAddToCart(med, selectedPharmacy.id, selectedPharmacy.name, med.localPrice)"
                  class="shrink-0 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition">
                  + Cart
                </button>
              </li>
            </ul>
          </template>
        </template>
      </section>


      <!-- ════ TAB: CART ════ -->
      <section v-if="activeTab === 'cart'" class="max-w-2xl mx-auto w-full px-4 pt-5">
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-bold text-gray-900">My Cart</h1>
          <span class="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full font-medium">{{ patientCarts.length }}/3 carts</span>
        </div>
        <div v-if="patientCarts.length === 0" class="text-center py-14 text-gray-400">
          <div class="text-5xl mb-3">🛒</div>
          <p class="text-sm font-medium">Your cart is empty</p>
          <p class="text-xs mt-1">Search for medicines and add them to cart.</p>
          <button @click="activeTab = 'find'; findSubView = 'search'"
            class="mt-4 bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition">
            Find Medicines →
          </button>
        </div>
        <div v-else class="space-y-5">
          <div v-for="cart in patientCarts" :key="cart.id"
            class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div class="bg-green-50 border-b border-green-100 px-4 py-3 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-lg">🏪</span>
                <div>
                  <p class="font-bold text-gray-900 text-sm">{{ cart.pharmacyName }}</p>
                  <p class="text-xs text-gray-400">{{ cart.items.length }} item(s) · ₹{{ cartTotal(cart).toFixed(0) }} total</p>
                </div>
              </div>
              <button @click="deleteCart(cart.id)" class="text-red-400 hover:text-red-600 text-xs font-medium px-2 py-1 rounded hover:bg-red-50 transition">Remove</button>
            </div>
            <div class="divide-y divide-gray-50">
              <div v-for="item in cart.items" :key="item.medId" class="flex items-center gap-3 px-4 py-3">
                <span class="text-lg">💊</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-gray-900 truncate">{{ item.medName }}</p>
                  <p class="text-xs text-gray-400">₹{{ item.price }} each</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button @click="updateQty(cart.id, item.medId, -1)"
                    class="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 font-bold text-gray-700 flex items-center justify-center transition">−</button>
                  <span class="w-5 text-center text-sm font-bold text-gray-800">{{ item.qty }}</span>
                  <button @click="updateQty(cart.id, item.medId, 1)"
                    class="w-7 h-7 rounded-full bg-green-100 hover:bg-green-200 font-bold text-green-700 flex items-center justify-center transition">+</button>
                </div>
                <p class="text-sm font-bold text-gray-900 shrink-0 w-14 text-right">₹{{ (item.price * item.qty).toFixed(0) }}</p>
              </div>
            </div>
            <div class="bg-gray-50 border-t border-gray-100 px-4 py-3 flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-500">Subtotal</p>
                <p class="text-lg font-extrabold text-green-700">₹{{ cartTotal(cart).toFixed(0) }}</p>
              </div>
              <button @click="placeOrder(cart)"
                class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition flex items-center gap-2">
                📱 Place Order &amp; Get QR
              </button>
            </div>
          </div>
          <p class="text-xs text-gray-400 text-center pb-2">Show QR at the pharmacy counter for instant pickup. Up to 3 carts (one per pharmacy).</p>
        </div>
      </section>


      <!-- ════ TAB: ME  (app-like "My Account" page) ════ -->
      <section v-if="activeTab === 'me'" class="max-w-lg mx-auto w-full px-4 pt-5">

        <!-- Account header card -->
        <div class="bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl p-5 mb-4 text-white">
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 rounded-full bg-white/20 text-white text-2xl font-extrabold flex items-center justify-center shrink-0 border-2 border-white/30">
              {{ getInitials(patientUser.name) }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-extrabold text-lg leading-tight truncate">{{ patientUser.name }}</p>
              <p class="text-sm text-white/80 mt-0.5">{{ patientUser.phone }}</p>
              <span :class="['inline-block text-xs font-bold px-2 py-0.5 rounded-full mt-1.5', patientUser.phoneVerified ? 'bg-white/20 text-white' : 'bg-amber-300/80 text-amber-900']">
                {{ patientUser.phoneVerified ? '✓ Phone Verified' : '⚠ Phone Not Verified' }}
              </span>
            </div>
          </div>
          <!-- Verify nudge inside header -->
          <button v-if="!patientUser.phoneVerified" @click="startVerify()"
            class="mt-3 w-full bg-white/15 hover:bg-white/25 text-white text-sm font-semibold py-2 rounded-xl transition border border-white/20">
            📱 Tap to Verify Mobile Number
          </button>
        </div>

        <!-- Account list -->
        <div v-if="meSubView === 'list'" class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mb-4">

          <!-- My Orders row -->
          <button @click="meSubView = 'orders'"
            class="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition border-b border-gray-100">
            <div class="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center text-lg shrink-0">📦</div>
            <div class="flex-1 text-left">
              <p class="text-sm font-semibold text-gray-900">My Orders</p>
              <p class="text-xs text-gray-400">{{ patientOrders.length }} order(s)</p>
            </div>
            <span class="text-gray-400 text-lg">›</span>
          </button>

          <!-- My Prescriptions row -->
          <button @click="showScanner = true"
            class="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition border-b border-gray-100">
            <div class="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-lg shrink-0">📷</div>
            <div class="flex-1 text-left">
              <p class="text-sm font-semibold text-gray-900">My Prescriptions</p>
              <p class="text-xs text-gray-400">Scan or upload a prescription</p>
            </div>
            <span class="text-gray-400 text-lg">›</span>
          </button>

          <!-- My Dosage Slips row -->
          <button @click="meSubView = 'dosage'"
            class="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition border-b border-gray-100">
            <div class="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-lg shrink-0">💊</div>
            <div class="flex-1 text-left">
              <p class="text-sm font-semibold text-gray-900">My Dosage Slips</p>
              <p class="text-xs text-gray-400">{{ dosageSlips.length }} slip(s)</p>
            </div>
            <span class="text-gray-400 text-lg">›</span>
          </button>

          <!-- PharmAI Chatbot row -->
          <button @click="showChat = true"
            class="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition border-b border-gray-100">
            <div class="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center text-lg shrink-0">🤖</div>
            <div class="flex-1 text-left">
              <p class="text-sm font-semibold text-gray-900">PharmAI Assistant</p>
              <p class="text-xs text-gray-400">Ask about medicines, dosage, side effects</p>
            </div>
            <span class="text-gray-400 text-lg">›</span>
          </button>

          <!-- Cart row -->
          <button @click="activeTab = 'cart'"
            class="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition border-b border-gray-100">
            <div class="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center text-lg shrink-0">🛒</div>
            <div class="flex-1 text-left">
              <p class="text-sm font-semibold text-gray-900">My Cart</p>
              <p class="text-xs text-gray-400">{{ patientCarts.length }} active cart(s) · {{ cartItemCount }} item(s)</p>
            </div>
            <span class="text-gray-400 text-lg">›</span>
          </button>

          <!-- Find Medicines row -->
          <button @click="activeTab = 'find'"
            class="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition">
            <div class="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center text-lg shrink-0">🔍</div>
            <div class="flex-1 text-left">
              <p class="text-sm font-semibold text-gray-900">Find Medicines</p>
              <p class="text-xs text-gray-400">Search across nearby pharmacies</p>
            </div>
            <span class="text-gray-400 text-lg">›</span>
          </button>
        </div>

        <!-- Logout button -->
        <button v-if="meSubView === 'list'" @click="logoutPatient()"
          class="w-full border-2 border-red-200 text-red-600 text-sm font-semibold py-3 rounded-2xl hover:bg-red-50 transition flex items-center justify-center gap-2 mb-6">
          <span>🚪</span> Logout
        </button>

        <!-- ── Orders sub-view ── -->
        <div v-if="meSubView === 'orders'">
          <button @click="meSubView = 'list'" class="flex items-center gap-1 text-green-700 text-sm font-medium mb-4 hover:text-green-800">← Back</button>
          <h2 class="text-lg font-bold text-gray-900 mb-3">My Orders</h2>
          <div v-if="patientOrders.length === 0" class="text-center py-14 text-gray-400">
            <div class="text-5xl mb-3">📦</div>
            <p class="text-sm font-medium">No orders yet</p>
            <p class="text-xs mt-1">Place an order from your cart to see it here.</p>
          </div>
          <div v-else class="space-y-3">
            <div v-for="order in patientOrders" :key="order.id"
              class="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
              <div class="flex items-start justify-between">
                <div>
                  <p class="font-bold text-gray-900 text-sm">{{ order.id }}</p>
                  <p class="text-xs text-gray-500 mt-0.5">{{ order.pharmacyName }}</p>
                  <p class="text-xs text-gray-400 mt-0.5">{{ order.items.length }} item(s) · ₹{{ order.items.reduce((s,i) => s + i.price * i.qty, 0).toFixed(0) }}</p>
                  <p class="text-xs text-gray-300 mt-0.5">{{ new Date(order.createdAt).toLocaleString('en-IN', {dateStyle:'medium', timeStyle:'short'}) }}</p>
                </div>
                <div class="text-right">
                  <span :class="['text-xs font-bold px-2 py-0.5 rounded-full', order.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700']">
                    {{ order.status === 'pending' ? '⏳ Pending' : '✓ Fulfilled' }}
                  </span>
                  <button @click="openOrderQR(order)" class="mt-2 block text-xs text-green-700 font-semibold underline hover:text-green-800 ml-auto">View QR →</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Dosage Slips sub-view ── -->
        <div v-if="meSubView === 'dosage'">
          <button @click="meSubView = 'list'" class="flex items-center gap-1 text-green-700 text-sm font-medium mb-4 hover:text-green-800">← Back</button>
          <h2 class="text-lg font-bold text-gray-900 mb-3">My Dosage Slips</h2>
          <div class="space-y-4">
            <div v-for="slip in dosageSlips" :key="slip.id"
              class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div class="bg-green-600 text-white px-4 py-3 flex items-center justify-between">
                <div>
                  <p class="font-bold">{{ slip.medicine }}</p>
                  <p class="text-xs opacity-80">By {{ slip.prescribedBy }} · {{ slip.date }}</p>
                </div>
                <span class="text-3xl">💊</span>
              </div>
              <div class="px-4 py-4 grid grid-cols-2 gap-3 text-sm">
                <div><p class="text-xs text-gray-400 font-medium uppercase">Dosage</p><p class="text-gray-800 font-semibold mt-0.5">{{ slip.dosage }}</p></div>
                <div><p class="text-xs text-gray-400 font-medium uppercase">Frequency</p><p class="text-gray-800 font-semibold mt-0.5">{{ slip.frequency }}</p></div>
                <div><p class="text-xs text-gray-400 font-medium uppercase">Timing</p><p class="text-gray-800 font-semibold mt-0.5">{{ slip.timing }}</p></div>
                <div><p class="text-xs text-gray-400 font-medium uppercase">Duration</p><p class="text-gray-800 font-semibold mt-0.5">{{ slip.duration }}</p></div>
              </div>
              <div class="bg-amber-50 border-t border-amber-200 px-4 py-3 flex gap-2">
                <span class="text-amber-500 text-lg shrink-0">⚠️</span>
                <p class="text-xs text-amber-800">{{ slip.warnings }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>


      <!-- ════ MOBILE BOTTOM NAVIGATION (hidden on desktop) ════ -->
      <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 no-print">
        <div class="grid grid-cols-5">
          <button v-for="tab in tabs" :key="tab.id" @click="handleTabClick(tab.id)"
            :class="['relative flex flex-col items-center py-2 gap-0.5 focus:outline-none transition', activeTab === tab.id && tab.id !== 'scanner' ? 'bottom-nav-active' : 'text-gray-500 hover:text-green-600']">
            <span class="text-xl leading-none">{{ tab.icon }}</span>
            <span class="text-[10px] font-medium">{{ tab.label }}</span>
            <span v-if="tab.id === 'cart' && cartItemCount > 0"
              class="absolute top-1 right-4 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {{ cartItemCount > 9 ? '9+' : cartItemCount }}
            </span>
          </button>
        </div>
      </nav>

      <!-- ════ FLOATING PHARMAI BUTTON (always visible when logged in) ════ -->
      <button
        v-if="patientUser"
        @click="showChat = !showChat"
        :class="['fixed z-40 flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold shadow-xl transition-all',
                 showChat ? 'bottom-20 md:bottom-[520px] right-4 rounded-full w-12 h-12 justify-center text-xl' : 'bottom-20 md:bottom-4 right-4 rounded-full px-4 py-2.5 text-sm']"
        :title="showChat ? 'Close PharmAI' : 'Open PharmAI Chatbot'"
      >
        <span :class="showChat ? 'text-xl' : ''">🤖</span>
        <span v-if="!showChat" class="hidden sm:inline">PharmAI</span>
      </button>

      <!-- Scanner modal -->
      <ScannerModal v-model:show="showScanner" title="Scan Your Prescription" mode="patient" />
    </div>
  `,
});
