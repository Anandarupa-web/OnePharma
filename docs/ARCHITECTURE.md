# Architecture Reference

This document describes the frontend architecture of OnePharma Phase 1 so that a backend engineer can understand how the Vue application is structured before integrating a Flask API.

---

## Table of Contents

1. [Entry Point](#entry-point)
2. [Vue Application Bootstrap](#vue-application-bootstrap)
3. [View Routing](#view-routing)
4. [Auth Guard Logic](#auth-guard-logic)
5. [Global State: `provide` / `inject`](#global-state-provide--inject)
6. [The `patientBridge` Object](#the-patientbridge-object)
7. [The Data Layer (`app.js` exports)](#the-data-layer-appjs-exports)
8. [Component Tree](#component-tree)
9. [View Summary](#view-summary)
10. [CSS and Styling](#css-and-styling)
11. [Phase 2 Migration Pointers](#phase-2-migration-pointers)

---

## Entry Point

`index.html` is the single HTML file for the entire application.

```html
<!-- Vue 3 via importmap (ESM) -->
<script type="importmap">
  { "imports": { "vue": "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js" } }
</script>
<script type="module" src="./static/js/app.js"></script>
```

All JavaScript files use `import ... from 'vue'` and relative ES module paths. There is no bundler (Webpack/Vite). Tailwind CSS is loaded from CDN and configured inline in `index.html`.

---

## Vue Application Bootstrap

`static/js/app.js` does three things in order:

1. **Seed localStorage** — `seedLocalStorage()` runs once at module load. It checks a `DATA_VERSION` key (`'4'`); if the stored version differs it wipes `op_staff`, `op_orders`, `op_auth`, `op_doctors`, `op_patients`, and `op_appointments`, then re-seeds all defaults. On subsequent loads it is a no-op (each key is only written if absent).

2. **Define the root `App` component** — manages `currentView`, auth state, hash routing, and provides global state.

3. **Mount** — `createApp(App).mount('#app')`.

---

## View Routing

There is no Vue Router. Routing is implemented using:

- A reactive `currentView` ref (string, component name) in the root `App`.
- `<component :is="currentView" />` in the root template renders the active view.
- A `switchView(id)` function handles navigation and auth guards.
- `window.addEventListener('hashchange', ...)` maps URL hashes to views on page load and back/forward navigation.

### Hash → View Map

```
#          (empty)   →  PatientHome
#staff               →  StaffPos
#pharmacy            →  PharmacyDashboard
#doctor              →  DoctorDashboard
#admin               →  AdminDashboard
```

`LoginPage` is rendered when an unauthenticated user attempts to navigate to a protected view. After login, `handleLogin` redirects to the intended view.

---

## Auth Guard Logic

```
switchView(id)
  └─ if id === 'PatientHome'    → always allow
  └─ if protected and no user   → save pendingView, show LoginPage
  └─ if id === 'AdminDashboard' → require role === 'app_admin'
  └─ if id === 'PharmacyDashboard' → require role in ['app_admin', 'pharmacist']
  └─ if id === 'DoctorDashboard'  → require role === 'doctor'
  └─ otherwise (StaffPos)       → any authenticated staff
```

**Staff auth session** is stored in `localStorage` under `op_auth`. The helper `saveAuth()` strips the password before writing:

```js
{ id, name, email, role, avatar, doctorId? }
```

**Patient auth session** is stored separately in `op_patient_auth`:

```js
{ id, name, phone, phoneVerified }
```

Passwords are **never** written to either auth key. In Phase 1 password comparison is done in-memory against the `op_staff` or `op_patients` tables (plain text, simulation only).

---

## Global State: `provide` / `inject`

The root `App` component provides the following values via Vue's `provide()`. Any child component can inject them without prop-drilling:

| Key | Type | Description |
|-----|------|-------------|
| `currentView` | `Ref<string>` | Active view name |
| `currentUser` | `Ref<object\|null>` | Authenticated staff user (id, name, email, role, avatar, doctorId?) |
| `switchView` | `Function(id)` | Navigate to a named view |
| `handleLogin` | `Function(user)` | Called by LoginPage after credential validation |
| `handleLogout` | `Function()` | Clears auth and returns to PatientHome |
| `patientBridge` | `Reactive<object>` | Shared patient-portal state (see below) |

---

## The `patientBridge` Object

A single reactive object shared between the `Navbar` and `PatientHome` components so they can share state without being parent/child:

```js
patientBridge = reactive({
  user:        getPatientAuth(),  // logged-in patient or null
  cartCount:   0,                 // total items across all active carts (computed & synced by PatientHome)
  city:        'Kolkata',         // selected city for pharmacy filter (persisted to op_city)
  activeTab:   'home',            // active page in PatientHome: 'home'|'find'|'cart'|'me'|'scanner'
  showScanner: false,             // triggers ScannerModal from anywhere (Navbar scan button)
  searchQuery: '',                // text from the desktop navbar search bar
})
```

`PatientHome` watches `patientBridge.activeTab` and `patientBridge.searchQuery` for changes from the Navbar, and writes back `cartCount` whenever the cart contents change.

---

## The Data Layer (`app.js` exports)

All persistence is centralised in named exported functions. Each function reads or writes exactly one `localStorage` key. **These are the functions that will be replaced by Axios/Fetch calls in Phase 2.**

```js
// Inventory
getInventory()           → reads 'op_inventory'   → array of medicine objects
saveInventory(arr)       → writes 'op_inventory'

// Sales (admin charts only)
getSalesData()           → reads 'op_sales'        → array of {month, revenue}

// Dosage slips
getDosageSlips()         → reads 'op_dosage_slips' → array of dosage slip objects
saveDosageSlips(arr)     → writes 'op_dosage_slips'

// Appointment slots (patient booking)
getSlots()               → reads 'op_slots'        → array of {time, booked}
saveSlots(arr)           → writes 'op_slots'

// Pharmacies (geo-search results)
getPharmacies()          → reads 'op_pharmacies'   → array of pharmacy objects
savePharmacies(arr)      → writes 'op_pharmacies'

// Per-pharmacy inventory levels
getPharmacyInv()         → reads 'op_pharmacy_inv' → nested object {pharmacyId: {medicineId: {s:stock, p:price}}}

// Staff (auth table)
getStaff()               → reads 'op_staff'        → array of staff/doctor users
saveStaff(arr)           → writes 'op_staff'

// Patients
getPatients()            → reads 'op_patients'     → array of patient objects
savePatients(arr)        → writes 'op_patients'

// Shopping carts (patient)
getCarts()               → reads 'op_carts'        → array of cart objects
saveCarts(arr)           → writes 'op_carts'

// Orders (all sources)
getOrders()              → reads 'op_orders'       → array of order objects
saveOrders(arr)          → writes 'op_orders'

// Doctors master DB
getDoctors()             → reads 'op_doctors'      → array of doctor objects
saveDoctors(arr)         → writes 'op_doctors'

// Appointments
getAppointments()        → reads 'op_appointments' → array of appointment objects
saveAppointments(arr)    → writes 'op_appointments'

// Medicine requests (staff → admin approval)
getMedicineRequests()    → reads 'op_medicine_requests' → array of request objects
saveMedicineRequests(arr)→ writes 'op_medicine_requests'

// Auth session
getAuth()                → reads 'op_auth'         → staff session object or null
saveAuth(user)           → writes 'op_auth'        (password stripped)
clearAuth()              → removes 'op_auth'

// Patient auth session
getPatientAuth()         → reads 'op_patient_auth' → patient session or null
savePatientAuth(patient) → writes 'op_patient_auth'(password stripped)
clearPatientAuth()       → removes 'op_patient_auth'

// Shared utility
roleBadgeClass(role)     → returns Tailwind CSS class string for a role badge
```

---

## Component Tree

```
App (app.js)
├── Navbar (components/Navbar.js)
│   └── ScannerModal (on demand)
└── <current view> (one of:)
    ├── PatientHome (views/PatientHome.js)
    │   └── ScannerModal
    ├── LoginPage (views/LoginPage.js)
    ├── StaffPos (views/StaffPos.js)
    │   └── ScannerModal
    ├── PharmacyDashboard (views/PharmacyDashboard.js)
    │   └── StockAlertCard (components/StockAlertCard.js)
    ├── DoctorDashboard (views/DoctorDashboard.js)
    └── AdminDashboard (views/AdminDashboard.js)
        └── StockAlertCard
```

---

## View Summary

| File | Component name | Size | Key state |
|------|----------------|------|-----------|
| `views/LoginPage.js` | `LoginPage` | ~200 lines | email, password, loading |
| `views/PatientHome.js` | `PatientHome` | ~1600 lines | patientBridge, carts, orders, chatbot, slots |
| `views/StaffPos.js` | `StaffPos` | ~900 lines | carts[], discounts, checkout, scanner |
| `views/PharmacyDashboard.js` | `PharmacyDashboard` | ~1200 lines | orders, inventory, staff, appointments |
| `views/DoctorDashboard.js` | `DoctorDashboard` | ~620 lines | queue, rxMeds, patientHistory |
| `views/AdminDashboard.js` | `AdminDashboard` | ~800 lines | pharmacies, doctors, medRequests |

---

## CSS and Styling

`static/css/styles.css` contains only a small number of rules that cannot be expressed with Tailwind utility classes:

- **Carousel fade transition:** `.carousel-fade-*` — the `leave-active` rule is `position: absolute; inset: 0` to prevent layout shift during the hero carousel transition.
- **Print styles:** `@media print` hides navigation and non-printable elements.
- **Dot-pulse animation:** Used for the loading spinner in the login button.
- **Scrollbar suppression:** `.no-scrollbar::-webkit-scrollbar { display: none }` used in several panels.

The Tailwind configuration in `index.html` extends the default theme with a `brand` colour palette (green-based, mapped to `brand-50` through `brand-800`).

---

## Phase 2 Migration Pointers

The architecture was designed with the following Phase 2 migration in mind:

1. **Replace `get*/save*` functions** in `app.js` with `async` Axios/Fetch wrappers that call Flask REST endpoints. Component code calls the same function names so no view files need to change.

2. **Replace `op_auth` session** with a JWT returned by `POST /api/auth/login`. Store the JWT in `httpOnly` cookie or `localStorage['op_token']`. Replace `getAuth()` / `saveAuth()` with token decode / header injection.

3. **Replace `op_patient_auth` session** with a separate patient JWT from `POST /api/patients/auth/login`.

4. **`seedLocalStorage()`** becomes a no-op once the backend is live; the function can remain but with all body code removed.

5. **`DATA_VERSION` bump mechanism** is only relevant for the localStorage simulation — can be removed in Phase 2.

See [`docs/FLASK_INTEGRATION.md`](FLASK_INTEGRATION.md) for the full endpoint-by-endpoint mapping.

For the complete data schema reference see [`docs/DATA_MODEL.md`](DATA_MODEL.md).
