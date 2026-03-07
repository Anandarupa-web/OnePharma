/**
 * StaffPos.js – Staff POS / Cashier view (complete rewrite)
 * Two-column desktop layout; single-column + floating checkout bar on mobile.
 * All state persisted to localStorage via helpers from app.js.
 */
import { defineComponent, ref, computed, reactive, watch, nextTick } from 'vue';
import ScannerModal from '../components/ScannerModal.js';
import {
  getInventory, saveInventory,
  getPatients,  savePatients,
  getDoctors,   saveDoctors,
  getMedicineRequests, saveMedicineRequests,
  getOrders,    saveOrders,
  getDosageSlips, saveDosageSlips,
} from '../app.js';

export default defineComponent({
  name: 'StaffPos',
  components: { ScannerModal },

  setup() {
    // ── Inventory & patients ─────────────────────────────────────────────────
    const inventory = ref(getInventory());
    const patients  = ref(getPatients());

    // ── Patient ──────────────────────────────────────────────────────────────
    const patientQuery    = ref('');
    const showPatientDrop = ref(false);
    const selectedPatient = ref(null);
    const newPatName      = ref('');
    const newPatPhone     = ref('');

    const patientResults = computed(() => {
      if (patientQuery.value.length < 2) return [];
      const q = patientQuery.value.toLowerCase();
      return patients.value
        .filter(p => p.name?.toLowerCase().includes(q) || p.phone?.includes(q))
        .slice(0, 5);
    });

    function selectPatient(p) {
      selectedPatient.value = p; patientQuery.value = ''; showPatientDrop.value = false;
    }
    function clearPatient() {
      selectedPatient.value = null; newPatName.value = ''; newPatPhone.value = '';
    }
    // Blur guard: close dropdown after a short tick so @mousedown.prevent on items fires first.
    let _patBlurTimer = null;
    function onPatBlur() { _patBlurTimer = setTimeout(() => { showPatientDrop.value = false; }, 150); }
    function cancelPatBlur() { clearTimeout(_patBlurTimer); }

    function patientInitials(name) {
      return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    }

    // Discount type definitions (extracted from template for clarity).
    const DISCOUNT_TYPES = [
      { k: 'percentage', l: 'Percentage' },
      { k: 'flat',       l: 'Flat Amount' },
      { k: 'roundoff',   l: 'Round Off' },
    ];

    // ── Doctor ───────────────────────────────────────────────────────────────
    const doctorName = ref('');
    const rxNotes    = ref('');

    // ── Medicine search ──────────────────────────────────────────────────────
    const medQuery = ref('');
    const catFilter = ref('');
    const medResults = computed(() => {
      const q = medQuery.value.toLowerCase();
      let list = inventory.value;
      if (catFilter.value) list = list.filter(m => m.category === catFilter.value);
      if (q.length >= 2) list = list.filter(m =>
        m.name?.toLowerCase().includes(q) || m.brand?.toLowerCase().includes(q) || m.generic?.toLowerCase().includes(q));
      // Show results when a category is active even if query is short; hide only when both are empty
      if (!catFilter.value && q.length < 2) return [];
      return list.slice(0, 8);
    });

    const popularMeds = computed(() =>
      [...inventory.value].sort((a, b) => (b.unitsSold || 0) - (a.unitsSold || 0)).slice(0, 6)
    );
    const medCategories = computed(() => [...new Set(inventory.value.map(m => m.category).filter(Boolean))]);

    // ── Multiple Carts ────────────────────────────────────────────────────────
    const MAX_CARTS = 10;
    const carts = ref([[]]);
    const activeCartIdx = ref(0);
    const cart = computed(() => carts.value[activeCartIdx.value]);

    const addCart = () => {
      if (carts.value.length >= MAX_CARTS) return;
      carts.value.push([]);
      activeCartIdx.value = carts.value.length - 1;
      clearPatient();
    };
    const removeCart = (idx) => {
      if (carts.value.length <= 1) return;
      carts.value.splice(idx, 1);
      activeCartIdx.value = Math.min(activeCartIdx.value, carts.value.length - 1);
    };

    function addToCart(med) {
      if (med.stock <= 0) return;
      const activeCart = carts.value[activeCartIdx.value];
      const ex = activeCart.find(i => i.medId === med.id);
      if (ex) { if (ex.qty < med.stock) ex.qty++; return; }
      activeCart.push({
        id: Date.now() + Math.random(), medId: med.id,
        name: med.name, price: med.price, gst: med.gst || 0,
        stock: med.stock, qty: 1, showDosage: false,
        dosage: { dose: '', freq: '', timing: '', duration: '', notes: '' },
      });
      medQuery.value = '';
      checkAlts(med);
    }
    function removeItem(id) { carts.value[activeCartIdx.value] = carts.value[activeCartIdx.value].filter(i => i.id !== id); alternatives.value = []; }
    function setQty(item, d) { item.qty = Math.max(1, Math.min(item.stock, item.qty + d)); }

    // ── Generic alternatives ─────────────────────────────────────────────────
    const alternatives = ref([]);
    const altTargetId  = ref(null);
    function checkAlts(med) {
      if (!med.ingredient) { alternatives.value = []; return; }
      altTargetId.value = cart.value[cart.value.length - 1]?.id ?? null;
      alternatives.value = inventory.value
        .filter(m => m.ingredient === med.ingredient && m.id !== med.id && m.stock > 0)
        .slice(0, 4);
    }
    function substituteItem(alt) {
      const idx = cart.value.findIndex(i => i.id === altTargetId.value);
      if (idx < 0) return;
      cart.value[idx] = { ...cart.value[idx], medId: alt.id, name: alt.name, price: alt.price, gst: alt.gst || 0, stock: alt.stock };
      alternatives.value = [];
    }

    // ── Discount & totals ────────────────────────────────────────────────────
    const discountType = ref('percentage');  // 'percentage' | 'flat' | 'roundoff'
    const discountPct  = ref(0);
    const flatFinal    = ref(0);
    const adjustGst    = ref(false);

    const subtotal   = computed(() => cart.value.reduce((s, i) => s + i.price * i.qty, 0));
    const rawGst     = computed(() => cart.value.reduce((s, i) => s + i.price * i.qty * (i.gst / 100), 0));
    const grossTotal = computed(() => +(subtotal.value + rawGst.value).toFixed(2));

    const discountAmount = computed(() => {
      if (!cart.value.length) return 0;
      if (discountType.value === 'percentage')
        return +(grossTotal.value * discountPct.value / 100).toFixed(2);
      return +Math.max(0, grossTotal.value - flatFinal.value).toFixed(2);
    });
    const gstAmount = computed(() => {
      if (adjustGst.value && discountAmount.value > 0 && grossTotal.value > 0)
        return +(rawGst.value * (1 - discountAmount.value / grossTotal.value)).toFixed(2);
      return +rawGst.value.toFixed(2);
    });
    const finalTotal = computed(() => +(grossTotal.value - discountAmount.value).toFixed(2));

    /** Discount as percentage of gross total, for display. */
    const discountPctDisplay = computed(() =>
      grossTotal.value > 0 ? (discountAmount.value / grossTotal.value * 100).toFixed(1) : '0'
    );

    watch(discountType, () => { discountPct.value = 0; flatFinal.value = grossTotal.value; });
    watch(grossTotal, v => {
      if (discountType.value !== 'percentage') flatFinal.value = +v.toFixed(2);
    });
    function setRoundOff(unit) { flatFinal.value = Math.floor(grossTotal.value / unit) * unit; }

    // ── Add New Medicine modal ───────────────────────────────────────────────
    const showAddMed = ref(false);
    const aiLoading  = ref(false);
    const addMedMsg  = ref('');
    const newMed = reactive({ name: '', brand: '', generic: '', category: '', price: '', gst: 5, images: [] });

    function aiIdentify() {
      // TODO(Phase 2): Replace with a real AI/OCR API call (e.g., Google Vision or a Flask endpoint)
      // that analyses packaging images and returns structured medicine details.
      aiLoading.value = true;
      setTimeout(() => {
        Object.assign(newMed, { brand: 'AutoBrand', generic: 'Paracetamol', category: 'Analgesic', price: 22, gst: 5 });
        aiLoading.value = false;
      }, 1500);
    }
    function handleMedImages(e) {
      // Revoke previous object URLs to prevent memory leaks before creating new ones.
      (newMed.images || []).forEach(u => URL.revokeObjectURL(u));
      newMed.images = Array.from(e.target.files || []).slice(0, 4).map(f => URL.createObjectURL(f));
    }
    function clearNewMedImages() {
      (newMed.images || []).forEach(u => URL.revokeObjectURL(u));
      newMed.images = [];
    }
    function saveNewMedicine() {
      if (!newMed.name.trim()) return;
      const inv = getInventory();
      const entry = {
        id: Date.now(), name: newMed.name.trim(), brand: newMed.brand, generic: newMed.generic,
        ingredient: newMed.generic, category: newMed.category,
        price: +newMed.price || 0, gst: +newMed.gst || 0,
        stock: 0, minStock: 10, expiry: '', supplier: 'Local',
      };
      inv.push(entry); saveInventory(inv); inventory.value = inv;
      const reqs = getMedicineRequests();
      reqs.push({ ...entry, status: 'pending', requestedAt: new Date().toISOString() });
      saveMedicineRequests(reqs);
      addMedMsg.value = 'Medicine added locally. Request sent to admin for master DB inclusion.';
      clearNewMedImages();
      Object.assign(newMed, { name: '', brand: '', generic: '', category: '', price: '', gst: 5 });
      setTimeout(() => { addMedMsg.value = ''; showAddMed.value = false; }, 2800);
    }
    function closeAddMed() { clearNewMedImages(); showAddMed.value = false; addMedMsg.value = ''; }

    // ── Checkout ─────────────────────────────────────────────────────────────
    const showCheckout  = ref(false);
    const checkoutDone  = ref(false);
    const invoiceNumber = ref('');

    function openCheckout() { if (!cart.value.length) return; showCheckout.value = true; checkoutDone.value = false; }

    function confirmCheckout() {
      const inv = getInventory();
      cart.value.forEach(item => {
        const m = inv.find(m => m.id === item.medId);
        if (m) m.stock = Math.max(0, m.stock - item.qty);
      });
      saveInventory(inv); inventory.value = inv;

      let patient = selectedPatient.value;
      if (!patient && newPatName.value.trim()) {
        const pts = getPatients();
        patient = { id: Date.now(), name: newPatName.value.trim(), phone: newPatPhone.value };
        pts.push(patient); savePatients(pts); patients.value = pts; selectedPatient.value = patient;
      }

      invoiceNumber.value = 'INV-' + Date.now().toString().slice(-6);
      const orders = getOrders();
      orders.unshift({
        id: invoiceNumber.value,
        patientName: patient?.name || 'Walk-in', patientPhone: patient?.phone || '',
        doctorName: doctorName.value, rxNotes: rxNotes.value,
        items: cart.value.map(i => ({ medId: i.medId, name: i.name, qty: i.qty, price: i.price, gst: i.gst })),
        subtotal: subtotal.value, gstAmount: gstAmount.value,
        discountAmount: discountAmount.value, finalTotal: finalTotal.value,
        createdAt: new Date().toISOString(), status: 'completed',
      });
      saveOrders(orders);

      const slips = getDosageSlips();
      cart.value.forEach(item => {
        if (item.dosage.dose || item.dosage.freq || item.dosage.notes) {
          slips.unshift({
            id: Date.now() + Math.random(), orderId: invoiceNumber.value,
            patientName: patient?.name || 'Walk-in', medicineName: item.name,
            ...item.dosage, createdAt: new Date().toISOString(),
          });
        }
      });
      saveDosageSlips(slips);
      checkoutDone.value = true;
    }

    function newTransaction() {
      carts.value[activeCartIdx.value] = []; alternatives.value = []; selectedPatient.value = null;
      newPatName.value = ''; newPatPhone.value = ''; doctorName.value = ''; rxNotes.value = '';
      discountType.value = 'percentage'; discountPct.value = 0; flatFinal.value = 0;
      adjustGst.value = false; showCheckout.value = false; checkoutDone.value = false;
    }

    // ── Scanner ───────────────────────────────────────────────────────────────
    const showScanner = ref(false);
    function onOcrDone(drugs) {
      drugs.forEach(name => {
        const m = inventory.value.find(m => m.name.toLowerCase().includes(name.toLowerCase()));
        if (m && m.stock > 0) addToCart(m);
      });
      showScanner.value = false;
    }

    return {
      inventory, patients,
      patientQuery, showPatientDrop, selectedPatient, newPatName, newPatPhone,
      patientResults, selectPatient, clearPatient, onPatBlur, cancelPatBlur, patientInitials,
      doctorName, rxNotes,
      medQuery, medResults, catFilter, popularMeds, medCategories, addToCart,
      carts, activeCartIdx, cart, MAX_CARTS, addCart, removeCart, removeItem, setQty,
      alternatives, substituteItem,
      discountType, discountPct, flatFinal, adjustGst, setRoundOff, DISCOUNT_TYPES,
      subtotal, rawGst, gstAmount, grossTotal, discountAmount, finalTotal, discountPctDisplay,
      showAddMed, aiLoading, addMedMsg, newMed, aiIdentify, handleMedImages, saveNewMedicine, closeAddMed,
      showCheckout, checkoutDone, invoiceNumber, openCheckout, confirmCheckout, newTransaction,
      showScanner, onOcrDone,
    };
  },

  template: `
<div class="min-h-screen bg-gray-50 pb-24 md:pb-4">

  <!-- ── Two-column layout ──────────────────────────────────────────────── -->
  <div class="max-w-7xl mx-auto p-4 flex flex-col md:flex-row gap-4 items-start">

    <!-- ══ LEFT PANEL ══════════════════════════════════════════════════════ -->
    <div class="w-full md:flex-1 space-y-4">

      <!-- Patient Info Card -->
      <div class="bg-white rounded-2xl p-4 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><span>👤</span> Patient</h2>
        <div v-if="selectedPatient" class="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
          <span class="w-8 h-8 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
            {{ patientInitials(selectedPatient.name) }}
          </span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-gray-800 truncate">{{ selectedPatient.name }}</p>
            <p class="text-xs text-gray-500">{{ selectedPatient.phone }}</p>
          </div>
          <button @click="clearPatient" class="text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
        </div>
        <div v-else class="space-y-2">
          <div class="relative">
            <input v-model="patientQuery" @focus="showPatientDrop=true" @blur="onPatBlur"
              placeholder="Search patient by name or phone…"
              class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            <div v-if="showPatientDrop && patientResults.length"
              @mousedown="cancelPatBlur"
              class="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-20 mt-1 overflow-hidden">
              <button v-for="p in patientResults" :key="p.id" @mousedown.prevent="selectPatient(p)"
                class="w-full text-left px-3 py-2 hover:bg-green-50 text-sm border-b last:border-0">
                <span class="font-medium">{{ p.name }}</span>
                <span class="text-gray-400 ml-2 text-xs">{{ p.phone }}</span>
              </button>
            </div>
            <div v-if="showPatientDrop && patientQuery.length>=2 && !patientResults.length"
              class="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-20 mt-1 px-3 py-2 text-sm text-gray-500">
              No match — fill below to add new patient
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <input v-model="newPatName" placeholder="Patient name"
              class="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            <input v-model="newPatPhone" placeholder="Phone"
              class="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>
        </div>
      </div>

      <!-- Doctor Info -->
      <div class="bg-white rounded-2xl p-4 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><span>🩺</span> Doctor / Prescription</h2>
        <input v-model="doctorName" placeholder="Doctor name (optional)"
          class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-green-400" />
        <textarea v-model="rxNotes" placeholder="Diagnosis / prescription notes (optional)" rows="2"
          class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400"></textarea>
      </div>

      <!-- Medicine Search -->
      <div class="bg-white rounded-2xl p-4 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-gray-700 flex items-center gap-2"><span>🔍</span> Medicine Search</h2>
          <button @click="showAddMed=true"
            class="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition font-medium">
            + Add New Medicine
          </button>
        </div>
        <!-- Popular Medicines (quick pick) -->
        <div class="mb-3">
          <p class="text-xs font-semibold text-gray-500 mb-2">⚡ Popular</p>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="m in popularMeds" :key="m.id" @click="addToCart(m)"
              :class="['text-xs px-2 py-1 rounded-lg border transition font-medium',
                m.stock>0 ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed']"
              :disabled="m.stock<=0"
              :title="m.name + ' · ₹' + m.price">
              {{ m.name.split(' ')[0] }}
            </button>
          </div>
        </div>
        <!-- Category chips -->
        <div class="mb-3">
          <p class="text-xs font-semibold text-gray-500 mb-2">📂 Categories</p>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="cat in medCategories" :key="cat"
              @click="catFilter=cat; medQuery=cat"
              :class="['text-xs px-2.5 py-1 rounded-lg border transition font-medium',
                catFilter===cat ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300']">
              {{ cat }}
            </button>
            <button v-if="catFilter" @click="catFilter=''; medQuery=''"
              class="text-xs px-2 py-1 rounded-lg text-red-500 hover:bg-red-50 border border-red-200">✕</button>
          </div>
        </div>
        <!-- Scan Rx button -->
        <div class="flex items-center gap-2 mb-3">
          <button @click="showScanner=true"
            class="flex items-center gap-1 text-sm bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg transition">
            <span>📷</span> Scan Rx
          </button>
        </div>
        <input v-model="medQuery" placeholder="Type medicine name, brand or generic (min 2 chars)…"
          class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 mb-2" />
        <div v-if="medResults.length" class="space-y-1 max-h-64 overflow-y-auto">
          <div v-for="m in medResults" :key="m.id"
            class="flex items-center justify-between rounded-xl px-3 py-2 text-sm transition"
            :class="m.stock>0 ? 'hover:bg-green-50 cursor-pointer' : 'opacity-50 bg-gray-50'">
            <div @click="addToCart(m)" class="flex-1 min-w-0">
              <p class="font-medium text-gray-800 truncate">{{ m.name }}</p>
              <p class="text-xs text-gray-500">{{ m.brand }} · {{ m.generic }}</p>
            </div>
            <div class="flex items-center gap-3 ml-3 flex-shrink-0">
              <span class="text-xs" :class="m.stock>0?'text-green-600':'text-red-500 font-semibold'">
                {{ m.stock>0 ? 'Stock: '+m.stock : 'Out of stock' }}
              </span>
              <span class="text-sm font-semibold text-gray-700">₹{{ m.price }}</span>
              <button v-if="m.stock>0" @click="addToCart(m)"
                class="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 rounded-lg transition">Add</button>
            </div>
          </div>
        </div>
        <p v-else-if="medQuery.length>=2 || catFilter" class="text-sm text-gray-400 text-center py-3">No medicines found.</p>
      </div>

      <!-- Generic Alternatives -->
      <div v-if="alternatives.length" class="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
        <h2 class="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2"><span>🔄</span> Generic Alternatives</h2>
        <div class="space-y-2">
          <div v-for="alt in alternatives" :key="alt.id"
            class="flex items-center justify-between bg-white rounded-xl px-3 py-2 shadow-xs">
            <div>
              <p class="text-sm font-medium text-gray-800">{{ alt.name }}</p>
              <p class="text-xs text-gray-500">{{ alt.brand }} · ₹{{ alt.price }} · Stock: {{ alt.stock }}</p>
            </div>
            <button @click="substituteItem(alt)"
              class="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg transition">Substitute</button>
          </div>
        </div>
      </div>

    </div><!-- /LEFT PANEL -->

    <!-- ══ RIGHT PANEL ═════════════════════════════════════════════════════ -->
    <div class="w-full md:w-96 space-y-4">

      <!-- Cart switcher -->
      <div class="bg-white rounded-2xl p-3 shadow-sm">
        <div class="flex items-center gap-2 flex-wrap">
          <button v-for="(c, i) in carts" :key="i"
            @click="activeCartIdx = i; clearPatient()"
            :class="['text-xs px-3 py-1.5 rounded-lg font-medium border transition',
              activeCartIdx===i ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400']">
            Cart {{ i+1 }}{{ c.length ? ' ('+c.length+')' : '' }}
          </button>
          <button v-if="carts.length < MAX_CARTS" @click="addCart"
            class="text-xs px-2.5 py-1.5 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-green-400 hover:text-green-600 transition">
            + New Cart
          </button>
          <button v-if="carts.length > 1" @click="removeCart(activeCartIdx)"
            class="text-xs px-2 py-1.5 rounded-lg text-red-400 hover:bg-red-50 border border-red-200 ml-auto">
            Remove Cart
          </button>
        </div>
      </div>

      <!-- Cart Items -->
      <div class="bg-white rounded-2xl p-4 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><span>🛒</span> Cart
          <span v-if="cart.length" class="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{{ cart.length }} item{{ cart.length>1?'s':'' }}</span>
        </h2>
        <div v-if="!cart.length" class="text-center py-8 text-gray-400 text-sm">
          <div class="text-3xl mb-2">🛒</div>Search and add medicines above
        </div>
        <div v-else class="space-y-3 max-h-96 overflow-y-auto pr-1">
          <div v-for="item in cart" :key="item.id" class="bg-gray-50 rounded-xl p-3">
            <div class="flex items-start justify-between gap-2">
              <p class="text-sm font-medium text-gray-800 flex-1 min-w-0 leading-tight">{{ item.name }}</p>
              <button @click="removeItem(item.id)" class="text-gray-300 hover:text-red-500 text-xl leading-none flex-shrink-0 mt-0.5">×</button>
            </div>
            <div class="flex items-center justify-between mt-2">
              <div class="flex items-center gap-1">
                <button @click="setQty(item,-1)" class="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 text-sm font-bold flex items-center justify-center">−</button>
                <span class="w-7 text-center text-sm font-semibold">{{ item.qty }}</span>
                <button @click="setQty(item,1)" class="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 text-sm font-bold flex items-center justify-center">+</button>
              </div>
              <div class="text-right">
                <p class="text-sm font-semibold text-gray-800">₹{{ (item.price * item.qty).toFixed(2) }}</p>
                <p class="text-xs text-gray-400">₹{{ item.price }} each</p>
              </div>
            </div>
            <!-- Dosage editor -->
            <button @click="item.showDosage=!item.showDosage"
              class="mt-2 text-xs text-green-600 hover:text-green-800 flex items-center gap-1 font-medium">
              <span>📋 Dosage Info</span>
              <span class="text-xs">{{ item.showDosage ? '▲' : '▼' }}</span>
            </button>
            <div v-if="item.showDosage" class="mt-2 grid grid-cols-2 gap-1.5">
              <input v-model="item.dosage.dose" placeholder="Dose (e.g. 1 tablet)"
                class="col-span-2 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
              <input v-model="item.dosage.freq" placeholder="Frequency"
                class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
              <input v-model="item.dosage.timing" placeholder="Timing (before/after food)"
                class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
              <input v-model="item.dosage.duration" placeholder="Duration (e.g. 5 days)"
                class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
              <input v-model="item.dosage.notes" placeholder="Notes"
                class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
            </div>
          </div>
        </div>
      </div>

      <!-- Discount Section -->
      <div v-if="cart.length" class="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <h2 class="text-sm font-semibold text-gray-700 flex items-center gap-2"><span>🏷️</span> Discount</h2>
        <!-- Type toggle -->
        <div class="flex rounded-xl overflow-hidden border border-gray-200 text-xs font-medium">
          <button v-for="t in DISCOUNT_TYPES" :key="t.k"
            @click="discountType=t.k"
            class="flex-1 py-2 transition"
            :class="discountType===t.k ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'">
            {{ t.l }}
          </button>
        </div>
        <!-- Percentage mode -->
        <div v-if="discountType==='percentage'" class="space-y-2">
          <input type="range" v-model.number="discountPct" min="0" max="50" step="5"
            class="w-full accent-green-600" />
          <div class="flex items-center gap-2">
            <input type="number" v-model.number="discountPct" min="0" max="50"
              class="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400" />
            <span class="text-sm text-gray-600">% off</span>
            <span class="ml-auto text-sm font-semibold text-red-500">−₹{{ discountAmount.toFixed(2) }}</span>
          </div>
        </div>
        <!-- Flat Amount mode -->
        <div v-if="discountType==='flat'" class="space-y-2">
          <label class="text-xs text-gray-500">Customer pays (₹)</label>
          <div class="flex items-center gap-2">
            <input type="number" v-model.number="flatFinal" :max="grossTotal" min="0"
              class="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            <span class="text-xs text-gray-500">of ₹{{ grossTotal.toFixed(2) }}</span>
          </div>
          <p class="text-xs text-green-600">Discount: ₹{{ discountAmount.toFixed(2) }}
            ({{ discountPctDisplay }}%)</p>
        </div>
        <!-- Round Off mode -->
        <div v-if="discountType==='roundoff'" class="space-y-2">
          <div class="flex gap-2">
            <button @click="setRoundOff(1)"  class="flex-1 border border-gray-200 rounded-lg py-2 text-xs hover:bg-green-50 hover:border-green-400 transition">Round to ₹1</button>
            <button @click="setRoundOff(10)" class="flex-1 border border-gray-200 rounded-lg py-2 text-xs hover:bg-green-50 hover:border-green-400 transition">Round to ₹10</button>
            <button @click="setRoundOff(100)" class="flex-1 border border-gray-200 rounded-lg py-2 text-xs hover:bg-green-50 hover:border-green-400 transition">Round to ₹100</button>
          </div>
          <p class="text-xs text-green-600">Final: ₹{{ flatFinal.toFixed(2) }} · Discount: ₹{{ discountAmount.toFixed(2) }}</p>
        </div>
        <!-- Adjust GST -->
        <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
          <input type="checkbox" v-model="adjustGst" class="accent-green-600 w-4 h-4" />
          Adjust GST on discounted amount
        </label>
      </div>

      <!-- Totals -->
      <div v-if="cart.length" class="bg-white rounded-2xl p-4 shadow-sm space-y-1.5">
        <h2 class="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><span>🧾</span> Totals</h2>
        <div class="flex justify-between text-sm text-gray-600"><span>Subtotal (pre-GST)</span><span>₹{{ subtotal.toFixed(2) }}</span></div>
        <div class="flex justify-between text-sm text-gray-600"><span>GST</span><span>₹{{ gstAmount.toFixed(2) }}</span></div>
        <div v-if="discountAmount>0" class="flex justify-between text-sm text-red-500 font-medium"><span>Discount</span><span>−₹{{ discountAmount.toFixed(2) }}</span></div>
        <div class="border-t border-gray-100 pt-2 flex justify-between text-base font-bold text-green-700">
          <span>Total</span><span>₹{{ finalTotal.toFixed(2) }}</span>
        </div>
        <button @click="openCheckout"
          class="w-full mt-3 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition text-sm">
          Proceed to Checkout →
        </button>
      </div>

    </div><!-- /RIGHT PANEL -->
  </div>

  <!-- ── Mobile floating checkout bar ─────────────────────────────────── -->
  <div v-if="cart.length" class="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-4 py-3 flex items-center gap-3 z-20">
    <div class="flex-1">
      <p class="text-xs text-gray-500">{{ cart.length }} item{{ cart.length>1?'s':'' }} · <span v-if="discountAmount>0" class="text-red-500">−₹{{ discountAmount.toFixed(2) }}</span></p>
      <p class="text-lg font-bold text-green-700">₹{{ finalTotal.toFixed(2) }}</p>
    </div>
    <button @click="openCheckout" class="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition">
      Checkout
    </button>
  </div>

  <!-- ══ Add New Medicine Modal ═══════════════════════════════════════════ -->
  <div v-if="showAddMed" class="fixed inset-0 bg-black/50 flex items-center justify-center z-30 p-4">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-screen overflow-y-auto p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-gray-800 text-base">➕ Add New Medicine</h3>
        <button @click="closeAddMed" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
      </div>
      <div class="space-y-3">
        <input v-model="newMed.name" placeholder="Medicine name *"
          class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
        <div class="grid grid-cols-2 gap-2">
          <input v-model="newMed.brand" placeholder="Brand name"
            class="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          <input v-model="newMed.generic" placeholder="Generic / ingredient"
            class="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          <input v-model="newMed.category" placeholder="Category"
            class="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          <input v-model.number="newMed.price" type="number" placeholder="Price (₹)"
            class="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          <input v-model.number="newMed.gst" type="number" placeholder="GST %"
            class="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
        </div>
        <!-- Image upload -->
        <div>
          <label class="text-xs text-gray-500 mb-1 block">Packaging images (up to 4)</label>
          <input type="file" accept="image/*" multiple @change="handleMedImages"
            class="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
          <div v-if="newMed.images.length" class="flex gap-2 mt-2 flex-wrap">
            <img v-for="(src,i) in newMed.images" :key="i" :src="src"
              class="w-16 h-16 object-cover rounded-lg border border-gray-200" />
          </div>
        </div>
        <!-- AI Identify -->
        <button @click="aiIdentify" :disabled="aiLoading"
          class="w-full flex items-center justify-center gap-2 border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-sm py-2 rounded-xl transition font-medium disabled:opacity-60">
          <span v-if="aiLoading" class="animate-spin">⏳</span>
          <span v-else>🤖</span>
          {{ aiLoading ? 'AI identifying…' : 'AI Identify' }}
        </button>
        <div v-if="addMedMsg" class="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-3 py-2">
          ✅ {{ addMedMsg }}
        </div>
        <button @click="saveNewMedicine" :disabled="!newMed.name.trim()"
          class="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50">
          Save Medicine
        </button>
      </div>
    </div>
  </div>

  <!-- ══ Checkout Modal ════════════════════════════════════════════════════ -->
  <div v-if="showCheckout" class="fixed inset-0 bg-black/50 flex items-center justify-center z-30 p-4">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-screen overflow-y-auto p-5">
      <div v-if="!checkoutDone">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-gray-800 text-base">🧾 Confirm Order</h3>
          <button @click="showCheckout=false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div class="space-y-1 text-sm text-gray-600 mb-4">
          <p><span class="font-medium">Patient:</span> {{ selectedPatient?.name || newPatName || 'Walk-in' }}</p>
          <p v-if="doctorName"><span class="font-medium">Doctor:</span> {{ doctorName }}</p>
        </div>
        <!-- Order items -->
        <div class="bg-gray-50 rounded-xl p-3 mb-4 space-y-1.5">
          <div v-for="item in cart" :key="item.id" class="flex justify-between text-sm">
            <span class="text-gray-700">{{ item.name }} × {{ item.qty }}</span>
            <span class="font-medium text-gray-800">₹{{ (item.price*item.qty).toFixed(2) }}</span>
          </div>
        </div>
        <!-- Dosage slips notice -->
        <div v-if="cart.some(i=>i.dosage.dose||i.dosage.freq)" class="bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-xl px-3 py-2 mb-3">
          📋 Dosage slips will be created for items with dosage info.
        </div>
        <!-- Totals breakdown -->
        <div class="space-y-1 text-sm mb-4">
          <div class="flex justify-between text-gray-600"><span>Subtotal</span><span>₹{{ subtotal.toFixed(2) }}</span></div>
          <div class="flex justify-between text-gray-600"><span>GST</span><span>₹{{ gstAmount.toFixed(2) }}</span></div>
          <div v-if="discountAmount>0" class="flex justify-between text-red-500 font-medium">
            <span>Discount ({{ discountType==='percentage'?discountPct+'%':'flat' }})</span>
            <span>−₹{{ discountAmount.toFixed(2) }}</span>
          </div>
          <div class="flex justify-between text-base font-bold text-green-700 border-t border-gray-100 pt-2">
            <span>Final Total</span><span>₹{{ finalTotal.toFixed(2) }}</span>
          </div>
        </div>
        <button @click="confirmCheckout"
          class="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition">
          ✅ Confirm &amp; Print Invoice
        </button>
      </div>
      <!-- Success state -->
      <div v-else class="text-center py-6 space-y-4">
        <div class="text-5xl">🎉</div>
        <h3 class="font-bold text-gray-800 text-lg">Order Confirmed!</h3>
        <p class="text-green-600 font-semibold text-base">{{ invoiceNumber }}</p>
        <p class="text-gray-500 text-sm">Total collected: <strong class="text-gray-800">₹{{ finalTotal.toFixed(2) }}</strong></p>
        <button @click="newTransaction"
          class="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition">
          + New Transaction
        </button>
      </div>
    </div>
  </div>

  <!-- ══ Scanner Modal ════════════════════════════════════════════════════ -->
  <ScannerModal v-if="showScanner" :show="showScanner" mode="staff" title="Scan Prescription"
    @update:show="showScanner=$event" @ocr-done="onOcrDone" />

</div>`,
});
