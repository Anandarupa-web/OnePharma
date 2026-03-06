/**
 * PatientHome.js – Patient Portal (public, no login required)
 *
 * Mobile-first with a sticky 5-tab bottom navigation bar.
 *
 * Tabs:
 *  1. find         – Global cross-pharmacy medicine search (shows all nearby pharmacies)
 *  2. pharmacies   – Browse nearby pharmacies; tap one to explore its full inventory
 *  3. scanner      – Opens ScannerModal (camera prescription upload)
 *  4. dosage       – Digital dosage slip cards
 *  5. appointments – 15-minute slot appointment booking
 */
import { defineComponent, ref, computed } from 'vue';
import ScannerModal from '../components/ScannerModal.js';
import {
  getInventory, getDosageSlips, getSlots, saveSlots,
  getPharmacies, getPharmacyInv,
} from '../app.js';

export default defineComponent({
  name: 'PatientHome',

  components: { ScannerModal },

  setup() {
    // ── Core state ─────────────────────────────────────────────────────────
    const activeTab     = ref('find');
    const showScanner   = ref(false);
    const inventory     = ref(getInventory());      // master medicine catalogue
    const pharmacies    = ref(getPharmacies());     // nearby pharmacy list
    const pharmacyInv   = ref(getPharmacyInv());    // { pharmacyId: { medId: {s,p} } }
    const dosageSlips   = ref(getDosageSlips());
    const slots         = ref(getSlots());
    const bookedSlotMsg = ref('');

    // ── Global search (Find Medicine tab) ─────────────────────────────────
    const globalQuery   = ref('');

    /**
     * For each matching medicine, build a result object that includes per-pharmacy
     * availability so the patient can compare at a glance.
     */
    const globalResults = computed(() => {
      const q = globalQuery.value.trim().toLowerCase();
      if (!q) return [];

      return inventory.value
        .filter((m) =>
          m.name.toLowerCase().includes(q) ||
          m.brand.toLowerCase().includes(q) ||
          m.generic.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q)
        )
        .map((m) => {
          const availability = pharmacies.value.map((ph) => {
            const entry = (pharmacyInv.value[ph.id] || {})[m.id];
            return {
              pharmacyId:   ph.id,
              pharmacyName: ph.name,
              distance:     ph.distance,
              open:         ph.open,
              stock:        entry ? entry.s : 0,
              price:        entry ? entry.p : m.price,
            };
          });
          return { ...m, availability };
        });
    });

    // ── Pharmacy browser (Pharmacies tab) ─────────────────────────────────
    /** null = show pharmacy list; object = show that pharmacy's inventory */
    const selectedPharmacy    = ref(null);
    const pharmacySearchQuery = ref('');

    /** When a pharmacy is selected, filter its inventory by search query. */
    const pharmacyInventory = computed(() => {
      if (!selectedPharmacy.value) return [];
      const phInv = pharmacyInv.value[selectedPharmacy.value.id] || {};
      return inventory.value
        .filter((m) => {
          const q = pharmacySearchQuery.value.trim().toLowerCase();
          const nameMatch = !q ||
            m.name.toLowerCase().includes(q) ||
            m.brand.toLowerCase().includes(q) ||
            m.generic.toLowerCase().includes(q);
          return nameMatch;
        })
        .map((m) => {
          const entry = phInv[m.id];
          return { ...m, localStock: entry ? entry.s : 0, localPrice: entry ? entry.p : m.price };
        });
    });

    const selectPharmacy  = (ph) => { selectedPharmacy.value = ph; pharmacySearchQuery.value = ''; };
    const clearPharmacy   = () => { selectedPharmacy.value = null; };

    // ── Bottom nav tabs config ─────────────────────────────────────────────
    const tabs = [
      { id: 'find',         icon: '🔍', label: 'Find Med'   },
      { id: 'pharmacies',   icon: '🏪', label: 'Pharmacies' },
      { id: 'scanner',      icon: '📷', label: 'Scan Rx'    },
      { id: 'dosage',       icon: '💊', label: 'My Doses'   },
      { id: 'appointments', icon: '📅', label: 'Book Appt.' },
    ];

    const handleTabClick = (id) => {
      if (id === 'scanner') {
        showScanner.value = true;
      } else {
        activeTab.value = id;
      }
    };

    // ── Appointment booking ────────────────────────────────────────────────
    const today        = new Date().toISOString().split('T')[0];
    const selectedDate = ref(today);
    const minDate      = today;
    const maxDate      = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
    })();

    const bookSlot    = (slot) => {
      if (slot.booked) return;
      slot.booked       = true;
      bookedSlotMsg.value = `✅ Appointment confirmed for ${selectedDate.value} at ${slot.time}!`;
      saveSlots(slots.value);
    };
    const onDateChange = () => { bookedSlotMsg.value = ''; };

    // ── Star rating helper ─────────────────────────────────────────────────
    const MAX_STARS = 5;
    const stars = (rating) => '★'.repeat(Math.round(rating)) + '☆'.repeat(MAX_STARS - Math.round(rating));

    return {
      activeTab, tabs, handleTabClick,
      globalQuery, globalResults,
      pharmacies, selectedPharmacy, pharmacySearchQuery, pharmacyInventory, selectPharmacy, clearPharmacy,
      showScanner,
      dosageSlips,
      slots, selectedDate, minDate, maxDate, bookSlot, bookedSlotMsg, onDateChange,
      stars,
    };
  },

  template: `
    <div class="flex flex-col min-h-[calc(100vh-3.5rem)] bg-gray-50 pb-20">

      <!-- ══════════════════════════════════════════════════════
           TAB 1: FIND MEDICINE  (global cross-pharmacy search)
           ══════════════════════════════════════════════════════ -->
      <section v-if="activeTab === 'find'" class="max-w-2xl mx-auto w-full px-4 pt-6">
        <h1 class="text-2xl font-bold text-gray-900 mb-1">Find a Medicine</h1>
        <p class="text-gray-500 text-sm mb-5">
          Search across all pharmacies near you — see who has it, the price, and distance.
        </p>

        <!-- Search input -->
        <div class="relative mb-4">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
          <input
            v-model="globalQuery"
            type="text"
            placeholder="e.g. Paracetamol, Crocin, Antibiotic…"
            class="w-full pl-10 pr-10 py-3 border-2 border-gray-200 focus:border-green-500 rounded-xl text-base outline-none transition bg-white shadow-sm"
            autocomplete="off"
          />
          <button
            v-if="globalQuery"
            @click="globalQuery = ''"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl"
            aria-label="Clear"
          >&times;</button>
        </div>

        <!-- Empty state -->
        <div v-if="!globalQuery" class="text-center py-14 text-gray-400">
          <div class="text-5xl mb-3">💊</div>
          <p class="text-sm font-medium">Type a medicine or category to see availability near you</p>
          <p class="text-xs mt-1 text-gray-300">Results show stock levels from all nearby pharmacies</p>
        </div>

        <!-- No results -->
        <div v-else-if="globalResults.length === 0" class="text-center py-14 text-gray-400">
          <div class="text-4xl mb-3">🔎</div>
          <p class="text-sm font-medium">No medicines matched "<span class="text-gray-700">{{ globalQuery }}</span>"</p>
        </div>

        <!-- Results: one card per medicine, expanded list of pharmacies inside -->
        <div v-else class="space-y-4">
          <div
            v-for="med in globalResults"
            :key="med.id"
            class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden"
          >
            <!-- Medicine header -->
            <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2">
              <div>
                <p class="font-bold text-gray-900 text-sm">{{ med.name }}</p>
                <p class="text-xs text-gray-500">
                  Brand: {{ med.brand }}
                  <span class="mx-1">·</span>
                  Generic: {{ med.generic }}
                  <span class="mx-1">·</span>
                  {{ med.category }}
                </p>
              </div>
              <!-- How many pharmacies carry it in stock -->
              <span class="shrink-0 text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                {{ med.availability.filter(a => a.stock > 0 && a.open).length }} / {{ med.availability.length }} available
              </span>
            </div>

            <!-- Per-pharmacy rows -->
            <ul class="divide-y divide-gray-50">
              <li
                v-for="avail in med.availability"
                :key="avail.pharmacyId"
                class="flex items-center px-4 py-2.5 gap-3"
                :class="avail.open ? '' : 'opacity-50'"
              >
                <!-- Pharmacy name + distance -->
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-800">{{ avail.pharmacyName }}</p>
                  <p class="text-xs text-gray-400">📍 {{ avail.distance }}
                    <span v-if="!avail.open" class="ml-1 text-red-400 font-medium">· Closed</span>
                  </p>
                </div>

                <!-- Price -->
                <p class="text-sm font-semibold text-gray-700 shrink-0">₹{{ avail.price }}</p>

                <!-- Stock badge -->
                <span
                  :class="[
                    'shrink-0 text-xs font-bold px-2.5 py-1 rounded-full',
                    !avail.open          ? 'bg-gray-100 text-gray-400'   :
                    avail.stock > 0      ? 'bg-green-100 text-green-700' :
                                           'bg-red-100 text-red-600'
                  ]"
                >
                  {{ !avail.open ? 'Closed' : avail.stock > 0 ? '✔ In Stock' : '✘ Out of Stock' }}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>


      <!-- ══════════════════════════════════════════════════════
           TAB 2: PHARMACIES  (browse & drill into one pharmacy)
           ══════════════════════════════════════════════════════ -->
      <section v-if="activeTab === 'pharmacies'" class="max-w-2xl mx-auto w-full px-4 pt-6">

        <!-- ── Pharmacy list view ── -->
        <template v-if="!selectedPharmacy">
          <h1 class="text-2xl font-bold text-gray-900 mb-1">Pharmacies Near You</h1>
          <p class="text-gray-500 text-sm mb-5">
            Tap a pharmacy to explore its full inventory and prices.
          </p>

          <div class="space-y-3">
            <button
              v-for="ph in pharmacies"
              :key="ph.id"
              @click="selectPharmacy(ph)"
              class="w-full bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-green-300 transition text-left flex items-start gap-4"
            >
              <!-- Icon -->
              <div class="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-xl shrink-0">
                🏪
              </div>

              <!-- Details -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="font-bold text-gray-900">{{ ph.name }}</p>
                  <span
                    :class="['text-xs font-semibold px-2 py-0.5 rounded-full', ph.open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600']"
                  >{{ ph.open ? 'Open' : 'Closed' }}</span>
                </div>
                <p class="text-xs text-gray-500 mt-0.5 truncate">{{ ph.address }}</p>
                <div class="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span class="text-xs text-amber-500">{{ stars(ph.rating) }} {{ ph.rating }} ({{ ph.totalRatings }})</span>
                  <span class="text-xs text-gray-400">📍 {{ ph.distance }}</span>
                  <span class="text-xs text-gray-400">🕐 {{ ph.hours }}</span>
                </div>
              </div>

              <span class="text-gray-400 shrink-0 text-lg">›</span>
            </button>
          </div>
        </template>

        <!-- ── Single pharmacy inventory drill-down ── -->
        <template v-else>
          <!-- Back button -->
          <button
            @click="clearPharmacy"
            class="flex items-center gap-2 text-green-700 font-medium text-sm mb-4 hover:text-green-800"
          >
            ← Back to pharmacies
          </button>

          <!-- Pharmacy header card -->
          <div class="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm mb-4">
            <div class="flex items-center gap-3">
              <span class="text-3xl">🏪</span>
              <div class="flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="font-bold text-gray-900 text-lg">{{ selectedPharmacy.name }}</h2>
                  <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', selectedPharmacy.open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600']">
                    {{ selectedPharmacy.open ? 'Open Now' : 'Closed' }}
                  </span>
                </div>
                <p class="text-xs text-gray-500 mt-0.5">{{ selectedPharmacy.address }}</p>
                <p class="text-xs text-gray-400 mt-0.5">📞 {{ selectedPharmacy.phone }} · 🕐 {{ selectedPharmacy.hours }}</p>
              </div>
            </div>
          </div>

          <!-- Search within this pharmacy -->
          <div class="relative mb-4">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              v-model="pharmacySearchQuery"
              type="text"
              placeholder="Filter medicines in this pharmacy…"
              class="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 focus:border-green-500 rounded-xl text-sm outline-none bg-white transition"
              autocomplete="off"
            />
          </div>

          <!-- Medicine list for selected pharmacy -->
          <ul class="space-y-2">
            <li
              v-for="med in pharmacyInventory"
              :key="med.id"
              class="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-sm"
            >
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-gray-900">{{ med.name }}</p>
                <p class="text-xs text-gray-500 mt-0.5">{{ med.brand }} · {{ med.category }}</p>
              </div>
              <div class="text-right shrink-0">
                <p class="text-sm font-bold text-gray-800">₹{{ med.localPrice }}</p>
                <span
                  :class="[
                    'inline-block mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full',
                    med.localStock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  ]"
                >
                  {{ med.localStock > 0 ? '✔ ' + med.localStock + ' units' : '✘ Out of Stock' }}
                </span>
              </div>
            </li>
          </ul>
        </template>
      </section>


      <!-- ══════════════════════════════════════════════════════
           TAB 3 (modal trigger): SCAN RX  – handled by showScanner flag
           (no section needed here; ScannerModal renders below)
           ══════════════════════════════════════════════════════ -->


      <!-- ══════════════════════════════════════════════════════
           TAB 4: DOSAGE SLIPS
           ══════════════════════════════════════════════════════ -->
      <section v-if="activeTab === 'dosage'" class="max-w-lg mx-auto w-full px-4 pt-6">
        <h1 class="text-2xl font-bold text-gray-900 mb-1">My Dosage Slips</h1>
        <p class="text-gray-500 text-sm mb-5">
          Auto-generated digital instructions — never forget your dosage again.
        </p>

        <div class="space-y-4">
          <div
            v-for="slip in dosageSlips"
            :key="slip.id"
            class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden"
          >
            <div class="bg-green-600 text-white px-4 py-3 flex items-center justify-between">
              <div>
                <p class="font-bold text-base">{{ slip.medicine }}</p>
                <p class="text-xs opacity-80">Prescribed by {{ slip.prescribedBy }} · {{ slip.date }}</p>
              </div>
              <span class="text-3xl">💊</span>
            </div>
            <div class="px-4 py-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Dosage</p>
                <p class="text-gray-800 font-semibold mt-0.5">{{ slip.dosage }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Frequency</p>
                <p class="text-gray-800 font-semibold mt-0.5">{{ slip.frequency }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Timing</p>
                <p class="text-gray-800 font-semibold mt-0.5">{{ slip.timing }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Duration</p>
                <p class="text-gray-800 font-semibold mt-0.5">{{ slip.duration }}</p>
              </div>
            </div>
            <div class="bg-amber-50 border-t border-amber-200 px-4 py-3 flex gap-2">
              <span class="text-amber-500 text-lg shrink-0">⚠️</span>
              <p class="text-xs text-amber-800">{{ slip.warnings }}</p>
            </div>
          </div>
        </div>
      </section>


      <!-- ══════════════════════════════════════════════════════
           TAB 5: APPOINTMENTS
           ══════════════════════════════════════════════════════ -->
      <section v-if="activeTab === 'appointments'" class="max-w-lg mx-auto w-full px-4 pt-6">
        <h1 class="text-2xl font-bold text-gray-900 mb-1">Book an Appointment</h1>
        <p class="text-gray-500 text-sm mb-5">
          Select a date and a 15-minute slot with our in-house pharmacist/doctor.
        </p>

        <label class="block mb-4">
          <span class="text-sm font-medium text-gray-700">Select Date</span>
          <input
            v-model="selectedDate"
            type="date"
            :min="minDate"
            :max="maxDate"
            @change="onDateChange"
            class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-3 py-2.5 text-base outline-none transition bg-white"
          />
        </label>

        <div
          v-if="bookedSlotMsg"
          class="bg-green-50 border border-green-300 text-green-800 rounded-xl px-4 py-3 text-sm font-medium mb-4"
        >
          {{ bookedSlotMsg }}
        </div>

        <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
          <button
            v-for="slot in slots"
            :key="slot.time"
            @click="bookSlot(slot)"
            :disabled="slot.booked"
            :class="[
              'cal-slot py-2.5 rounded-xl text-sm font-medium border-2 transition',
              slot.booked
                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-white border-green-200 text-green-700 hover:bg-green-50 hover:border-green-400'
            ]"
          >
            <span v-if="slot.booked" class="block text-xs mb-0.5 text-gray-300">Booked</span>
            {{ slot.time }}
          </button>
        </div>

        <p class="text-xs text-gray-400 mt-4 text-center">
          Each slot is 15 minutes. A confirmation SMS will be sent on the actual booking.
        </p>
      </section>


      <!-- ══════════════════════════════════════════════════════
           STICKY BOTTOM NAVIGATION (5 tabs)
           ══════════════════════════════════════════════════════ -->
      <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 no-print">
        <div class="grid grid-cols-5">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="handleTabClick(tab.id)"
            :class="[
              'flex flex-col items-center py-2 gap-0.5 focus:outline-none transition',
              activeTab === tab.id && tab.id !== 'scanner'
                ? 'bottom-nav-active'
                : 'text-gray-500 hover:text-green-600'
            ]"
          >
            <span class="text-xl leading-none">{{ tab.icon }}</span>
            <span class="text-[10px] font-medium">{{ tab.label }}</span>
          </button>
        </div>
      </nav>


      <!-- ══════════════════════════════════════════════════════
           PRESCRIPTION SCANNER MODAL
           ══════════════════════════════════════════════════════ -->
      <ScannerModal
        v-model:show="showScanner"
        title="Scan Your Prescription"
        mode="patient"
      />
    </div>
  `,
});

