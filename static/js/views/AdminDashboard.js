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
import { getInventory, getSalesData, getStaff, saveStaff } from '../app.js';

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
      { id: 'analytics', icon: '📊', label: 'Analytics'  },
      { id: 'alerts',    icon: '🔔', label: 'Alerts'     },
      { id: 'inventory', icon: '📦', label: 'Inventory'  },
      { id: 'supplier',  icon: '📋', label: 'Supplier'   },
      { id: 'staff',     icon: '👥', label: 'Staff'      },
    ];

    // ── Staff Management state ─────────────────────────────────────────────
    const staffList    = ref(getStaff());
    const showAddStaff = ref(false);
    const editingStaff = ref(null);   // null = new, object = editing existing

    const blankForm = () => ({ name: '', email: '', password: '', role: 'cashier', phone: '', active: true });
    const staffForm = reactive(blankForm());

    const ROLES = ['admin', 'cashier', 'pharmacist'];

    const roleBadge = (role) => {
      const map = { admin: 'bg-purple-100 text-purple-700', cashier: 'bg-blue-100 text-blue-700', pharmacist: 'bg-teal-100 text-teal-700' };
      return map[role] || 'bg-gray-100 text-gray-700';
    };

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
        const avatar = staffForm.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
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

    /** Remove a staff member (with confirmation). */
    const removeMember = (id) => {
      if (!confirm('Remove this staff member? This cannot be undone.')) return;
      staffList.value = staffList.value.filter((s) => s.id !== id);
      saveStaff(staffList.value);
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

    return {
      activePanel, navItems,
      inventory, salesData,
      lowStockAlerts, expiryAlerts, topMedicines,
      reportFrom, reportTo, reportGenerated, reportMsg, generateReport,
      totalRevenue, totalAlerts, totalItems,
      // Staff management
      staffList, showAddStaff, staffForm, editingStaff, ROLES,
      roleBadge, openAddForm, openEditForm, saveStaffMember, toggleActive, removeMember,
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
        </section>

      </main>
    </div>
  `,
});
