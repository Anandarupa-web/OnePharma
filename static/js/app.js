/**
 * app.js – OnePharma Phase 1
 * Initialises the Vue 3 application, seeds localStorage with rich mock data,
 * and provides the root component that switches between the three portals.
 *
 * Architecture note:
 *   • All "database" interactions read/write localStorage so the app is 100 % serverless.
 *   • In Phase 2 this layer will be replaced by Axios calls to Flask REST endpoints.
 */

import { createApp, ref, reactive, provide, computed } from 'vue';

// ── Page-level view imports ──────────────────────────────────────────────────
import AdminDashboard from './views/AdminDashboard.js';
import StaffPos       from './views/StaffPos.js';
import PatientHome    from './views/PatientHome.js';

// ── Shared component imports ─────────────────────────────────────────────────
import Navbar from './components/Navbar.js';

// ============================================================
// MOCK DATA  –  seeds localStorage on first load
// ============================================================

/** Full medicine catalogue with inventory levels, pricing, and metadata. */
const DEFAULT_INVENTORY = [
  { id: 1,  name: 'Paracetamol 500mg',     brand: 'Crocin',       generic: 'Paracetamol',     ingredient: 'Paracetamol', category: 'Analgesic',       stock: 240, minStock: 50,  price: 18,   gst: 5,  expiry: '2026-12-01', supplier: 'HealthCo',    unitsSold: 520 },
  { id: 2,  name: 'Amoxicillin 250mg',     brand: 'Mox',          generic: 'Amoxicillin',     ingredient: 'Amoxicillin', category: 'Antibiotic',      stock: 30,  minStock: 40,  price: 85,   gst: 12, expiry: '2025-04-15', supplier: 'PharmaGen',   unitsSold: 310 },
  { id: 3,  name: 'Metformin 500mg',       brand: 'Glycomet',     generic: 'Metformin',       ingredient: 'Metformin',   category: 'Antidiabetic',    stock: 180, minStock: 60,  price: 42,   gst: 5,  expiry: '2026-09-30', supplier: 'BioPharm',    unitsSold: 280 },
  { id: 4,  name: 'Atorvastatin 10mg',     brand: 'Atorva',       generic: 'Atorvastatin',    ingredient: 'Atorvastatin',category: 'Statin',          stock: 95,  minStock: 30,  price: 110,  gst: 12, expiry: '2026-07-22', supplier: 'MedWorld',    unitsSold: 240 },
  { id: 5,  name: 'Omeprazole 20mg',       brand: 'Omez',         generic: 'Omeprazole',      ingredient: 'Omeprazole',  category: 'Antacid',         stock: 150, minStock: 40,  price: 65,   gst: 5,  expiry: '2026-11-10', supplier: 'HealthCo',    unitsSold: 210 },
  { id: 6,  name: 'Azithromycin 500mg',    brand: 'Azithral',     generic: 'Azithromycin',    ingredient: 'Azithromycin',category: 'Antibiotic',      stock: 12,  minStock: 25,  price: 195,  gst: 12, expiry: '2025-03-25', supplier: 'PharmaGen',   unitsSold: 195 },
  { id: 7,  name: 'Cetirizine 10mg',       brand: 'Zyrtec',       generic: 'Cetirizine',      ingredient: 'Cetirizine',  category: 'Antihistamine',   stock: 200, minStock: 50,  price: 28,   gst: 5,  expiry: '2027-01-15', supplier: 'BioPharm',    unitsSold: 390 },
  { id: 8,  name: 'Ibuprofen 400mg',       brand: 'Brufen',       generic: 'Ibuprofen',       ingredient: 'Ibuprofen',   category: 'Analgesic',       stock: 175, minStock: 50,  price: 35,   gst: 5,  expiry: '2026-08-19', supplier: 'MedWorld',    unitsSold: 450 },
  { id: 9,  name: 'Losartan 50mg',         brand: 'Repace',       generic: 'Losartan',        ingredient: 'Losartan',    category: 'Antihypertensive',stock: 60,  minStock: 30,  price: 120,  gst: 12, expiry: '2026-05-28', supplier: 'HealthCo',    unitsSold: 165 },
  { id: 10, name: 'Amlodipine 5mg',        brand: 'Amlovas',      generic: 'Amlodipine',      ingredient: 'Amlodipine',  category: 'Antihypertensive',stock: 85,  minStock: 30,  price: 90,   gst: 12, expiry: '2026-10-05', supplier: 'PharmaGen',   unitsSold: 175 },
  { id: 11, name: 'Pantoprazole 40mg',     brand: 'Pantocid',     generic: 'Pantoprazole',    ingredient: 'Pantoprazole',category: 'Antacid',         stock: 130, minStock: 40,  price: 78,   gst: 5,  expiry: '2026-12-20', supplier: 'BioPharm',    unitsSold: 230 },
  { id: 12, name: 'Doxycycline 100mg',     brand: 'Doxy-1',       generic: 'Doxycycline',     ingredient: 'Doxycycline', category: 'Antibiotic',      stock: 20,  minStock: 30,  price: 145,  gst: 12, expiry: '2025-03-10', supplier: 'MedWorld',    unitsSold: 145 },
  { id: 13, name: 'Salbutamol 100mcg',     brand: 'Asthalin',     generic: 'Salbutamol',      ingredient: 'Salbutamol',  category: 'Bronchodilator',  stock: 45,  minStock: 20,  price: 155,  gst: 12, expiry: '2026-06-14', supplier: 'HealthCo',    unitsSold: 110 },
  { id: 14, name: 'Insulin Glargine 100U', brand: 'Lantus',       generic: 'Insulin Glargine',ingredient: 'Insulin',     category: 'Antidiabetic',    stock: 8,   minStock: 15,  price: 1250, gst: 5,  expiry: '2025-05-01', supplier: 'ColdChainPh', unitsSold: 60  },
  { id: 15, name: 'Vitamin D3 1000IU',     brand: 'D-Rise',       generic: 'Cholecalciferol', ingredient: 'Vit D3',      category: 'Supplement',      stock: 300, minStock: 60,  price: 55,   gst: 0,  expiry: '2027-03-31', supplier: 'NutriLab',    unitsSold: 340 },
];

