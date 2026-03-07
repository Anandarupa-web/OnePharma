/**
 * DoctorDashboard.js – Doctor Portal
 *
 * Two-panel layout: left patient queue, right prescription builder.
 * Doctors can see today's appointments, add walk-in patients,
 * and write structured prescriptions that create orders sent to the pharmacy.
 */
import { defineComponent, ref, computed, reactive, inject } from 'vue';
import { getInventory, getPatients, savePatients, getOrders, saveOrders, getAppointments, saveAppointments, getDoctors } from '../app.js';

export default defineComponent({
  name: 'DoctorDashboard',

  setup() {
    const currentUser = inject('currentUser');
    const inventory   = ref(getInventory());
    const patients    = ref(getPatients());
    const appointments = ref(getAppointments());
    const doctors     = ref(getDoctors());

    const myDoctor = computed(() => doctors.value.find(d => d.id === currentUser.value?.doctorId));
    const today    = new Date().toISOString().split('T')[0];

    const patientSearch = ref('');

    const queue = computed(() => {
      const myApts = appointments.value
        .filter(a => a.doctorId === myDoctor.value?.id && a.status === 'scheduled')
        .map(a => ({
          ...a,
          patient: patients.value.find(p => p.id === a.patientId || p.phone === a.patientPhone),
        }));
      if (patientSearch.value.trim()) {
        const q = patientSearch.value.toLowerCase();
        return myApts.filter(a =>
          a.patientName?.toLowerCase().includes(q) ||
          a.patientPhone?.includes(q) ||
          a.reason?.toLowerCase().includes(q)
        );
      }
      return myApts.sort((a, b) => a.time.localeCompare(b.time));
    });

    const selectedApt = ref(null);
    const selectPatient = (apt) => {
      selectedApt.value = apt;
      rxMeds.value = [];
      diagnosis.value = '';
      medSearch.value = '';
      submitError.value = '';
      submitSuccess.value = '';
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

        const apts = getAppointments().map(a =>
          a.id === selectedApt.value.id ? { ...a, status: 'completed' } : a
        );
        saveAppointments(apts);
        appointments.value = apts;

        submitLoading.value = false;
        submitSuccess.value = `Prescription ${orderId} submitted for ${selectedApt.value.patientName}. The pharmacy has been notified.`;
        rxMeds.value      = [];
        diagnosis.value   = '';
        selectedApt.value = null;
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
      myDoctor, queue, patientSearch, selectedApt, selectPatient,
      diagnosis, rxMeds, medSearch, medSuggestions,
      FREQ_OPTIONS, TIMING_OPTIONS, DOSE_PRESETS,
      addMedToRx, applyPreset, removeRxMed, calcQty,
      submitLoading, submitSuccess, submitError, submitPrescription,
      showAddPatient, newPat, addWalkIn, today,
    };
  },

  template: `
<div class="flex min-h-[calc(100vh-3.5rem)] bg-gray-100">

  <!-- ══ Left: Patient Queue ════════════════════════════════════════════ -->
  <div class="w-full md:w-80 lg:w-96 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
    <div class="p-4 border-b border-gray-100">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h2 class="text-lg font-bold text-gray-900">👥 Patient Queue</h2>
          <p v-if="myDoctor" class="text-xs text-blue-600">{{ myDoctor.name }} · {{ myDoctor.specialty }}</p>
        </div>
        <button @click="showAddPatient=!showAddPatient"
          class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-1.5 rounded-lg transition">
          + Walk-in
        </button>
      </div>
      <input v-model="patientSearch" placeholder="Search patients..."
        class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />

      <!-- Walk-in form -->
      <div v-if="showAddPatient" class="mt-3 space-y-2 bg-blue-50 rounded-xl p-3">
        <input v-model="newPat.name" placeholder="Name *"
          class="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
        <input v-model="newPat.phone" placeholder="Phone *"
          class="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
        <input v-model.number="newPat.age" placeholder="Age" type="number"
          class="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
        <input v-model="newPat.complaint" placeholder="Complaint"
          class="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
        <div class="flex gap-2">
          <button @click="showAddPatient=false"
            class="flex-1 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
          <button @click="addWalkIn"
            class="flex-1 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">Add</button>
        </div>
      </div>
    </div>

    <!-- Queue list -->
    <div class="flex-1 overflow-y-auto p-3 space-y-2">
      <div v-if="queue.length === 0" class="text-center py-8 text-gray-400 text-sm">
        <div class="text-4xl mb-2">📅</div>
        No patients in queue today.
      </div>
      <button v-for="apt in queue" :key="apt.id"
        @click="selectPatient(apt)"
        :class="['w-full text-left rounded-2xl p-3 border transition',
          selectedApt && selectedApt.id === apt.id
            ? 'bg-blue-50 border-blue-400 shadow'
            : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50']">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <p class="font-semibold text-gray-900 text-sm">{{ apt.patientName }}</p>
              <span :class="['text-[10px] px-1.5 py-0.5 rounded font-bold',
                apt.patient && apt.patient.tag === 'new' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500']">
                {{ apt.patient && apt.patient.tag ? apt.patient.tag : 'new' }}
              </span>
            </div>
            <p class="text-xs text-gray-500 mt-0.5 truncate">{{ apt.patientPhone }}</p>
            <p class="text-xs text-blue-600 mt-0.5 truncate">{{ apt.reason }}</p>
          </div>
          <span class="text-xs text-gray-400 shrink-0">{{ apt.time }}</span>
        </div>
        <p v-if="apt.patient && apt.patient.age" class="text-xs text-gray-400 mt-1">Age: {{ apt.patient.age }}</p>
      </button>
    </div>
  </div>

  <!-- ══ Right: Prescription Builder ═══════════════════════════════════ -->
  <div class="flex-1 overflow-y-auto p-4 pb-10">

    <!-- No patient selected -->
    <div v-if="!selectedApt" class="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
      <div class="text-6xl mb-4">🩺</div>
      <p class="text-lg font-medium">Select a patient from the queue</p>
      <p class="text-sm mt-1">to begin diagnosis and prescription</p>
    </div>

    <!-- Prescription panel -->
    <div v-else class="max-w-2xl mx-auto space-y-4">

      <!-- Patient card -->
      <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
        <div class="flex items-start gap-3">
          <div class="w-12 h-12 rounded-full bg-blue-100 text-blue-700 text-lg font-bold flex items-center justify-center shrink-0">
            {{ (selectedApt.patientName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }}
          </div>
          <div class="flex-1">
            <p class="font-bold text-gray-900">{{ selectedApt.patientName }}</p>
            <p class="text-xs text-gray-500">{{ selectedApt.patientPhone }}</p>
            <p v-if="selectedApt.patient && selectedApt.patient.age" class="text-xs text-gray-400">Age: {{ selectedApt.patient.age }}</p>
            <p class="text-xs text-blue-600 mt-1">📋 {{ selectedApt.reason }}</p>
            <p class="text-xs text-gray-400">⏰ {{ selectedApt.time }}</p>
          </div>
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

        <!-- Medicine search -->
        <div class="relative mb-3">
          <input v-model="medSearch" placeholder="Search medicine by name or brand..."
            class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <div v-if="medSuggestions.length"
            class="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-20 mt-1 overflow-hidden">
            <div v-for="med in medSuggestions" :key="med.id"
              @click="addMedToRx(med)"
              class="px-3 py-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between gap-2 border-b last:border-0">
              <div>
                <p class="text-sm font-medium text-gray-800">{{ med.name }}</p>
                <p class="text-xs text-gray-400">{{ med.brand }} · {{ med.generic }} · {{ med.category }}</p>
              </div>
              <span class="text-xs text-green-600 shrink-0">₹{{ med.price }}</span>
            </div>
          </div>
        </div>

        <!-- Rx items -->
        <div v-if="rxMeds.length === 0"
          class="text-center py-6 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
          Search and add medicines above
        </div>
        <div v-else class="space-y-3">
          <div v-for="(item, idx) in rxMeds" :key="item.medId"
            class="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <div class="flex items-start justify-between gap-2 mb-3">
              <div>
                <p class="text-sm font-semibold text-gray-800">{{ item.name }}</p>
                <p class="text-xs text-gray-500">{{ item.brand }}</p>
              </div>
              <button @click="removeRxMed(idx)" class="text-gray-400 hover:text-red-500 text-xl leading-none mt-0.5">×</button>
            </div>

            <!-- Presets -->
            <div class="mb-2">
              <button @click="item.showPresets = !item.showPresets"
                class="text-xs text-blue-600 hover:text-blue-800 font-medium">
                ⚡ Quick presets {{ item.showPresets ? '▲' : '▼' }}
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
                <span class="text-xs text-gray-500">Dose (tabs/ml)</span>
                <input v-model.number="item.dose" type="number" min="0.5" step="0.5"
                  class="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </label>
              <label class="block">
                <span class="text-xs text-gray-500">Frequency</span>
                <select v-model="item.freq"
                  class="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                  <option v-for="f in FREQ_OPTIONS" :key="f.val" :value="f.val">{{ f.label }}</option>
                </select>
              </label>
              <label class="block">
                <span class="text-xs text-gray-500">Timing</span>
                <select v-model="item.timing"
                  class="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                  <option v-for="t in TIMING_OPTIONS" :key="t" :value="t">{{ t }}</option>
                </select>
              </label>
              <label class="block">
                <span class="text-xs text-gray-500">Duration (days)</span>
                <input v-model.number="item.duration" type="number" min="1"
                  class="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </label>
            </div>
            <input v-model="item.notes" placeholder="Optional instructions..."
              class="mt-2 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
            <p class="text-xs text-gray-500 mt-2 font-medium">
              Qty: {{ calcQty(item) }} units · ₹{{ (item.price * calcQty(item)).toFixed(2) }}
            </p>
          </div>
        </div>

        <!-- Rx Summary -->
        <div v-if="rxMeds.length" class="mt-3 bg-gray-50 rounded-xl p-3 border border-gray-200">
          <p class="text-xs font-bold text-gray-700 mb-2">Prescription Summary</p>
          <div v-for="r in rxMeds" :key="r.medId" class="flex justify-between text-xs text-gray-600 py-0.5">
            <span class="flex-1 truncate">{{ r.name }} · {{ r.dose }} × {{ r.freq }} × {{ r.duration }}d {{ r.timing }}</span>
            <span class="text-green-700 font-medium ml-2">Qty {{ calcQty(r) }}</span>
          </div>
          <div class="border-t border-gray-200 mt-2 pt-2 flex justify-between text-sm font-bold text-gray-800">
            <span>Total</span>
            <span class="text-green-700">₹{{ rxMeds.reduce((s,r) => s + r.price * calcQty(r), 0).toFixed(2) }}</span>
          </div>
        </div>

        <div v-if="submitError" class="mt-3 bg-red-50 text-red-600 text-xs rounded-xl px-3 py-2">{{ submitError }}</div>
        <div v-if="submitSuccess" class="mt-3 bg-green-50 text-green-700 text-sm rounded-xl px-3 py-2 font-medium">✅ {{ submitSuccess }}</div>

        <button @click="submitPrescription" :disabled="submitLoading || !rxMeds.length"
          class="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
          <span v-if="submitLoading">⏳ Submitting...</span>
          <span v-else>📤 Submit Prescription → Pharmacy</span>
        </button>
      </div>
    </div>
  </div>
</div>
  `,
});
