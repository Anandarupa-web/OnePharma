/**
 * DoctorDashboard.js – Doctor Portal
 *
 * Responsive: two-panel on desktop, tab-switched on mobile.
 * Left: patient queue with tag filter + walk-in form.
 * Right: prescription builder (with patient history sub-tab).
 */
import { defineComponent, ref, computed, reactive, inject } from 'vue';
import { getInventory, getPatients, savePatients, getOrders, saveOrders, getAppointments, saveAppointments, getDoctors } from '../app.js';

export default defineComponent({
  name: 'DoctorDashboard',

  setup() {
    const currentUser  = inject('currentUser');
    const inventory    = ref(getInventory());
    const patients     = ref(getPatients());
    const appointments = ref(getAppointments());
    const doctors      = ref(getDoctors());
    const allOrders    = ref(getOrders());   // for history

    const myDoctor = computed(() => doctors.value.find(d => d.id === currentUser.value?.doctorId));
    const today    = new Date().toISOString().split('T')[0];

    // ── Mobile panel: 'queue' | 'prescription' | 'history' ───────────────
    const mobilePanel = ref('queue');

    const patientSearch = ref('');
    const tagFilter     = ref('');  // '' | 'new' | 'returning'

    const queue = computed(() => {
      const myApts = appointments.value
        .filter(a => a.doctorId === myDoctor.value?.id && a.status === 'scheduled')
        .map(a => ({
          ...a,
          patient: patients.value.find(p => p.id === a.patientId || p.phone === a.patientPhone),
        }));
      let list = myApts;
      if (tagFilter.value) {
        list = list.filter(a => (a.patient?.tag || 'new') === tagFilter.value);
      }
      if (patientSearch.value.trim()) {
        const q = patientSearch.value.toLowerCase();
        list = list.filter(a =>
          a.patientName?.toLowerCase().includes(q) ||
          a.patientPhone?.includes(q) ||
          a.reason?.toLowerCase().includes(q)
        );
      }
      return list.sort((a, b) => {
        if (a.time === 'Walk-in') return 1;
        if (b.time === 'Walk-in') return -1;
        return a.time.localeCompare(b.time);
      });
    });

    const selectedApt = ref(null);
    // Desktop sub-tab: 'prescription' | 'history'
    const rxSubTab    = ref('prescription');

    // ── Patient history ───────────────────────────────────────────────────
    const patientHistory = computed(() => {
      if (!selectedApt.value) return [];
      const phone = selectedApt.value.patientPhone;
      const id    = selectedApt.value.patientId;
      return allOrders.value
        .filter(o =>
          o.source === 'doctor_prescription' &&
          (o.patientPhone === phone || (id && o.patientId === id))
        )
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    });

    const fmtDate = (iso) =>
      iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    const selectPatient = (apt) => {
      selectedApt.value = apt;
      rxMeds.value = [];
      diagnosis.value = '';
      medSearch.value = '';
      submitError.value = '';
      submitSuccess.value = '';
      rxSubTab.value    = 'prescription';
      mobilePanel.value = 'prescription';  // auto-switch on mobile
    };

    const diagnosis  = ref('');
    const rxMeds     = ref([]);
    const medSearch  = ref('');

    const medSuggestions = computed(() => {
      if (medSearch.value.length < 2) return [];
      const q = medSearch.value.toLowerCase();
      return inventory.value.filter(m =>
        m.name?.toLowerCase().includes(q) || m.brand?.toLowerCase().includes(q)
      ).slice(0, 6);
    });

    const FREQ_OPTIONS = [
      { val: 'OD',      label: 'Once daily (OD)'     },
      { val: 'BD',      label: 'Twice daily (BD)'     },
      { val: 'TDS',     label: 'Thrice daily (TDS)'   },
      { val: 'QID',     label: 'Four times (QID)'     },
      { val: 'SOS',     label: 'As needed (SOS)'      },
      { val: 'every_8h',label: 'Every 8 hours'        },
    ];
    const TIMING_OPTIONS = ['Before food', 'After food', 'With food', 'Bedtime'];
    const DOSE_PRESETS   = [
      { label: '1 tab OD×5d',  dose: 1,   freq: 'OD',  timing: 'After food', duration: 5  },
      { label: '1 tab BD×5d',  dose: 1,   freq: 'BD',  timing: 'After food', duration: 5  },
      { label: '1 tab TDS×7d', dose: 1,   freq: 'TDS', timing: 'After food', duration: 7  },
      { label: '½ tab OD',     dose: 0.5, freq: 'OD',  timing: 'After food', duration: 30 },
      { label: '2 tab SOS',    dose: 2,   freq: 'SOS', timing: 'As needed',  duration: 3  },
    ];

    const addMedToRx = (med) => {
      if (rxMeds.value.find(r => r.medId === med.id)) return;
      rxMeds.value.push({
        medId: med.id, name: med.name, brand: med.brand, price: med.price,
        dose: 1, freq: 'BD', timing: 'After food', duration: 5, notes: '',
        showPresets: false,
      });
      medSearch.value = '';
    };

    const applyPreset = (item, preset) => {
      item.dose     = preset.dose;
      item.freq     = preset.freq;
      item.timing   = preset.timing;
      item.duration = preset.duration;
      item.showPresets = false;
    };

    const removeRxMed = (idx) => rxMeds.value.splice(idx, 1);

    const calcQty = (item) => {
      const perDay = { OD: 1, BD: 2, TDS: 3, QID: 4, SOS: 1, every_8h: 3 }[item.freq] || 1;
      return item.dose * perDay * item.duration;
    };

    const submitLoading = ref(false);
    const submitSuccess = ref('');
    const submitError   = ref('');

    const submitPrescription = () => {
      if (!selectedApt.value)  { submitError.value = 'No patient selected.';          return; }
      if (!rxMeds.value.length){ submitError.value = 'Add at least one medicine.';    return; }
      submitError.value   = '';
      submitLoading.value = true;

      setTimeout(() => {
        const orderId = 'RX-' + Date.now().toString().slice(-8) + '-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const order = {
          id: orderId,
          doctorId:   myDoctor.value?.id,
          doctorName: myDoctor.value?.name || currentUser.value?.name,
          patientId:  selectedApt.value.patientId || null,
          patientName:  selectedApt.value.patientName,
          patientPhone: selectedApt.value.patientPhone,
          diagnosis: diagnosis.value,
          items: rxMeds.value.map(r => ({
            medId: r.medId, name: r.name, brand: r.brand, price: r.price,
            qty: calcQty(r), dose: r.dose, freq: r.freq, timing: r.timing,
            duration: r.duration, notes: r.notes,
            gst: inventory.value.find(m => m.id === r.medId)?.gst || 5,
          })),
          subtotal:        rxMeds.value.reduce((s, r) => s + r.price * calcQty(r), 0),
          finalTotal:      rxMeds.value.reduce((s, r) => s + r.price * calcQty(r), 0),
          gstAmount:       0,
          discountAmount:  0,
          status:          'pending',
          source:          'doctor_prescription',
          connectedPharmacyId: myDoctor.value?.pharmacyId || null,
          pharmacyId:      myDoctor.value?.pharmacyId || null,
          timestamp:       new Date().toISOString(),
          createdAt:       new Date().toISOString(),
          expiresAt:       new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };

        const orders = getOrders();
        orders.unshift(order);
        saveOrders(orders);
        allOrders.value = orders;  // refresh history panel

        const apts = getAppointments().map(a =>
          a.id === selectedApt.value.id ? { ...a, status: 'completed' } : a
        );
        saveAppointments(apts);
        appointments.value = apts;

        submitLoading.value = false;
        submitSuccess.value = `Prescription ${orderId} submitted for ${selectedApt.value.patientName}. The pharmacy has been notified.`;
        rxMeds.value        = [];
        diagnosis.value     = '';
        selectedApt.value   = null;
        mobilePanel.value   = 'queue';
        setTimeout(() => { submitSuccess.value = ''; }, 5000);
      }, 500);
    };

    const showAddPatient = ref(false);
    const newPat = reactive({ name: '', phone: '', age: '', complaint: '' });

    const addWalkIn = () => {
      if (!newPat.name || !newPat.phone) return;
      const pts = getPatients();
      const p = {
        id: Date.now(), name: newPat.name, phone: newPat.phone,
        age: newPat.age, tag: 'new', complaint: newPat.complaint,
        phoneVerified: false, createdAt: new Date().toISOString(),
      };
      pts.push(p);
      savePatients(pts);
      patients.value = pts;

      const apt = {
        id: 'APT-WI-' + Date.now(),
        patientId: p.id, patientName: p.name, patientPhone: p.phone,
        doctorId:   myDoctor.value?.id,
        doctorName: myDoctor.value?.name || currentUser.value?.name,
        date: today, time: 'Walk-in',
        reason: newPat.complaint || 'Walk-in',
        status: 'scheduled',
        pharmacyId: myDoctor.value?.pharmacyId || null,
      };
      const apts = getAppointments();
      apts.push(apt);
      saveAppointments(apts);
      appointments.value = apts;

      Object.assign(newPat, { name: '', phone: '', age: '', complaint: '' });
      showAddPatient.value = false;
    };

    return {
      myDoctor, queue, patientSearch, tagFilter,
      selectedApt, selectPatient, mobilePanel, rxSubTab,
      patientHistory, fmtDate,
      diagnosis, rxMeds, medSearch, medSuggestions,
      FREQ_OPTIONS, TIMING_OPTIONS, DOSE_PRESETS,
      addMedToRx, applyPreset, removeRxMed, calcQty,
      submitLoading, submitSuccess, submitError, submitPrescription,
      showAddPatient, newPat, addWalkIn, today,
    };
  },

  template: `
<div class="min-h-[calc(100vh-3.5rem)] bg-gray-100 flex flex-col overflow-hidden">

  <!-- ══ MOBILE TOP-BAR ══════════════════════════════════════════════════ -->
  <div class="md:hidden bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between sticky top-0 z-20 shrink-0">
    <div class="flex-1 min-w-0">
      <p class="text-sm font-bold text-gray-900 truncate">🩺 {{ myDoctor ? myDoctor.name : 'Doctor Dashboard' }}</p>
      <p v-if="myDoctor" class="text-[11px] text-blue-600 leading-tight">{{ myDoctor.specialty }}</p>
    </div>
    <div class="flex gap-1 ml-2 shrink-0">
      <button @click="mobilePanel='queue'"
        :class="['text-xs px-2.5 py-1.5 rounded-lg font-semibold transition',
          mobilePanel==='queue' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600']">
        👥<span v-if="queue.length" class="ml-0.5">{{queue.length}}</span>
      </button>
      <button v-if="selectedApt" @click="mobilePanel='prescription'"
        :class="['text-xs px-2.5 py-1.5 rounded-lg font-semibold transition',
          mobilePanel==='prescription' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600']">
        💊
      </button>
      <button v-if="selectedApt" @click="mobilePanel='history'"
        :class="['text-xs px-2.5 py-1.5 rounded-lg font-semibold transition relative',
          mobilePanel==='history' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600']">
        📋<span v-if="patientHistory.length" class="ml-0.5 text-[10px]">{{patientHistory.length}}</span>
      </button>
    </div>
  </div>

  <!-- ══ MAIN FLEX (desktop: row, mobile: column with panel visibility) ══ -->
  <div class="flex flex-1 overflow-hidden">

    <!-- ══ LEFT: Patient Queue ═══════════════════════════════════════════ -->
    <div :class="[
      'bg-white border-r border-gray-200 flex-col overflow-hidden',
      'md:flex md:w-80 lg:w-96 shrink-0',
      mobilePanel==='queue' ? 'flex w-full' : 'hidden',
    ]">

      <!-- Header -->
      <div class="p-3 border-b border-gray-100 shrink-0">
        <!-- Doctor info + walk-in button -->
        <div class="flex items-start justify-between gap-2 mb-2">
          <div>
            <h2 class="text-sm font-bold text-gray-900 hidden md:block">👥 Patient Queue</h2>
            <p v-if="myDoctor" class="text-xs text-blue-600 hidden md:block">{{ myDoctor.name }} · {{ myDoctor.specialty }}</p>
            <p class="text-sm font-semibold text-gray-700 md:hidden">Today's Queue ({{ queue.length }})</p>
          </div>
          <button @click="showAddPatient=!showAddPatient"
            class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-2.5 py-1.5 rounded-lg transition shrink-0">
            + Walk-in
          </button>
        </div>

        <!-- Search -->
        <input v-model="patientSearch" placeholder="Search name, phone or complaint…"
          class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mb-2" />

        <!-- Tag filter chips -->
        <div class="flex gap-1.5 flex-wrap">
          <button @click="tagFilter=''"
            :class="['text-[11px] px-2.5 py-1 rounded-full border font-medium transition',
              tagFilter==='' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300']">
            All
          </button>
          <button @click="tagFilter='new'"
            :class="['text-[11px] px-2.5 py-1 rounded-full border font-medium transition',
              tagFilter==='new' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-green-700 border-green-200']">
            🟢 New
          </button>
          <button @click="tagFilter='returning'"
            :class="['text-[11px] px-2.5 py-1 rounded-full border font-medium transition',
              tagFilter==='returning' ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-600 border-gray-200']">
            🔄 Returning
          </button>
        </div>

        <!-- Walk-in form -->
        <div v-if="showAddPatient" class="mt-2 bg-blue-50 rounded-xl p-3 space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <input v-model="newPat.name" placeholder="Name *"
              class="col-span-2 border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
            <input v-model="newPat.phone" placeholder="Phone *"
              class="border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none" />
            <input v-model.number="newPat.age" placeholder="Age" type="number"
              class="border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
          <input v-model="newPat.complaint" placeholder="Complaint"
            class="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none" />
          <div class="flex gap-2">
            <button @click="showAddPatient=false"
              class="flex-1 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            <button @click="addWalkIn"
              class="flex-1 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">Add Patient</button>
          </div>
        </div>
      </div>

      <!-- Queue list -->
      <div class="flex-1 overflow-y-auto p-2.5 space-y-2">
        <div v-if="queue.length === 0" class="text-center py-10 text-gray-400 text-sm">
          <div class="text-4xl mb-2">📅</div>
          No patients in queue today.
        </div>
        <button v-for="apt in queue" :key="apt.id"
          @click="selectPatient(apt)"
          :class="['w-full text-left rounded-2xl p-3 border transition active:scale-[0.98]',
            selectedApt && selectedApt.id === apt.id
              ? 'bg-blue-50 border-blue-400 shadow-sm'
              : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50']">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <p class="font-semibold text-gray-900 text-sm">{{ apt.patientName }}</p>
                <span :class="['text-[10px] px-1.5 py-0.5 rounded font-bold',
                  (apt.patient && apt.patient.tag || 'new') === 'new' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500']">
                  {{ apt.patient && apt.patient.tag ? apt.patient.tag : 'new' }}
                </span>
              </div>
              <p class="text-xs text-gray-500 mt-0.5 truncate">{{ apt.patientPhone }}</p>
              <p class="text-xs text-blue-600 mt-0.5 truncate leading-tight">{{ apt.reason }}</p>
            </div>
            <div class="text-right shrink-0">
              <span class="text-xs text-gray-400 block">{{ apt.time }}</span>
              <p v-if="apt.patient && apt.patient.age" class="text-[11px] text-gray-400 mt-0.5">{{ apt.patient.age }}y</p>
            </div>
          </div>
        </button>
      </div>
    </div><!-- /queue panel -->

    <!-- ══ RIGHT: Prescription + History ════════════════════════════════ -->
    <div :class="[
      'flex-1 flex-col overflow-y-auto',
      'md:flex',
      (mobilePanel === 'prescription' || mobilePanel === 'history') ? 'flex w-full' : 'hidden',
    ]">

      <!-- Desktop: no patient selected placeholder -->
      <div v-if="!selectedApt" class="hidden md:flex flex-col items-center justify-center flex-1 text-gray-400">
        <div class="text-6xl mb-4">🩺</div>
        <p class="text-lg font-medium">Select a patient from the queue</p>
        <p class="text-sm mt-1">to begin diagnosis and prescription</p>
      </div>

      <!-- Content when patient selected -->
      <div v-if="selectedApt" class="flex flex-col flex-1">

        <!-- Desktop sub-tab bar -->
        <div class="hidden md:flex gap-0 px-4 pt-3 border-b border-gray-200 bg-white shrink-0">
          <button @click="rxSubTab='prescription'"
            :class="['px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition',
              rxSubTab==='prescription'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700']">
            💊 Prescription
          </button>
          <button @click="rxSubTab='history'"
            :class="['px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition',
              rxSubTab==='history'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700']">
            📋 History
            <span v-if="patientHistory.length" class="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{{patientHistory.length}}</span>
          </button>
        </div>

        <!-- ── PRESCRIPTION ─────────────────────────────────────────── -->
        <div v-show="mobilePanel==='prescription' || rxSubTab==='prescription'"
          class="p-3 sm:p-4 space-y-3 max-w-2xl w-full mx-auto">

          <!-- Patient card -->
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center shrink-0">
                {{ (selectedApt.patientName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-bold text-gray-900 leading-tight">{{ selectedApt.patientName }}</p>
                <p class="text-xs text-gray-500">{{ selectedApt.patientPhone }}</p>
                <p v-if="selectedApt.patient && selectedApt.patient.age" class="text-xs text-gray-400">Age: {{ selectedApt.patient.age }}</p>
                <p class="text-xs text-blue-600 mt-0.5 leading-snug">📋 {{ selectedApt.reason }}</p>
                <p class="text-xs text-gray-400">⏰ {{ selectedApt.time }}</p>
              </div>
              <!-- Mobile: back to queue -->
              <button @click="mobilePanel='queue'" class="md:hidden text-gray-400 hover:text-gray-600 text-lg leading-none p-1 shrink-0">←</button>
            </div>
          </div>

          <!-- Diagnosis -->
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <h3 class="text-sm font-semibold text-gray-700 mb-2">📝 Diagnosis</h3>
            <textarea v-model="diagnosis" placeholder="Enter diagnosis / clinical notes..." rows="2"
              class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"></textarea>
          </div>

          <!-- Prescription builder -->
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">💊 Prescription Builder</h3>

            <div class="relative mb-3">
              <input v-model="medSearch" placeholder="Search medicine by name or brand..."
                class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <div v-if="medSuggestions.length"
                class="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-20 mt-1 overflow-hidden">
                <div v-for="med in medSuggestions" :key="med.id"
                  @click="addMedToRx(med)"
                  class="px-3 py-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between gap-2 border-b last:border-0">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-800">{{ med.name }}</p>
                    <p class="text-xs text-gray-400 truncate">{{ med.brand }} · {{ med.generic }} · {{ med.category }}</p>
                  </div>
                  <span class="text-xs text-green-600 shrink-0 font-medium">₹{{ med.price }}</span>
                </div>
              </div>
            </div>

            <div v-if="rxMeds.length === 0"
              class="text-center py-5 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
              Search and add medicines above
            </div>
            <div v-else class="space-y-3">
              <div v-for="(item, idx) in rxMeds" :key="item.medId"
                class="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <div class="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p class="text-sm font-semibold text-gray-800">{{ item.name }}</p>
                    <p class="text-xs text-gray-500">{{ item.brand }}</p>
                  </div>
                  <button @click="removeRxMed(idx)" class="text-gray-400 hover:text-red-500 text-xl leading-none mt-0.5 shrink-0">×</button>
                </div>
                <!-- Presets -->
                <div class="mb-2">
                  <button @click="item.showPresets = !item.showPresets"
                    class="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    ⚡ Presets {{ item.showPresets ? '▲' : '▼' }}
                  </button>
                  <div v-if="item.showPresets" class="flex flex-wrap gap-1.5 mt-1.5">
                    <button v-for="p in DOSE_PRESETS" :key="p.label" @click="applyPreset(item, p)"
                      class="text-xs px-2.5 py-1 bg-white border border-blue-200 text-blue-700 rounded-full hover:bg-blue-100 transition font-medium">
                      {{ p.label }}
                    </button>
                  </div>
                </div>
                <!-- Dosage fields -->
                <div class="grid grid-cols-2 gap-2">
                  <label class="block">
                    <span class="text-[11px] text-gray-500 font-medium">Dose</span>
                    <input v-model.number="item.dose" type="number" min="0.5" step="0.5"
                      class="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </label>
                  <label class="block">
                    <span class="text-[11px] text-gray-500 font-medium">Frequency</span>
                    <select v-model="item.freq"
                      class="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                      <option v-for="f in FREQ_OPTIONS" :key="f.val" :value="f.val">{{ f.label }}</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-[11px] text-gray-500 font-medium">Timing</span>
                    <select v-model="item.timing"
                      class="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                      <option v-for="t in TIMING_OPTIONS" :key="t" :value="t">{{ t }}</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-[11px] text-gray-500 font-medium">Duration (days)</span>
                    <input v-model.number="item.duration" type="number" min="1"
                      class="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </label>
                </div>
                <input v-model="item.notes" placeholder="Optional instructions..."
                  class="mt-2 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <p class="text-xs text-gray-500 mt-1.5 font-medium">
                  Qty: {{ calcQty(item) }} units · ₹{{ (item.price * calcQty(item)).toFixed(2) }}
                </p>
              </div>
            </div>

            <!-- Rx Summary -->
            <div v-if="rxMeds.length" class="mt-3 bg-gray-50 rounded-xl p-3 border border-gray-200">
              <p class="text-xs font-bold text-gray-700 mb-2">Prescription Summary</p>
              <div v-for="r in rxMeds" :key="r.medId" class="flex justify-between text-xs text-gray-600 py-0.5 gap-2">
                <span class="flex-1 truncate">{{ r.name }} · {{ r.dose }} × {{ r.freq }} × {{ r.duration }}d · {{ r.timing }}</span>
                <span class="text-green-700 font-medium shrink-0">Qty {{ calcQty(r) }}</span>
              </div>
              <div class="border-t border-gray-200 mt-2 pt-2 flex justify-between text-sm font-bold text-gray-800">
                <span>Total</span>
                <span class="text-green-700">₹{{ rxMeds.reduce((s,r) => s + r.price * calcQty(r), 0).toFixed(2) }}</span>
              </div>
            </div>

            <div v-if="submitError" class="mt-3 bg-red-50 text-red-600 text-xs rounded-xl px-3 py-2">{{ submitError }}</div>
            <div v-if="submitSuccess" class="mt-3 bg-green-50 text-green-700 text-sm rounded-xl px-3 py-2 font-medium">✅ {{ submitSuccess }}</div>

            <button @click="submitPrescription" :disabled="submitLoading || !rxMeds.length"
              class="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm">
              <span v-if="submitLoading">⏳ Submitting...</span>
              <span v-else>📤 Submit Prescription → Pharmacy</span>
            </button>
          </div>
        </div><!-- /prescription -->

        <!-- ── HISTORY ───────────────────────────────────────────────── -->
        <div v-show="mobilePanel==='history' || rxSubTab==='history'"
          class="p-3 sm:p-4 max-w-2xl w-full mx-auto">

          <!-- Patient header -->
          <div class="bg-white rounded-2xl p-3 shadow-sm border border-gray-200 mb-3 flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
              {{ (selectedApt.patientName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-bold text-gray-900 text-sm truncate">{{ selectedApt.patientName }}</p>
              <p class="text-xs text-gray-500">{{ selectedApt.patientPhone }}</p>
            </div>
            <button @click="mobilePanel='queue'" class="md:hidden text-gray-400 hover:text-gray-600 text-lg leading-none shrink-0">←</button>
          </div>

          <div v-if="patientHistory.length === 0"
            class="bg-white rounded-2xl p-8 text-center text-gray-400 border border-gray-200">
            <div class="text-4xl mb-2">📋</div>
            <p class="text-sm">No prescription history found for this patient.</p>
          </div>

          <div v-else class="space-y-3">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
              {{ patientHistory.length }} prescription{{ patientHistory.length > 1 ? 's' : '' }}
            </p>
            <div v-for="ord in patientHistory" :key="ord.id"
              class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div class="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p class="text-xs font-bold text-blue-800">{{ ord.id }}</p>
                  <p class="text-[11px] text-blue-600 mt-0.5">{{ fmtDate(ord.createdAt) }} · by {{ ord.doctorName }}</p>
                </div>
                <span :class="['text-[10px] px-2 py-0.5 rounded-full font-semibold',
                  ord.status==='completed' ? 'bg-green-100 text-green-700' :
                  ord.status==='pending'   ? 'bg-amber-100 text-amber-700' :
                  'bg-blue-100 text-blue-700']">
                  {{ ord.status }}
                </span>
              </div>
              <div v-if="ord.diagnosis" class="px-4 pt-2 pb-1">
                <p class="text-xs text-gray-500 italic">📝 {{ ord.diagnosis }}</p>
              </div>
              <div class="px-4 py-2 space-y-2">
                <div v-for="item in ord.items" :key="item.medId"
                  class="flex items-start justify-between gap-2 text-xs">
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-gray-800">{{ item.name }}</p>
                    <p class="text-gray-500">{{ item.dose }}× {{ item.freq }} · {{ item.timing }} · {{ item.duration }} days</p>
                    <p v-if="item.notes" class="text-gray-400 italic">{{ item.notes }}</p>
                  </div>
                  <p class="text-gray-500 shrink-0">Qty {{ item.qty }}</p>
                </div>
              </div>
              <div class="px-4 py-2 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                <span class="font-medium text-gray-700">₹{{ ord.finalTotal?.toFixed(2) || '—' }}</span>
                <span v-if="ord.completedAt" class="text-green-600">✅ {{ fmtDate(ord.completedAt) }}</span>
              </div>
            </div>
          </div>
        </div><!-- /history -->

      </div><!-- /selectedApt content -->
    </div><!-- /right panel -->
  </div><!-- /main flex -->
</div>
  `,
});