/** Monthly sales data for the last 6 months (used in Admin charts). */
const DEFAULT_SALES = [
  { month: 'Oct', revenue: 48200 },
  { month: 'Nov', revenue: 53100 },
  { month: 'Dec', revenue: 71500 },
  { month: 'Jan', revenue: 62800 },
  { month: 'Feb', revenue: 58400 },
  { month: 'Mar', revenue: 66300 },
];

/** Dosage slip templates displayed on the Patient portal. */
const DEFAULT_DOSAGE_SLIPS = [
  {
    id: 1,
    medicine: 'Paracetamol 500mg',
    dosage: '1 tablet',
    frequency: 'Every 6 hours',
    timing: 'After meals',
    duration: '5 days',
    warnings: 'Do not exceed 4 tablets in 24 hours. Avoid alcohol.',
    prescribedBy: 'Dr. Mehta',
    date: '2026-03-01',
  },
  {
    id: 2,
    medicine: 'Amoxicillin 250mg',
    dosage: '1 capsule',
    frequency: 'Twice daily (morning & night)',
    timing: 'With a full glass of water',
    duration: '7 days',
    warnings: 'Complete the full course. Inform doctor of any allergic reaction.',
    prescribedBy: 'Dr. Mehta',
    date: '2026-03-01',
  },
  {
    id: 3,
    medicine: 'Metformin 500mg',
    dosage: '1 tablet',
    frequency: 'Twice daily',
    timing: 'With or immediately after meals',
    duration: 'Ongoing – refill monthly',
    warnings: 'Monitor blood sugar levels. Report severe nausea or muscle pain immediately.',
    prescribedBy: 'Dr. Sen',
    date: '2026-02-20',
  },
];

/** Available appointment time slots. */
const generateSlots = () => {
  const slots = [];
  const times = ['09:00','09:15','09:30','09:45','10:00','10:15','10:30','10:45',
                  '11:00','11:15','11:30','11:45','14:00','14:15','14:30','14:45',
                  '15:00','15:15','15:30','15:45','16:00','16:15','16:30','16:45'];
  const booked = ['09:15','10:00','10:30','14:15','15:00'];
  times.forEach(t => slots.push({ time: t, booked: booked.includes(t) }));
  return slots;
};

// ── Seed localStorage on first visit ────────────────────────────────────────
const seedLocalStorage = () => {
  if (!localStorage.getItem('op_inventory')) {
    localStorage.setItem('op_inventory',   JSON.stringify(DEFAULT_INVENTORY));
  }
  if (!localStorage.getItem('op_sales')) {
    localStorage.setItem('op_sales',       JSON.stringify(DEFAULT_SALES));
  }
  if (!localStorage.getItem('op_dosage_slips')) {
    localStorage.setItem('op_dosage_slips',JSON.stringify(DEFAULT_DOSAGE_SLIPS));
  }
  if (!localStorage.getItem('op_slots')) {
    localStorage.setItem('op_slots',       JSON.stringify(generateSlots()));
  }
};

// ── Helpers to read/write localStorage ──────────────────────────────────────
export const getInventory    = () => JSON.parse(localStorage.getItem('op_inventory')    || '[]');
export const saveInventory   = (d) => localStorage.setItem('op_inventory', JSON.stringify(d));
export const getSalesData    = () => JSON.parse(localStorage.getItem('op_sales')        || '[]');
export const getDosageSlips  = () => JSON.parse(localStorage.getItem('op_dosage_slips') || '[]');
export const getSlots        = () => JSON.parse(localStorage.getItem('op_slots')        || '[]');
export const saveSlots       = (d) => localStorage.setItem('op_slots', JSON.stringify(d));

// ============================================================
// ROOT COMPONENT
// ============================================================

const App = {
  name: 'App',

  components: { Navbar, AdminDashboard, StaffPos, PatientHome },

  setup() {
    /** The currently active portal. Controls which view is rendered. */
    const currentView = ref('PatientHome');

    /** Mapping used by the Navbar for labels / icons. */
    const views = [
      { id: 'PatientHome',    label: 'Patient',  icon: 'user'    },
      { id: 'StaffPos',       label: 'Staff',    icon: 'briefcase' },
      { id: 'AdminDashboard', label: 'Admin',    icon: 'chart-bar'},
    ];

    const switchView = (id) => { currentView.value = id; };

    // Provide shared state to all descendant components
    provide('currentView', currentView);
    provide('switchView',  switchView);

    return { currentView, views, switchView };
  },

  template: `
    <div class="min-h-screen flex flex-col">
      <!-- Top navigation bar – shared across all portals -->
      <Navbar
        :views="views"
        :current="currentView"
        @switch="switchView"
      />

      <!-- Dynamic portal rendering -->
      <main class="flex-1">
        <Transition name="fade" mode="out-in">
          <component :is="currentView" :key="currentView" />
        </Transition>
      </main>
    </div>
  `,
};

// ── Mount ────────────────────────────────────────────────────────────────────
seedLocalStorage();
createApp(App).mount('#app');
