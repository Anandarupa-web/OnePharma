/**
 * PatientHome.js – Patient Portal (mobile-first)
 *
 * Sections (toggled by a sticky bottom navigation bar):
 *  1. Availability Checker – real-time inventory search with in-stock badges
 *  2. Prescription Scanner – opens ScannerModal with camera input
 *  3. Dosage Slips         – digital dosage cards addressing post-visit memory loss
 *  4. Appointments         – calendar mockup with 15-min bookable time slots
 */
import { defineComponent, ref, computed }  from 'vue';
import ScannerModal from '../components/ScannerModal.js';
import { getInventory, getDosageSlips, getSlots, saveSlots } from '../app.js';

export default defineComponent({
  name: 'PatientHome',

  components: { ScannerModal },

  setup() {
    // ── State ──────────────────────────────────────────────────────────────
    const activeTab      = ref('checker');   // 'checker' | 'scanner' | 'dosage' | 'appointments'
    const searchQuery    = ref('');
    const showScanner    = ref(false);
    const inventory      = ref(getInventory());
    const dosageSlips    = ref(getDosageSlips());
    const slots          = ref(getSlots());
    const bookedSlotMsg  = ref('');

    // Appointment date picker – default to today
    const today          = new Date().toISOString().split('T')[0];
    const selectedDate   = ref(today);

    // ── Computed ───────────────────────────────────────────────────────────
    /** Filtered inventory based on the search query. */
    const searchResults = computed(() => {
      const q = searchQuery.value.trim().toLowerCase();
      if (!q) return [];
      return inventory.value.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.brand.toLowerCase().includes(q) ||
          m.generic.toLowerCase().includes(q)
      );
    });

    /** Bottom navigation tabs config. */
    const tabs = [
      { id: 'checker',      icon: '🔍', label: 'Check Stock' },
      { id: 'scanner',      icon: '📷', label: 'Scan Rx'     },
      { id: 'dosage',       icon: '💊', label: 'My Doses'    },
      { id: 'appointments', icon: '📅', label: 'Book Appt.'  },
    ];

    // ── Methods ────────────────────────────────────────────────────────────
    const handleTabClick = (id) => {
      if (id === 'scanner') {
        showScanner.value = true;
      } else {
        activeTab.value = id;
      }
    };

    const bookSlot = (slot) => {
      if (slot.booked) return;
      slot.booked       = true;
      bookedSlotMsg.value = `✅ Appointment confirmed for ${selectedDate.value} at ${slot.time}!`;
      saveSlots(slots.value);
    };

    // ── Date helpers ───────────────────────────────────────────────────────
    const minDate = today;
    const maxDate = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
    })();

    // Reset confirmation message when date changes
    const onDateChange = () => { bookedSlotMsg.value = ''; };

    return {
      activeTab, tabs, handleTabClick,
      searchQuery, searchResults,
      showScanner,
      dosageSlips,
      slots, selectedDate, minDate, maxDate, bookSlot, bookedSlotMsg, onDateChange,
    };
  },

  template: `
    <div class="flex flex-col min-h-[calc(100vh-3.5rem)] bg-gray-50 pb-20">

      <!-- ══════════ AVAILABILITY CHECKER ══════════ -->
      <section v-if="activeTab === 'checker'" class="max-w-lg mx-auto w-full px-4 pt-6">
        <h1 class="text-2xl font-bold text-gray-900 mb-1">Check Medicine Availability</h1>
        <p class="text-gray-500 text-sm mb-5">
          Search by medicine name, brand, or generic to avoid wasted trips.
        </p>

        <!-- Search input -->
        <div class="relative mb-4">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="e.g. Paracetamol, Crocin, Insulin…"
            class="w-full pl-10 pr-4 py-3 border-2 border-gray-200 focus:border-green-500 rounded-xl text-base outline-none transition bg-white shadow-sm"
            autocomplete="off"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl"
            aria-label="Clear search"
          >&times;</button>
        </div>

        <!-- Prompt when nothing typed -->
        <div v-if="!searchQuery" class="text-center py-14 text-gray-400">
          <div class="text-5xl mb-3">💊</div>
          <p class="text-sm">Start typing to check availability</p>
        </div>

        <!-- No results -->
        <div v-else-if="searchResults.length === 0" class="text-center py-14 text-gray-400">
          <div class="text-5xl mb-3">🔎</div>
          <p class="text-sm font-medium">No medicines found for "<span class="text-gray-700">{{ searchQuery }}</span>"</p>
        </div>

        <!-- Results list -->
        <ul v-else class="space-y-3">
          <li
            v-for="med in searchResults"
            :key="med.id"
            class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between gap-3"
          >
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-gray-900 text-sm">{{ med.name }}</p>
              <p class="text-xs text-gray-500 mt-0.5">
                Brand: {{ med.brand }} &nbsp;·&nbsp; Generic: {{ med.generic }}
              </p>
              <p class="text-xs text-gray-400 mt-0.5">{{ med.category }}</p>
            </div>

            <!-- In Stock / Out of Stock badge -->
            <div class="shrink-0 text-center">
              <span
                :class="[
                  'inline-block px-3 py-1 rounded-full text-xs font-bold',
                  med.stock > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                ]"
              >
                {{ med.stock > 0 ? '✔ In Stock' : '✘ Out of Stock' }}
              </span>
              <p v-if="med.stock > 0" class="text-xs text-gray-400 mt-1">{{ med.stock }} units</p>
            </div>
          </li>
        </ul>
      </section>

      <!-- ══════════ DOSAGE SLIPS ══════════ -->
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
            <!-- Card header -->
            <div class="bg-green-600 text-white px-4 py-3 flex items-center justify-between">
              <div>
                <p class="font-bold text-base">{{ slip.medicine }}</p>
                <p class="text-xs opacity-80">Prescribed by {{ slip.prescribedBy }} · {{ slip.date }}</p>
              </div>
              <span class="text-3xl">💊</span>
            </div>

            <!-- Details -->
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

            <!-- Warning banner -->
            <div class="bg-amber-50 border-t border-amber-200 px-4 py-3 flex gap-2">
              <span class="text-amber-500 text-lg shrink-0">⚠️</span>
              <p class="text-xs text-amber-800">{{ slip.warnings }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ══════════ APPOINTMENTS ══════════ -->
      <section v-if="activeTab === 'appointments'" class="max-w-lg mx-auto w-full px-4 pt-6">
        <h1 class="text-2xl font-bold text-gray-900 mb-1">Book an Appointment</h1>
        <p class="text-gray-500 text-sm mb-5">
          Select a date and a 15-minute slot with our in-house pharmacist/doctor.
        </p>

        <!-- Date picker -->
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

        <!-- Confirmation message -->
        <div
          v-if="bookedSlotMsg"
          class="bg-green-50 border border-green-300 text-green-800 rounded-xl px-4 py-3 text-sm font-medium mb-4"
        >
          {{ bookedSlotMsg }}
        </div>

        <!-- Time slots grid -->
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

      <!-- ══════════ STICKY BOTTOM NAV ══════════ -->
      <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 no-print">
        <div class="grid grid-cols-4">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="handleTabClick(tab.id)"
            :class="[
              'flex flex-col items-center py-2.5 gap-0.5 focus:outline-none transition',
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

      <!-- ══════════ SCANNER MODAL ══════════ -->
      <ScannerModal
        v-model:show="showScanner"
        title="Scan Your Prescription"
        mode="patient"
      />
    </div>
  `,
});
