/**
 * Navbar.js – Top navigation bar (redesigned)
 *
 * Props:
 *   currentView   – 'PatientHome' | 'StaffPos' | 'AdminDashboard' | 'PharmacyDashboard' | 'LoginPage'
 *   staffUser     – null when guest/patient, or { name, role, avatar } when staff auth
 *   patientBridge – shared reactive bridge object (user, cartCount, city, activeTab, …)
 *
 * Emits:
 *   staff-logout  – staff logout button clicked
 *
 * Layout:
 *   Mobile:  [Brand] [City▾]             [Account]
 *   Desktop: [Brand] [City▾] [Search──────────] [📷] [🛒] [Account]
 */
import { defineComponent, ref, computed, inject } from 'vue';
import { roleBadgeClass } from '../app.js';

const CITIES = [
  'Kolkata','Mumbai','Delhi','Bangalore','Hyderabad',
  'Chennai','Pune','Ahmedabad','Jaipur','Surat',
  'Lucknow','Kochi','Chandigarh','Bhopal','Indore',
];

export default defineComponent({
  name: 'Navbar',

  props: {
    currentView:   { type: String, required: true },
    staffUser:     { type: Object, default: null },
    patientBridge: { type: Object, default: null },
  },

  emits: ['staff-logout'],

  setup(props, { emit }) {
    const isPatient = computed(() => props.currentView === 'PatientHome');

    // ── City dropdown ──────────────────────────────────────────────────
    const showCityDD = ref(false);
    const gpsMsg     = ref('');  // inline GPS feedback toast

    const selectCity = (city) => {
      if (props.patientBridge) props.patientBridge.city = city;
      localStorage.setItem('op_city', city);
      showCityDD.value = false;
    };

    const useGps = () => {
      gpsMsg.value = '';
      if (!navigator.geolocation) {
        gpsMsg.value = '⚠️ Geolocation not supported by your browser.';
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          showCityDD.value = false;
          // Phase 2: replace with reverse-geocode API call.
          gpsMsg.value = `📍 GPS (${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}) detected. Reverse geocoding coming in Phase 2.`;
          setTimeout(() => { gpsMsg.value = ''; }, 4000);
        },
        () => {
          gpsMsg.value = '⚠️ Location access denied. Please enable it in browser settings.';
          setTimeout(() => { gpsMsg.value = ''; }, 4000);
        },
      );
    };

    // Close dropdown on outside click
    const closeCityDD = (e) => { showCityDD.value = false; };

    // ── Desktop search ─────────────────────────────────────────────────
    const desktopSearch = ref('');
    const triggerSearch = () => {
      if (!props.patientBridge) return;
      props.patientBridge.searchQuery = desktopSearch.value;
      if (desktopSearch.value) props.patientBridge.activeTab = 'find';
    };

    // ── Account / Me helpers ───────────────────────────────────────────
    const onAccountClick = () => {
      if (!props.patientBridge) return;
      if (props.patientBridge.user) {
        props.patientBridge.activeTab = 'me';
      } else {
        // Signal PatientHome to open login modal by using a special value
        props.patientBridge.activeTab = 'login';
      }
    };

    const getInitials = (name) =>
      (name || '').split(' ').filter(w => w.length > 0).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';

    const roleBadge = computed(() => props.staffUser ? roleBadgeClass(props.staffUser.role) : '');

    const currentCity = computed(() => props.patientBridge ? props.patientBridge.city : 'Kolkata');
    const cartCount   = computed(() => props.patientBridge ? props.patientBridge.cartCount : 0);
    const patientUser = computed(() => props.patientBridge ? props.patientBridge.user : null);

    return {
      CITIES, isPatient,
      showCityDD, selectCity, useGps, closeCityDD, gpsMsg,
      desktopSearch, triggerSearch,
      onAccountClick, getInitials,
      roleBadge, currentCity, cartCount, patientUser,
    };
  },

  template: `
    <nav class="relative bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm no-print">
      <div class="max-w-7xl mx-auto px-3 sm:px-5">
        <div class="flex items-center h-14 gap-2 sm:gap-3">

          <!-- ── Brand (click → patient home) ── -->
          <button
            @click="patientBridge && (patientBridge.activeTab = 'home')"
            class="flex items-center gap-1.5 shrink-0 focus:outline-none"
            :title="isPatient ? 'Go to Home' : 'OnePharma'"
          >
            <span class="text-2xl leading-none">💊</span>
            <span class="font-extrabold text-green-700 tracking-tight text-base sm:text-lg leading-none">OnePharma</span>
          </button>

          <!-- ── City / Location selector ── -->
          <div v-if="isPatient" class="relative shrink-0">
            <!-- Backdrop to close dropdown on outside click -->
            <div v-if="showCityDD" class="fixed inset-0 z-40" @click="showCityDD = false" />

            <button
              @click="showCityDD = !showCityDD"
              class="relative z-50 flex items-center gap-1 text-xs sm:text-sm text-gray-600 hover:text-green-700 font-medium bg-gray-50 hover:bg-green-50 border border-gray-200 hover:border-green-300 px-2 py-1 rounded-lg transition"
              title="Change city"
            >
              <span class="hidden sm:inline">📍</span>
              <span>{{ currentCity }}</span>
              <span class="text-gray-400 text-xs">▾</span>
            </button>

            <!-- City dropdown panel -->
            <Transition name="fade">
              <div v-if="showCityDD"
                class="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 w-52 p-2">
                <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-2 mb-1">Select City</p>
                <button
                  v-for="city in CITIES" :key="city"
                  @click="selectCity(city)"
                  :class="['w-full text-left px-3 py-1.5 rounded-xl text-sm transition', city === currentCity ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-700 hover:bg-gray-50']"
                >
                  {{ city }}
                </button>
                <div class="border-t border-gray-100 mt-1 pt-1">
                  <button
                    @click="useGps"
                    class="w-full text-left px-3 py-1.5 rounded-xl text-sm text-blue-600 hover:bg-blue-50 transition flex items-center gap-2"
                  >
                    <span>📡</span> Use My Location (GPS)
                  </button>
                </div>
              </div>
            </Transition>
          </div>

          <!-- ── Desktop: search bar (patient portal only) ── -->
          <div v-if="isPatient" class="hidden md:flex flex-1 items-center gap-2 min-w-0">
            <div class="relative flex-1">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">🔍</span>
              <input
                v-model="desktopSearch"
                type="text"
                placeholder="Search medicines, brands, categories…"
                @keyup.enter="triggerSearch"
                @input="triggerSearch"
                class="w-full pl-9 pr-4 py-2 border-2 border-gray-200 focus:border-green-500 rounded-xl text-sm outline-none bg-gray-50 focus:bg-white transition"
                autocomplete="off"
              />
            </div>
            <!-- Scan Rx button (desktop, adjacent to search) -->
            <button
              @click="patientBridge && (patientBridge.showScanner = true)"
              class="shrink-0 flex items-center gap-1.5 bg-green-50 hover:bg-green-100 border border-green-200 hover:border-green-400 text-green-700 font-semibold text-sm px-3 py-2 rounded-xl transition"
              title="Scan Prescription"
            >
              <span>📷</span>
              <span class="hidden lg:inline">Scan Rx</span>
            </button>
          </div>

          <!-- ── Spacer (mobile: push right side to end) ── -->
          <div v-if="isPatient" class="flex-1 md:hidden" />
          <div v-if="!isPatient" class="flex-1" />

          <!-- ── Patient portal: Cart + Account ── -->
          <template v-if="isPatient">
            <!-- Cart icon with badge -->
            <button
              v-if="patientUser"
              @click="patientBridge.activeTab = 'cart'"
              class="relative hidden sm:flex items-center justify-center w-9 h-9 rounded-xl hover:bg-gray-100 transition text-gray-600 hover:text-green-700"
              title="My Cart"
            >
              <span class="text-xl">🛒</span>
              <span
                v-if="cartCount > 0"
                class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
              >
                {{ cartCount > 9 ? '9+' : cartCount }}
              </span>
            </button>

            <!-- Account / Me button -->
            <button
              @click="onAccountClick"
              class="flex items-center gap-1.5 hover:bg-gray-100 rounded-xl px-2 py-1.5 transition"
              :title="patientUser ? patientUser.name : 'Login'"
            >
              <div
                v-if="patientUser"
                class="w-7 h-7 rounded-full bg-green-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0"
              >
                {{ getInitials(patientUser.name) }}
              </div>
              <span v-else class="text-sm font-semibold text-green-700">Login</span>
              <div v-if="patientUser" class="hidden sm:block text-left">
                <p class="text-xs font-semibold text-gray-800 leading-tight max-w-[100px] truncate">{{ patientUser.name }}</p>
                <p class="text-[10px] text-gray-400 leading-tight">
                  {{ patientUser.phoneVerified ? '✓ Verified' : '⚠ Unverified' }}
                </p>
              </div>
            </button>
          </template>

          <!-- ── Staff / Admin portal: user chip + logout ── -->
          <template v-else-if="staffUser">
            <div class="flex items-center gap-2">
              <span :class="['w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0',
                staffUser.role==='app_admin' ? 'bg-purple-700' : staffUser.role==='pharmacist' ? 'bg-indigo-600' : 'bg-green-600']">
                {{ staffUser.avatar }}
              </span>
              <div class="hidden sm:block text-left">
                <p class="text-xs font-semibold text-gray-800 leading-tight">{{ staffUser.name }}</p>
                <span :class="['text-[10px] px-1.5 py-0.5 rounded font-medium', roleBadge]">
                  {{ staffUser.role === 'app_admin' ? 'App Admin' : staffUser.role === 'pharmacist' ? 'Pharmacy Owner' : 'Staff' }}
                </span>
              </div>
              <button
                @click="$emit('staff-logout')"
                class="ml-1 text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded"
                title="Log out"
              >
                Logout
              </button>
            </div>
          </template>

          <!-- ── Guest in staff/login view ── -->
          <template v-else-if="!isPatient">
            <span class="hidden sm:inline text-xs text-gray-400">
              Go to <code class="bg-gray-100 px-1 rounded">#pharmacy</code>,
              <code class="bg-gray-100 px-1 rounded">#staff</code> or
              <code class="bg-gray-100 px-1 rounded">#admin</code>
            </span>
          </template>

        </div>
      </div>

      <!-- GPS feedback toast (non-blocking, auto-dismisses) -->
      <Transition name="slide-up">
        <div v-if="gpsMsg"
          class="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-gray-800 text-white text-xs font-medium px-4 py-2 rounded-xl shadow-lg whitespace-nowrap z-50 max-w-xs text-center">
          {{ gpsMsg }}
        </div>
      </Transition>
    </nav>
  `,
});
