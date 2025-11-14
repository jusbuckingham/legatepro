# 🏛️ LegatePro  
**A modern, elegant, AI‑powered probate management platform.**

LegatePro simplifies the probate process for Personal Representatives (executors) through guided workflows, automation, and structured estate management.  
Inspired by real‑world estate administration, LegatePro aims to become the **TurboTax for probate** — calm, accurate, and empowering.

---

## ✨ Core Features (MVP)

### 📂 Estate Management  
- Create & manage multiple estates  
- Decedent details, court info, PR compensation structure  
- Organized dashboard with tasks, expenses, rent, documents, and more  

### ✅ Task Tracking  
- Full CRUD task management  
- Status, priority, dates, notes  
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
- Tenant names, rent history, periods, methods, reference numbers  
- Property‑level ledgers + estate‑wide summaries  

### 🔌 Utilities Tracker  
- Manage all utility accounts tied to each property  
- Service addresses, account numbers, contact details  
- Track open/closed status for final accounting  

### 📇 Contacts Directory  
- Attorneys, heirs, creditors, insurers, vendors  
- Notes, phone numbers, bar IDs, claim IDs, retainer fees  

### ⏱️ PR Time Tracking  
- Court‑friendly timecard for Personal Representative hours  
- Auto‑calculates totals  
- Export‑ready for court filings  

---

## 🏗️ Tech Stack

- **Next.js (App Router)**  
- **TypeScript**  
- **Tailwind CSS**  
- **MongoDB + Mongoose**  
- **Server Actions**  
- **Stripe Billing** (coming soon)  
- **Kinde or NextAuth** (TBD)  

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables  
Create `.env.local`:

```
MONGODB_URI=""
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
NEXTAUTH_SECRET=""
NEXTAUTH_URL="http://localhost:3000"
```

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
    app/                 # Authenticated application shell
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

## 🛠️ Design & Development Philosophy

### **1. Radical Simplicity**  
Probate is overwhelming — the UI should be calm, minimal, and obvious.

### **2. Real‑World Accuracy**  
Every workflow is modeled from actual estate administration:  
rent ledgers, funeral invoices, PR timecards, utilities, legal filings.

### **3. AI‑Assisted Probate** (coming soon)  
- Automated document generation (receipts, letters, notices)  
- Smart suggestions based on probate stage  
- Auto‑classification of uploaded documents  

---

## 🎨 Logo  
The LegatePro logo is currently in design. Guiding principles:  
- Geometric keyhole symbol (legacy + security)  
- Minimal modern lines  
- Red + sandstone palette  
- Tone: refined, structured, Black Renaissance inspired  

---

## 📌 Roadmap

- [ ] Full CRUD tasks  
- [ ] Expense receipt uploads  
- [ ] Enhanced document index  
- [ ] Property management + rent exports  
- [ ] Utility workflows  
- [ ] Contacts system  
- [ ] PR timecard exports  
- [ ] Authentication  
- [ ] Stripe billing integration  
- [ ] PDF generation  
- [ ] AI assistants & automation  

---

## ✉️ Author  
**Jus K. Buckingham**  
Los Angeles  
Private & Proprietary Project
