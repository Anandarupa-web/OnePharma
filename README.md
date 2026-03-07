# OnePharma – Phase 1 UI Prototype

**Multi-tenant pharmacy management platform** connecting patients, pharmacy staff, pharmacy owners, doctors, and platform administrators on a single web application.

Phase 1 is a fully functional, serverless frontend prototype built with Vue 3 and localStorage as a temporary persistence layer. The architecture is designed so that every localStorage read/write can be replaced 1-for-1 with Flask REST API calls in Phase 2.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Application Overview](#application-overview)
3. [Roles and Capabilities](#roles-and-capabilities)
   - [Guest / Patient](#1-guest--patient)
   - [Pharmacy Staff](#2-pharmacy-staff)
   - [Pharmacy Owner (Pharmacist)](#3-pharmacy-owner-pharmacist)
   - [Doctor](#4-doctor)
   - [App Admin](#5-app-admin-onepharma-platform)
4. [Demo Credentials](#demo-credentials)
5. [Tech Stack](#tech-stack)
6. [Project Structure](#project-structure)
7. [For Backend Integration](#for-backend-integration)

---

## Quick Start

No build step required. The project is a pure static site.

```bash
# Serve with Python's built-in HTTP server (recommended — importmap requires a server):
cd /path/to/OnePharma
python3 -m http.server 8080
# Open http://localhost:8080
```

Or open `index.html` directly in a modern browser that supports ES Modules (Chrome 89+, Firefox 90+, Safari 15+).

> **Note:** The importmap in `index.html` loads Vue 3 from `unpkg.com`, so an internet connection is required on first load. Subsequent loads use the browser cache.

---

## Application Overview

OnePharma is built around one `index.html` that mounts a single Vue 3 application. The app renders different "portal views" depending on the authenticated user's role. All state is kept in `localStorage` under `op_*` keys. The data layer exports named helper functions (`getInventory()`, `saveOrders()`, etc.) which are the single integration points for Phase 2 Flask backend calls.

URL hash routing controls which portal is shown:

| URL hash  | Portal rendered      | Required role   |
|-----------|----------------------|-----------------|
| *(none)*  | Patient Home         | none            |
| `#staff`  | Staff POS            | `staff`         |
| `#pharmacy` | Pharmacy Dashboard | `pharmacist`    |
| `#doctor` | Doctor Dashboard     | `doctor`        |
| `#admin`  | Admin Dashboard      | `app_admin`     |

---

## Roles and Capabilities

### 1. Guest / Patient

**Entry point:** The default landing page (`PatientHome`). No login required for browsing.

**Unauthenticated capabilities:**
- Browse hero carousel with feature highlights
- Search medicines by name, brand, generic name, or category across all registered pharmacies
- View per-pharmacy stock availability and pricing
- Browse the full inventory of a specific pharmacy
- Use the AI Chatbot (`PharmAI`) for medicine information, dosage guidance, and FAQ
- Scan / upload a prescription image (UI mockup — OCR simulated in Phase 1)

**After patient login / registration:**

Patients authenticate using **phone number + password** (separate from staff login). Session stored in `op_patient_auth`.

- All unauthenticated features remain available
- Add medicines to cart (up to 3 carts, one per pharmacy)
- Adjust item quantities in cart
- Place an order → generates a QR code for pickup at the pharmacy counter
- View order history and track order status (`pending` → `completed`)
- View digital dosage slips attached to previous orders
- Book an appointment time slot at a pharmacy (15-minute slots, 9 AM–5 PM)
- Phone verification via OTP (simulated — OTP generated client-side using `crypto.getRandomValues`)
- Account management: view profile, dosage history, order history

**Patient data model:** See [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md#op_patients).

---

### 2. Pharmacy Staff

**Login:** Email + password → routes to `StaffPos` (Staff POS view).

**Capabilities:**
- **Multi-cart POS:** Manage up to 10 simultaneous transactions in tabbed carts
- **Patient lookup:** Search existing patients by name or phone; create new walk-in patient records on the fly
- **Medicine search:** Search by name, brand, or generic; filter by category (Analgesic, Antibiotic, etc.)
- **Dosage editor:** Per-item dosage instructions (dose, frequency, timing, duration, notes) attached to each cart line
- **Generic alternatives:** When a branded medicine is added, the system automatically suggests generic alternatives with the same active ingredient
- **Discount engine:** Three discount modes:
  - *Percentage*: % off gross total
  - *Flat amount*: Enter a final price; discount = gross − target
  - *Round-off*: Round down to nearest ₹10 / ₹50 / ₹100
  - Optional GST adjustment: proportionally reduce GST when discount is applied
- **Checkout:** Deducts stock, saves order to `op_orders`, generates invoice number, saves dosage slips to `op_dosage_slips`
- **Prescription scanner (mockup):** Upload or photograph a prescription; simulated OCR populates the cart
- **Add new medicine:** Staff can request a new medicine be added. It is added to local inventory with `stock: 0` and a request is logged to `op_medicine_requests` for admin approval
- **Doctor field:** Attach a referring doctor's name to an order (free text in Phase 1; will be a foreign key in Phase 2)
- **Appointment management:** Create and view appointments for connected doctors (linked via `pharmacyId`); mark appointments as completed or cancel them

**Tax calculation:**
```
subtotal    = sum(item.price × qty)
rawGst      = sum(item.price × qty × item.gst/100)
grossTotal  = subtotal + rawGst
finalTotal  = grossTotal − discountAmount
```

---

### 3. Pharmacy Owner (Pharmacist)

**Login:** Email + password → routes to `PharmacyDashboard`.

The pharmacy owner portal (`PharmacyDashboard`) has seven panels accessible via a left sidebar:

| Panel | Description |
|-------|-------------|
| **Overview** | KPI cards: pending orders, total revenue (from sales data), active staff count, total inventory items. Recent orders list. |
| **Orders** | Two sub-tabs: *Pending* (status: `pending` or `in_progress`) and *History* (completed/cancelled/expired). Fulfillment workflow: Start → In Progress → Complete (deducts stock, sets `completedAt`). Cancel action. Expiry badges for patient-cart orders (24h window). |
| **Appointments** | View, create, and manage appointments for all doctors linked to this pharmacy. Book new appointment (patient name/phone, doctor dropdown from linked doctors, date, time slot). Mark appointment as Done (moves to Completed tab) or Cancel. |
| **Inventory** | Searchable table of all medicines. Inline stock editing. Add new medicine form. Remove medicine. Stock colour coding: red = out of stock, amber = low stock, green = healthy. |
| **Staff** | Full CRUD for pharmacy staff and pharmacist accounts. Toggle active/inactive status. |
| **Alerts** | Low-stock alerts (stock < minStock) and near-expiry alerts (expiry within 30 days). Uses `StockAlertCard` component. |
| **Suppliers** | Date-range report generation (PDF/CSV — simulated in Phase 1). |

**Order lifecycle (pharmacy side):**
```
pending  →  in_progress  →  completed
                ↓
            cancelled
```
Patient-cart orders expire after 24 hours (`expiresAt` field). Doctor prescriptions are valid for 30 days. Expired orders are auto-marked on dashboard mount.

---

### 4. Doctor

**Login:** Email + password → routes to `DoctorDashboard`.

The doctor portal is a responsive two-panel layout (desktop) / tab-switched interface (mobile):

**Patient Queue panel:**
- Shows today's appointments assigned to this doctor (filtered by `doctorId`)
- Filter queue by patient tag: *All*, *New*, *Returning*
- Search queue by patient name, phone, or complaint
- Add walk-in patients (creates a new `op_patients` record and a `scheduled` appointment)
- Patient cards show: name, tag (new/returning), phone, complaint/reason, time

**Prescription Builder panel (desktop right / mobile Rx tab):**
- Opens when a patient is selected from the queue
- **Diagnosis field:** Free text clinical notes
- **Medicine search:** Typeahead against the inventory catalogue by name or brand
- **Prescription items:** Each medicine gets dose, frequency (OD/BD/TDS/QID/SOS/every 8h), timing (Before/After/With food, Bedtime), duration (days), and optional notes
- **Dose presets:** One-tap standard regimens (e.g., "1×BD×5d")
- **Quantity auto-calculation:** `qty = dose × frequency_per_day × duration`
- **Prescription summary:** Per-item summary with total cost
- **Submit:** Creates an `op_orders` record with `source: 'doctor_prescription'` linked to the pharmacy (`connectedPharmacyId`). Marks the appointment as `completed`. Order is valid for 30 days.

**Patient History tab (desktop sub-tab / mobile History tab):**
- All past `doctor_prescription` orders for the selected patient (matched by phone number and/or patient ID)
- Prescriptions listed in reverse chronological order
- Each entry shows: prescription ID, date, prescribing doctor, status, diagnosis, full medicine list with dosage detail, total amount, and completion date

**Mobile layout:**
- Sticky top-bar with tab buttons: Queue 👥 / Prescription 💊 / History 📋
- Selecting a patient from the queue auto-navigates to the Prescription tab
- Back button (←) on patient card returns to the queue

---

### 5. App Admin (OnePharma Platform)

**Login:** Email + password → routes to `AdminDashboard`.

The platform admin has supreme access. This role is for OnePharma developers/operators, not pharmacy staff.

| Panel | Description |
|-------|-------------|
| **Overview** | Platform-wide KPIs: registered pharmacies, total orders, pending medicine requests, total staff. |
| **Pharmacies** | Full CRUD for registered pharmacy network (name, address, phone, hours, GPS coordinates, rating, open status). |
| **Master Meds** | Read-only view of the master medicine catalogue (sourced from `op_inventory`). |
| **Med Requests** | Review, approve, or reject new-medicine requests submitted by pharmacy staff via `op_medicine_requests`. |
| **Doctors DB** | Full CRUD for the master doctors database. Assign a doctor to a pharmacy (`pharmacyId`). Each doctor record includes: name, specialty, phone, clinic address, GPS coordinates, login email/password, active flag. |

---

## Demo Credentials

All credentials are pre-seeded in `op_staff` and `op_patients` localStorage on first load.

### Staff / Professional Login (`#staff`, `#pharmacy`, `#doctor`, `#admin`)

| Role | Email | Password | Portal |
|------|-------|----------|--------|
| App Admin | `admin@onepharma.com` | `appadmin123` | Admin Dashboard |
| Pharmacy Owner | `owner@saha.com` | `owner123` | Pharmacy Dashboard |
| Staff | `raj@saha.com` | `pass123` | Staff POS |
| Staff | `priya@saha.com` | `pass123` | Staff POS |
| Doctor | `mehta@clinic.com` | `doc123` | Doctor Dashboard (Dr. R. Mehta, General Physician) |
| Doctor | `sen@clinic.com` | `doc123` | Doctor Dashboard (Dr. A. Sen, Diabetologist) |

### Patient Login (Patient Home)

| Phone | Password |
|-------|----------|
| `+91-90001-11111` | `demo123` |
| `+91-90002-22222` | `demo123` |
| `+91-90003-33333` | `demo123` |

> Inactive staff accounts (`active: false`) are rejected at login even with correct credentials.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Vue 3 (Composition API) | Loaded via ESM importmap from unpkg.com |
| Styling | Tailwind CSS | Via CDN; custom brand colour `brand-*` extends green-500 palette |
| Charts | Chart.js 4.4 | Used in Admin Dashboard analytics |
| QR Codes | qrcode.js 1.5 | Patient order QR codes |
| Persistence | `localStorage` | All `op_*` keys; replaced by Flask API in Phase 2 |
| No build step | — | Open `index.html` or serve with `python3 -m http.server` |

---

## Project Structure

```
OnePharma/
├── index.html                        # Single entry point; importmap; CDN scripts
├── README.md                         # This file
├── docs/
│   ├── ARCHITECTURE.md               # Vue architecture, file roles, provide/inject map
│   ├── DATA_MODEL.md                 # Full localStorage schema, field-by-field
│   └── FLASK_INTEGRATION.md         # API endpoint mapping, auth strategy, migration guide
└── static/
    ├── css/
    │   └── styles.css                # Global custom styles (carousel, print, dot-pulse)
    └── js/
        ├── app.js                    # Root Vue app; seed data; all localStorage helpers (exported)
        ├── components/
        │   ├── Navbar.js             # Top navigation bar (role-aware)
        │   ├── PosCart.js            # Reusable cart summary component (unused — logic in StaffPos)
        │   ├── ScannerModal.js       # Prescription OCR upload modal
        │   └── StockAlertCard.js     # Reusable low-stock / expiry alert card
        └── views/
            ├── LoginPage.js          # Staff/doctor/admin login page
            ├── PatientHome.js        # Patient portal (all patient-facing features)
            ├── StaffPos.js           # Staff POS / billing
            ├── PharmacyDashboard.js  # Pharmacy owner management portal
            ├── DoctorDashboard.js    # Doctor prescription & patient queue
            └── AdminDashboard.js     # OnePharma platform admin
```

For detailed architecture, data schemas, and Flask integration instructions see the [`docs/`](docs/) folder.

| Document | Contents |
|----------|----------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Vue architecture, file roles, provide/inject map, all exported data-layer helpers |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Every localStorage schema with field-by-field documentation and ER sketch |
| [`docs/FLASK_INTEGRATION.md`](docs/FLASK_INTEGRATION.md) | REST endpoint mapping, auth migration, CORS, Phase 2 checklist |
