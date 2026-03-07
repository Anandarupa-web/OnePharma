# Data Model Reference

This document describes every object stored in `localStorage` in Phase 1. Each section documents the shape of records for one key. When migrating to Flask + a relational database, each top-level section corresponds to one or more database tables.

All keys are prefixed with `op_`. The seed data lives in `static/js/app.js`.

---

## Table of Contents

1. [`op_inventory`](#op_inventory) — Master medicine catalogue
2. [`op_pharmacy_inv`](#op_pharmacy_inv) — Per-pharmacy stock levels
3. [`op_pharmacies`](#op_pharmacies) — Registered pharmacies
4. [`op_staff`](#op_staff) — Staff, pharmacist, doctor, admin users
5. [`op_patients`](#op_patients) — Patient accounts
6. [`op_doctors`](#op_doctors) — Doctors master DB
7. [`op_appointments`](#op_appointments) — Appointments
8. [`op_carts`](#op_carts) — Active patient shopping carts
9. [`op_orders`](#op_orders) — All orders (patient, staff POS, doctor prescription)
10. [`op_dosage_slips`](#op_dosage_slips) — Dosage instruction slips
11. [`op_slots`](#op_slots) — Appointment time slots
12. [`op_sales`](#op_sales) — Monthly revenue data (admin charts)
13. [`op_medicine_requests`](#op_medicine_requests) — New-medicine requests from staff
14. [`op_auth`](#op_auth) — Staff session
15. [`op_patient_auth`](#op_patient_auth) — Patient session

---

## `op_inventory`

**Type:** `Array<Medicine>`

The master medicine catalogue. Shared across all pharmacies as the canonical product list. Per-pharmacy stock and pricing overrides are in `op_pharmacy_inv`.

```jsonc
{
  "id":        1,                    // integer, unique medicine ID
  "name":      "Paracetamol 500mg",  // full product name including strength
  "brand":     "Crocin",             // brand/trade name
  "generic":   "Paracetamol",        // generic/INN name
  "ingredient":"Paracetamol",        // active ingredient (used for generic-alt matching)
  "category":  "Analgesic",          // medicine category (see category list below)
  "stock":     240,                  // current stock quantity (units)
  "minStock":  50,                   // minimum stock threshold (triggers alert below this)
  "price":     18,                   // selling price (INR, excluding GST)
  "gst":       5,                    // GST rate as percentage (0 | 5 | 12)
  "expiry":    "2026-12-01",         // expiry date (ISO date string YYYY-MM-DD)
  "supplier":  "HealthCo",           // supplier name
  "unitsSold": 520                   // lifetime units sold (used for popularity sort)
}
```

**Known categories:** `Analgesic`, `Antibiotic`, `Antidiabetic`, `Statin`, `Antacid`, `Antihistamine`, `Antihypertensive`, `Bronchodilator`, `Supplement`

**Phase 2 table:** `medicines` — with a separate `pharmacy_medicines` join table for per-pharmacy overrides.

---

## `op_pharmacy_inv`

**Type:** `Object` — `{ [pharmacyId: string]: { [medicineId: string]: { s: number, p: number } } }`

Per-pharmacy stock levels and local pricing. The outer key is the pharmacy ID as a string; the inner key is the medicine ID as a string.

```jsonc
{
  "1": {
    "1":  { "s": 240, "p": 18  },  // s = stock, p = price
    "2":  { "s": 30,  "p": 85  }
  },
  "2": {
    "1":  { "s": 85,  "p": 20  }
  }
}
```

- `s` — current stock level at this pharmacy
- `p` — selling price at this pharmacy (may differ from master catalogue)

**Phase 2 table:** `pharmacy_inventory` with columns `pharmacy_id`, `medicine_id`, `stock`, `price`.

---

## `op_pharmacies`

**Type:** `Array<Pharmacy>`

```jsonc
{
  "id":           1,
  "name":         "Saha Pharmacy",
  "address":      "12, MG Road, Kolkata – 700001",
  "distance":     "0.3 km",          // pre-computed distance from demo location
  "rating":       4.5,               // average rating (0.0–5.0)
  "totalRatings": 128,               // number of reviews
  "open":         true,              // currently open flag
  "phone":        "+91-98765-43210",
  "hours":        "8 AM – 10 PM",
  "lat":          22.5726,           // latitude (decimal degrees)
  "lng":          88.3639            // longitude (decimal degrees)
}
```

---

## `op_staff`

**Type:** `Array<StaffUser>`

Covers all non-patient users: app_admin, pharmacist, staff, doctor.

```jsonc
{
  "id":         1,
  "name":       "Suresh Saha",
  "email":      "owner@saha.com",
  "password":   "owner123",          // ⚠️ plain text — Phase 1 demo only; replace with bcrypt hash
  "role":       "pharmacist",        // "app_admin" | "pharmacist" | "staff" | "doctor"
  "phone":      "+91-98765-00001",
  "joinDate":   "2022-06-01",        // ISO date string
  "active":     true,                // inactive accounts cannot log in
  "avatar":     "SS",                // two-letter initials for avatar fallback
  "pharmacyId": 1,                   // foreign key → op_pharmacies; null for app_admin
  "doctorId":   null                 // foreign key → op_doctors; non-null only for role === 'doctor'
}
```

**Roles:**

| Role | Value | Description |
|------|-------|-------------|
| Platform admin | `app_admin` | OnePharma developers; no pharmacyId |
| Pharmacy owner | `pharmacist` | Full pharmacy management; pharmacyId set |
| Pharmacy employee | `staff` | POS access; pharmacyId set |
| Doctor | `doctor` | Doctor portal; pharmacyId + doctorId set |

**Phase 2 table:** `users` with a `role` enum column. Doctor users additionally have a foreign key into the `doctors` table.

---

## `op_patients`

**Type:** `Array<Patient>`

```jsonc
{
  "id":            101,
  "name":          "Arjun Sharma",
  "phone":         "+91-90001-11111",
  "phoneVerified": true,
  "password":      "demo123",         // ⚠️ plain text — Phase 1 demo only
  "createdAt":     "2026-01-15",
  "age":           34,
  "address":       "Salt Lake, Kolkata",
  "complaint":     "Fever and body ache",  // chief complaint (from walk-in or registration)
  "tag":           "returning"             // "new" | "returning" — set by doctor/staff
}
```

**Phase 2 table:** `patients` — separate from `users` because the authentication mechanism and data fields differ.

---

## `op_doctors`

**Type:** `Array<Doctor>`

The master doctors database, managed by the App Admin.

```jsonc
{
  "id":         1,
  "name":       "Dr. R. Mehta",
  "specialty":  "General Physician",
  "phone":      "+91-99001-11111",
  "clinic":     "Mehta Clinic, Park Street",
  "active":     true,
  "pharmacyId": 1,                    // linked pharmacy (null = not connected to any pharmacy)
  "lat":        22.5726,
  "lng":        88.3639,
  "email":      "mehta@clinic.com",   // login email; also present in op_staff
  "password":   "doc123"              // ⚠️ plain text — Phase 1 only
}
```

**Relationship to `op_staff`:** Each doctor has one entry in `op_doctors` (master DB) and one entry in `op_staff` (for login). They are linked via `op_staff.doctorId = op_doctors.id`. In Phase 2 this should be a single `users` table with a `doctor_profile` relation.

---

## `op_appointments`

**Type:** `Array<Appointment>`

```jsonc
{
  "id":            "APT-001",           // string, unique
  "patientId":     101,                 // foreign key → op_patients
  "patientName":   "Arjun Sharma",
  "patientPhone":  "+91-90001-11111",
  "doctorId":      1,                   // foreign key → op_doctors
  "doctorName":    "Dr. R. Mehta",
  "date":          "2026-03-08",        // ISO date (YYYY-MM-DD)
  "time":          "10:00",             // appointment time (HH:MM 24h)
  "reason":        "Fever and body ache",
  "status":        "scheduled",         // "scheduled" | "completed" | "cancelled"
  "pharmacyId":    1,                   // which pharmacy's system created this
  "createdAt":     "2026-03-07T10:00:00.000Z",  // ISO timestamp (added by staff when booking)
  "completedAt":   null                 // ISO timestamp, set when marked Done
}
```

**Walk-in appointments** (created from Doctor Dashboard): `id` uses prefix `APT-WI-`, `time` is `"Walk-in"`.

**Staff-booked appointments** (created from Pharmacy Dashboard): `id` uses prefix `APT-S-`.

---

## `op_carts`

**Type:** `Array<Cart>`

Active patient shopping carts (not yet ordered). Maximum 3 carts per patient (one per pharmacy).

```jsonc
{
  "id":           "cart_1710000000000",
  "patientId":    101,                 // foreign key → op_patients
  "pharmacyId":   1,                   // foreign key → op_pharmacies
  "pharmacyName": "Saha Pharmacy",
  "items": [
    {
      "medId":   1,
      "medName": "Paracetamol 500mg",
      "price":   18,                   // price at the time of adding to cart
      "qty":     2
    }
  ],
  "createdAt": "2026-03-07T10:00:00.000Z"
}
```

---

## `op_orders`

**Type:** `Array<Order>`

Unified order collection. Orders come from three sources:

| `source` | Created by | `expiresAt` |
|----------|-----------|------------|
| `patient_cart` | Patient places order | 24 hours |
| `doctor_prescription` | Doctor submits prescription | 30 days |
| `staff_pos` | Staff POS checkout | no expiry (`null`) |

```jsonc
{
  "id":              "ORD-000001",      // unique order ID; "INV-XXXXXX" for staff POS
  "patientId":       101,               // foreign key → op_patients (null for walk-ins)
  "patientName":     "Arjun Sharma",
  "patientPhone":    "+91-90001-11111",
  "pharmacyId":      1,                 // foreign key → op_pharmacies
  "pharmacyName":    "Saha Pharmacy",
  "doctorId":        1,                 // foreign key → op_doctors (null if no prescription)
  "doctorName":      "Dr. R. Mehta",
  "diagnosis":       "Viral fever",     // free text (doctor_prescription only)
  "source":          "patient_cart",    // "patient_cart" | "doctor_prescription" | "staff_pos"
  "status":          "pending",         // see lifecycle below
  "items": [
    {
      "medId":    1,
      "name":     "Paracetamol 500mg",
      "brand":    "Crocin",
      "qty":      2,
      "price":    18,                   // unit price at time of order
      "gst":      5,
      // doctor_prescription fields (only present for that source):
      "dose":     1,                    // dose per administration
      "freq":     "BD",                 // frequency code: OD | BD | TDS | QID | SOS | every_8h
      "timing":   "After food",         // timing instruction
      "duration": 5,                    // duration in days
      "notes":    ""
    }
  ],
  "subtotal":        36,                // sum(price × qty) before GST
  "gstAmount":       1.8,
  "discountAmount":  0,
  "finalTotal":      37.8,
  "rxNotes":         "",                // free-text Rx notes from staff POS
  "connectedPharmacyId": 1,             // doctor_prescription: pharmacy to fulfil this order
  "createdAt":       "2026-03-07T10:00:00.000Z",
  "expiresAt":       "2026-03-08T10:00:00.000Z",  // null for staff_pos
  "startedAt":       null,              // set when pharmacy starts processing
  "completedAt":     null,              // set when pharmacy marks complete
  "notifiedAt":      null,              // set alongside completedAt (Phase 1 placeholder)
  "timestamp":       "2026-03-07T10:00:00.000Z"   // same as createdAt (legacy alias)
}
```

**Order status lifecycle:**

```
patient_cart order:
  pending → in_progress → completed
                ↓
            cancelled
            expired  (auto-set by PharmacyDashboard on mount if expiresAt passed)

staff_pos order:
  created directly as  completed

doctor_prescription order:
  pending → in_progress → completed
                ↓
            cancelled
```

---

## `op_dosage_slips`

**Type:** `Array<DosageSlip>`

Printed/digital dosage instructions generated at POS checkout.

```jsonc
{
  "id":           1,
  "orderId":      "INV-123456",        // foreign key → op_orders
  "patientName":  "Arjun Sharma",
  "medicineName": "Paracetamol 500mg",
  "medicine":     "Paracetamol 500mg", // alias — used in patient-facing display
  "dosage":       "1 tablet",          // dose description (free text)
  "dose":         "1",                 // numeric dose (from staff POS dosage editor)
  "frequency":    "Every 6 hours",     // frequency label (from staff POS)
  "freq":         "TDS",               // frequency code
  "timing":       "After meals",
  "duration":     "5 days",
  "warnings":     "Do not exceed 4 tablets in 24 hours.",
  "prescribedBy": "Dr. Mehta",
  "date":         "2026-03-01",
  "createdAt":    "2026-03-07T10:00:00.000Z"
}
```

Seed records (DEFAULT_DOSAGE_SLIPS) use the `medicine/dosage/frequency` form. Staff POS–generated slips use the `medicineName/dose/freq` form. Both forms are supported by the patient-facing view.

---

## `op_slots`

**Type:** `Array<Slot>`

15-minute consultation time slots for appointment booking (patient portal).

```jsonc
{ "time": "09:00", "booked": false }
```

Slots run 09:00–11:45 and 14:00–16:45 in 15-minute increments. `booked: true` means the slot is taken.

**Phase 2:** Replace with a per-doctor, per-date slots table.

---

## `op_sales`

**Type:** `Array<MonthlySales>`

Pre-aggregated monthly revenue used in Admin Dashboard charts.

```jsonc
{ "month": "Mar", "revenue": 66300 }
```

6 records covering the most recent 6 months. **Phase 2:** Compute dynamically from the `orders` table.

---

## `op_medicine_requests`

**Type:** `Array<MedicineRequest>`

New-medicine requests submitted by pharmacy staff via the POS `+New Med` form. Admin reviews and approves / rejects these to update the master catalogue.

```jsonc
{
  "id":          1710000000000,         // timestamp-based integer
  "name":        "Cetirizine 5mg",
  "brand":       "ZyrtecLow",
  "generic":     "Cetirizine",
  "ingredient":  "Cetirizine",
  "category":    "Antihistamine",
  "price":       15,
  "gst":         5,
  "stock":       0,
  "minStock":    10,
  "expiry":      "",
  "supplier":    "Local",
  "status":      "pending",             // "pending" | "approved" | "rejected"
  "requestedAt": "2026-03-07T10:00:00.000Z"
}
```

---

## `op_auth`

**Type:** `Object | null`

Active staff/doctor/admin session. Written by `saveAuth(user)` which strips the password before writing.

```jsonc
{
  "id":       1,
  "name":     "Suresh Saha",
  "email":    "owner@saha.com",
  "role":     "pharmacist",
  "avatar":   "SS",
  "doctorId": null        // only present for role === 'doctor'
}
```

**Phase 2:** Replace with a JWT stored in `localStorage['op_token']` or an `httpOnly` cookie.

---

## `op_patient_auth`

**Type:** `Object | null`

Active patient session. Written by `savePatientAuth(patient)`.

```jsonc
{
  "id":            101,
  "name":          "Arjun Sharma",
  "phone":         "+91-90001-11111",
  "phoneVerified": true
}
```

**Phase 2:** Replace with a patient-specific JWT.

---

## Key Relationships (ER Sketch)

```
pharmacies ──< pharmacy_inventory >── medicines
pharmacies ──< staff
pharmacies ──< doctors
pharmacies ──< appointments
pharmacies ──< orders (via connectedPharmacyId / pharmacyId)

patients ──< carts >── medicines
patients ──< orders
patients ──< appointments
patients ──< dosage_slips

doctors ──< appointments
doctors ──< orders (as prescriber)

orders ──< dosage_slips (via orderId)
orders.items[].medId → medicines.id
```

---

## Important Quirks for Phase 2

1. **`op_doctors` vs `op_staff`**: A doctor has two records — one in `op_doctors` (clinical profile) and one in `op_staff` (login credentials). The `op_staff` record's `doctorId` field links to `op_doctors.id`. In Phase 2, unify into a single `users` table with a `doctor_profiles` relation.

2. **`op_pharmacy_inv` key types**: Both pharmacy IDs and medicine IDs are stored as string keys in the nested object (because `localStorage` JSON serialises numeric object keys as strings). When reading, always coerce to the correct type. In Phase 2 use integer foreign keys in SQL.

3. **`op_orders` mixed source schema**: The `items` array has different optional fields depending on `source`. Normalise in Phase 2 by separating `order_items` into base fields + a `dosage_instructions` relation for prescription orders.

4. **`expiresAt` auto-expiry**: The `PharmacyDashboard` auto-marks `patient_cart` orders as `expired` on mount if `expiresAt` is past. In Phase 2, implement this as a scheduled task (Celery beat / cron).

5. **`op_dosage_slips` dual schema**: Seed records use `medicine/dosage/frequency` keys while POS-generated records use `medicineName/dose/freq`. The patient portal handles both. Normalise in Phase 2.
