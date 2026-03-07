/**
 * PharmacyDashboard.js – Pharmacy Owner/Manager Portal (Saha Pharmacy)
 *
 * Layout: Persistent left sidebar + main content area (mirrors AdminDashboard style).
 *
 * Panels:
 *  1. Overview   – KPI cards, recent orders, stock summary
 *  2. Orders     – Pending / History tabs with fulfill & cancel actions
 *  3. Inventory  – Searchable table with inline stock edit, add & remove
 *  4. Staff      – Full CRUD (pharmacist / staff roles)
 *  5. Alerts     – Low-stock & near-expiry cards
 *  6. Suppliers  – Date-range report with PDF / CSV export simulation
 */
import { defineComponent, ref, computed, reactive, onMounted, inject } from 'vue';
import StockAlertCard from '../components/StockAlertCard.js';
import {
  getInventory, saveInventory, getSalesData,
  getStaff, saveStaff, roleBadgeClass,
  getOrders, saveOrders,
  getAppointments, saveAppointments, getDoctors,
} from '../app.js';

export default defineComponent({
  name: 'PharmacyDashboard',

  components: { StockAlertCard },

  setup() {

    // ── Named constants ────────────────────────────────────────────────────
    /** Stock below minStock × STOCK_WARNING_RATIO triggers amber warning. */
    const STOCK_WARNING_RATIO = 1.2;
    /** Estimated purchase price ≈ PURCHASE_COST_RATIO × selling price. */
    const PURCHASE_COST_RATIO = 0.7;

    // ── Get current pharmacist's pharmacy ID from auth ─────────────────────
    const currentUser = inject('currentUser');
    const myPharmacyId = computed(() => currentUser.value?.pharmacyId ?? 1);

    // ── Core reactive data ─────────────────────────────────────────────────
    const activePanel = ref('overview');
    const inventory   = ref(getInventory());
    const salesData   = ref(getSalesData());
    const orders      = ref(getOrders());
    const staffList   = ref(getStaff());

    // ── Navigation ─────────────────────────────────────────────────────────
    const navItems = [
      { id: 'overview',      icon: '📊', label: 'Overview',      short: 'Home'   },
      { id: 'orders',        icon: '📋', label: 'Orders',        short: 'Orders' },
      { id: 'appointments',  icon: '📅', label: 'Appointments',  short: 'Apts'   },
      { id: 'inventory',     icon: '📦', label: 'Inventory',     short: 'Stock'  },
      { id: 'staff',         icon: '👥', label: 'Staff',         short: 'Staff'  },
      { id: 'alerts',        icon: '🔔', label: 'Alerts',        short: 'Alerts' },
      { id: 'suppliers',     icon: '🚚', label: 'Suppliers',     short: 'Supply' },
    ];

    /** Maximum inventory rows rendered before the user is prompted to search. */
    const INVENTORY_PAGE_SIZE = 20;

    // Note: PURCHASE_COST_RATIO is defined at the top of setup() above.

    // ── Auto-expire stale patient-cart orders on mount ─────────────────────
    onMounted(() => {
      const now  = new Date();
      const list = getOrders().map((o) => {
        if (o.status === 'pending' && o.source === 'patient_cart' && o.expiresAt) {
          if (new Date(o.expiresAt) < now) return { ...o, status: 'expired' };
        }
        return o;
      });
      saveOrders(list);
      orders.value = list;
    });

    // ── Computed order lists ───────────────────────────────────────────────
    const pendingOrders = computed(() => orders.value.filter((o) => ['pending','in_progress'].includes(o.status)));
    const historyOrders = computed(() => orders.value.filter((o) => !['pending','in_progress'].includes(o.status)));

    // ── Orders panel sub-tab ───────────────────────────────────────────────
    const ordersTab       = ref('pending');
    const expandedOrderId = ref(null);
    const toggleOrderItems = (id) => {
      expandedOrderId.value = expandedOrderId.value === id ? null : id;
    };

    /** Start: set in_progress. */
    const startOrder = (ord) => {
      const list = getOrders().map(o => o.id === ord.id ? { ...o, status: 'in_progress', startedAt: new Date().toISOString() } : o);
      saveOrders(list); orders.value = list;
    };

    /** Complete: set completed, deduct stock, notifiedAt for patient tracking. */
    const completeOrder = (ord) => {
      const inv = getInventory();
      ord.items.forEach((item) => {
        const med = inv.find((m) => m.name === item.name);
        if (med) med.stock = Math.max(0, med.stock - item.qty);
      });
      saveInventory(inv);
      inventory.value = inv;
      const list = getOrders().map(o => o.id === ord.id ? { ...o, status: 'completed', completedAt: new Date().toISOString(), notifiedAt: new Date().toISOString() } : o);
      saveOrders(list); orders.value = list;
    };

    const cancelOrder = (order) => {
      const list = getOrders().map((o) =>
        o.id === order.id ? { ...o, status: 'cancelled' } : o
      );
      saveOrders(list);
      orders.value = list;
    };

    // ── Appointments ───────────────────────────────────────────────────────
    const appointments    = ref(getAppointments());
    const linkedDoctors   = computed(() => getDoctors().filter(d => d.pharmacyId === myPharmacyId.value && d.active));
    const aptsTab         = ref('pending');   // 'pending' | 'completed'

    const pendingAppointments = computed(() =>
      appointments.value
        .filter(a => a.pharmacyId === myPharmacyId.value && a.status === 'scheduled')
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.time.localeCompare(b.time))
    );
    const completedAppointments = computed(() =>
      appointments.value
        .filter(a => a.pharmacyId === myPharmacyId.value && a.status === 'completed')
        .sort((a, b) => new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0))
    );
    /** Keep backwards-compat alias */
    const pharmacyAppointments = pendingAppointments;

    const completeAppointment = (apt) => {
      const list = getAppointments().map(a =>
        a.id === apt.id ? { ...a, status: 'completed', completedAt: new Date().toISOString() } : a
      );
      saveAppointments(list);
      appointments.value = list;
    };

    const cancelAppointment = (apt) => {
      const list = getAppointments().map(a =>
        a.id === apt.id ? { ...a, status: 'cancelled' } : a
      );
      saveAppointments(list);
      appointments.value = list;
    };

    // ── New appointment form ──────────────────────────────────────────────
    const showNewApt    = ref(false);
    const APT_TIMES     = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];
    const blankApt      = () => ({ patientName: '', patientPhone: '', doctorId: '', date: '', time: '', reason: '' });
    const aptForm       = reactive(blankApt());
    const aptFormError  = ref('');

    const saveNewAppointment = () => {
      if (!aptForm.patientName || !aptForm.patientPhone || !aptForm.doctorId || !aptForm.date || !aptForm.time) {
        aptFormError.value = 'Please fill all required fields.'; return;
      }
      aptFormError.value = '';
      const doc = linkedDoctors.value.find(d => d.id === Number(aptForm.doctorId));
      const list = getAppointments();
      list.push({
        id: 'APT-S-' + Date.now() + '-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0'),
        patientName:  aptForm.patientName,
        patientPhone: aptForm.patientPhone,
        doctorId:   Number(aptForm.doctorId),
        doctorName: doc?.name || '',
        date:       aptForm.date,
        time:       aptForm.time,
        reason:     aptForm.reason || 'Consultation',
        status:     'scheduled',
        pharmacyId: myPharmacyId.value,
        createdAt:  new Date().toISOString(),
      });
      saveAppointments(list);
      appointments.value = list;
      Object.assign(aptForm, blankApt());
      showNewApt.value = false;
    };

    /** Returns { text, cls } for the order expiry badge. */
    const orderExpiryBadge = (order) => {
      if (order.source === 'doctor_prescription')
        return { text: 'Valid 30 days', cls: 'bg-green-100 text-green-700' };
      if (order.source === 'staff_pos')
        return null;
      if (!order.expiresAt) return null;
      const hLeft = Math.floor((new Date(order.expiresAt) - Date.now()) / 3600000);
      if (hLeft <= 0)  return { text: 'Expired',            cls: 'bg-red-100 text-red-700'   };
      if (hLeft <= 3)  return { text: `Expires in ${hLeft}h`, cls: 'bg-red-100 text-red-700' };
      return               { text: `Expires in ${hLeft}h`, cls: 'bg-amber-100 text-amber-700' };
    };

    /** Returns { text, cls } for the order source badge. */
    const sourceBadge = (source) => {
      if (source === 'doctor_prescription') return { text: '🩺 Doctor',  cls: 'bg-blue-100 text-blue-700'  };
      if (source === 'patient_cart')        return { text: '🧑 Patient', cls: 'bg-amber-100 text-amber-700' };
      return                                       { text: '🏪 POS',     cls: 'bg-gray-100 text-gray-700'  };
    };

    /** Returns Tailwind classes for a status badge. */
    const statusBadgeCls = (status) => ({
      pending:     'bg-amber-100 text-amber-700',
      in_progress: 'bg-blue-100  text-blue-700',
      completed:   'bg-green-100 text-green-700',
      cancelled:   'bg-gray-100  text-gray-600',
      expired:     'bg-red-100   text-red-700',
    }[status] || 'bg-gray-100 text-gray-700');

    /** Format ISO string as a short localised date-time. */
    const fmtDateTime = (iso) =>
      iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

    // ── Inventory state ────────────────────────────────────────────────────
    const invSearch       = ref('');
    const editingStockId  = ref(null);
    const editingStockVal = ref(0);
    const showAddMed      = ref(false);

    const blankMed = () => ({
      name: '', brand: '', generic: '', category: '',
      price: 0, gst: 5, stock: 0, minStock: 20, expiry: '', supplier: '',
    });
    const medForm = reactive(blankMed());

    const filteredInventory = computed(() => {
      const q = invSearch.value.toLowerCase().trim();
      return inventory.value.filter(
        (m) => !q || m.name.toLowerCase().includes(q) || (m.brand || '').toLowerCase().includes(q)
      );
    });

    /** Tailwind colour class for the stock cell. */
    const stockCellCls = (med) => {
      if (med.stock === 0)              return 'text-red-600 font-bold';
      if (med.stock < med.minStock)     return 'text-red-500 font-semibold';
      if (med.stock < med.minStock * STOCK_WARNING_RATIO) return 'text-amber-600 font-semibold';
      return 'text-green-700 font-semibold';
    };

    const openEditStock = (med) => {
      editingStockId.value  = med.id;
      editingStockVal.value = med.stock;
    };

    const saveStock = (med) => {
      const inv = getInventory();
      const idx = inv.findIndex((m) => m.id === med.id);
      if (idx !== -1) inv[idx].stock = Math.max(0, Number(editingStockVal.value));
      saveInventory(inv);
      inventory.value    = inv;
      editingStockId.value = null;
    };

    const removeMed = (id) => {
      const inv = getInventory().filter((m) => m.id !== id);
      saveInventory(inv);
      inventory.value = inv;
    };

    const addMedicine = () => {
      if (!medForm.name.trim()) return;
      const inv   = getInventory();
      const newId = Math.max(0, ...inv.map((m) => m.id)) + 1;
      inv.push({ ...medForm, id: newId, unitsSold: 0, ingredient: medForm.generic });
      saveInventory(inv);
      inventory.value = inv;
      Object.assign(medForm, blankMed());
      showAddMed.value = false;
    };

    // ── Staff management ───────────────────────────────────────────────────
    const ROLES        = ['pharmacist', 'staff'];
    const roleBadge    = roleBadgeClass;
    const showAddStaff    = ref(false);
    const editingStaff    = ref(null);
    const confirmRemoveId = ref(null);
    const blankStaff  = () => ({ name: '', email: '', password: '', role: 'staff', phone: '', active: true });
    const staffForm   = reactive(blankStaff());

    const openAddForm  = () => { Object.assign(staffForm, blankStaff()); editingStaff.value = null; showAddStaff.value = true; };
    const openEditForm = (m)  => { Object.assign(staffForm, { ...m }); editingStaff.value = m.id; showAddStaff.value = true; };

    const saveStaffMember = () => {
      if (!staffForm.name || !staffForm.email) return;
      if (editingStaff.value === null) {
        const newId  = Math.max(0, ...staffList.value.map((s) => s.id)) + 1;
        const avatar = staffForm.name.split(' ').filter((w) => w).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '??';
        staffList.value.push({ ...staffForm, id: newId, avatar, joinDate: new Date().toISOString().split('T')[0] });
      } else {
        const idx = staffList.value.findIndex((s) => s.id === editingStaff.value);
        if (idx !== -1) Object.assign(staffList.value[idx], staffForm);
      }
      saveStaff(staffList.value);
      showAddStaff.value = false;
    };

    const toggleActive  = (m)  => { m.active = !m.active; saveStaff(staffList.value); };
    const removeMember  = (id) => { confirmRemoveId.value = id; };
    const confirmRemove = ()   => {
      staffList.value = staffList.value.filter((s) => s.id !== confirmRemoveId.value);
      saveStaff(staffList.value);
      confirmRemoveId.value = null;
    };

    // ── Alert computed ─────────────────────────────────────────────────────
    const lowStockAlerts = computed(() => inventory.value.filter((m) => m.stock < m.minStock));
    const expiryAlerts   = computed(() => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 30);
      return inventory.value.filter((m) => new Date(m.expiry) <= cutoff);
    });

    // ── Supplier report ────────────────────────────────────────────────────
    const reportFrom      = ref('');
    const reportTo        = ref('');
    const reportMsg       = ref('');
    const generateReport  = (fmt) => {
      if (!reportFrom.value || !reportTo.value) {
        reportMsg.value = '⚠️ Please select both a start and end date.';
        return;
      }
      reportMsg.value = `✅ ${fmt} report generated for ${reportFrom.value} → ${reportTo.value} (simulated download).`;
    };

    // ── Global KPIs ────────────────────────────────────────────────────────
    const totalRevenue = computed(() =>
      salesData.value.reduce((s, d) => s + d.revenue, 0).toLocaleString('en-IN')
    );
    const totalAlerts  = computed(() => lowStockAlerts.value.length + expiryAlerts.value.length);
    const activeStaff  = computed(() => staffList.value.filter((s) => s.active).length);

    return {
      activePanel, navItems,
      // orders
      pendingOrders, historyOrders, ordersTab,
      expandedOrderId, toggleOrderItems,
      startOrder, completeOrder, cancelOrder,
      orderExpiryBadge, sourceBadge, statusBadgeCls, fmtDateTime,
      // appointments
      appointments, pharmacyAppointments,
      aptsTab, pendingAppointments, completedAppointments,
      completeAppointment, cancelAppointment,
      showNewApt, aptForm, aptFormError, saveNewAppointment,
      linkedDoctors, APT_TIMES,
      // inventory
      inventory, invSearch, filteredInventory,
      editingStockId, editingStockVal, stockCellCls,
      openEditStock, saveStock, removeMed,
      showAddMed, medForm, addMedicine,
      // staff
      staffList, ROLES, roleBadge,
      showAddStaff, editingStaff, confirmRemoveId, staffForm,
      openAddForm, openEditForm, saveStaffMember, toggleActive, removeMember, confirmRemove,
      // alerts
      lowStockAlerts, expiryAlerts, totalAlerts,
      // suppliers
      reportFrom, reportTo, reportMsg, generateReport,
      // kpi
      totalRevenue, activeStaff,
      INVENTORY_PAGE_SIZE, PURCHASE_COST_RATIO,
    };
  },

  /* ═══════════════════════════════════════════════════════════════════════════
     TEMPLATE
     ═══════════════════════════════════════════════════════════════════════════ */
  template: `
    <div class="flex min-h-[calc(100vh-3.5rem)] bg-gray-100">

      <!-- ═══════════════════════════════════════
           LEFT SIDEBAR (desktop)
           ═══════════════════════════════════════ -->
      <aside class="hidden sm:flex flex-col w-52 xl:w-60 bg-white border-r border-gray-200 py-5 px-3 gap-1 shrink-0">
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">Saha Pharmacy</h2>

        <button
          v-for="item in navItems"
          :key="item.id"
          @click="activePanel = item.id"
          :class="[
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500',
            activePanel === item.id ? 'bg-green-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'
          ]"
        >
          <span class="text-lg leading-none">{{ item.icon }}</span>
          <span class="flex-1">{{ item.label }}</span>
          <!-- pending-orders badge -->
          <span v-if="item.id === 'orders' && pendingOrders.length"
            class="ml-auto text-[10px] font-bold bg-amber-400 text-white rounded-full px-1.5 py-0.5 leading-none">
            {{ pendingOrders.length }}
          </span>
          <!-- alerts badge -->
          <span v-if="item.id === 'alerts' && totalAlerts"
            class="ml-auto text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
            {{ totalAlerts }}
          </span>
        </button>

        <!-- Sidebar KPI footer -->
        <div class="mt-auto pt-4 border-t border-gray-100 px-3 space-y-3">
          <div>
            <p class="text-xs text-gray-400">6-mo Revenue</p>
            <p class="text-sm font-bold text-green-700">₹{{ totalRevenue }}</p>
          </div>
          <div>
            <p class="text-xs text-gray-400">Pending Orders</p>
            <p class="text-sm font-bold" :class="pendingOrders.length ? 'text-amber-600' : 'text-gray-700'">{{ pendingOrders.length }}</p>
          </div>
          <div>
            <p class="text-xs text-gray-400">Active Alerts</p>
            <p class="text-sm font-bold" :class="totalAlerts ? 'text-red-600' : 'text-gray-700'">{{ totalAlerts }}</p>
          </div>
        </div>
      </aside>

      <!-- Mobile bottom tab-bar -->
      <div class="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 grid grid-cols-7 no-print">
        <button
          v-for="item in navItems"
          :key="item.id"
          @click="activePanel = item.id"
          :class="['relative flex flex-col items-center py-2 gap-0.5 text-[10px] font-medium', activePanel === item.id ? 'text-green-600' : 'text-gray-500']"
        >
          <span class="text-xl">{{ item.icon }}</span>
          {{ item.short }}
          <span v-if="item.id === 'orders' && pendingOrders.length"
            class="absolute top-1 right-2 w-4 h-4 bg-amber-400 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {{ pendingOrders.length }}
          </span>
          <span v-if="item.id === 'alerts' && totalAlerts"
            class="absolute top-1 right-2 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {{ totalAlerts }}
          </span>
        </button>
      </div>

      <!-- ═══════════════════════════════════════
           MAIN CONTENT
           ═══════════════════════════════════════ -->
      <main class="flex-1 overflow-y-auto px-4 sm:px-6 py-5 pb-24 sm:pb-6">


        <!-- ──────────────────────────────────────
             PANEL 1 · OVERVIEW
             ────────────────────────────────────── -->
        <section v-if="activePanel === 'overview'">
          <h1 class="text-2xl font-bold text-gray-900 mb-5">📊 Saha Pharmacy Dashboard</h1>

          <!-- KPI cards -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p class="text-xs text-gray-400 font-medium">6-mo Revenue</p>
              <p class="text-2xl font-bold text-green-700 mt-1">₹{{ totalRevenue }}</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p class="text-xs text-gray-400 font-medium">Pending Orders</p>
              <p class="text-2xl font-bold mt-1" :class="pendingOrders.length ? 'text-amber-600' : 'text-gray-700'">{{ pendingOrders.length }}</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p class="text-xs text-gray-400 font-medium">Active Staff</p>
              <p class="text-2xl font-bold text-blue-600 mt-1">{{ activeStaff }}</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p class="text-xs text-gray-400 font-medium">Active Alerts</p>
              <p class="text-2xl font-bold mt-1" :class="totalAlerts ? 'text-red-600' : 'text-gray-700'">{{ totalAlerts }}</p>
            </div>
          </div>

          <!-- Recent orders & stock summary -->
          <div class="grid lg:grid-cols-2 gap-5">

            <!-- Recent orders (last 5) -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-200">
              <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 class="text-sm font-bold text-gray-700">Recent Orders</h2>
                <button @click="activePanel='orders'" class="text-xs text-green-600 hover:underline">View all</button>
              </div>
              <div v-if="!pendingOrders.length && !historyOrders.length" class="px-5 py-8 text-center text-sm text-gray-400">
                No orders yet.
              </div>
              <ul v-else class="divide-y divide-gray-100">
                <li
                  v-for="o in [...pendingOrders, ...historyOrders].slice(0, 5)"
                  :key="o.id"
                  class="px-5 py-3 flex items-center justify-between gap-3"
                >
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">{{ o.patientName || o.doctorName || 'Unknown' }}</p>
                    <p class="text-xs text-gray-400">{{ fmtDateTime(o.createdAt) }}</p>
                  </div>
                  <span :class="['text-xs px-2 py-0.5 rounded-full font-semibold shrink-0', statusBadgeCls(o.status)]">
                    {{ o.status }}
                  </span>
                </li>
              </ul>
            </div>

            <!-- Stock summary -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-col gap-4">
              <h2 class="text-sm font-bold text-gray-700">Stock Health</h2>
              <div class="flex items-center gap-4">
                <div class="flex-1 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-red-600">{{ lowStockAlerts.length }}</p>
                  <p class="text-xs text-red-500 mt-1">Low Stock SKUs</p>
                </div>
                <div class="flex-1 bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-amber-600">{{ expiryAlerts.length }}</p>
                  <p class="text-xs text-amber-600 mt-1">Near Expiry</p>
                </div>
              </div>
              <button
                v-if="totalAlerts"
                @click="activePanel='alerts'"
                class="mt-auto text-sm text-green-600 hover:underline font-medium"
              >
                Review alerts →
              </button>
              <p v-else class="text-sm text-green-700 font-medium">✅ All stock levels healthy!</p>
            </div>
          </div>
        </section>


        <!-- ──────────────────────────────────────
             PANEL 2 · ORDERS
             ────────────────────────────────────── -->
        <section v-if="activePanel === 'orders'">
          <h1 class="text-2xl font-bold text-gray-900 mb-5">📋 Orders</h1>

          <!-- Sub-tabs -->
          <div class="flex gap-1 mb-5 bg-white rounded-xl border border-gray-200 p-1 w-fit">
            <button
              @click="ordersTab = 'pending'"
              :class="['px-4 py-1.5 rounded-lg text-sm font-medium transition', ordersTab === 'pending' ? 'bg-green-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100']"
            >
              Pending
              <span v-if="pendingOrders.length" class="ml-1 bg-amber-400 text-white text-xs rounded-full px-1.5 py-0.5">{{ pendingOrders.length }}</span>
            </button>
            <button
              @click="ordersTab = 'history'"
              :class="['px-4 py-1.5 rounded-lg text-sm font-medium transition', ordersTab === 'history' ? 'bg-green-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100']"
            >
              History
            </button>
          </div>

          <!-- PENDING orders -->
          <div v-if="ordersTab === 'pending'">
            <div v-if="!pendingOrders.length" class="bg-white rounded-2xl border border-gray-200 px-6 py-12 text-center text-gray-400">
              🎉 No pending orders right now.
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="o in pendingOrders"
                :key="o.id"
                class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <!-- Patient info -->
                  <div class="min-w-0">
                    <p class="font-semibold text-gray-900">{{ o.patientName || o.doctorName || 'Unknown' }}</p>
                    <p v-if="o.patientPhone" class="text-xs text-gray-400">{{ o.patientPhone }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">{{ fmtDateTime(o.createdAt) }}</p>
                  </div>
                  <!-- Badges -->
                  <div class="flex flex-wrap gap-2 shrink-0">
                    <span :class="['text-xs px-2 py-0.5 rounded-full font-semibold', sourceBadge(o.source).cls]">
                      {{ sourceBadge(o.source).text }}
                    </span>
                    <span
                      v-if="orderExpiryBadge(o)"
                      :class="['text-xs px-2 py-0.5 rounded-full font-semibold', orderExpiryBadge(o).cls]"
                    >
                      {{ orderExpiryBadge(o).text }}
                    </span>
                  </div>
                </div>

                <!-- Items collapsible -->
                <div class="mt-3">
                  <button
                    @click="toggleOrderItems(o.id)"
                    class="text-xs text-green-600 hover:underline font-medium"
                  >
                    {{ expandedOrderId === o.id ? '▲ Hide items' : '▼ Show ' + (o.items ? o.items.length : 0) + ' item(s)' }}
                  </button>
                  <ul v-if="expandedOrderId === o.id" class="mt-2 space-y-1">
                    <li
                      v-for="(item, idx) in o.items"
                      :key="idx"
                      class="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-1.5"
                    >
                      <span class="text-gray-700">{{ item.name }}</span>
                      <span class="text-gray-400">×{{ item.qty }} · ₹{{ item.price }}</span>
                    </li>
                  </ul>
                </div>

                <!-- Totals + actions -->
                <div class="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100">
                  <div class="flex items-center gap-3">
                    <p class="text-sm font-bold text-gray-800">Total: ₹{{ o.finalTotal ?? o.subtotal ?? 0 }}</p>
                    <span :class="['text-xs px-2 py-0.5 rounded-full font-semibold', statusBadgeCls(o.status)]">{{ o.status }}</span>
                  </div>
                  <div class="flex gap-2">
                    <button v-if="o.status === 'pending'"
                      @click="startOrder(o)"
                      class="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition"
                    >▶ Start</button>
                    <button v-if="o.status === 'in_progress'"
                      @click="completeOrder(o)"
                      class="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition"
                    >✓ Complete</button>
                    <button
                      @click="cancelOrder(o)"
                      class="flex items-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold px-4 py-2 rounded-xl transition"
                    >✗ Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- HISTORY orders -->
          <div v-if="ordersTab === 'history'">
            <div v-if="!historyOrders.length" class="bg-white rounded-2xl border border-gray-200 px-6 py-12 text-center text-gray-400">
              No order history yet.
            </div>
            <div v-else class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead class="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th class="px-4 py-3 text-left">Patient / Doctor</th>
                    <th class="px-4 py-3 text-left">Source</th>
                    <th class="px-4 py-3 text-right">Total</th>
                    <th class="px-4 py-3 text-left">Date</th>
                    <th class="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="o in historyOrders" :key="o.id" class="hover:bg-gray-50">
                    <td class="px-4 py-3 font-medium text-gray-900">{{ o.patientName || o.doctorName || '—' }}</td>
                    <td class="px-4 py-3">
                      <span :class="['text-xs px-2 py-0.5 rounded-full font-semibold', sourceBadge(o.source).cls]">
                        {{ sourceBadge(o.source).text }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-right font-semibold text-gray-800">₹{{ o.finalTotal ?? o.subtotal ?? 0 }}</td>
                    <td class="px-4 py-3 text-gray-400 text-xs">{{ fmtDateTime(o.createdAt) }}</td>
                    <td class="px-4 py-3 text-center">
                      <span :class="['text-xs px-2 py-0.5 rounded-full font-semibold', statusBadgeCls(o.status)]">
                        {{ o.status }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>


        <!-- ──────────────────────────────────────
             PANEL · APPOINTMENTS
             ────────────────────────────────────── -->
        <section v-if="activePanel === 'appointments'">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h1 class="text-2xl font-bold text-gray-900">📅 Appointments</h1>
            <button @click="showNewApt=!showNewApt"
              class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition">
              + New Appointment
            </button>
          </div>

          <!-- New appointment form -->
          <div v-if="showNewApt" class="bg-white rounded-2xl border border-blue-200 shadow-sm p-5 mb-5">
            <h2 class="text-sm font-bold text-gray-800 mb-4">📝 Book New Appointment</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input v-model="aptForm.patientName" placeholder="Patient name *"
                class="border-2 border-gray-200 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input v-model="aptForm.patientPhone" placeholder="Patient phone *" type="tel"
                class="border-2 border-gray-200 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <select v-model="aptForm.doctorId"
                class="border-2 border-gray-200 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm outline-none">
                <option value="">Select doctor *</option>
                <option v-for="doc in linkedDoctors" :key="doc.id" :value="doc.id">{{ doc.name }} · {{ doc.specialty }}</option>
              </select>
              <input v-model="aptForm.date" type="date"
                class="border-2 border-gray-200 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <select v-model="aptForm.time"
                class="border-2 border-gray-200 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm outline-none">
                <option value="">Select time *</option>
                <option v-for="t in APT_TIMES" :key="t" :value="t">{{ t }}</option>
              </select>
              <input v-model="aptForm.reason" placeholder="Reason for visit"
                class="border-2 border-gray-200 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm outline-none" />
            </div>
            <div v-if="aptFormError" class="mt-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{{ aptFormError }}</div>
            <div class="flex gap-3 mt-4">
              <button @click="showNewApt=false" class="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 text-sm">Cancel</button>
              <button @click="saveNewAppointment" class="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition">Confirm Booking</button>
            </div>
          </div>

          <!-- Tabs: Pending / Completed -->
          <div class="flex gap-1 mb-4 bg-white rounded-xl border border-gray-200 p-1 w-fit">
            <button @click="aptsTab='pending'"
              :class="['px-4 py-2 rounded-lg text-sm font-semibold transition',
                aptsTab==='pending' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700']">
              ⏳ Pending
              <span v-if="pendingAppointments.length" class="ml-1 text-[11px] bg-white/30 px-1.5 py-0.5 rounded-full">{{ pendingAppointments.length }}</span>
            </button>
            <button @click="aptsTab='completed'"
              :class="['px-4 py-2 rounded-lg text-sm font-semibold transition',
                aptsTab==='completed' ? 'bg-green-600 text-white' : 'text-gray-500 hover:text-gray-700']">
              ✅ Completed
              <span v-if="completedAppointments.length" class="ml-1 text-[11px] bg-white/20 px-1.5 py-0.5 rounded-full">{{ completedAppointments.length }}</span>
            </button>
          </div>

          <!-- Pending appointments -->
          <div v-if="aptsTab === 'pending'">
            <div v-if="pendingAppointments.length === 0" class="bg-white rounded-2xl border border-gray-200 px-6 py-12 text-center text-gray-400">
              <div class="text-5xl mb-3">📅</div>
              <p class="text-sm">No pending appointments.</p>
            </div>
            <div v-else class="space-y-3">
              <div v-for="apt in pendingAppointments" :key="apt.id"
                class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-start gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap mb-1">
                    <p class="font-semibold text-gray-900">{{ apt.patientName }}</p>
                    <span class="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">scheduled</span>
                  </div>
                  <p class="text-xs text-gray-500">{{ apt.patientPhone }}</p>
                  <p class="text-xs text-blue-600 mt-0.5">{{ apt.reason }}</p>
                  <p class="text-xs text-gray-400 mt-0.5">🩺 {{ apt.doctorName }} · ⏰ {{ apt.time }} · 📅 {{ apt.date }}</p>
                </div>
                <div class="flex gap-2 flex-wrap shrink-0">
                  <button @click="completeAppointment(apt)"
                    class="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold px-3 py-1.5 rounded-lg transition">
                    ✅ Done
                  </button>
                  <button @click="cancelAppointment(apt)"
                    class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold px-3 py-1.5 rounded-lg transition">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Completed appointments -->
          <div v-if="aptsTab === 'completed'">
            <div v-if="completedAppointments.length === 0" class="bg-white rounded-2xl border border-gray-200 px-6 py-12 text-center text-gray-400">
              <div class="text-5xl mb-3">✅</div>
              <p class="text-sm">No completed appointments yet.</p>
            </div>
            <div v-else class="space-y-3">
              <div v-for="apt in completedAppointments" :key="apt.id"
                class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-start gap-4 opacity-80">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap mb-1">
                    <p class="font-semibold text-gray-700">{{ apt.patientName }}</p>
                    <span class="text-xs px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">completed</span>
                  </div>
                  <p class="text-xs text-gray-500">{{ apt.patientPhone }}</p>
                  <p class="text-xs text-gray-400 mt-0.5">🩺 {{ apt.doctorName }} · ⏰ {{ apt.time }} · 📅 {{ apt.date }}</p>
                  <p v-if="apt.completedAt" class="text-xs text-green-600 mt-0.5">✅ Completed {{ fmtDateTime(apt.completedAt) }}</p>
                </div>
              </div>
            </div>
          </div>
        </section>


        <!-- ──────────────────────────────────────
             PANEL 3 · INVENTORY
             ────────────────────────────────────── -->
        <section v-if="activePanel === 'inventory'">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h1 class="text-2xl font-bold text-gray-900">📦 Inventory</h1>
            <button
              @click="showAddMed = true"
              class="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >+ Add Medicine</button>
          </div>

          <!-- Search -->
          <div class="mb-4">
            <input
              v-model="invSearch"
              type="search"
              placeholder="Search medicine or brand…"
              class="w-full sm:w-72 border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none bg-white"
            />
          </div>

          <!-- Table -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th class="px-4 py-3 text-left">Medicine</th>
                  <th class="px-4 py-3 text-left">Brand</th>
                  <th class="px-4 py-3 text-left">Category</th>
                  <th class="px-4 py-3 text-right">Stock</th>
                  <th class="px-4 py-3 text-right">Min</th>
                  <th class="px-4 py-3 text-right">Price</th>
                  <th class="px-4 py-3 text-right">GST</th>
                  <th class="px-4 py-3 text-left">Expiry</th>
                  <th class="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="med in filteredInventory.slice(0, INVENTORY_PAGE_SIZE)" :key="med.id" class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-medium text-gray-900 max-w-[12rem] truncate">{{ med.name }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ med.brand }}</td>
                  <td class="px-4 py-3 text-gray-500">{{ med.category }}</td>
                  <!-- Stock cell with inline edit -->
                  <td class="px-4 py-3 text-right">
                    <template v-if="editingStockId === med.id">
                      <input
                        v-model.number="editingStockVal"
                        type="number" min="0"
                        class="w-20 border-2 border-green-400 rounded-lg px-2 py-1 text-sm text-right outline-none"
                        @keyup.enter="saveStock(med)"
                        @keyup.esc="editingStockId = null"
                      />
                    </template>
                    <template v-else>
                      <span :class="stockCellCls(med)">{{ med.stock }}</span>
                    </template>
                  </td>
                  <td class="px-4 py-3 text-right text-gray-400">{{ med.minStock }}</td>
                  <td class="px-4 py-3 text-right font-medium text-gray-800">₹{{ med.price }}</td>
                  <td class="px-4 py-3 text-right text-gray-500">{{ med.gst }}%</td>
                  <td class="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                    {{ new Date(med.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }}
                  </td>
                  <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <template v-if="editingStockId === med.id">
                        <button @click="saveStock(med)"
                          class="text-xs text-green-600 hover:text-green-800 font-bold px-2 py-1 rounded hover:bg-green-50">Save</button>
                        <button @click="editingStockId = null"
                          class="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">✕</button>
                      </template>
                      <template v-else>
                        <button @click="openEditStock(med)"
                          class="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50">Edit Stock</button>
                        <button @click="removeMed(med.id)"
                          class="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50">Remove</button>
                      </template>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="filteredInventory.length > INVENTORY_PAGE_SIZE" class="px-5 py-2 text-xs text-gray-400 border-t border-gray-100">
              Showing {{ INVENTORY_PAGE_SIZE }} of {{ filteredInventory.length }} results — refine your search to see more.
            </div>
            <div v-if="!filteredInventory.length" class="px-5 py-8 text-center text-sm text-gray-400">
              No medicines match "{{ invSearch }}".
            </div>
          </div>

          <!-- Add Medicine Modal -->
          <Transition name="fade">
            <div
              v-if="showAddMed"
              class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
              @click.self="showAddMed = false"
            >
              <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                <h2 class="text-lg font-bold text-gray-900 mb-4">Add New Medicine</h2>
                <div class="space-y-3">
                  <div class="grid grid-cols-2 gap-3">
                    <label class="block col-span-2">
                      <span class="text-xs font-medium text-gray-600">Medicine Name *</span>
                      <input v-model="medForm.name" type="text" placeholder="e.g. Paracetamol 500mg"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
                    </label>
                    <label class="block">
                      <span class="text-xs font-medium text-gray-600">Brand</span>
                      <input v-model="medForm.brand" type="text" placeholder="e.g. Crocin"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
                    </label>
                    <label class="block">
                      <span class="text-xs font-medium text-gray-600">Generic Name</span>
                      <input v-model="medForm.generic" type="text" placeholder="e.g. Paracetamol"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
                    </label>
                    <label class="block">
                      <span class="text-xs font-medium text-gray-600">Category</span>
                      <input v-model="medForm.category" type="text" placeholder="e.g. Analgesic"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
                    </label>
                    <label class="block">
                      <span class="text-xs font-medium text-gray-600">Supplier</span>
                      <input v-model="medForm.supplier" type="text" placeholder="e.g. HealthCo"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
                    </label>
                    <label class="block">
                      <span class="text-xs font-medium text-gray-600">Price (₹)</span>
                      <input v-model.number="medForm.price" type="number" min="0"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
                    </label>
                    <label class="block">
                      <span class="text-xs font-medium text-gray-600">GST (%)</span>
                      <input v-model.number="medForm.gst" type="number" min="0" max="28"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
                    </label>
                    <label class="block">
                      <span class="text-xs font-medium text-gray-600">Stock (units)</span>
                      <input v-model.number="medForm.stock" type="number" min="0"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
                    </label>
                    <label class="block">
                      <span class="text-xs font-medium text-gray-600">Min Stock</span>
                      <input v-model.number="medForm.minStock" type="number" min="0"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none" />
                    </label>
                    <label class="block col-span-2">
                      <span class="text-xs font-medium text-gray-600">Expiry Date</span>
                      <input v-model="medForm.expiry" type="date"
                        class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2 text-sm outline-none bg-white" />
                    </label>
                  </div>
                </div>
                <div class="flex gap-3 mt-5">
                  <button @click="showAddMed = false"
                    class="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition">Cancel</button>
                  <button @click="addMedicine" :disabled="!medForm.name.trim()"
                    class="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition">
                    Add Medicine
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </section>


        <!-- ──────────────────────────────────────
             PANEL 4 · STAFF
             ────────────────────────────────────── -->
        <section v-if="activePanel === 'staff'">
          <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
            <h1 class="text-2xl font-bold text-gray-900">👥 Staff Management</h1>
            <button
              @click="openAddForm"
              class="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >+ Add Staff Member</button>
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
                <tr v-for="member in staffList" :key="member.id" :class="['hover:bg-gray-50', !member.active ? 'opacity-60' : '']">
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      <span class="w-8 h-8 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {{ member.avatar }}
                      </span>
                      <span class="font-medium text-gray-900">{{ member.name }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <span :class="['text-xs px-2 py-0.5 rounded font-semibold', roleBadge(member.role)]">{{ member.role }}</span>
                  </td>
                  <td class="px-4 py-3 text-gray-600">{{ member.email }}</td>
                  <td class="px-4 py-3 text-gray-500">{{ member.phone }}</td>
                  <td class="px-4 py-3 text-gray-400 text-xs">{{ member.joinDate }}</td>
                  <td class="px-4 py-3 text-center">
                    <button
                      @click="toggleActive(member)"
                      :class="['text-xs font-semibold px-3 py-1 rounded-full transition', member.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200']"
                    >{{ member.active ? 'Active' : 'Inactive' }}</button>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-2">
                      <button @click="openEditForm(member)" class="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition">Edit</button>
                      <button @click="removeMember(member.id)" class="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition">Remove</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Add / Edit Staff Modal -->
          <Transition name="fade">
            <div v-if="showAddStaff" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="showAddStaff = false">
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
                  <button @click="showAddStaff = false" class="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition">Cancel</button>
                  <button @click="saveStaffMember" :disabled="!staffForm.name || !staffForm.email"
                    class="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition">
                    {{ editingStaff === null ? 'Add Staff' : 'Save Changes' }}
                  </button>
                </div>
              </div>
            </div>
          </Transition>

          <!-- Remove-staff confirmation modal -->
          <Transition name="fade">
            <div v-if="confirmRemoveId !== null" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="confirmRemoveId = null">
              <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
                <div class="text-5xl mb-3">⚠️</div>
                <h2 class="text-lg font-bold text-gray-900 mb-1">Remove Staff Member?</h2>
                <p class="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
                <div class="flex gap-3">
                  <button @click="confirmRemoveId = null" class="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition">Cancel</button>
                  <button @click="confirmRemove" class="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition">Remove</button>
                </div>
              </div>
            </div>
          </Transition>
        </section>


        <!-- ──────────────────────────────────────
             PANEL 5 · ALERTS
             ────────────────────────────────────── -->
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

          <!-- Low stock -->
          <div class="mb-6">
            <h2 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>📦</span> Low Stock ({{ lowStockAlerts.length }})
            </h2>
            <div v-if="!lowStockAlerts.length" class="text-sm text-gray-400 bg-white rounded-xl px-4 py-4 border border-gray-100">No low-stock items.</div>
            <div v-else class="space-y-2">
              <StockAlertCard
                v-for="med in lowStockAlerts" :key="med.id"
                :medicine="med.name"
                type="low-stock"
                :detail="med.stock + ' units left (min threshold: ' + med.minStock + ')'"
              />
            </div>
          </div>

          <!-- Near expiry -->
          <div>
            <h2 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>⏰</span> Near Expiry / Expired ({{ expiryAlerts.length }})
            </h2>
            <div v-if="!expiryAlerts.length" class="text-sm text-gray-400 bg-white rounded-xl px-4 py-4 border border-gray-100">No items nearing expiry.</div>
            <div v-else class="space-y-2">
              <StockAlertCard
                v-for="med in expiryAlerts" :key="med.id"
                :medicine="med.name"
                type="expiry"
                :detail="'Expires on ' + new Date(med.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })"
              />
            </div>
          </div>
        </section>


        <!-- ──────────────────────────────────────
             PANEL 6 · SUPPLIERS
             ────────────────────────────────────── -->
        <section v-if="activePanel === 'suppliers'">
          <h1 class="text-2xl font-bold text-gray-900 mb-5">🚚 Supplier Reporting</h1>

          <!-- Date filters + export buttons -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-5">
            <h2 class="text-sm font-bold text-gray-700 mb-4">Generate Purchase Report</h2>
            <div class="grid sm:grid-cols-2 gap-4 mb-4">
              <label class="block">
                <span class="text-xs font-medium text-gray-600">From Date</span>
                <input v-model="reportFrom" type="date"
                  class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2.5 text-sm outline-none bg-white" />
              </label>
              <label class="block">
                <span class="text-xs font-medium text-gray-600">To Date</span>
                <input v-model="reportTo" type="date"
                  class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2.5 text-sm outline-none bg-white" />
              </label>
            </div>

            <div v-if="reportMsg" :class="['rounded-xl px-4 py-3 text-sm font-medium mb-4', reportMsg.startsWith('⚠️') ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-green-50 border border-green-200 text-green-800']">
              {{ reportMsg }}
            </div>

            <div class="flex flex-wrap gap-3">
              <button @click="generateReport('PDF')"
                class="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
                <span>📄</span> Export PDF
              </button>
              <button @click="generateReport('CSV')"
                class="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400">
                <span>📊</span> Export CSV
              </button>
            </div>
          </div>

          <!-- Preview table -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
            <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 class="text-sm font-bold text-gray-700">Purchase Quantity Summary (All-Time Preview)</h2>
              <span class="text-xs text-gray-400">Mock data — filters apply on export</span>
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
                  <td class="px-5 py-3 text-right font-semibold text-green-700">₹{{ ((med.stock + med.unitsSold) * med.price * PURCHASE_COST_RATIO).toFixed(0) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

      </main>
    </div>
  `,
});
