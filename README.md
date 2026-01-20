# 🏛️ LegatePro  
<!-- Badges -->
<p align="left">
  <img src="https://img.shields.io/badge/Next.js-14-black" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue" />
  <img src="https://img.shields.io/badge/TailwindCSS-3-38BDF8" />
  <img src="https://img.shields.io/badge/MongoDB-Mongoose-47A248" />
  <img src="https://img.shields.io/badge/Status-Private%20Beta-orange" />
</p>

**A modern, elegant, role‑aware probate management platform — with built‑in estate intelligence.**

LegatePro is a next‑generation probate administration system designed to guide Personal Representatives (executors), attorneys, and fiduciaries through every stage of estate administration.

Instead of disconnected spreadsheets, PDFs, and email threads, LegatePro provides a structured, court‑aware workspace that shows *what’s done, what’s missing, and what needs attention next* — all in one place.

---

## ✨ Core Features (MVP & Beyond)

### 📊 Estate Readiness Score (Foundational)
- Automatically calculates how complete an estate is across documents, tasks, properties, expenses, invoices, and contacts
- Highlights missing or at‑risk areas before they become court issues
- Designed to answer one critical question at a glance:
  **“How ready is this estate right now?”**
- Serves as the backbone for future AI recommendations and alerts

### 📂 Estate Management  
- Create & manage multiple estates  
- Decedent details, court info, PR compensation structure  
- Organized dashboard with tasks, expenses, rent, documents, utilities, contacts, and billing  

### 👥 Collaboration & Permissions
- Invite collaborators by email with role-based access (Owner, Editor, Viewer)
- Secure invite links with expiration and revocation
- Read-only mode for viewers with UI + API enforcement
- Inline collaborator management per estate

### ✅ Task Tracking  
- Full CRUD task management  
- Status, priority, due dates, and notes  
- Filterable task views  

### 💵 Expense Tracking  
- Category‑based expense organization (Funeral, Probate, Insurance, Taxes, etc.)  
- Upload receipts (PDF, HEIC, images)  
- Automated totals and summaries  

### 🧾 Document Index  
- Court‑ready index for all estate‑related documents  
- Subject tagging (Banking, Auto, Insurance, Medical, etc.)  
- Sensitive document flag with filtered views  
- Fast search, filtering, and preview from estate overview  

### 🏠 Property & Rent Management  
- Track rental properties inside an estate  
- Tenant names, rent history, payment periods, reference numbers  
- Property‑level ledgers + estate‑wide rent summaries  

### 🔌 Utilities Tracker  
- Manage all utility accounts tied to each property  
- Service addresses, account numbers, contact details  
- Track open/closed status for final accounting  

### 📇 Contacts Directory  
- Attorneys, heirs, creditors, insurers, vendors  
- Notes, phone numbers, bar IDs, claim IDs, retainer fees  

### ⏱️ PR Time Tracking  
- Court‑friendly timecard system for Personal Representative hours  
- Edit, delete, and manage entries  
- Auto‑calculates totals + unbilled time  
- Integrates with invoice creation  

### 🧾 Invoice Management  
- Create invoices per estate  
- Auto‑generated invoice numbers  
- Workspace billing defaults (currency, terms, hourly rate)  
- Edit, print, and manage invoice status (Draft, Sent, Paid, etc.)  
- Line item editor with rate/amount normalization  
- Estate timeline events log invoice creation/updates  

### 🕒 Estate Timeline & Activity Log
- Unified, chronological audit log per estate
- Tracks invoices, tasks, documents, notes, and collaborators
- Invite lifecycle events (sent, accepted, revoked)
- Grouped by day (Today / Yesterday / dates)
- Copy-friendly invite links surfaced directly in timeline

---

## 🤖 AI Assistance (Planned)

LegatePro uses AI as *strategic assistance*, not automation theater. AI features are designed to reduce risk, surface blind spots, and explain complexity — never to replace legal judgment.

Planned capabilities include:

- **Next‑Step Recommendations**
  - Context‑aware guidance based on estate progress, deadlines, and missing data

- **Document Classification & Tagging**
  - Auto‑suggest subjects, tags, and sensitivity flags when indexing documents

