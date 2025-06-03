# 📦 Packaged App - Ready to Use!

## 🎉 **App is Pre-Configured**

This packaged app has Clerk authentication keys **already embedded**. It should work out-of-the-box without any configuration!

---

## 🚀 **Quick Start**

1. **Launch the app**
2. **Try Gmail sign-in** - should open browser for Google OAuth
3. **Try email/password** - works with real accounts
4. **Enjoy all features** - AI assistance, speech recognition, etc.

---

## 🔧 **If Authentication Doesn't Work**

### **Check Console Output:**
- Right-click app → "Show Package Contents"
- Navigate to: `Contents/MacOS/`
- Run `./interview-lift` in terminal to see logs

### **Common Issues & Solutions:**

#### **Issue**: Expired Clerk Key
```
❌ Invalid Clerk Publishable Key format
🔑 Using Clerk Publishable Key: pk_test_...
```
**Solution**: App developer needs to update with fresh Clerk key

#### **Issue**: OAuth Redirect Problems
```
OAuth redirect failed / CORS errors
```
**Solution**: Check Clerk dashboard OAuth settings

#### **Issue**: Network/Firewall
```
Failed to load Clerk SDK / Network errors
```
**Solution**: Check internet connection and firewall settings

---

## 🛠 **For Developers: Updating Keys**

### **Step 1**: Get New Clerk Keys
- Go to https://dashboard.clerk.com
- Create fresh application
- Copy new **Publishable Key**

### **Step 2**: Update Config
```bash
# Navigate to app contents:
Right-click app → "Show Package Contents"
→ Contents/Resources/app/src/electron/config/app-config.js
```

```javascript
clerk: {
  publishableKey: 'pk_test_your-new-fresh-key-here' || // Update this
                 process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 
                 process.env.CLERK_PUBLISHABLE_KEY || 
                 null
},
```

### **Step 3**: Configure OAuth
In Clerk dashboard, add these redirect URLs:
- `file://` (for packaged app)
- `http://localhost:3000` (for development)

---

## ✅ **Expected Behavior**

### **Working App Shows:**
```
🔑 Using Clerk Publishable Key: pk_test_ABC123...
✅ Clerk initialized successfully
```

### **Broken App Shows:**
```
❌ Invalid Clerk Publishable Key format
📋 Please: 1. Create a new Clerk project...
```

---

## 📱 **App Features (Once Working)**

- ✅ **Gmail OAuth** - Opens browser for Google sign-in
- ✅ **Email/Password** - Standard authentication
- ✅ **Real User Accounts** - Persistent login across sessions
- ✅ **AI Interview Assistant** - All features enabled
- ✅ **Speech Recognition** - Real-time transcription
- ✅ **Overlay Mode** - Transparent interview helper

---

**Note**: This app uses real authentication (no demo mode). Users need valid email accounts to sign up/sign in. 