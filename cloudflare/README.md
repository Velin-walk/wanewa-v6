# Walk Nepal Walk - Cloudflare API Setup Guide

This guide helps you recreate your deleted Cloudflare Worker, D1 Database, and R2 Bucket for `walk-nepal-walk-api`.

---

## 🚀 Quick Setup Option A: Using Cloudflare Web Dashboard (Easiest)

### Step 1: Create the D1 Database
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) -> **Storage & Databases** -> **D1 SQL Database**.
2. Click **Create Database**.
3. Name it: `walk-nepal-walk-db` and click **Create**.
4. Click on the newly created database -> **Console** tab.
5. Copy all text from `cloudflare/schema.sql` in this project, paste it into the SQL console, and click **Execute**.

### Step 2: Create the R2 Bucket
1. In Cloudflare Dashboard, go to **Storage & Databases** -> **R2 Objects**.
2. Click **Create Bucket**.
3. Name it: `walk-nepal-walk-storage` and click **Create**.

### Step 3: Create the Worker
1. Go to **Workers & Pages** -> **Create Application** -> **Create Worker**.
2. Name it `walk-nepal-walk-api` and click **Deploy**.
3. Click **Edit Code**.
4. Replace all code in the editor with the contents of `cloudflare/worker.js` from this folder.
5. Click **Save and Deploy**.

### Step 4: Add Bindings to Worker
1. Go back to your worker's page (**Workers & Pages** -> **walk-nepal-walk-api**).
2. Go to **Settings** -> **Bindings** (or **Variables & Bindings**).
3. Click **Add** -> **D1 Database Binding**:
   - Variable name: `DB`
   - D1 Database: Select `walk-nepal-walk-db`
4. Click **Add** -> **R2 Bucket Binding**:
   - Variable name: `BUCKET`
   - R2 Bucket: Select `mapminers-trails` (or your existing R2 bucket)
5. Click **Save and Deploy**.

---

## 💻 Quick Setup Option B: Using Terminal / Wrangler CLI

If you have Node.js and Wrangler installed locally:

```bash
cd cloudflare

# 1. Login to Cloudflare
npx wrangler login

# 2. Create D1 Database
npx wrangler d1 create walk-nepal-walk-db
# Copy the database_id from output and paste it into wrangler.toml

# 3. Create R2 Bucket
npx wrangler r2 bucket create walk-nepal-walk-storage

# 4. Initialize Database Schema
npx wrangler d1 execute walk-nepal-walk-db --file=./schema.sql

# 5. Deploy Worker
npx wrangler deploy
```

---

## 🔗 Step 5: Update App Environment Variable (If Worker URL Changed)

If your new Worker URL matches `https://walk-nepal-walk-api.velinrai-vr.workers.dev`, no changes are needed!

If your worker has a different URL (e.g., `https://walk-nepal-walk-api.YOUR-NAME.workers.dev`):
1. In AI Studio **Settings**, set:
   ```env
   CLOUDFLARE_WORKER_URL=https://walk-nepal-walk-api.YOUR-NAME.workers.dev
   ```
2. In the Admin Dashboard of your app, click **Upload to Database** to restore all catalog itineraries to your new D1 database!
