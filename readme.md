# AI-Powered Pharmacy Management System 

**[span_0](start_span)Team 65**[span_0](end_span) | **[span_1](start_span)Software Engineering Project**[span_1](end_span)

## 📌 Project Overview
[span_2](start_span)Welcome to the repository for the AI-Powered Pharmacy Management System[span_2](end_span). This platform is designed to digitize and streamline operations for local pharmacies, improving efficiency for staff and enhancing the healthcare experience for patients. 

Currently, the project is in **Phase 1**, focusing on a high-fidelity, interactive, static UI prototype (HTML/CSS/JS) to validate user flows before backend integration. The system is designed with a multi-tenant architecture to be scalable for multiple pharmacies in the future.

## 🎯 The Problem
[span_3](start_span)[span_4](start_span)[span_5](start_span)[span_6](start_span)Based on user research interviews conducted with a local pharmacy owner (Mr. Saha) and regular customers[span_3](end_span)[span_4](end_span)[span_5](end_span)[span_6](end_span), we identified several critical operational bottlenecks:
* **[span_7](start_span)[span_8](start_span)Manual Operations:** Inventory tracking is manual, error-prone, and lacks structured sales data for business analytics[span_7](end_span)[span_8](end_span).
* **[span_9](start_span)Customer Friction:** Stockouts occur without warning, and slow manual billing causes long queues and frustration for unwell patients[span_9](end_span).
* **[span_10](start_span)[span_11](start_span)Safety & Compliance:** Handwritten prescriptions are difficult to read, and expiry date management is purely reactive[span_10](end_span)[span_11](end_span). [span_12](start_span)Patients also struggle to remember verbal dosage instructions after leaving the counter[span_12](end_span).

## 👥 Target Users
[span_13](start_span)The system caters to distinct user tiers[span_13](end_span):
* **[span_14](start_span)Primary Users:** Staff Members (managing day-to-day inventory, billing)[span_14](end_span) [span_15](start_span)and Patients (booking appointments, checking availability)[span_15](end_span).
* **[span_16](start_span)Secondary Users:** Admins/Owners (overseeing analytics and schedules)[span_16](end_span).
* **[span_17](start_span)Tertiary Users:** Registered Doctors (receiving appointments via the platform - *Planned for Phase 2*)[span_17](end_span).

## ✨ Key Features (Phase 1 UI Prototype)
[span_18](start_span)This prototype implements the frontend interfaces for our core SMART User Stories[span_18](end_span):

### Admin / Owner Portal
* **[span_19](start_span)Data Analytics Dashboard:** Visual summaries of monthly sales and top-selling medicines[span_19](end_span).
* **[span_20](start_span)[span_21](start_span)Automated Alerts:** Notifications for stock falling below minimum thresholds and medicines approaching their expiry dates[span_20](end_span)[span_21](end_span).
* **[span_22](start_span)Supplier Reporting:** Quick generation of purchase quantity reports[span_22](end_span).

### Staff / Cashier Portal
* **[span_23](start_span)[span_24](start_span)Rapid POS & Billing:** Auto-calculating invoices (tax-compliant) designed to process orders in under a minute[span_23](end_span)[span_24](end_span).
* **[span_25](start_span)AI Prescription Scanner (Mockup):** UI flow for uploading handwritten prescriptions to extract drug names and dosages[span_25](end_span).
* **[span_26](start_span)Smart Recommendations:** Suggests generic alternatives for expensive brands[span_26](end_span).

### Patient Portal (Mobile-Optimized)
* **[span_27](start_span)Availability Checker:** Allows patients to verify medicine availability before visiting the store[span_27](end_span).
* **[span_28](start_span)Digital Dosage Slips:** Auto-generated digital instructions (frequency, timing) provided at checkout[span_28](end_span).
* **[span_29](start_span)Appointment Booking:** Interface for booking 15-minute consultation slots[span_29](end_span).

## 🛠️ Tech Stack (Phase 1)
* **Structure & Logic:** HTML5, Vanilla JavaScript (DOM manipulation and simulated state via `localStorage`).
* **Styling:** Tailwind CSS (via CDN) for rapid, utility-first, responsive design.
* **Data Visualization:** Chart.js (or similar CDN library) for admin dashboard charts.
* *Note: Phase 1 contains no active database or backend frameworks.*

## 🚀 How to Run the Prototype
1. Clone this repository to your local machine.
2. No build steps, `npm install`, or local servers are strictly required.
3. Open `index.html` in any modern web browser to access the main directory and navigate through the portal views.

## 📅 Roadmap
* **[span_30](start_span)[span_31](start_span)Milestone 1 (March 22):** Finalize requirement specifications, UI/UX prototyping, and core user flow validation[span_30](end_span)[span_31](end_span).
* **[span_32](start_span)Phase 2:** Backend integration, database architecture, and integration of Tertiary Users (Registered Doctors)[span_32](end_span).
