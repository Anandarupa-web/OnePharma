/**
 * AdminDashboard.js – OnePharma App-Level Admin Dashboard
 *
 * This is the SUPREME ADMIN dashboard for the OnePharma platform developers.
 * NOT for pharmacy owners (use PharmacyDashboard) or staff (use StaffPos).
 *
 * Layout: CSS Grid dashboard with a persistent left-hand navigation sidebar.
 *
 * Panels:
 *  1. Overview      – Global KPIs: total pharmacies, total orders, pending med-requests
 *  2. Pharmacies    – Full CRUD for registered pharmacy network
 *  3. Master Meds   – Master medicine catalogue view
 *  4. Med Requests  – Approve / reject new-medicine submissions from pharmacies
 *  5. Doctors DB    – Master doctors database CRUD
 */
import { defineComponent, ref, computed, onMounted, watch, nextTick, reactive } from 'vue';
import StockAlertCard from '../components/StockAlertCard.js';
import { getInventory, getStaff, roleBadgeClass, getPharmacies, savePharmacies, getMedicineRequests, saveMedicineRequests, getDoctors, saveDoctors, getOrders } from '../app.js';

export default defineComponent({
  name: 'AdminDashboard',

  components: { StockAlertCard },

  setup() {
    // ── State ──────────────────────────────────────────────────────────────
    const activePanel = ref('overview');
    const inventory   = ref(getInventory());  // master medicine catalogue

    // ── Navigation items ───────────────────────────────────────────────────
    const navItems = [
      { id: 'overview',     icon: '🌐', label: 'Overview'     },
      { id: 'pharmacies',   icon: '🏪', label: 'Pharmacies'   },
      { id: 'master_meds',  icon: '💊', label: 'Master Meds'  },
      { id: 'med_requests', icon: '🆕', label: 'Requests'     },
      { id: 'doctors',      icon: '🩺', label: 'Doctors'      },
    ];

    // ── Global KPIs (app-level) ──────────────────────────────────────────
    const allOrders = ref(getOrders());
    const allStaff  = ref(getStaff());

    const totalPharmacies = computed(() => pharmacyList.value.length);
    const totalPending    = computed(() => allOrders.value.filter(o => o.status === 'pending').length);
    const totalStaff      = computed(() => allStaff.value.filter(s => s.role !== 'app_admin').length);
    const totalItems      = computed(() => inventory.value.length);


    // ── Pharmacies management ──────────────────────────────────────────────────
    const pharmacyList   = ref(getPharmacies());
    const showAddPharmacy = ref(false);
    const editingPharmacy = ref(null);
    const confirmRemovePharmacyId = ref(null);
    const blankPharmacy = () => ({ name: '', address: '', phone: '', hours: '', rating: 4.0, open: true, distance: '', lat: '', lng: '' });
    const pharmacyForm = reactive(blankPharmacy());

    const openAddPharmacy = () => { Object.assign(pharmacyForm, blankPharmacy()); editingPharmacy.value = null; showAddPharmacy.value = true; };
    const openEditPharmacy = (ph) => { Object.assign(pharmacyForm, { ...ph }); editingPharmacy.value = ph.id; showAddPharmacy.value = true; };
    const savePharmacyEntry = () => {
      if (!pharmacyForm.name.trim()) return;
      const ls = JSON.parse(localStorage.getItem('op_pharmacies') || '[]');
      if (editingPharmacy.value === null) {
        const newId = Math.max(0, ...ls.map(p => p.id)) + 1;
        ls.push({ ...pharmacyForm, id: newId, totalRatings: 0 });
      } else {
        const idx = ls.findIndex(p => p.id === editingPharmacy.value);
        if (idx !== -1) Object.assign(ls[idx], pharmacyForm);
      }
      localStorage.setItem('op_pharmacies', JSON.stringify(ls));
      pharmacyList.value = ls;
      showAddPharmacy.value = false;
    };
    const removePharmacy = (id) => { confirmRemovePharmacyId.value = id; };
    const confirmRemovePharmacy = () => {
      const ls = JSON.parse(localStorage.getItem('op_pharmacies') || '[]').filter(p => p.id !== confirmRemovePharmacyId.value);
      localStorage.setItem('op_pharmacies', JSON.stringify(ls));
      pharmacyList.value = ls; confirmRemovePharmacyId.value = null;
    };

    // ── Doctors management ─────────────────────────────────────────────────────
    const doctorList   = ref(getDoctors());
    const showAddDoctor = ref(false);
    const editingDoctor = ref(null);
    const confirmRemoveDoctorId = ref(null);
    const blankDoctor = () => ({ name: '', specialty: '', phone: '', clinic: '', active: true, pharmacyId: null, lat: '', lng: '', email: '' });
    const doctorForm = reactive(blankDoctor());

    const openAddDoctor = () => { Object.assign(doctorForm, blankDoctor()); editingDoctor.value = null; showAddDoctor.value = true; };
    const openEditDoctor = (doc) => { Object.assign(doctorForm, { ...doc }); editingDoctor.value = doc.id; showAddDoctor.value = true; };
    const saveDoctorEntry = () => {
      if (!doctorForm.name.trim()) return;
      const list = getDoctors();
      if (editingDoctor.value === null) {
        list.push({ ...doctorForm, id: Date.now() });
      } else {
        const idx = list.findIndex(d => d.id === editingDoctor.value);
        if (idx !== -1) Object.assign(list[idx], doctorForm);
      }
      saveDoctors(list); doctorList.value = list; showAddDoctor.value = false;
    };
    const removeDoctor = (id) => { confirmRemoveDoctorId.value = id; };
    const confirmRemoveDoctor = () => {
      const list = getDoctors().filter(d => d.id !== confirmRemoveDoctorId.value);
      saveDoctors(list); doctorList.value = list; confirmRemoveDoctorId.value = null;
    };

    // ── Medicine Requests management ───────────────────────────────────────────
    const medRequests = ref(getMedicineRequests());
    const approveRequest = (req) => {
      const list = getMedicineRequests().map(r => r.id === req.id ? { ...r, status: 'approved' } : r);
      saveMedicineRequests(list); medRequests.value = list;
    };
    const rejectRequest = (req) => {
      const list = getMedicineRequests().map(r => r.id === req.id ? { ...r, status: 'rejected' } : r);
      saveMedicineRequests(list); medRequests.value = list;
    };
    const pendingRequests = computed(() => medRequests.value.filter(r => r.status === 'pending').length);

    const getPharmacyName = (pharmacyId) => {
      if (!pharmacyId) return '—';
      const ph = pharmacyList.value.find(p => p.id === pharmacyId);
      return ph ? ph.name : '—';
    };

    return {
      activePanel, navItems,
      inventory, allOrders, allStaff,
      totalPharmacies, totalPending, totalStaff, totalItems,
      // Pharmacies CRUD
      pharmacyList, showAddPharmacy, editingPharmacy, pharmacyForm,
      confirmRemovePharmacyId,
      openAddPharmacy, openEditPharmacy, savePharmacyEntry, removePharmacy, confirmRemovePharmacy,
      // Doctors CRUD
      doctorList, showAddDoctor, editingDoctor, doctorForm,
      confirmRemoveDoctorId,
      openAddDoctor, openEditDoctor, saveDoctorEntry, removeDoctor, confirmRemoveDoctor,
      // Medicine requests
      medRequests, pendingRequests, approveRequest, rejectRequest,
      // roleBadge helper
      roleBadge: roleBadgeClass,
      getPharmacyName,
    };
  },

  template: `
    <div class="flex min-h-[calc(100vh-3.5rem)] bg-gray-100">

      <!-- ════════════════════════════════════════════════
           LEFT SIDEBAR
           ════════════════════════════════════════════════ -->
      <aside class="hidden sm:flex flex-col w-52 xl:w-60 bg-white border-r border-gray-200 py-5 px-3 gap-1 shrink-0">
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">🌐 App Admin</h2>

        <button
          v-for="item in navItems"
          :key="item.id"
          @click="activePanel = item.id"
          :class="[
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500',
            activePanel === item.id
              ? 'bg-green-600 text-white shadow'
              : 'text-gray-600 hover:bg-gray-100'
          ]"
        >
          <span class="text-lg leading-none">{{ item.icon }}</span>
          {{ item.label }}
        </button>

        <!-- KPI snapshot in sidebar footer -->
        <div class="mt-auto pt-4 border-t border-gray-100 px-3 space-y-3">
          <div>
            <p class="text-xs text-gray-400">Pharmacies</p>
            <p class="text-2xl font-bold text-indigo-700 mt-1">{{ totalPharmacies }}</p>
          </div>
          <div>
            <p class="text-xs text-gray-400">Pending Orders</p>
            <p class="text-sm font-bold" :class="totalPending > 0 ? 'text-amber-600' : 'text-gray-700'">
              {{ totalPending }}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-400">SKUs in Catalogue</p>
            <p class="text-sm font-bold text-gray-700">{{ totalItems }}</p>
          </div>
        </div>
      </aside>

      <!-- Mobile tab-bar (sm and below) -->
      <div class="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 grid grid-cols-5 no-print">
        <button
          v-for="item in navItems"
          :key="item.id"
          @click="activePanel = item.id"
          :class="[
            'flex flex-col items-center py-2 gap-0.5 text-[10px] font-medium',
            activePanel === item.id ? 'text-green-600' : 'text-gray-500'
          ]"
        >
          <span class="text-xl">{{ item.icon }}</span>
          {{ item.label }}
        </button>
      </div>


      <!-- ════════════════════════════════════════════════
           MAIN CONTENT AREA
           ════════════════════════════════════════════════ -->
      <main class="flex-1 overflow-y-auto px-4 sm:px-6 py-5 pb-24 sm:pb-6">
        <!-- ────────────────────────────────────────────────
             PANEL 1: GLOBAL OVERVIEW
             ──────────────────────────────────────────────── -->
        <section v-if="activePanel === 'overview'">
          <div class="mb-6">
            <h1 class="text-2xl font-bold text-gray-900">🌐 OnePharma App Admin</h1>
            <p class="text-sm text-gray-500 mt-1">Supreme platform overview — this dashboard is for OnePharma developers only.</p>
          </div>

          <!-- KPI strip -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p class="text-xs text-gray-400 font-medium">Registered Pharmacies</p>
              <p class="text-2xl font-bold text-indigo-700 mt-1">{{ totalPharmacies }}</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p class="text-xs text-gray-400 font-medium">Pending Orders (all)</p>
              <p class="text-2xl font-bold mt-1" :class="totalPending > 0 ? 'text-amber-600' : 'text-gray-700'">{{ totalPending }}</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p class="text-xs text-gray-400 font-medium">Staff Across Network</p>
              <p class="text-2xl font-bold text-green-700 mt-1">{{ totalStaff }}</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p class="text-xs text-gray-400 font-medium">Master Medicines</p>
              <p class="text-2xl font-bold text-blue-700 mt-1">{{ totalItems }}</p>
            </div>
          </div>

          <!-- Pharmacy quick table -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-200 mb-5">
            <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 class="text-sm font-bold text-gray-700">Registered Pharmacies</h2>
              <button @click="activePanel='pharmacies'" class="text-xs text-indigo-600 hover:underline font-medium">Manage all →</button>
            </div>
            <div class="divide-y divide-gray-50">
              <div v-for="ph in pharmacyList" :key="ph.id" class="px-5 py-3 flex items-center gap-3 flex-wrap">
                <span class="text-xl">🏪</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-gray-800 truncate">{{ ph.name }}</p>
                  <p class="text-xs text-gray-400 truncate">{{ ph.address }}</p>
                </div>
                <div class="flex items-center gap-2 text-xs flex-wrap">
                  <span :class="['font-semibold px-2 py-0.5 rounded-full', ph.open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600']">
                    {{ ph.open ? 'Open' : 'Closed' }}
                  </span>
                  <span class="text-gray-400">{{ ph.phone }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick links -->
          <div class="grid sm:grid-cols-3 gap-3">
            <button @click="activePanel='master_meds'"
              class="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 text-left hover:border-indigo-300 hover:shadow-md transition">
              <p class="text-2xl mb-2">💊</p>
              <p class="font-semibold text-gray-800 text-sm">Master Medicines</p>
              <p class="text-xs text-gray-400 mt-0.5">{{ totalItems }} items in master catalogue</p>
            </button>
            <button @click="activePanel='med_requests'"
              class="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 text-left hover:border-amber-300 hover:shadow-md transition">
              <p class="text-2xl mb-2">🆕</p>
              <p class="font-semibold text-gray-800 text-sm">Medicine Requests</p>
              <p class="text-xs text-gray-400 mt-0.5">{{ pendingRequests }} pending approval</p>
            </button>
            <button @click="activePanel='doctors'"
              class="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 text-left hover:border-green-300 hover:shadow-md transition">
              <p class="text-2xl mb-2">🩺</p>
              <p class="font-semibold text-gray-800 text-sm">Doctors Database</p>
              <p class="text-xs text-gray-400 mt-0.5">Platform-wide doctor registry</p>
            </button>
          </div>
        </section>


        <!-- ────────────────────────────────────────────────
             PANEL 2: MASTER MEDICINE CATALOGUE
             ──────────────────────────────────────────────── -->
        <section v-if="activePanel === 'master_meds'">
          <h1 class="text-2xl font-bold text-gray-900 mb-5">💊 Master Medicine Catalogue</h1>
          <p class="text-sm text-gray-500 mb-4">Platform-wide reference list. Pharmacies submit additions via Med Requests which you approve below.</p>

          <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th class="px-4 py-3 text-left">#</th>
                  <th class="px-4 py-3 text-left">Medicine</th>
                  <th class="px-4 py-3 text-left">Brand</th>
                  <th class="px-4 py-3 text-left">Generic</th>
                  <th class="px-4 py-3 text-left">Category</th>
                  <th class="px-4 py-3 text-right">Price</th>
                  <th class="px-4 py-3 text-right">GST</th>
                  <th class="px-4 py-3 text-left">Supplier</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="med in inventory" :key="med.id" class="hover:bg-gray-50">
                  <td class="px-4 py-3 text-gray-400 text-xs">{{ med.id }}</td>
                  <td class="px-4 py-3 font-medium text-gray-900">{{ med.name }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ med.brand }}</td>
                  <td class="px-4 py-3 text-gray-500">{{ med.generic }}</td>
                  <td class="px-4 py-3 text-gray-500">{{ med.category }}</td>
                  <td class="px-4 py-3 text-right font-medium text-gray-800">₹{{ med.price }}</td>
                  <td class="px-4 py-3 text-right text-gray-500">{{ med.gst }}%</td>
                  <td class="px-4 py-3 text-gray-500">{{ med.supplier }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>


        <!-- ────────────────────────────────────────────────
             PANEL 3: PHARMACIES MANAGEMENT
             ──────────────────────────────────────────────── -->
        <section v-if="activePanel === 'pharmacies'">
          <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
            <h1 class="text-2xl font-bold text-gray-900">🏪 Pharmacy Management</h1>
            <button @click="openAddPharmacy"
              class="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition">
              + Add Pharmacy
            </button>
          </div>

          <!-- Pharmacy grid -->
          <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-5">
            <div v-for="ph in pharmacyList" :key="ph.id"
              class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-2xl">🏪</span>
                  <div>
                    <p class="font-bold text-gray-900 text-sm">{{ ph.name }}</p>
                    <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', ph.open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600']">
                      {{ ph.open ? 'Open' : 'Closed' }}
                    </span>
                  </div>
                </div>
                <div class="flex gap-1 shrink-0">
                  <button @click="openEditPharmacy(ph)" class="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50">Edit</button>
                  <button @click="removePharmacy(ph.id)" class="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50">Remove</button>
                </div>
              </div>
              <p class="text-xs text-gray-500 leading-snug">{{ ph.address }}</p>
              <div class="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                <span>📞 {{ ph.phone }}</span>
                <span>🕐 {{ ph.hours }}</span>
                <span class="text-amber-500">★ {{ ph.rating }}</span>
                <span v-if="ph.distance">📍 {{ ph.distance }}</span>
              </div>
            </div>
          </div>

          <!-- Add/Edit Pharmacy Modal -->
          <Transition name="fade">
            <div v-if="showAddPharmacy" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="showAddPharmacy=false">
              <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                <h2 class="text-lg font-bold text-gray-900 mb-4">{{ editingPharmacy === null ? 'Add Pharmacy' : 'Edit Pharmacy' }}</h2>
                <div class="space-y-3">
                  <label class="block"><span class="text-xs font-medium text-gray-600">Name *</span>
                    <input v-model="pharmacyForm.name" type="text" placeholder="e.g. City Pharmacy"
                      class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                  <label class="block"><span class="text-xs font-medium text-gray-600">Address</span>
                    <input v-model="pharmacyForm.address" type="text" placeholder="123, MG Road, City"
                      class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                  <div class="grid grid-cols-2 gap-3">
                    <label class="block"><span class="text-xs font-medium text-gray-600">Phone</span>
                      <input v-model="pharmacyForm.phone" type="tel"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                    <label class="block"><span class="text-xs font-medium text-gray-600">Hours</span>
                      <input v-model="pharmacyForm.hours" type="text" placeholder="9 AM – 9 PM"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <label class="block"><span class="text-xs font-medium text-gray-600">Distance</span>
                      <input v-model="pharmacyForm.distance" type="text" placeholder="0.5 km"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                    <label class="block"><span class="text-xs font-medium text-gray-600">Rating (0-5)</span>
                      <input v-model.number="pharmacyForm.rating" type="number" min="0" max="5" step="0.1"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <label class="block"><span class="text-xs font-medium text-gray-600">Latitude</span>
                      <input v-model.number="pharmacyForm.lat" type="number" step="any" placeholder="22.5726"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                    <label class="block"><span class="text-xs font-medium text-gray-600">Longitude</span>
                      <input v-model.number="pharmacyForm.lng" type="number" step="any" placeholder="88.3639"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                  </div>
                  <label class="flex items-center gap-2">
                    <input v-model="pharmacyForm.open" type="checkbox" class="w-4 h-4 accent-green-600" />
                    <span class="text-sm text-gray-700">Currently open</span>
                  </label>
                </div>
                <div class="flex gap-3 mt-5">
                  <button @click="showAddPharmacy=false" class="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50">Cancel</button>
                  <button @click="savePharmacyEntry" :disabled="!pharmacyForm.name"
                    class="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold rounded-xl">
                    {{ editingPharmacy === null ? 'Add' : 'Save' }}
                  </button>
                </div>
              </div>
            </div>
          </Transition>

          <!-- Remove pharmacy confirm -->
          <Transition name="fade">
            <div v-if="confirmRemovePharmacyId !== null" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="confirmRemovePharmacyId=null">
              <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
                <div class="text-5xl mb-3">⚠️</div>
                <h2 class="text-lg font-bold text-gray-900 mb-1">Remove Pharmacy?</h2>
                <p class="text-sm text-gray-500 mb-5">This cannot be undone.</p>
                <div class="flex gap-3">
                  <button @click="confirmRemovePharmacyId=null" class="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50">Cancel</button>
                  <button @click="confirmRemovePharmacy" class="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl">Remove</button>
                </div>
              </div>
            </div>
          </Transition>
        </section>


        <!-- ────────────────────────────────────────────────
             PANEL 4: DOCTORS DATABASE
             ──────────────────────────────────────────────── -->
        <section v-if="activePanel === 'doctors'">
          <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
            <h1 class="text-2xl font-bold text-gray-900">🩺 Doctors Database</h1>
            <button @click="openAddDoctor"
              class="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition">
              + Add Doctor
            </button>
          </div>

          <div v-if="doctorList.length === 0" class="text-center py-12 text-gray-400">
            <div class="text-5xl mb-3">🩺</div>
            <p class="text-sm">No doctors in the database yet.</p>
            <p class="text-xs mt-1">Staff will see doctor names they entered when creating carts.</p>
          </div>

          <div v-else class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto mb-4">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th class="px-4 py-3 text-left">Doctor</th>
                  <th class="px-4 py-3 text-left">Specialty</th>
                  <th class="px-4 py-3 text-left">Clinic</th>
                  <th class="px-4 py-3 text-left">Phone</th>
                  <th class="px-4 py-3 text-left">Linked Pharmacy</th>
                  <th class="px-4 py-3 text-center">Status</th>
                  <th class="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="doc in doctorList" :key="doc.id" class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-medium text-gray-900">{{ doc.name }}</td>
                  <td class="px-4 py-3 text-gray-500">{{ doc.specialty }}</td>
                  <td class="px-4 py-3 text-gray-500">{{ doc.clinic }}</td>
                  <td class="px-4 py-3 text-gray-400">{{ doc.phone }}</td>
                  <td class="px-4 py-3 text-gray-500">{{ getPharmacyName(doc.pharmacyId) }}</td>
                  <td class="px-4 py-3 text-center">
                    <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', doc.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500']">
                      {{ doc.active ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-2">
                      <button @click="openEditDoctor(doc)" class="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50">Edit</button>
                      <button @click="removeDoctor(doc.id)" class="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50">Remove</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Add/Edit Doctor Modal -->
          <Transition name="fade">
            <div v-if="showAddDoctor" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="showAddDoctor=false">
              <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                <h2 class="text-lg font-bold text-gray-900 mb-4">{{ editingDoctor === null ? 'Add Doctor' : 'Edit Doctor' }}</h2>
                <div class="space-y-3">
                  <label class="block"><span class="text-xs font-medium text-gray-600">Full Name *</span>
                    <input v-model="doctorForm.name" type="text" placeholder="Dr. Anita Sharma"
                      class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                  <label class="block"><span class="text-xs font-medium text-gray-600">Specialty</span>
                    <input v-model="doctorForm.specialty" type="text" placeholder="General Physician"
                      class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                  <label class="block"><span class="text-xs font-medium text-gray-600">Clinic / Hospital</span>
                    <input v-model="doctorForm.clinic" type="text" placeholder="City Clinic, Park Street"
                      class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                  <label class="block"><span class="text-xs font-medium text-gray-600">Phone</span>
                    <input v-model="doctorForm.phone" type="tel"
                      class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                  <label class="block"><span class="text-xs font-medium text-gray-600">Email (for login)</span>
                    <input v-model="doctorForm.email" type="email" placeholder="doctor@clinic.com"
                      class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                  <label class="block"><span class="text-xs font-medium text-gray-600">Linked Pharmacy</span>
                    <select v-model.number="doctorForm.pharmacyId"
                      class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none">
                      <option :value="null">None</option>
                      <option v-for="ph in pharmacyList" :key="ph.id" :value="ph.id">{{ ph.name }}</option>
                    </select>
                  </label>
                  <div class="grid grid-cols-2 gap-3">
                    <label class="block"><span class="text-xs font-medium text-gray-600">Latitude</span>
                      <input v-model.number="doctorForm.lat" type="number" step="any" placeholder="22.5726"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                    <label class="block"><span class="text-xs font-medium text-gray-600">Longitude</span>
                      <input v-model.number="doctorForm.lng" type="number" step="any" placeholder="88.3639"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                  </div>
                  <label class="flex items-center gap-2">
                    <input v-model="doctorForm.active" type="checkbox" class="w-4 h-4 accent-green-600" />
                    <span class="text-sm text-gray-700">Active in system</span>
                  </label>
                </div>
                <div class="flex gap-3 mt-5">
                  <button @click="showAddDoctor=false" class="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50">Cancel</button>
                  <button @click="saveDoctorEntry" :disabled="!doctorForm.name"
                    class="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold rounded-xl">
                    {{ editingDoctor === null ? 'Add Doctor' : 'Save Changes' }}
                  </button>
                </div>
              </div>
            </div>
          </Transition>

          <!-- Remove doctor confirm -->
          <Transition name="fade">
            <div v-if="confirmRemoveDoctorId !== null" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="confirmRemoveDoctorId=null">
              <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
                <div class="text-5xl mb-3">⚠️</div>
                <h2 class="text-lg font-bold text-gray-900 mb-1">Remove Doctor?</h2>
                <p class="text-sm text-gray-500 mb-5">This cannot be undone.</p>
                <div class="flex gap-3">
                  <button @click="confirmRemoveDoctorId=null" class="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50">Cancel</button>
                  <button @click="confirmRemoveDoctor" class="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl">Remove</button>
                </div>
              </div>
            </div>
          </Transition>
        </section>


        <!-- ────────────────────────────────────────────────
             PANEL 5: MEDICINE REQUESTS (from pharmacies)
             ──────────────────────────────────────────────── -->
        <section v-if="activePanel === 'med_requests'">
          <h1 class="text-2xl font-bold text-gray-900 mb-2">🆕 New Medicine Requests</h1>
          <p class="text-sm text-gray-500 mb-5">Pharmacy staff submitted these new medicines for master-database approval.</p>

          <!-- Summary strip -->
          <div class="grid grid-cols-3 gap-3 mb-5">
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 text-center">
              <p class="text-2xl font-bold text-amber-600">{{ medRequests.filter(r=>r.status==='pending').length }}</p>
              <p class="text-xs text-gray-400 mt-0.5">Pending</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 text-center">
              <p class="text-2xl font-bold text-green-600">{{ medRequests.filter(r=>r.status==='approved').length }}</p>
              <p class="text-xs text-gray-400 mt-0.5">Approved</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 text-center">
              <p class="text-2xl font-bold text-red-500">{{ medRequests.filter(r=>r.status==='rejected').length }}</p>
              <p class="text-xs text-gray-400 mt-0.5">Rejected</p>
            </div>
          </div>

          <div v-if="medRequests.length === 0" class="text-center py-12 text-gray-400">
            <div class="text-5xl mb-3">🆕</div>
            <p class="text-sm">No medicine requests yet.</p>
          </div>

          <div v-else class="space-y-3">
            <div v-for="req in medRequests" :key="req.id"
              class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-start gap-4 flex-wrap">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1 flex-wrap">
                  <p class="font-bold text-gray-900">{{ req.name }}</p>
                  <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full',
                    req.status==='pending'  ? 'bg-amber-100 text-amber-700' :
                    req.status==='approved' ? 'bg-green-100 text-green-700' :
                                              'bg-red-100 text-red-600']">
                    {{ req.status }}
                  </span>
                </div>
                <p class="text-xs text-gray-500">{{ req.brand || '—' }} · {{ req.generic || '—' }} · {{ req.category || '—' }}</p>
                <p class="text-xs text-gray-400 mt-0.5">₹{{ req.price }} · {{ req.gst }}% GST · Requested: {{ req.requestedAt ? new Date(req.requestedAt).toLocaleDateString('en-IN') : '—' }}</p>
              </div>
              <div v-if="req.status === 'pending'" class="flex gap-2 shrink-0">
                <button @click="approveRequest(req)"
                  class="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold px-3 py-1.5 rounded-lg transition">
                  ✓ Approve
                </button>
                <button @click="rejectRequest(req)"
                  class="text-xs bg-red-500 hover:bg-red-600 text-white font-semibold px-3 py-1.5 rounded-lg transition">
                  ✗ Reject
                </button>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  `,
});
