# Flask Integration Guide

This guide explains how to connect the OnePharma Vue 3 frontend to a Python Flask backend. It maps every `localStorage` read/write in Phase 1 to the corresponding REST API endpoint that the Flask backend must expose in Phase 2, covers authentication migration, CORS setup, and documents the expected JSON shapes for each endpoint.

For the Vue application architecture and how each view uses these helpers, see [`ARCHITECTURE.md`](ARCHITECTURE.md). For the full data schema reference see [`DATA_MODEL.md`](DATA_MODEL.md).

---

## Table of Contents

1. [Integration Strategy](#integration-strategy)
2. [Replacing the Data Layer](#replacing-the-data-layer)
3. [CORS Configuration](#cors-configuration)
4. [Authentication Migration](#authentication-migration)
   - [Staff / Doctor / Admin Auth](#staff--doctor--admin-auth)
   - [Patient Auth](#patient-auth)
5. [API Endpoint Reference](#api-endpoint-reference)
   - [Inventory](#inventory)
   - [Pharmacy Inventory (Per-Pharmacy Stock)](#pharmacy-inventory-per-pharmacy-stock)
   - [Pharmacies](#pharmacies)
   - [Staff](#staff)
   - [Patients](#patients)
   - [Doctors](#doctors)
   - [Appointments](#appointments)
   - [Carts](#carts)
   - [Orders](#orders)
   - [Dosage Slips](#dosage-slips)
   - [Appointment Slots](#appointment-slots)
   - [Sales Analytics](#sales-analytics)
   - [Medicine Requests](#medicine-requests)
6. [Serving the Frontend from Flask](#serving-the-frontend-from-flask)
7. [Data Seeding](#data-seeding)
8. [Phase 2 Checklist](#phase-2-checklist)

---

## Integration Strategy

Phase 1 stores everything in `localStorage`. Phase 2 replaces each `get*/save*` function in `static/js/app.js` with an `async` function that calls a Flask REST endpoint.

**No view files need to change.** All views consume the exported helper functions from `app.js`. Swapping the implementation of those helpers from `localStorage` to `fetch()` calls is the only change needed in `app.js`.

The integration can be done incrementally — one resource at a time — while keeping the rest on `localStorage`. This allows feature-by-feature migration and testing.

```
Phase 1:  getInventory() → JSON.parse(localStorage.getItem('op_inventory'))
Phase 2:  getInventory() → await fetch('/api/inventory').then(r => r.json())
```

---

## Replacing the Data Layer

Each helper function in `app.js` should become an `async` function. The calling code in all view files already uses `const x = get*()` — change this to `const x = await get*()`. Vue's `setup()` supports `async` setups via `<Suspense>` or by using `onMounted` for async data fetching.

**Recommended pattern for view files (no change needed if using `onMounted`):**

```js
// Before (Phase 1)
const inventory = ref(getInventory());

// After (Phase 2)
const inventory = ref([]);
onMounted(async () => {
  inventory.value = await getInventory();
});
```

All `save*` calls become `POST`/`PUT`/`DELETE` requests and should be awaited.

---

## CORS Configuration

The Vue frontend is served as static files. In development the frontend runs on a different origin from Flask (e.g., `http://localhost:8080` vs `http://localhost:5000`). Configure Flask-CORS accordingly:

```python
from flask import Flask
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:8080"]}},
     supports_credentials=True)
```

In production, serve the static files from Flask itself (see [Serving the Frontend from Flask](#serving-the-frontend-from-flask)) so CORS is not needed.

---

## Authentication Migration

### Staff / Doctor / Admin Auth

**Current Phase 1 flow:**
1. `LoginPage` posts `email` + `password` to `getStaff()` (localStorage lookup).
2. On match, calls `handleLogin(user)` which calls `saveAuth(user)` (writes to `op_auth`).
3. All protected views inject `currentUser` from the root App's `ref(getAuth())`.

**Phase 2 flow:**

1. Replace the `getStaff()` lookup in `LoginPage.js` with `POST /api/auth/login`.
2. Flask validates credentials against the database (bcrypt), issues a JWT.
3. Store the JWT: `localStorage.setItem('op_token', jwt)`.
4. Replace `getAuth()` with a function that decodes the JWT payload.
5. Attach the JWT to all subsequent API requests:
   ```js
   const authHeaders = () => ({
     'Authorization': 'Bearer ' + localStorage.getItem('op_token'),
     'Content-Type': 'application/json',
   });
   ```

**Flask endpoints:**

```
POST /api/auth/login
  Body: { "email": "...", "password": "..." }
  Returns: { "token": "<jwt>", "user": { id, name, email, role, avatar, doctorId? } }
  Errors: 401 if credentials invalid, 403 if account inactive

POST /api/auth/logout
  (Stateless JWT — frontend just deletes the token.)

GET /api/auth/me
  Header: Authorization: Bearer <token>
  Returns: { id, name, email, role, avatar, doctorId? }
```

**JWT payload should include:**
```json
{
  "sub":        1,
  "name":       "Raj Kumar",
  "email":      "raj@saha.com",
  "role":       "staff",
  "avatar":     "RK",
  "pharmacyId": 1,
  "doctorId":   null,
  "exp":        1800000000
}
```

### Patient Auth

Patients use a separate login modal inside `PatientHome.js` (phone + password). They have their own session key `op_patient_auth`.

**Phase 2 endpoints:**

```
POST /api/patients/auth/register
  Body: { "name": "...", "phone": "...", "password": "..." }
  Returns: { "token": "<jwt>", "patient": { id, name, phone, phoneVerified: false } }

POST /api/patients/auth/login
  Body: { "phone": "...", "password": "..." }
  Returns: { "token": "<jwt>", "patient": { id, name, phone, phoneVerified } }

POST /api/patients/auth/verify-otp
  Body: { "otp": "123456" }
  Header: Authorization: Bearer <patient-token>
  Returns: { "phoneVerified": true }
  Note: In Phase 1, OTP is generated client-side. In Phase 2, Flask generates and sends it via SMS.
```

---

## API Endpoint Reference

All endpoints are prefixed with `/api`. All request/response bodies are JSON. Authentication is required for all endpoints unless marked `(public)`.

### Inventory

The master medicine catalogue.

```
GET    /api/inventory
  (public)
  Returns: Array<Medicine>
  Query params: ?search=<str>&category=<str>

GET    /api/inventory/<int:id>
  Returns: Medicine

POST   /api/inventory
  Requires: role in [app_admin, pharmacist]
  Body: Medicine (without id)
  Returns: Medicine (with id)

PUT    /api/inventory/<int:id>
  Requires: role in [app_admin, pharmacist]
  Body: Partial<Medicine>
  Returns: Medicine

DELETE /api/inventory/<int:id>
  Requires: role === app_admin
  Returns: { "deleted": true }
```

**Medicine object:**
```json
{
  "id": 1,
  "name": "Paracetamol 500mg",
  "brand": "Crocin",
  "generic": "Paracetamol",
  "ingredient": "Paracetamol",
  "category": "Analgesic",
  "stock": 240,
  "minStock": 50,
  "price": 18,
  "gst": 5,
  "expiry": "2026-12-01",
  "supplier": "HealthCo",
  "unitsSold": 520
}
```

---

### Pharmacy Inventory (Per-Pharmacy Stock)

```
GET    /api/pharmacy-inventory
  (public)
  Returns: { pharmacyId: { medicineId: { s: stock, p: price } } }
  (matches Phase 1 nested format for drop-in replacement)

GET    /api/pharmacy-inventory/<int:pharmacy_id>
  Returns: { medicineId: { s: stock, p: price } }

PUT    /api/pharmacy-inventory/<int:pharmacy_id>/<int:medicine_id>
  Requires: role in [pharmacist, app_admin]
  Body: { "stock": 100, "price": 20 }
  Returns: { "s": 100, "p": 20 }
```

---

### Pharmacies

```
GET    /api/pharmacies
  (public)
  Returns: Array<Pharmacy>
  Query params: ?city=<str>&lat=<float>&lng=<float>&radius=<km>

GET    /api/pharmacies/<int:id>
  (public)
  Returns: Pharmacy

POST   /api/pharmacies
  Requires: role === app_admin
  Body: Pharmacy (without id)
  Returns: Pharmacy (with id)

PUT    /api/pharmacies/<int:id>
  Requires: role === app_admin
  Returns: Pharmacy

DELETE /api/pharmacies/<int:id>
  Requires: role === app_admin
  Returns: { "deleted": true }
```

**Pharmacy object:**
```json
{
  "id": 1,
  "name": "Saha Pharmacy",
  "address": "12, MG Road, Kolkata",
  "distance": "0.3 km",
  "rating": 4.5,
  "totalRatings": 128,
  "open": true,
  "phone": "+91-98765-43210",
  "hours": "8 AM – 10 PM",
  "lat": 22.5726,
  "lng": 88.3639
}
```

---

### Staff

```
GET    /api/staff
  Requires: role in [app_admin, pharmacist]
  Query params: ?pharmacyId=<int>
  Returns: Array<StaffUser> (passwords excluded)

POST   /api/staff
  Requires: role in [app_admin, pharmacist]
  Body: StaffUser (with plain password — hash server-side before storing)
  Returns: StaffUser (without password)

PUT    /api/staff/<int:id>
  Requires: role in [app_admin, pharmacist]
  Body: Partial<StaffUser>
  Returns: StaffUser (without password)

DELETE /api/staff/<int:id>
  Requires: role in [app_admin, pharmacist]
  Returns: { "deleted": true }
```

---

### Patients

```
GET    /api/patients
  Requires: role in [app_admin, pharmacist, staff, doctor]
  Query params: ?search=<name_or_phone>
  Returns: Array<Patient> (passwords excluded)

GET    /api/patients/<int:id>
  Requires: authenticated
  Returns: Patient (without password)

POST   /api/patients
  Requires: authenticated (staff, doctor creating walk-in)
  Body: { name, phone, age?, address?, complaint?, tag? }
  Returns: Patient

PUT    /api/patients/<int:id>
  Requires: role in [staff, pharmacist, doctor, app_admin] or patient self
  Body: Partial<Patient>
  Returns: Patient
```

---

### Doctors

```
GET    /api/doctors
  (public)
  Query params: ?pharmacyId=<int>  (filter to linked doctors)
  Returns: Array<Doctor> (passwords excluded)

GET    /api/doctors/<int:id>
  Returns: Doctor

POST   /api/doctors
  Requires: role === app_admin
  Body: Doctor (with email, password — hash server-side)
  Returns: Doctor (without password)

PUT    /api/doctors/<int:id>
  Requires: role === app_admin
  Body: Partial<Doctor>
  Returns: Doctor

DELETE /api/doctors/<int:id>
  Requires: role === app_admin
  Returns: { "deleted": true }
```

**Doctor object:**
```json
{
  "id": 1,
  "name": "Dr. R. Mehta",
  "specialty": "General Physician",
  "phone": "+91-99001-11111",
  "clinic": "Mehta Clinic, Park Street",
  "active": true,
  "pharmacyId": 1,
  "lat": 22.5726,
  "lng": 88.3639,
  "email": "mehta@clinic.com"
}
```

---

### Appointments

```
GET    /api/appointments
  Requires: authenticated
  Query params:
    ?pharmacyId=<int>   filter by pharmacy
    ?doctorId=<int>     filter by doctor
    ?patientId=<int>    filter by patient
    ?status=<str>       "scheduled" | "completed" | "cancelled"
    ?date=<YYYY-MM-DD>
  Returns: Array<Appointment>

GET    /api/appointments/<string:id>
  Returns: Appointment

POST   /api/appointments
  Requires: role in [staff, pharmacist, doctor]
  Body: {
    patientName, patientPhone, patientId?,
    doctorId, doctorName,
    date, time, reason,
    pharmacyId, status: "scheduled"
  }
  Returns: Appointment

PUT    /api/appointments/<string:id>
  Requires: authenticated
  Body: Partial<Appointment>  (used to mark completed/cancelled, set completedAt)
  Returns: Appointment
```

**Appointment object:**
```json
{
  "id": "APT-001",
  "patientId": 101,
  "patientName": "Arjun Sharma",
  "patientPhone": "+91-90001-11111",
  "doctorId": 1,
  "doctorName": "Dr. R. Mehta",
  "date": "2026-03-08",
  "time": "10:00",
  "reason": "Fever and body ache",
  "status": "scheduled",
  "pharmacyId": 1,
  "createdAt": "2026-03-07T10:00:00.000Z",
  "completedAt": null
}
```

---

### Carts

```
GET    /api/carts
  Requires: patient auth
  Query params: ?patientId=<int>
  Returns: Array<Cart> (for the authenticated patient)

POST   /api/carts
  Requires: patient auth
  Body: { patientId, pharmacyId, pharmacyName, items: [{medId, medName, price, qty}] }
  Returns: Cart

PUT    /api/carts/<string:id>
  Requires: patient auth (owner only)
  Body: { items: [...] }   (full replacement of items array)
  Returns: Cart

DELETE /api/carts/<string:id>
  Requires: patient auth (owner only)
  Returns: { "deleted": true }
```

**Cart object:**
```json
{
  "id": "cart_1710000000000",
  "patientId": 101,
  "pharmacyId": 1,
  "pharmacyName": "Saha Pharmacy",
  "items": [
    { "medId": 1, "medName": "Paracetamol 500mg", "price": 18, "qty": 2 }
  ],
  "createdAt": "2026-03-07T10:00:00.000Z"
}
```

---

### Orders

```
GET    /api/orders
  Requires: authenticated
  Query params:
    ?pharmacyId=<int>      pharmacy view
    ?patientId=<int>       patient view
    ?doctorId=<int>        doctor view (prescriptions only)
    ?source=<str>          "patient_cart" | "doctor_prescription" | "staff_pos"
    ?status=<str>          "pending" | "in_progress" | "completed" | "cancelled" | "expired"
  Returns: Array<Order>

GET    /api/orders/<string:id>
  Returns: Order

POST   /api/orders
  Requires: authenticated
  Body: Order (without id; id generated server-side)
  Returns: Order

PUT    /api/orders/<string:id>
  Requires: role in [pharmacist, staff] (pharmacy fulfillment) or patient auth (cancel own)
  Body: Partial<Order>  e.g. { "status": "completed", "completedAt": "<iso>" }
  Returns: Order
```

**Order object:** See [`DATA_MODEL.md#op_orders`](DATA_MODEL.md#op_orders) for the full schema.

**Business rules for Flask to enforce:**
- `patient_cart` orders: set `expiresAt = createdAt + 24h`
- `doctor_prescription` orders: set `expiresAt = createdAt + 30d`
- `staff_pos` orders: `expiresAt = null`, created directly with `status: 'completed'`
- When an order is `completed`, deduct `qty` from `pharmacy_inventory.stock` for each item
- Auto-expire `patient_cart` orders: a scheduled job or `GET /api/orders` query should set `status = 'expired'` for orders past `expiresAt`

---

### Dosage Slips

```
GET    /api/dosage-slips
  Requires: authenticated
  Query params: ?patientId=<int>&orderId=<str>
  Returns: Array<DosageSlip>

POST   /api/dosage-slips
  Requires: role in [staff, doctor]
  Body: DosageSlip (without id)
  Returns: DosageSlip

GET    /api/dosage-slips/<int:id>
  Returns: DosageSlip
```

---

### Appointment Slots

In Phase 1, slots are a flat array of time strings with a `booked` flag. Phase 2 should make slots per-doctor, per-date.

```
GET    /api/slots
  (public)
  Query params: ?doctorId=<int>&date=<YYYY-MM-DD>
  Returns: Array<{ time: "HH:MM", booked: bool }>

PUT    /api/slots/book
  Requires: patient auth
  Body: { doctorId, date, time, patientId }
  Returns: { "time": "10:00", "booked": true }
```

---

### Sales Analytics

```
GET    /api/sales
  Requires: role in [pharmacist, app_admin]
  Query params: ?pharmacyId=<int>&months=<int>
  Returns: Array<{ month: "Jan", revenue: 66300 }>

GET    /api/sales/top-medicines
  Requires: role in [pharmacist, app_admin]
  Query params: ?pharmacyId=<int>&limit=<int>
  Returns: Array<{ name, unitsSold, revenue }>
```

---

### Medicine Requests

```
GET    /api/medicine-requests
  Requires: role === app_admin
  Query params: ?status=<str>  "pending" | "approved" | "rejected"
  Returns: Array<MedicineRequest>

POST   /api/medicine-requests
  Requires: role in [staff, pharmacist]
  Body: Medicine fields + { status: "pending" }
  Returns: MedicineRequest

PUT    /api/medicine-requests/<int:id>
  Requires: role === app_admin
  Body: { "status": "approved" | "rejected" }
  On approve: also insert into `op_inventory` (medicines table)
  Returns: MedicineRequest
```

---

## Serving the Frontend from Flask

The recommended production setup is to serve the Vue static files directly from Flask:

```python
from flask import Flask, send_from_directory
import os

app = Flask(__name__, static_folder='../OnePharma', static_url_path='')

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    if path.startswith('api/'):
        return {'error': 'Not found'}, 404
    full = os.path.join(app.static_folder, path)
    if path and os.path.exists(full):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')
```

This serves `index.html` for all non-API routes, which is correct for the hash-based Vue router.

> **Important:** `index.html` loads Vue from `unpkg.com` via an importmap. In production, download `vue.esm-browser.prod.js` and serve it locally to eliminate the CDN dependency. Update the importmap in `index.html`:
> ```json
> { "imports": { "vue": "/static/js/vendor/vue.esm-browser.prod.js" } }
> ```

---

## Data Seeding

The `seedLocalStorage()` function in `app.js` seeds all demo data into `localStorage` on first load. This function should remain in Phase 2 but become a no-op:

```js
const seedLocalStorage = () => {
  // No-op in Phase 2 — data lives in the Flask database.
  // Remove or comment out all localStorage.setItem calls.
};
```

For the Flask database, create a seed script (e.g., `flask seed-db`) that inserts the same DEFAULT_* arrays from `app.js` into the respective tables.

---

## Phase 2 Checklist

Use this checklist when integrating the Flask backend:

### Infrastructure
- [ ] Set up Flask project with `flask-restful` or `flask-smorest`
- [ ] Configure `flask-sqlalchemy` with the target database (PostgreSQL recommended)
- [ ] Configure `flask-migrate` for schema migrations
- [ ] Configure `flask-cors` for development CORS
- [ ] Configure `flask-jwt-extended` (or `PyJWT`) for JWT auth
- [ ] Configure `flask-bcrypt` for password hashing

### Authentication
- [ ] `POST /api/auth/login` — staff/admin login → JWT
- [ ] `POST /api/patients/auth/login` — patient login → JWT
- [ ] `POST /api/patients/auth/register` — patient registration
- [ ] `POST /api/patients/auth/verify-otp` — phone verification (integrate SMS gateway)
- [ ] Replace `getAuth()` / `saveAuth()` / `clearAuth()` in `app.js` with JWT helpers
- [ ] Replace `getPatientAuth()` / `savePatientAuth()` / `clearPatientAuth()` in `app.js` with JWT helpers

### Data Layer (`app.js`)
- [ ] `getInventory()` / `saveInventory()` → `GET /api/inventory`, `POST/PUT /api/inventory/<id>`
- [ ] `getPharmacyInv()` → `GET /api/pharmacy-inventory`
- [ ] `getPharmacies()` / `savePharmacies()` → `GET/POST/PUT/DELETE /api/pharmacies`
- [ ] `getStaff()` / `saveStaff()` → `GET/POST/PUT/DELETE /api/staff`
- [ ] `getPatients()` / `savePatients()` → `GET/POST/PUT /api/patients`
- [ ] `getDoctors()` / `saveDoctors()` → `GET/POST/PUT/DELETE /api/doctors`
- [ ] `getAppointments()` / `saveAppointments()` → `GET/POST/PUT /api/appointments`
- [ ] `getCarts()` / `saveCarts()` → `GET/POST/PUT/DELETE /api/carts`
- [ ] `getOrders()` / `saveOrders()` → `GET/POST/PUT /api/orders`
- [ ] `getDosageSlips()` / `saveDosageSlips()` → `GET/POST /api/dosage-slips`
- [ ] `getSlots()` / `saveSlots()` → `GET/PUT /api/slots`
- [ ] `getSalesData()` → `GET /api/sales`
- [ ] `getMedicineRequests()` / `saveMedicineRequests()` → `GET/POST/PUT /api/medicine-requests`

### Business Logic (Flask-side)
- [ ] Auto-expire `patient_cart` orders older than 24h (scheduled job)
- [ ] Deduct stock on order completion
- [ ] Enforce max 3 carts per patient
- [ ] Validate `expiresAt` window per order source
- [ ] OTP generation and SMS delivery on patient registration

### Production
- [ ] Serve Vue static files from Flask (catch-all route)
- [ ] Download and self-host Vue ESM bundle (remove unpkg.com CDN dependency)
- [ ] Self-host Tailwind CSS (replace CDN link with bundled CSS)
- [ ] Remove `DATA_VERSION` / `seedLocalStorage` logic from `app.js`
- [ ] Update `index.html` importmap to point to local Vue bundle
