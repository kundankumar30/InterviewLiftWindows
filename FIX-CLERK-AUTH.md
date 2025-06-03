# 🔑 Fix Clerk Authentication Issue

## 🚨 **Current Problem**
```
❌ 401 Unauthorized errors from Clerk API
❌ "ClerkJS components are not ready yet"
❌ Expired/invalid publishable key
```

---

## ✅ **Solution: Get Fresh Clerk Key**

### **Step 1: Get New Clerk Publishable Key**

1. **Visit**: https://dashboard.clerk.com
2. **Sign in** to your account (or create a new one)
3. **Create New Application**:
   - Name: "Interview Lift"
   - Enable **Email** authentication
   - Enable **Google** OAuth
4. **Copy Publishable Key**: Look for `pk_test_...` (NOT the secret key)

### **Step 2: Update App & Rebuild** 

Run the automated script:
```bash
./update-clerk-key.sh pk_test_YOUR_NEW_KEY_HERE
```

**What this does:**
- ✅ Updates `src/electron/config/app-config.js` with new key
- ✅ Rebuilds the app with fresh authentication
- ✅ Creates new installer with working Clerk auth
- ✅ Tests the build process

### **Step 3: Manual Update (Alternative)**

If you prefer manual update:

1. **Edit** `src/electron/config/app-config.js`:
```javascript
clerk: {
  publishableKey: 'pk_test_YOUR_NEW_KEY_HERE', // Replace this line
  // ... rest stays same
}
```

2. **Rebuild**:
```bash
npm run electron:package
./create-installer-dmg.sh
mv Interview-Lift-Installer-1.0.0.dmg installers/
```

---

## 🔧 **Configure Clerk Dashboard**

After creating your Clerk app:

### **OAuth Settings**
1. Go to **User & Authentication** → **Social connections**
2. **Enable Google**
3. **Add redirect URLs**:
   - `http://localhost:3000`
   - `file://`
   - Your production domain

### **Authentication Methods**
- ✅ **Email** (for email/password)
- ✅ **Google** (for Gmail OAuth)
- ✅ **Username** (optional)

---

## ✅ **Verification Steps**

After updating the key and rebuilding:

### **Test Development App**
```bash
npm run electron
```
**Expected**: Login screen loads without 401 errors

### **Test Installed App**
```bash
open "/Applications/Interview Lift.app"
```
**Expected**: Authentication works properly

### **Console Checks**
- ✅ No 401 errors
- ✅ "Clerk initialized successfully"
- ✅ Gmail OAuth opens browser correctly

---

## 🚀 **What You'll Get**

### **Working Authentication**
- ✅ Gmail OAuth (opens browser)
- ✅ Email/password signup/signin
- ✅ Persistent user sessions
- ✅ Proper error handling

### **Updated Files**
- ✅ `out/interview-lift-darwin-arm64/interview-lift.app` (working app)
- ✅ `installers/Interview-Lift-Installer-1.0.0.dmg` (new installer)
- ✅ System installation works properly

---

## 🔍 **Troubleshooting**

### **Still getting 401 errors?**
- Key might be from wrong environment (dev vs prod)
- Check Clerk dashboard for key status
- Try creating completely new Clerk application

### **OAuth not working?**
- Verify Google is enabled in Clerk dashboard
- Check redirect URLs include `file://` for packaged app
- Ensure no CORS restrictions

### **"Components not ready" error?**
- Usually fixed with fresh key
- May need to clear app data/cache

---

**🎯 Once completed, your Interview Lift app will have fully working authentication!** 