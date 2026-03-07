/**
 * app.js – OnePharma Phase 1
 * Initialises the Vue 3 application, seeds localStorage with rich mock data,
 * and provides the root component that switches between the three portals.
 *
 * Architecture note:
 *   • All "database" interactions read/write localStorage so the app is 100 % serverless.
 *   • In Phase 2 this layer will be replaced by Axios calls to Flask REST endpoints.
 *   • Auth state is held in localStorage under 'op_auth' (no passwords stored there).
 */

import { createApp, ref, reactive, provide, onMounted, onUnmounted } from 'vue';

// ── Page-level view imports ──────────────────────────────────────────────────
import AdminDashboard     from './views/AdminDashboard.js';
import PharmacyDashboard  from './views/PharmacyDashboard.js';
import StaffPos           from './views/StaffPos.js';
import PatientHome        from './views/PatientHome.js';
import LoginPage          from './views/LoginPage.js';
import DoctorDashboard    from './views/DoctorDashboard.js';

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

/**
 * Nearby pharmacies – simulates a geo-search result.
 * In Phase 2 this will be a Flask API call with the user's coordinates.
 */
const DEFAULT_PHARMACIES = [
  { id: 1, name: 'Saha Pharmacy',    address: '12, MG Road, Kolkata – 700001',              distance: '0.3 km', rating: 4.5, totalRatings: 128, open: true,  phone: '+91-98765-43210', hours: '8 AM – 10 PM', lat: 22.5726, lng: 88.3639 },
  { id: 2, name: 'MedPlus',          address: '45, Park Street, Kolkata – 700016',           distance: '1.1 km', rating: 4.2, totalRatings: 214, open: true,  phone: '+91-98765-12345', hours: '9 AM – 9 PM',  lat: 22.5535, lng: 88.3513 },
  { id: 3, name: 'Apollo Pharmacy',  address: '78, Rashbehari Ave, Kolkata – 700029',        distance: '2.0 km', rating: 4.7, totalRatings: 356, open: false, phone: '+91-98765-67890', hours: '8 AM – 11 PM', lat: 22.5205, lng: 88.3639 },
  { id: 4, name: 'LifeCare Pharmacy',address: '3, Sector V, Salt Lake, Kolkata – 700091',   distance: '3.5 km', rating: 4.0, totalRatings: 87,  open: true,  phone: '+91-98765-11111', hours: '10 AM – 8 PM', lat: 22.5958, lng: 88.4496 },
];

/**
 * Per-pharmacy stock levels – { pharmacyId: { medicineId: { stock, price } } }.
 * Pharmacy 1 mirrors the main inventory; others have variations to simulate reality.
 */
const DEFAULT_PHARMACY_INVENTORIES = {
  1: { 1:{s:240,p:18}, 2:{s:30,p:85},   3:{s:180,p:42},  4:{s:95,p:110},  5:{s:150,p:65},  6:{s:12,p:195},  7:{s:200,p:28}, 8:{s:175,p:35}, 9:{s:60,p:120},  10:{s:85,p:90},  11:{s:130,p:78}, 12:{s:20,p:145}, 13:{s:45,p:155},  14:{s:8,p:1250},  15:{s:300,p:55} },
  2: { 1:{s:85,p:20},  2:{s:0,p:88},    3:{s:200,p:40},  4:{s:50,p:115},  5:{s:90,p:68},   6:{s:0,p:199},   7:{s:150,p:30}, 8:{s:120,p:38}, 9:{s:0,p:125},   10:{s:60,p:95},  11:{s:80,p:82},  12:{s:0,p:150},  13:{s:30,p:160},  14:{s:5,p:1299},  15:{s:200,p:58} },
  3: { 1:{s:180,p:17}, 2:{s:60,p:82},   3:{s:150,p:44},  4:{s:80,p:108},  5:{s:200,p:62},  6:{s:25,p:192},  7:{s:250,p:26}, 8:{s:200,p:33}, 9:{s:40,p:118},  10:{s:100,p:88}, 11:{s:110,p:76}, 12:{s:35,p:142}, 13:{s:55,p:152},  14:{s:12,p:1220}, 15:{s:400,p:52} },
  4: { 1:{s:120,p:19}, 2:{s:20,p:90},   3:{s:90,p:45},   4:{s:0,p:112},   5:{s:60,p:70},   6:{s:0,p:200},   7:{s:80,p:32},  8:{s:100,p:37}, 9:{s:20,p:122},  10:{s:0,p:92},   11:{s:50,p:80},  12:{s:0,p:148},  13:{s:0,p:158},   14:{s:0,p:1280},  15:{s:150,p:57} },
};

