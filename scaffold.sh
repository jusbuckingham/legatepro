#!/bin/bash

echo "🧱 Scaffolding full LegatePro project structure..."

# ------------ #
#  APP ROUTES  #
# ------------ #

BASE="src/app/app" # authenticated area

# Ensure folder exists
mkdir -p $BASE

# Core folders
mkdir -p $BASE/estates
mkdir -p $BASE/settings
mkdir -p $BASE/billing

# Estate routes
mkdir -p $BASE/estates/new
mkdir -p $BASE/estates/[estateId]
mkdir -p $BASE/estates/[estateId]/tasks
mkdir -p $BASE/estates/[estateId]/expenses
mkdir -p $BASE/estates/[estateId]/documents
mkdir -p $BASE/estates/[estateId]/properties
mkdir -p $BASE/estates/[estateId]/properties/[propertyId]
mkdir -p $BASE/estates/[estateId]/rent
mkdir -p $BASE/estates/[estateId]/utilities
mkdir -p $BASE/estates/[estateId]/contacts
mkdir -p $BASE/estates/[estateId]/time
mkdir -p $BASE/estates/[estateId]/settings

# Layout files
touch $BASE/layout.tsx
touch $BASE/estates/[estateId]/layout.tsx

# Estate pages
touch $BASE/estates/page.tsx
touch $BASE/estates/new/page.tsx
touch $BASE/estates/[estateId]/page.tsx

# Estate tab pages
touch $BASE/estates/[estateId]/tasks/page.tsx
touch $BASE/estates/[estateId]/expenses/page.tsx
touch $BASE/estates/[estateId]/documents/page.tsx
touch $BASE/estates/[estateId]/properties/page.tsx
touch $BASE/estates/[estateId]/rent/page.tsx
touch $BASE/estates/[estateId]/utilities/page.tsx
touch $BASE/estates/[estateId]/contacts/page.tsx
touch $BASE/estates/[estateId]/time/page.tsx
touch $BASE/estates/[estateId]/settings/page.tsx
touch $BASE/settings/page.tsx
touch $BASE/billing/page.tsx

# ------------- #
#   COMPONENTS   #
# ------------- #

mkdir -p src/components/ui
mkdir -p src/components/estate
mkdir -p src/components/forms
mkdir -p src/components/navigation

touch src/components/ui/Button.tsx
touch src/components/ui/Input.tsx
touch src/components/ui/Table.tsx
touch src/components/ui/Badge.tsx
touch src/components/ui/Card.tsx
touch src/components/navigation/AppShell.tsx

# ------------ #
#   MODELS     #
# ------------ #

mkdir -p src/models

MODELS=(
  Estate
  Task
  Expense
  EstateDocument
  EstateProperty
  RentPayment
  UtilityAccount
  Contact
  TimeEntry
  User
)

for model in "${MODELS[@]}"; do
  touch "src/models/$model.ts"
done

# ----------- #
#   LIB/UTIL  #
# ----------- #

mkdir -p src/lib
touch src/lib/db.ts
touch src/lib/auth.ts
touch src/lib/stripe.ts
touch src/lib/utils.ts
touch src/lib/validators.ts

# ------------ #
#   API ROUTES #
# ------------ #

mkdir -p src/app/api/estates
mkdir -p src/app/api/tasks
mkdir -p src/app/api/expenses
mkdir -p src/app/api/documents
mkdir -p src/app/api/properties
mkdir -p src/app/api/rent
mkdir -p src/app/api/utilities
mkdir -p src/app/api/contacts
mkdir -p src/app/api/time
mkdir -p src/app/api/auth
mkdir -p src/app/api/billing

for group in estates tasks expenses documents properties rent utilities contacts time auth billing
do
  touch "src/app/api/$group/route.ts"
done

echo "✨ LegatePro scaffold complete!"
echo "You can now fill in each file one by one."