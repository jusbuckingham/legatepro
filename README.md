# 🏛️ LegatePro  
<!-- Badges -->
<p align="left">
  <img src="https://img.shields.io/badge/Next.js-14-black" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue" />
  <img src="https://img.shields.io/badge/TailwindCSS-3-38BDF8" />
  <img src="https://img.shields.io/badge/MongoDB-Mongoose-47A248" />
  <img src="https://img.shields.io/badge/Status-Private%20Beta-orange" />
</p>

**A modern, elegant, AI‑powered probate management platform.**

LegatePro is a next‑generation probate administration system designed to streamline estate management for Personal Representatives (executors), attorneys, and fiduciaries.  
With structured workflows, automation, and AI‑assisted guidance, LegatePro aims to become the *TurboTax for probate* — accurate, compliant, and built for real‑world estate complexity.

---

## ✨ Core Features (MVP & Beyond)

### 📂 Estate Management  
- Create & manage multiple estates  
- Decedent details, court info, PR compensation structure  
- Organized dashboard with tasks, expenses, rent, documents, utilities, contacts, and billing  

### ✅ Task Tracking  
- Full CRUD task management  
- Status, priority, due dates, and notes  
- Filterable task views  

### 💵 Expense Tracking  
- Category‑based expense organization (Funeral, Probate, Insurance, Taxes, etc.)  
- Upload receipts (PDF, HEIC, images)  
- Automated totals and summaries  

### 🧾 Document Index  
- Unified index for all estate‑related documents  
- Tagging system (Banking, Auto, Insurance, Medical, etc.)  
- Designed to link out to Google Drive, iCloud, Dropbox, etc.  

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

### 🤖 AI‑Assisted Probate (Coming Soon)  
- Automated document drafting (receipts, letters, notices)  
- Smart suggestions based on probate stage  
- Auto‑classification of uploaded documents  

---

## 🏗️ Tech Stack

- **Next.js 14 (App Router)**  
- **TypeScript**  
- **Tailwind CSS**  
- **MongoDB + Mongoose**  
- **NextAuth (Credentials + OAuth)**  
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
AI will enhance—not replace—human judgment through:  
- Smart recommendations  
- Auto‑drafted documents  
- Context‑aware insights  

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

- [x] Full CRUD tasks  
- [x] Expense module  
- [ ] Enhanced document index  
- [x] Property management  
- [ ] Utility workflows  
- [x] Contacts system  
- [x] PR time tracking + unbilled totals  
- [x] Invoice creation, editing, printing, numbering  
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