/**
 * Hierarchy: app_admin (OnePharma devs) > pharmacist (pharmacy owner) > staff (pharmacy employees)
 *   app_admin   → AdminDashboard   (OnePharma developers — supreme admin)
 *   pharmacist  → PharmacyDashboard (pharmacy owner/manager, e.g. Suresh Saha)
 *   staff       → StaffPos          (pharmacy employees — POS / billing)
 */
const DEFAULT_STAFF = [
  { id: 0,  name: 'OnePharma Admin',      email: 'admin@onepharma.com',      password: 'appadmin123', role: 'app_admin',  phone: '+91-99999-00000', joinDate: '2024-01-01', active: true,  avatar: 'OP', pharmacyId: null,  doctorId: null },
  { id: 1,  name: 'Suresh Saha',          email: 'owner@saha.com',           password: 'owner123',    role: 'pharmacist', phone: '+91-98765-00001', joinDate: '2022-06-01', active: true,  avatar: 'SS', pharmacyId: 1,     doctorId: null },
  { id: 2,  name: 'Raj Kumar',            email: 'raj@saha.com',             password: 'pass123',     role: 'staff',      phone: '+91-98765-00002', joinDate: '2023-03-15', active: true,  avatar: 'RK', pharmacyId: 1,     doctorId: null },
  { id: 3,  name: 'Priya Singh',          email: 'priya@saha.com',           password: 'pass123',     role: 'staff',      phone: '+91-98765-00003', joinDate: '2023-08-20', active: true,  avatar: 'PS', pharmacyId: 1,     doctorId: null },
  { id: 4,  name: 'Dr. Amit Dev',         email: 'amit@saha.com',            password: 'pass123',     role: 'staff',      phone: '+91-98765-00004', joinDate: '2023-01-10', active: false, avatar: 'AD', pharmacyId: 1,     doctorId: null },
  { id: 5,  name: 'Meena Rao',            email: 'meena@saha.com',           password: 'pass123',     role: 'staff',      phone: '+91-98765-00005', joinDate: '2024-01-05', active: true,  avatar: 'MR', pharmacyId: 1,     doctorId: null },
  { id: 10, name: 'Dr. R. Mehta',         email: 'mehta@clinic.com',         password: 'doc123',      role: 'doctor',     phone: '+91-99001-11111', joinDate: '2020-01-01', active: true,  avatar: 'RM', pharmacyId: 1,     doctorId: 1    },
  { id: 11, name: 'Dr. A. Sen',           email: 'sen@clinic.com',           password: 'doc123',      role: 'doctor',     phone: '+91-99001-22222', joinDate: '2020-01-01', active: true,  avatar: 'AS', pharmacyId: 1,     doctorId: 2    },
  { id: 12, name: 'Dr. P. Chatterjee',    email: 'pchatterjee@clinic.com',   password: 'doc123',      role: 'doctor',     phone: '+91-99001-33333', joinDate: '2020-01-01', active: true,  avatar: 'PC', pharmacyId: null,  doctorId: 3    },
];

/**
 * Demo patient accounts.
 * Phone + password login; passwords are plain-text for Phase 1 simulation only.
 * Phase 2 will use bcrypt server-side + JWT.
 */
