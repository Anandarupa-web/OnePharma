/**
 * AdminDashboard.js – Admin / Owner Management Portal
 *
 * Layout: CSS Grid dashboard with a persistent left-hand navigation sidebar.
 *
 * Panels:
 *  1. Analytics  – Chart.js line graph (monthly sales) + bar chart (top medicines)
 *  2. Alerts     – Stock-out & near-expiry notifications using StockAlertCard
 *  3. Inventory  – Full inventory table with live stock indicators
 *  4. Supplier   – Report generator with date filters and CSV/PDF simulation
 */
import { defineComponent, ref, computed, onMounted, watch, nextTick, reactive } from 'vue';
import StockAlertCard from '../components/StockAlertCard.js';
import { getInventory, getSalesData, getStaff, saveStaff, roleBadgeClass, getPharmacies, getMedicineRequests, saveMedicineRequests, getDoctors, saveDoctors } from '../app.js';

export default defineComponent({
  name: 'AdminDashboard',

  components: { StockAlertCard },

  setup() {
    // ── State ──────────────────────────────────────────────────────────────
    const activePanel = ref('analytics');
    const inventory   = ref(getInventory());
    const salesData   = ref(getSalesData());

    // Supplier report filters
    const reportFrom      = ref('');
    const reportTo        = ref('');
    const reportGenerated = ref(false);
    const reportMsg       = ref('');

    // Chart instances (to avoid double-render on re-mount)
    let salesChart = null;
    let topChart   = null;

    // ── Navigation items ───────────────────────────────────────────────────
    const navItems = [
      { id: 'analytics',    icon: '📊', label: 'Analytics'    },
      { id: 'alerts',       icon: '🔔', label: 'Alerts'       },
      { id: 'inventory',    icon: '📦', label: 'Inventory'    },
      { id: 'supplier',     icon: '📋', label: 'Supplier'     },
      { id: 'staff',        icon: '👥', label: 'Staff'        },
      { id: 'pharmacies',   icon: '🏪', label: 'Pharmacies'   },
      { id: 'doctors',      icon: '🩺', label: 'Doctors'      },
      { id: 'med_requests', icon: '🆕', label: 'Med Requests' },
    ];

    // ── Staff Management state ─────────────────────────────────────────────
    const staffList    = ref(getStaff());
    const showAddStaff = ref(false);
    const editingStaff = ref(null);   // null = new, object = editing existing
    const confirmRemoveId = ref(null); // non-null triggers the confirm modal

    const blankForm = () => ({ name: '', email: '', password: '', role: 'cashier', phone: '', active: true });
    const staffForm = reactive(blankForm());

    const ROLES = ['admin', 'staff'];  // All non-admin staff have unified POS access

    // Delegate to the shared utility exported from app.js
    const roleBadge = roleBadgeClass;

    /** Open the Add Staff form (blank). */
    const openAddForm = () => {
      Object.assign(staffForm, blankForm());
      editingStaff.value = null;
      showAddStaff.value = true;
    };

    /** Open the Edit Staff form pre-filled. */
    const openEditForm = (member) => {
      Object.assign(staffForm, { ...member });
      editingStaff.value = member.id;
      showAddStaff.value = true;
    };

    /** Save new or edited staff record. */
    const saveStaffMember = () => {
      if (!staffForm.name || !staffForm.email) return;

      if (editingStaff.value === null) {
        // Add new staff member
        const newId = Math.max(0, ...staffList.value.map((s) => s.id)) + 1;
        const avatar = staffForm.name.split(' ').filter((w) => w.length > 0).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '??';
        staffList.value.push({ ...staffForm, id: newId, avatar, joinDate: new Date().toISOString().split('T')[0] });
      } else {
        // Update existing
        const idx = staffList.value.findIndex((s) => s.id === editingStaff.value);
        if (idx !== -1) Object.assign(staffList.value[idx], staffForm);
      }

      saveStaff(staffList.value);
      showAddStaff.value = false;
    };

    /** Toggle a staff member's active status. */
    const toggleActive = (member) => {
      member.active = !member.active;
      saveStaff(staffList.value);
    };

    /** Show a custom confirmation modal before removing a staff member. */
    const removeMember = (id) => { confirmRemoveId.value = id; };

    const confirmRemove = () => {
      staffList.value = staffList.value.filter((s) => s.id !== confirmRemoveId.value);
      saveStaff(staffList.value);
      confirmRemoveId.value = null;
    };

    // ── Derived alert lists ────────────────────────────────────────────────
    /** Medicines below minimum stock threshold. */
    const lowStockAlerts = computed(() =>
      inventory.value.filter((m) => m.stock < m.minStock)
    );

    /** Medicines expiring within 30 days. */
    const expiryAlerts = computed(() => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 30);
      return inventory.value.filter((m) => new Date(m.expiry) <= cutoff);
    });

    /** Top 5 medicines by units sold (for bar chart). */
    const topMedicines = computed(() =>
      [...inventory.value].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 5)
    );

    // ── Chart rendering ────────────────────────────────────────────────────
    const renderCharts = async () => {
      await nextTick();

      const salesCanvas = document.getElementById('salesChart');
      const topCanvas   = document.getElementById('topChart');

      if (!salesCanvas || !topCanvas) return;

      // Destroy existing chart instances before re-creating
      if (salesChart) { salesChart.destroy(); salesChart = null; }
      if (topChart)   { topChart.destroy();   topChart   = null; }

      // ── Line chart: Monthly Revenue ──────────────────────────────────
      salesChart = new Chart(salesCanvas, {
        type: 'line',
        data: {
          labels:   salesData.value.map((d) => d.month),
          datasets: [{
            label:           'Revenue (₹)',
            data:            salesData.value.map((d) => d.revenue),
            borderColor:     '#16a34a',
            backgroundColor: 'rgba(22,163,74,0.1)',
            borderWidth:     2.5,
            pointBackgroundColor: '#16a34a',
            pointRadius:     4,
            fill:            true,
            tension:         0.35,
          }],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: true,
          plugins: { legend: { position: 'top' } },
          scales: {
            y: {
              beginAtZero: false,
              ticks: { callback: (v) => '₹' + v.toLocaleString('en-IN') },
            },
          },
        },
      });

      // ── Bar chart: Top-Selling Medicines ─────────────────────────────
      topChart = new Chart(topCanvas, {
        type: 'bar',
        data: {
          labels: topMedicines.value.map((m) => m.name.length > 16 ? m.name.slice(0, 15) + '…' : m.name),
          datasets: [{
            label:           'Units Sold',
            data:            topMedicines.value.map((m) => m.unitsSold),
            backgroundColor: ['#16a34a','#2563eb','#d97706','#9333ea','#e11d48'],
            borderRadius:    6,
          }],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: true,
          plugins: { legend: { position: 'top' } },
          scales: { y: { beginAtZero: true } },
        },
      });
    };

    // ── Lifecycle ──────────────────────────────────────────────────────────
    onMounted(() => {
      if (activePanel.value === 'analytics') renderCharts();
    });

    watch(activePanel, (val) => {
      if (val === 'analytics') renderCharts();
    });

    // ── Supplier report ────────────────────────────────────────────────────
    const generateReport = (format) => {
      if (!reportFrom.value || !reportTo.value) {
        reportMsg.value = '⚠️ Please select both a start and end date.';
        return;
      }
      reportGenerated.value = true;
      reportMsg.value = `✅ ${format} report generated for ${reportFrom.value} → ${reportTo.value} (simulated download).`;
    };

    // ── Computed KPI cards ─────────────────────────────────────────────────
    const totalRevenue = computed(() =>
      salesData.value.reduce((s, d) => s + d.revenue, 0).toLocaleString('en-IN')
    );
    const totalAlerts  = computed(() => lowStockAlerts.value.length + expiryAlerts.value.length);
    const totalItems   = computed(() => inventory.value.length);


    // ── Pharmacies management ──────────────────────────────────────────────────
    const pharmacyList   = ref(getPharmacies());
    const showAddPharmacy = ref(false);
    const editingPharmacy = ref(null);
    const confirmRemovePharmacyId = ref(null);
    const blankPharmacy = () => ({ name: '', address: '', phone: '', hours: '', rating: 4.0, open: true, distance: '' });
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
    const blankDoctor = () => ({ name: '', specialty: '', phone: '', clinic: '', active: true });
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

    return {
      activePanel, navItems,
      inventory, salesData,
      lowStockAlerts, expiryAlerts, topMedicines,
      reportFrom, reportTo, reportGenerated, reportMsg, generateReport,
      totalRevenue, totalAlerts, totalItems,
      // Staff management
      staffList, showAddStaff, staffForm, editingStaff, ROLES,
      roleBadge, openAddForm, openEditForm, saveStaffMember, toggleActive, removeMember,
      confirmRemoveId, confirmRemove,
      // Pharmacies
      pharmacyList, showAddPharmacy, editingPharmacy, pharmacyForm,
      confirmRemovePharmacyId,
      openAddPharmacy, openEditPharmacy, savePharmacyEntry, removePharmacy, confirmRemovePharmacy,
      // Doctors
      doctorList, showAddDoctor, editingDoctor, doctorForm,
      confirmRemoveDoctorId,
      openAddDoctor, openEditDoctor, saveDoctorEntry, removeDoctor, confirmRemoveDoctor,
      // Medicine requests
      medRequests, pendingRequests, approveRequest, rejectRequest,
    };
  },

  template: `
    <div class="flex min-h-[calc(100vh-3.5rem)] bg-gray-100">

      <!-- ════════════════════════════════════════════════
           LEFT SIDEBAR
           ════════════════════════════════════════════════ -->
      <aside class="hidden sm:flex flex-col w-52 xl:w-60 bg-white border-r border-gray-200 py-5 px-3 gap-1 shrink-0">
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">Admin Panel</h2>

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
            <p class="text-xs text-gray-400">6-mo Revenue</p>
            <p class="text-sm font-bold text-green-700">₹{{ totalRevenue }}</p>
          </div>
          <div>
            <p class="text-xs text-gray-400">Active Alerts</p>
            <p class="text-sm font-bold" :class="totalAlerts > 0 ? 'text-red-600' : 'text-gray-700'">
              {{ totalAlerts }}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-400">SKUs in Stock</p>
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
             PANEL 1: ANALYTICS DASHBOARD
             ──────────────────────────────────────────────── -->
        <section v-if="activePanel === 'analytics'">
          <h1 class="text-2xl font-bold text-gray-900 mb-5">📊 Analytics Dashboard</h1>

          <!-- KPI cards row -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p class="text-xs text-gray-400 font-medium">6-mo Revenue</p>
              <p class="text-2xl font-bold text-green-700 mt-1">₹{{ totalRevenue }}</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p class="text-xs text-gray-400 font-medium">Active Alerts</p>
              <p class="text-2xl font-bold mt-1" :class="totalAlerts > 0 ? 'text-red-600' : 'text-gray-700'">{{ totalAlerts }}</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p class="text-xs text-gray-400 font-medium">Low Stock SKUs</p>
              <p class="text-2xl font-bold text-amber-600 mt-1">{{ lowStockAlerts.length }}</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p class="text-xs text-gray-400 font-medium">Near Expiry</p>
              <p class="text-2xl font-bold text-orange-600 mt-1">{{ expiryAlerts.length }}</p>
            </div>
          </div>

          <!-- Charts grid -->
          <div class="grid lg:grid-cols-2 gap-5">
            <!-- Monthly Sales Line Chart -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <h2 class="text-sm font-bold text-gray-700 mb-4">Monthly Sales Revenue (Last 6 Months)</h2>
              <canvas id="salesChart" height="220"></canvas>
            </div>
            <!-- Top Medicines Bar Chart -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <h2 class="text-sm font-bold text-gray-700 mb-4">Top 5 Medicines by Units Sold</h2>
              <canvas id="topChart" height="220"></canvas>
            </div>
          </div>

          <!-- Top medicines table -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-200 mt-5 overflow-x-auto">
            <div class="px-5 py-3 border-b border-gray-100">
              <h2 class="text-sm font-bold text-gray-700">Top Sellers Detail</h2>
            </div>
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th class="px-5 py-3 text-left">Medicine</th>
                  <th class="px-5 py-3 text-left">Category</th>
                  <th class="px-5 py-3 text-right">Units Sold</th>
                  <th class="px-5 py-3 text-right">Price</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="med in topMedicines" :key="med.id" class="hover:bg-gray-50">
                  <td class="px-5 py-3 font-medium text-gray-900">{{ med.name }}</td>
                  <td class="px-5 py-3 text-gray-500">{{ med.category }}</td>
                  <td class="px-5 py-3 text-right font-semibold text-green-700">{{ med.unitsSold }}</td>
                  <td class="px-5 py-3 text-right text-gray-700">₹{{ med.price }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>


        <!-- ────────────────────────────────────────────────
             PANEL 2: ALERTS CENTRE
             ──────────────────────────────────────────────── -->
        <section v-if="activePanel === 'alerts'">
          <h1 class="text-2xl font-bold text-gray-900 mb-5">🔔 Alerts Centre</h1>

          <!-- Summary banner -->
          <div v-if="lowStockAlerts.length + expiryAlerts.length > 0"
            class="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 mb-5 flex items-center gap-3">
            <span class="text-3xl">🚨</span>
            <div>
              <p class="font-bold text-red-800">{{ lowStockAlerts.length + expiryAlerts.length }} active alert(s) require attention</p>
              <p class="text-sm text-red-600">Review and restock / discard flagged items promptly.</p>
            </div>
          </div>
          <div v-else class="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 mb-5 flex items-center gap-3">
            <span class="text-3xl">✅</span>
            <p class="font-bold text-green-800">All stock levels are healthy. No near-expiry items.</p>
          </div>

          <!-- Low Stock alerts -->
          <div class="mb-6">
            <h2 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>📦</span> Low Stock ({{ lowStockAlerts.length }})
            </h2>
            <div v-if="lowStockAlerts.length === 0" class="text-sm text-gray-400 bg-white rounded-xl px-4 py-4 border border-gray-100">
              No low-stock items.
            </div>
            <div v-else class="space-y-2">
              <StockAlertCard
                v-for="med in lowStockAlerts"
                :key="med.id"
                :medicine="med.name"
                type="low-stock"
                :detail="med.stock + ' units left (min threshold: ' + med.minStock + ')'"
              />
            </div>
          </div>

          <!-- Near-Expiry alerts -->
          <div>
            <h2 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>⏰</span> Near Expiry / Expired ({{ expiryAlerts.length }})
            </h2>
            <div v-if="expiryAlerts.length === 0" class="text-sm text-gray-400 bg-white rounded-xl px-4 py-4 border border-gray-100">
              No items nearing expiry.
            </div>
            <div v-else class="space-y-2">
              <StockAlertCard
                v-for="med in expiryAlerts"
                :key="med.id"
                :medicine="med.name"
                type="expiry"
                :detail="'Expires on ' + new Date(med.expiry).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })"
              />
            </div>
          </div>
        </section>


        <!-- ────────────────────────────────────────────────
             PANEL 3: INVENTORY TABLE
             ──────────────────────────────────────────────── -->
        <section v-if="activePanel === 'inventory'">
          <h1 class="text-2xl font-bold text-gray-900 mb-5">📦 Full Inventory</h1>

          <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th class="px-4 py-3 text-left">#</th>
                  <th class="px-4 py-3 text-left">Medicine</th>
                  <th class="px-4 py-3 text-left">Brand</th>
                  <th class="px-4 py-3 text-left">Category</th>
                  <th class="px-4 py-3 text-right">Stock</th>
                  <th class="px-4 py-3 text-right">Min</th>
                  <th class="px-4 py-3 text-right">Price</th>
                  <th class="px-4 py-3 text-right">GST</th>
                  <th class="px-4 py-3 text-left">Expiry</th>
                  <th class="px-4 py-3 text-left">Supplier</th>
                  <th class="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr
                  v-for="med in inventory"
                  :key="med.id"
                  class="hover:bg-gray-50"
                >
                  <td class="px-4 py-3 text-gray-400">{{ med.id }}</td>
                  <td class="px-4 py-3 font-medium text-gray-900">{{ med.name }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ med.brand }}</td>
                  <td class="px-4 py-3 text-gray-500">{{ med.category }}</td>
                  <td class="px-4 py-3 text-right" :class="med.stock < med.minStock ? 'text-red-600 font-bold' : 'text-gray-800'">{{ med.stock }}</td>
                  <td class="px-4 py-3 text-right text-gray-400">{{ med.minStock }}</td>
                  <td class="px-4 py-3 text-right font-medium text-gray-800">₹{{ med.price }}</td>
                  <td class="px-4 py-3 text-right text-gray-500">{{ med.gst }}%</td>
                  <td class="px-4 py-3 text-gray-600">{{ new Date(med.expiry).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) }}</td>
                  <td class="px-4 py-3 text-gray-500">{{ med.supplier }}</td>
                  <td class="px-4 py-3 text-center">
                    <span
                      v-if="med.stock === 0"
                      class="inline-block px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold"
                    >Out of Stock</span>
                    <span
                      v-else-if="med.stock < med.minStock"
                      class="inline-block px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold"
                    >Low Stock</span>
                    <span
                      v-else
                      class="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold"
                    >OK</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>


        <!-- ────────────────────────────────────────────────
             PANEL 4: SUPPLIER REPORTING
             ──────────────────────────────────────────────── -->
        <section v-if="activePanel === 'supplier'">
          <h1 class="text-2xl font-bold text-gray-900 mb-5">📋 Supplier Reporting</h1>

          <!-- Date filter form -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-5">
            <h2 class="text-sm font-bold text-gray-700 mb-4">Generate Purchase Report</h2>

            <div class="grid sm:grid-cols-2 gap-4 mb-4">
              <label class="block">
                <span class="text-xs font-medium text-gray-600">From Date</span>
                <input
                  v-model="reportFrom"
                  type="date"
                  class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2.5 text-sm outline-none bg-white"
                />
              </label>
              <label class="block">
                <span class="text-xs font-medium text-gray-600">To Date</span>
                <input
                  v-model="reportTo"
                  type="date"
                  class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2.5 text-sm outline-none bg-white"
                />
              </label>
            </div>

            <!-- Result message -->
            <div
              v-if="reportMsg"
              :class="[
                'rounded-xl px-4 py-3 text-sm font-medium mb-4',
                reportMsg.startsWith('⚠️') ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-green-50 border border-green-200 text-green-800'
              ]"
            >
              {{ reportMsg }}
            </div>

            <div class="flex flex-wrap gap-3">
              <button
                @click="generateReport('PDF')"
                class="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <span>📄</span> Export PDF
              </button>
              <button
                @click="generateReport('CSV')"
                class="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
              >
                <span>📊</span> Export CSV
              </button>
            </div>
          </div>

          <!-- Mock report preview table -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
            <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 class="text-sm font-bold text-gray-700">Purchase Quantity Summary (All Time Preview)</h2>
              <span class="text-xs text-gray-400">Mock data – filters apply on export</span>
            </div>
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th class="px-5 py-3 text-left">Medicine</th>
                  <th class="px-5 py-3 text-left">Supplier</th>
                  <th class="px-5 py-3 text-right">Current Stock</th>
                  <th class="px-5 py-3 text-right">Units Sold</th>
                  <th class="px-5 py-3 text-right">Unit Price</th>
                  <th class="px-5 py-3 text-right">Est. Purchase Value</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="med in inventory" :key="med.id" class="hover:bg-gray-50">
                  <td class="px-5 py-3 font-medium text-gray-900">{{ med.name }}</td>
                  <td class="px-5 py-3 text-gray-500">{{ med.supplier }}</td>
                  <td class="px-5 py-3 text-right text-gray-700">{{ med.stock }}</td>
                  <td class="px-5 py-3 text-right text-gray-700">{{ med.unitsSold }}</td>
                  <td class="px-5 py-3 text-right text-gray-700">₹{{ med.price }}</td>
                  <td class="px-5 py-3 text-right font-semibold text-green-700">₹{{ ((med.stock + med.unitsSold) * med.price * 0.7).toFixed(0) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>


        <!-- ────────────────────────────────────────────────
             PANEL 5: STAFF MANAGEMENT
             ──────────────────────────────────────────────── -->
        <section v-if="activePanel === 'staff'">
          <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
            <h1 class="text-2xl font-bold text-gray-900">👥 Staff Management</h1>
            <button
              @click="openAddForm"
              class="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >
              + Add Staff Member
            </button>
          </div>

          <!-- KPI strip -->
          <div class="grid grid-cols-3 gap-3 mb-5">
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 text-center">
              <p class="text-2xl font-bold text-gray-800">{{ staffList.length }}</p>
              <p class="text-xs text-gray-400 mt-0.5">Total Staff</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 text-center">
              <p class="text-2xl font-bold text-green-700">{{ staffList.filter(s => s.active).length }}</p>
              <p class="text-xs text-gray-400 mt-0.5">Active</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 text-center">
              <p class="text-2xl font-bold text-red-500">{{ staffList.filter(s => !s.active).length }}</p>
              <p class="text-xs text-gray-400 mt-0.5">Inactive</p>
            </div>
          </div>

          <!-- Staff table -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th class="px-4 py-3 text-left">Staff Member</th>
                  <th class="px-4 py-3 text-left">Role</th>
                  <th class="px-4 py-3 text-left">Email</th>
                  <th class="px-4 py-3 text-left">Phone</th>
                  <th class="px-4 py-3 text-left">Joined</th>
                  <th class="px-4 py-3 text-center">Status</th>
                  <th class="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr
                  v-for="member in staffList"
                  :key="member.id"
                  :class="['hover:bg-gray-50', !member.active ? 'opacity-60' : '']"
                >
                  <!-- Avatar + name -->
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      <span class="w-8 h-8 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {{ member.avatar }}
                      </span>
                      <span class="font-medium text-gray-900">{{ member.name }}</span>
                    </div>
                  </td>
                  <!-- Role badge -->
                  <td class="px-4 py-3">
                    <span :class="['text-xs px-2 py-0.5 rounded font-semibold', roleBadge(member.role)]">
                      {{ member.role }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-gray-600">{{ member.email }}</td>
                  <td class="px-4 py-3 text-gray-500">{{ member.phone }}</td>
                  <td class="px-4 py-3 text-gray-400 text-xs">{{ member.joinDate }}</td>
                  <!-- Active toggle -->
                  <td class="px-4 py-3 text-center">
                    <button
                      @click="toggleActive(member)"
                      :class="[
                        'text-xs font-semibold px-3 py-1 rounded-full transition',
                        member.active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      ]"
                    >
                      {{ member.active ? 'Active' : 'Inactive' }}
                    </button>
                  </td>
                  <!-- Actions -->
                  <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-2">
                      <button
                        @click="openEditForm(member)"
                        class="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition"
                      >Edit</button>
                      <button
                        @click="removeMember(member.id)"
                        class="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition"
                      >Remove</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Add / Edit Staff Modal -->
          <Transition name="fade">
            <div
              v-if="showAddStaff"
              class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
              @click.self="showAddStaff = false"
            >
              <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                <h2 class="text-lg font-bold text-gray-900 mb-4">
                  {{ editingStaff === null ? 'Add New Staff Member' : 'Edit Staff Member' }}
                </h2>

                <div class="space-y-3">
                  <label class="block">
                    <span class="text-xs font-medium text-gray-600">Full Name *</span>
                    <input v-model="staffForm.name" type="text" placeholder="e.g. Riya Gupta"
                      class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
                  </label>

                  <label class="block">
                    <span class="text-xs font-medium text-gray-600">Email *</span>
                    <input v-model="staffForm.email" type="email" placeholder="riya@saha.com"
                      class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
                  </label>

                  <label class="block">
                    <span class="text-xs font-medium text-gray-600">Password {{ editingStaff !== null ? '(leave blank to keep current)' : '*' }}</span>
                    <input v-model="staffForm.password" type="password" placeholder="••••••••"
                      class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
                  </label>

                  <label class="block">
                    <span class="text-xs font-medium text-gray-600">Phone</span>
                    <input v-model="staffForm.phone" type="tel" placeholder="+91-98765-XXXXX"
                      class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
                  </label>

                  <label class="block">
                    <span class="text-xs font-medium text-gray-600">Role</span>
                    <select v-model="staffForm.role"
                      class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none bg-white">
                      <option v-for="r in ROLES" :key="r" :value="r">{{ r.charAt(0).toUpperCase() + r.slice(1) }}</option>
                    </select>
                  </label>

                  <label class="flex items-center gap-2 mt-1">
                    <input v-model="staffForm.active" type="checkbox" class="w-4 h-4 accent-green-600" />
                    <span class="text-sm text-gray-700">Account active (can log in)</span>
                  </label>
                </div>

                <div class="flex gap-3 mt-5">
                  <button
                    @click="showAddStaff = false"
                    class="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition"
                  >Cancel</button>
                  <button
                    @click="saveStaffMember"
                    :disabled="!staffForm.name || !staffForm.email"
                    class="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition"
                  >
                    {{ editingStaff === null ? 'Add Staff' : 'Save Changes' }}
                  </button>
                </div>
              </div>
            </div>
          </Transition>

          <!-- Remove-staff confirmation modal -->
          <Transition name="fade">
            <div
              v-if="confirmRemoveId !== null"
              class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
              @click.self="confirmRemoveId = null"
            >
              <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
                <div class="text-5xl mb-3">⚠️</div>
                <h2 class="text-lg font-bold text-gray-900 mb-1">Remove Staff Member?</h2>
                <p class="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
                <div class="flex gap-3">
                  <button
                    @click="confirmRemoveId = null"
                    class="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition"
                  >Cancel</button>
                  <button
                    @click="confirmRemove"
                    class="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition"
                  >Remove</button>
                </div>
              </div>
            </div>
          </Transition>
        </section>


        <!-- ────────────────────────────────────────────────
             PANEL 6: PHARMACIES MANAGEMENT
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
             PANEL 7: DOCTORS DATABASE
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
             PANEL 8: MEDICINE REQUESTS (from staff)
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