- **Plain‑English Legal Explanations**
  - Inline explanations for probate terms, filings, and requirements

- **Risk Detection & Warnings**
  - Flags missing filings, overdue tasks, or inconsistencies before court submission

---

## 🏗️ Tech Stack

- **Next.js 14 (App Router)**  
- **TypeScript**  
- **Tailwind CSS**  
- **MongoDB + Mongoose**  
- **Custom Auth Wrapper (NextAuth-compatible)**  
- **Stripe Billing (coming soon)**  
- **Server Actions**  
- **Vercel Deployment**  
- **Cloud Storage Integrations (coming soon)**  

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables  
Create `.env.local` using `.env.example` as the template:

```bash
cp .env.example .env.local
```

Fill in required values:
- Database connection  
- NEXTAUTH_SECRET  
- NEXTAUTH_URL  
- Any provider keys if enabling OAuth  
- Stripe keys (optional for now)  

### 3. Start the Dev Server
```bash
npm run dev
```

Then visit:  
👉 http://localhost:3000

---

## 📁 Project Structure

```
src/
  app/
    login/              # Login UI
    register/           # Registration UI
    api/                # Route handlers (Next.js)
      auth/             # NextAuth + register API
      estates/          # Estate CRUD
    app/                # Authenticated application shell
      estates/
        new/             # Create estate
        [estateId]/      # Estate workspace
          tasks/
          expenses/
          documents/
          properties/
          rent/
          utilities/
          contacts/
          time/
          settings/
    page.tsx             # Marketing landing page
  models/                # MongoDB/Mongoose models
  lib/                   # db connection, auth helpers, utils
  components/            # UI components and shared blocks
```

---

## 💼 Investor Overview (High‑Level)

### Market Need  
Probate impacts ~3M estates annually in the U.S., yet the process remains paper‑heavy, fragmented, and stressful.  
LegatePro modernizes this space by offering tools that Personal Representatives actually need but currently assemble across spreadsheets, PDFs, email threads, and courthouse forms.

### Value Proposition  
- Reduces administrative burden by 60–80%  
- Prevents errors in filings, deadlines, and accounting  
- Creates clean, court‑ready exports for judges and attorneys  
- Offers AI‑powered document drafting and classification (future)

### Target Users  
- Personal Representatives (executors)  
- Probate attorneys  
- Estate planners  
- Court‑appointed administrators

### Long‑Term Vision  
A unified ecosystem for estate administration:  
tasks → documents → rent → utilities → expenses → filings → AI automation.

---

## 🛠️ Design & Development Philosophy

### **1. Radical Simplicity**  
Probate is overwhelming — the UI should be calm, minimal, and obvious.

### **2. Real‑World Accuracy**  
Every workflow is modeled from actual estate administration:  
rent ledgers, funeral invoices, PR timecards, utilities, legal filings.

### **3. AI as Strategic Assistance**  
AI will enhance — not replace — human judgment by:
- Surfacing what’s missing or at risk
- Explaining complex probate concepts in plain language
- Suggesting next actions based on real estate data

---

## 🎨 Visual Style  
Tone: modern, structured, elegant.  
Inspired by:  
- Geometric keyhole motifs  
- Minimal contrasts  
- Sandstone + red accents  
- Black Renaissance aesthetic  

Brand direction aligns with trust, clarity, and professional legal tech standards.

---

## 📌 Roadmap

- [ ] Estate Readiness Score (cross‑module progress & risk signal)
- [x] Full CRUD tasks
- [x] Expense module
- [x] Document index + sensitive docs
- [x] Property management
- [ ] Utility workflows
- [x] Contacts system
- [x] PR time tracking + unbilled totals
- [x] Invoice creation, editing, printing, numbering
- [x] Collaboration & role-based permissions
- [x] Estate timeline & activity logging
- [ ] Stripe billing integration
- [ ] PDF generation
- [ ] AI assistants & automation

---

## ✉️ Author  
**Jus K. Buckingham**  
Los Angeles  
Private & Proprietary Project

---

## 🔐 Licensing & Confidentiality

This project is private, proprietary, and not open‑source.  
All rights reserved. Distribution or replication is prohibited without explicit written permission.