const DEFAULT_PATIENTS = [
  { id: 101, name: 'Arjun Sharma',  phone: '+91-90001-11111', phoneVerified: true,  password: 'demo123', createdAt: '2026-01-15', age: 34, address: 'Salt Lake, Kolkata',    complaint: 'Fever and body ache',    tag: 'returning' },
  { id: 102, name: 'Priya Das',     phone: '+91-90002-22222', phoneVerified: false, password: 'demo123', createdAt: '2026-02-20', age: 28, address: 'Park Street, Kolkata',   complaint: 'Diabetes follow-up',     tag: 'returning' },
  { id: 103, name: 'Ravi Verma',    phone: '+91-90003-33333', phoneVerified: true,  password: 'demo123', createdAt: '2026-01-01', age: 52, address: 'Ballygunge, Kolkata',    complaint: 'BP and cholesterol',     tag: 'returning' },
  { id: 104, name: 'Sunita Pal',    phone: '+91-90004-44444', phoneVerified: true,  password: 'demo123', createdAt: '2026-02-01', age: 41, address: 'New Town, Kolkata',      complaint: 'Cold and cough',         tag: 'new'       },
  { id: 105, name: 'Amit Roy',      phone: '+91-90005-55555', phoneVerified: true,  password: 'demo123', createdAt: '2026-03-01', age: 23, address: 'Howrah, Kolkata',        complaint: 'Skin allergy',           tag: 'new'       },
  { id: 106, name: 'Kavita Singh',  phone: '+91-90006-66666', phoneVerified: false, password: 'demo123', createdAt: '2026-01-20', age: 60, address: 'Alipore, Kolkata',       complaint: 'Asthma check-up',        tag: 'returning' },
  { id: 107, name: 'Deepak Ghosh',  phone: '+91-90007-77777', phoneVerified: true,  password: 'demo123', createdAt: '2026-02-15', age: 38, address: 'Dum Dum, Kolkata',       complaint: 'Back pain',              tag: 'new'       },
  { id: 108, name: 'Meena Tiwari',  phone: '+91-90008-88888', phoneVerified: true,  password: 'demo123', createdAt: '2026-02-28', age: 45, address: 'Jadavpur, Kolkata',      complaint: 'Thyroid follow-up',      tag: 'returning' },
];

