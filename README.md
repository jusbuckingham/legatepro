# 🏛️ LegatePro  
**A modern, elegant, AI-powered probate management platform.**

LegatePro streamlines the entire probate process for Personal Representatives (executors), inspired by the workflows, documents, and real-world lessons learned from managing complex estates.  
Built with **Next.js, TypeScript, MongoDB, Vercel, and Stripe**, LegatePro aims to become the “TurboTax for probate”—simple, guided, automated.

---

## ✨ Features (MVP)

### 📂 Estate Management  
- Create, track, and manage multiple estates  
- Store decedent information, court details, compensation structure  
- Clean estate-level dashboard with tasks, expenses, documents, and more  

### ✅ Task Tracking  
- Tasks modeled after real probate workflows  
- Priorities, dates, notes, statuses  
- Fully filterable and exportable  

### 💵 Expense Tracking  
- Organize expenses by category (Funeral, Probate, Income Tax, etc.)  
- Upload receipts + supporting documents  
- Automatic totals and summaries  

### 🧾 Document Index  
- Centralized index linking to PDF, HEIC, and image documents  
- Clean tagging system (Banking, Auto, Medical, Income Tax, etc.)  
- Links out to Google Drive, iCloud Drive, Dropbox, etc.  

### 🏠 Property & Rent Tracking  
- Track rental properties, tenants, payment history, repairs, expenses  
- Auto‑summaries for each property  
- Link receipts, rent ledgers, and Zillow values  

### 🔌 Utilities Manager  
- Track utility accounts, contact info, service addresses, and close-out status  

### 📇 Contacts Directory  
- Attorneys, heirs, insurers, creditors, vendors  
- Bar ID, retainer fees, claim numbers, contract numbers, and more  

### ⏱️ Time Tracking  
- Personal Representative timecard  
- Auto-calculated compensation summaries  
- Export for court filings  

---

## 🏗️ Tech Stack

- **Next.js (App Router)**  
- **TypeScript**  
- **TailwindCSS**  
- **MongoDB Atlas**  
- **Mongoose Models**  
- **Server Actions**  
- **Stripe Billing** (coming soon)  
- **Kinde or NextAuth** for authentication (TBD)

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env.local` file:

```
MONGODB_URI="your-mongodb-connection"
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
NEXTAUTH_SECRET=""
NEXTAUTH_URL="http://localhost:3000"
```

(Add keys as features are implemented.)

### 3. Run the Development Server
```bash
npm run dev
```

Then open:  
👉 http://localhost:3000

---

## 📁 Project Structure (Simplified)

```
src/
  app/
    app/                 # Authenticated app shell
      estates/
        new/            # Create estate
        [estateId]/     # Estate dashboard (tabs)
          tasks/
          expenses/
          documents/
          properties/
          rent/
          utilities/
          contacts/
          time/
          settings/
    page.tsx            # Marketing landing page
  models/               # Mongoose models
  lib/                  # db, auth, stripe helpers
  components/           # UI + shared components
```

---

## 🛠️ Development Philosophy

LegatePro is built with three principles:

### **1. Absolute Simplicity**  
Probate is overwhelming. LegatePro should feel calm, clean, and clearly structured.

### **2. Real-World Accuracy**  
Everything is based on actual estate administration workflows, from rental ledgers to court timecards.

### **3. AI-Augmented Help**  
Eventually, the platform will offer:
- document generation (receipts, accounting reports, notices)
- data extraction from uploaded documents
- task suggestions based on probate stage

---

## 🎨 Logo (Coming Soon)

We will design a logo that reflects:
- clean modern aesthetic  
- minimal elegance  
- themes of order, clarity, legacy, and structure  
- your personal taste: refined, modern, slightly artistic, with a nod to Black renaissance design  

Logo ideas on deck:
- geometric keyhole + book  
- minimalist courthouse silhouette  
- abstract “L” monogram  
- red/black/gold palette (optional based on preference)

---

## 📌 Roadmap

- [ ] Full CRUD for tasks  
- [ ] Expense + receipt upload  
- [ ] Document index  
- [ ] Property + rent tools  
- [ ] Utilities module  
- [ ] Contacts system  
- [ ] Timecard + auto-compensation  
- [ ] Authentication  
- [ ] Stripe billing  
- [ ] PDF generation  
- [ ] AI assistants  

---

## 📝 License
This project is currently private and proprietary.

---

## ✉️ Author
Built by **Jus K. Buckingham**  
Los Angeles.

---