const DEFAULT_APPOINTMENTS = [
  { id: 'APT-001', patientId: 101, patientName: 'Arjun Sharma',  patientPhone: '+91-90001-11111', doctorId: 1, doctorName: 'Dr. R. Mehta', date: '2026-03-08', time: '10:00', reason: 'Fever and body ache',  status: 'scheduled', pharmacyId: 1 },
  { id: 'APT-002', patientId: 102, patientName: 'Priya Das',     patientPhone: '+91-90002-22222', doctorId: 2, doctorName: 'Dr. A. Sen',   date: '2026-03-08', time: '11:00', reason: 'Diabetes follow-up',   status: 'scheduled', pharmacyId: 1 },
  { id: 'APT-003', patientId: 103, patientName: 'Ravi Verma',    patientPhone: '+91-90003-33333', doctorId: 2, doctorName: 'Dr. A. Sen',   date: '2026-03-07', time: '09:30', reason: 'BP check',             status: 'completed', pharmacyId: 1 },
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

/** Default doctors for the master database. */
const DEFAULT_DOCTORS = [
  { id: 1, name: 'Dr. R. Mehta',      specialty: 'General Physician',  phone: '+91-99001-11111', clinic: 'Mehta Clinic, Park Street',          active: true, pharmacyId: 1,    lat: 22.5726, lng: 88.3639, email: 'mehta@clinic.com',      password: 'doc123' },
  { id: 2, name: 'Dr. A. Sen',        specialty: 'Diabetologist',      phone: '+91-99001-22222', clinic: 'Sen Diabetes Centre, Salt Lake',     active: true, pharmacyId: 1,    lat: 22.5810, lng: 88.3990, email: 'sen@clinic.com',         password: 'doc123' },
  { id: 3, name: 'Dr. P. Chatterjee', specialty: 'Cardiologist',       phone: '+91-99001-33333', clinic: 'Heart Care Hospital, Ballygunge',    active: true, pharmacyId: null, lat: 22.5205, lng: 88.3639, email: 'pchatterjee@clinic.com',  password: 'doc123' },
  { id: 4, name: 'Dr. S. Roy',        specialty: 'Pulmonologist',      phone: '+91-99001-44444', clinic: 'Breath Easy Clinic, New Town',       active: true, pharmacyId: null, lat: 22.6169, lng: 88.4700, email: 'sroy@clinic.com',         password: 'doc123' },
];

// ── Data version – bump this string whenever DEFAULT_STAFF changes  ──────────
// Any returning browser with stale staff credentials will get a fresh seed.
const DATA_VERSION = '4';
const _versionKey  = 'op_data_version';

// ── Seed localStorage on first visit ────────────────────────────────────────
const seedLocalStorage = () => {
  // If the stored data-version doesn't match, force-refresh the staff table
  // (and orders, which also changed shape) so new role credentials take effect.
  if (localStorage.getItem(_versionKey) !== DATA_VERSION) {
    localStorage.removeItem('op_staff');
    localStorage.removeItem('op_orders');
    localStorage.removeItem('op_auth');
    localStorage.removeItem('op_doctors');
    localStorage.removeItem('op_patients');
    localStorage.removeItem('op_appointments');
    localStorage.setItem(_versionKey, DATA_VERSION);
  }

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
  if (!localStorage.getItem('op_pharmacies')) {
    localStorage.setItem('op_pharmacies',  JSON.stringify(DEFAULT_PHARMACIES));
  }
  if (!localStorage.getItem('op_pharmacy_inv')) {
    localStorage.setItem('op_pharmacy_inv',JSON.stringify(DEFAULT_PHARMACY_INVENTORIES));
  }
  if (!localStorage.getItem('op_staff')) {
    localStorage.setItem('op_staff',       JSON.stringify(DEFAULT_STAFF));
  }
  if (!localStorage.getItem('op_patients')) {
    localStorage.setItem('op_patients',    JSON.stringify(DEFAULT_PATIENTS));
  }
  if (!localStorage.getItem('op_carts')) {
    localStorage.setItem('op_carts',       JSON.stringify([]));
  }
  if (!localStorage.getItem('op_orders')) {
    const now = new Date();
    const inXh = (h) => new Date(now.getTime() + h * 3600000).toISOString();
    const inXd = (d) => new Date(now.getTime() + d * 86400000).toISOString();
    const agoXh = (h) => new Date(now.getTime() - h * 3600000).toISOString();
    const DEFAULT_ORDERS = [
      {
        id: 'ORD-000001', patientName: 'Arjun Sharma', patientPhone: '+91-90001-11111',
        doctorName: '', source: 'patient_cart',
        items: [{ name: 'Paracetamol 500mg', qty: 2, price: 18, gst: 5 }, { name: 'Cetirizine 10mg', qty: 1, price: 28, gst: 5 }],
        subtotal: 64, gstAmount: 3.2, discountAmount: 0, finalTotal: 67.2,
        status: 'pending', createdAt: agoXh(2),
        expiresAt: inXh(22),
      },
      {
        id: 'ORD-000002', patientName: 'Priya Das', patientPhone: '+91-90002-22222',
        doctorName: 'Dr. R. Mehta', source: 'doctor_prescription',
        items: [{ name: 'Amoxicillin 250mg', qty: 1, price: 85, gst: 12 }, { name: 'Pantoprazole 40mg', qty: 1, price: 78, gst: 5 }],
        subtotal: 163, gstAmount: 14.1, discountAmount: 0, finalTotal: 177.1,
        status: 'pending', createdAt: agoXh(48),
        expiresAt: inXd(28),
      },
      {
        id: 'ORD-000003', patientName: 'Ravi Verma', patientPhone: '+91-90003-33333',
        doctorName: 'Dr. A. Sen', source: 'doctor_prescription',
        items: [{ name: 'Metformin 500mg', qty: 3, price: 42, gst: 5 }, { name: 'Atorvastatin 10mg', qty: 1, price: 110, gst: 12 }],
        subtotal: 236, gstAmount: 19.5, discountAmount: 10, finalTotal: 245.5,
        status: 'pending', createdAt: agoXh(24),
        expiresAt: inXd(29),
      },
      {
        id: 'ORD-000004', patientName: 'Sunita Pal', patientPhone: '+91-90004-44444',
        doctorName: '', source: 'patient_cart',
        items: [{ name: 'Ibuprofen 400mg', qty: 2, price: 35, gst: 5 }],
        subtotal: 70, gstAmount: 3.5, discountAmount: 5, finalTotal: 68.5,
        status: 'completed', createdAt: agoXh(72),
        expiresAt: null,
      },
    ];
    localStorage.setItem('op_orders', JSON.stringify(DEFAULT_ORDERS));
  }
  if (!localStorage.getItem('op_doctors')) {
    localStorage.setItem('op_doctors',     JSON.stringify(DEFAULT_DOCTORS));
  }
  if (!localStorage.getItem('op_appointments')) {
    localStorage.setItem('op_appointments', JSON.stringify(DEFAULT_APPOINTMENTS));
  }
  if (!localStorage.getItem('op_medicine_requests')) {
    localStorage.setItem('op_medicine_requests', JSON.stringify([]));
  }
};

// ── Helpers to read/write localStorage ──────────────────────────────────────
export const getInventory       = () => JSON.parse(localStorage.getItem('op_inventory')    || '[]');
export const saveInventory      = (d) => localStorage.setItem('op_inventory', JSON.stringify(d));
export const getSalesData       = () => JSON.parse(localStorage.getItem('op_sales')        || '[]');
export const getDosageSlips     = () => JSON.parse(localStorage.getItem('op_dosage_slips') || '[]');
export const getSlots           = () => JSON.parse(localStorage.getItem('op_slots')        || '[]');
export const saveSlots          = (d) => localStorage.setItem('op_slots', JSON.stringify(d));
export const getPharmacies      = () => JSON.parse(localStorage.getItem('op_pharmacies')   || '[]');
export const savePharmacies     = (d) => localStorage.setItem('op_pharmacies', JSON.stringify(d));
export const getPharmacyInv     = () => JSON.parse(localStorage.getItem('op_pharmacy_inv') || '{}');
export const getStaff           = () => JSON.parse(localStorage.getItem('op_staff')        || '[]');
export const saveStaff          = (d) => localStorage.setItem('op_staff', JSON.stringify(d));

/** Patient account helpers. */
export const getPatients        = () => JSON.parse(localStorage.getItem('op_patients')     || '[]');
export const savePatients       = (d) => localStorage.setItem('op_patients', JSON.stringify(d));

/** Patient cart helpers. Cart shape: { id, patientId, pharmacyId, pharmacyName, items: [{medId, medName, price, qty}], createdAt } */
export const getCarts           = () => JSON.parse(localStorage.getItem('op_carts')        || '[]');
export const saveCarts          = (d) => localStorage.setItem('op_carts', JSON.stringify(d));

/** Patient order helpers. Order shape: { id, cartId, patientId, patientName, patientPhone, pharmacyId, pharmacyName, items, status, createdAt } */
export const getOrders          = () => JSON.parse(localStorage.getItem('op_orders')       || '[]');
export const saveOrders         = (d) => localStorage.setItem('op_orders', JSON.stringify(d));

/** Dosage slip write helper (read helper already above). */
export const saveDosageSlips    = (d) => localStorage.setItem('op_dosage_slips', JSON.stringify(d));

/** Doctor / prescriber helpers (staff POS). */
export const getDoctors         = () => JSON.parse(localStorage.getItem('op_doctors')           || '[]');
export const saveDoctors        = (d) => localStorage.setItem('op_doctors', JSON.stringify(d));

/** Appointment helpers. */
export const getAppointments    = () => JSON.parse(localStorage.getItem('op_appointments')      || '[]');
export const saveAppointments   = (d) => localStorage.setItem('op_appointments', JSON.stringify(d));

/** Medicine-request helpers – staff POS sends new medicines for admin approval. */
export const getMedicineRequests  = () => JSON.parse(localStorage.getItem('op_medicine_requests') || '[]');
export const saveMedicineRequests = (d) => localStorage.setItem('op_medicine_requests', JSON.stringify(d));

/** Patient session – stored separately from staff auth (op_auth). Password never written here. */
export const getPatientAuth     = () => JSON.parse(localStorage.getItem('op_patient_auth') || 'null');
export const savePatientAuth    = (p) => {
  const safe = { id: p.id, name: p.name, phone: p.phone, phoneVerified: p.phoneVerified || false };
  localStorage.setItem('op_patient_auth', JSON.stringify(safe));
};
export const clearPatientAuth   = () => localStorage.removeItem('op_patient_auth');

/** Auth helpers – password is never written to op_auth. */
export const getAuth  = () => JSON.parse(localStorage.getItem('op_auth')  || 'null');
export const saveAuth = (user) => {
  const safe = { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar };
  if (user.role === 'doctor') safe.doctorId = user.doctorId || null;
  localStorage.setItem('op_auth', JSON.stringify(safe));
};
export const clearAuth = () => localStorage.removeItem('op_auth');

/**
 * Shared role → Tailwind badge class map.
 * Exported so Navbar, AdminDashboard, and any future component
 * can use the same colour scheme without duplication.
 */
export const roleBadgeClass = (role) => {
  const map = {
    app_admin:  'bg-purple-100 text-purple-800',
    pharmacist: 'bg-indigo-100 text-indigo-700',
    staff:      'bg-green-100  text-green-700',
    doctor:     'bg-blue-100   text-blue-700',
  };
  return map[role] || 'bg-gray-100 text-gray-700';
};

// ============================================================
// ROOT COMPONENT
// ============================================================

const App = {
  name: 'App',

  components: { Navbar, AdminDashboard, PharmacyDashboard, StaffPos, PatientHome, LoginPage, DoctorDashboard },

  setup() {
    /** The currently active portal view name. */
    const currentView = ref('PatientHome');

    /** The currently authenticated staff user (null = guest / patient browsing). */
    const currentUser = ref(getAuth());

    /** When a guest tries to open a protected portal, remember target for post-login redirect. */
    const pendingView = ref(null);

    /**
     * Shared bridge object for the patient portal.
     * Provided to all descendants (PatientHome + Navbar) so they share reactive
     * state without prop-drilling.
     *
     *   user        – currently logged-in patient (null = guest)
     *   cartCount   – total item count across all active carts
     *   city        – selected city for pharmacy geo-filter
     *   activeTab   – active page in PatientHome ('home'|'find'|'cart'|'me')
     *   showScanner – flag to open the ScannerModal from Navbar scan button
     *   searchQuery – text typed in the desktop navbar search bar
     */
    const patientBridge = reactive({
      user:        getPatientAuth(),
      cartCount:   0,
      city:        localStorage.getItem('op_city') || 'Kolkata',
      activeTab:   'home',
      showScanner: false,
      searchQuery: '',
    });

    /**
     * Route to a portal view with auth guard.
     * PatientHome is always accessible; StaffPos/AdminDashboard require auth.
     */
    const switchView = (id) => {
      if (id === 'PatientHome') {
        currentView.value = 'PatientHome';
        window.location.hash = '';
        return;
      }
      const protected_ = { StaffPos: true, AdminDashboard: true, PharmacyDashboard: true, DoctorDashboard: true };
      if (protected_[id] && !currentUser.value) {
        pendingView.value = id;
        currentView.value = 'LoginPage';
        return;
      }
      if (id === 'AdminDashboard' && currentUser.value && currentUser.value.role !== 'app_admin') return;
      if (id === 'PharmacyDashboard' && currentUser.value && !['app_admin','pharmacist'].includes(currentUser.value.role)) return;
      if (id === 'DoctorDashboard' && currentUser.value && currentUser.value.role !== 'doctor') return;
      currentView.value = id;
    };

    /** Called by LoginPage after credentials are validated. */
    const handleLogin = (user) => {
      saveAuth(user);
      currentUser.value = { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar };
      const roleRoutes = { app_admin: 'AdminDashboard', pharmacist: 'PharmacyDashboard', staff: 'StaffPos', doctor: 'DoctorDashboard' };
      const target = pendingView.value || roleRoutes[user.role] || 'StaffPos';
      pendingView.value = null;
      switchView(target);
    };

    /** Called from Navbar logout button or from any child component. */
    const handleLogout = () => {
      clearAuth();
      currentUser.value = null;
      currentView.value = 'PatientHome';
      window.location.hash = '';
    };

    // ── Hash-based URL routing ─────────────────────────────────────────
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (hash === 'staff')           switchView('StaffPos');
      else if (hash === 'admin')      switchView('AdminDashboard');
      else if (hash === 'pharmacy')   switchView('PharmacyDashboard');
      else if (hash === 'doctor')     switchView('DoctorDashboard');
      else if (!hash)                 currentView.value = 'PatientHome';
    };
    onMounted(() => {
      handleHashChange();
      window.addEventListener('hashchange', handleHashChange);
    });
    onUnmounted(() => window.removeEventListener('hashchange', handleHashChange));

    // ── Provide shared state & actions to all descendants ──────────────
    provide('currentView',   currentView);
    provide('currentUser',   currentUser);
    provide('switchView',    switchView);
    provide('handleLogin',   handleLogin);
    provide('handleLogout',  handleLogout);
    provide('patientBridge', patientBridge);

    return { currentView, currentUser, switchView, handleLogout, patientBridge };
  },

  template: `
    <div class="min-h-screen flex flex-col">
      <Navbar
        :current-view="currentView"
        :staff-user="currentUser"
        :patient-bridge="patientBridge"
        @staff-logout="handleLogout"
      />
      <main class="flex-1">
        <Transition name="fade" mode="out-in">
          <component :is="currentView" :key="currentView" />
        </Transition>
      </main>

      <!-- ═══════════════════════════════════════════════════
           SITE FOOTER
           ═══════════════════════════════════════════════════ -->
      <footer class="bg-gray-900 text-gray-300 mt-auto no-print">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-8">

            <!-- Brand column -->
            <div>
              <div class="flex items-center gap-2 mb-3">
                <span class="text-2xl">💊</span>
                <span class="font-extrabold text-white text-lg">OnePharma</span>
              </div>
              <p class="text-xs text-gray-400 leading-relaxed">
                Bridging patients, pharmacies, and healthcare providers on a single intelligent platform.
                Phase 1 working prototype.
              </p>
              <p class="text-xs text-gray-500 mt-3">© 2026 OnePharma. All rights reserved.</p>
            </div>

            <!-- For Patients column -->
            <div>
              <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">For Patients</h3>
              <ul class="space-y-2 text-sm">
                <li>
                  <button @click="patientBridge.activeTab = 'home'; currentView = 'PatientHome'"
                    class="hover:text-white transition">🏠 Patient Home</button>
                </li>
                <li>
                  <button @click="patientBridge.activeTab = 'find'; currentView = 'PatientHome'"
                    class="hover:text-white transition">🔍 Find Medicines</button>
                </li>
                <li>
                  <button @click="patientBridge.showScanner = true; currentView = 'PatientHome'"
                    class="hover:text-white transition">📷 Scan Prescription</button>
                </li>
              </ul>
            </div>

            <!-- For Professionals column -->
            <div>
              <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">For Professionals</h3>
              <ul class="space-y-2 text-sm">
                <li>
                  <a href="#pharmacy" class="hover:text-white transition flex items-center gap-2">
                    <span class="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Owner</span>
                    Pharmacy Owner Login
                  </a>
                </li>
                <li>
                  <a href="#staff" class="hover:text-white transition flex items-center gap-2">
                    <span class="bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Staff</span>
                    Pharmacy Staff Login
                  </a>
                </li>
                <li>
                  <a href="#admin" class="hover:text-white transition flex items-center gap-2">
                    <span class="bg-purple-800 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Admin</span>
                    OnePharma App Admin
                  </a>
                </li>
                <li>
                  <a href="#doctor" class="hover:text-white transition flex items-center gap-2">
                    <span class="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Doctor</span>
                    Doctor Login
                  </a>
                </li>
                <li class="text-xs text-gray-500 pt-1">
                  Append <code class="bg-gray-800 px-1 rounded">#pharmacy</code>,
                  <code class="bg-gray-800 px-1 rounded">#staff</code> or
                  <code class="bg-gray-800 px-1 rounded">#admin</code> to the URL
                </li>
              </ul>
            </div>
          </div>

          <!-- Bottom bar -->
          <div class="border-t border-gray-800 mt-8 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p class="text-xs text-gray-500">Phase 1 Prototype · No real data is stored · localStorage only</p>
            <div class="flex items-center gap-4 text-xs text-gray-500">
              <span>Vue 3</span>
              <span>·</span>
              <span>Tailwind CSS</span>
              <span>·</span>
              <span>100% Serverless</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  `,
};

// ── Mount ────────────────────────────────────────────────────────────────────
seedLocalStorage();
createApp(App).mount('#app');
