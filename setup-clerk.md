# 🚀 Real Clerk Authentication Setup

## Step 1: Create Clerk Account & Project

1. **Go to**: https://dashboard.clerk.com
2. **Sign up** for a free account (10,000 users free)
3. **Click**: "Create application"
4. **Name**: "Interview Lift" 
5. **Enable Authentication Methods**:
   - ✅ **Email** (for email/password)
   - ✅ **Google** (for Gmail OAuth)
   - ✅ **Username** (optional)

## Step 2: Get Your API Keys

After creating your app, copy these values:

- **Publishable Key**: `pk_test_...`
- **Secret Key**: `sk_test_...`

## Step 3: Embed Keys in App (Recommended for Distribution)

**Edit** `src/electron/config/app-config.js`:

```javascript
clerk: {
  publishableKey: 'pk_test_your-actual-new-key-here' || // Your real key
                 process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 
                 process.env.CLERK_PUBLISHABLE_KEY || 
                 null
},
```

## Step 4: Test the App

```bash
npm run electron
```

### ✅ What to Expect:

1. **Valid Key**: Login screen shows with working Gmail/Email buttons
2. **Invalid Key**: Shows setup instructions with error message
3. **Real Users**: Can sign up/sign in with real email addresses
4. **Gmail OAuth**: Opens browser for Google authentication

### 🔧 Troubleshooting:

- **401 Errors**: Key is expired, get a fresh one from Clerk dashboard
- **No OAuth**: Ensure Google is enabled in Clerk dashboard
- **CORS Issues**: Add your domain to Clerk's allowed origins

## Step 5: Package for Distribution

Once keys are embedded and working:

```bash
npm run electron:package
```

**Result**: App works out-of-the-box, no user configuration needed! 🎉

## Step 6: Configure OAuth (Important)

In your Clerk dashboard:

1. Go to **User & Authentication** → **Social connections**
2. **Enable Google** 
3. Add redirect URLs:
   - `http://localhost:3000` (for development)
   - `file://` (for packaged app)
   - Your production domain

---

**Benefits of Embedded Keys:**
- ✅ **No user setup required**
- ✅ **App works immediately after install**
- ✅ **Better user experience**
- ✅ **Easier distribution**

**Security Note**: Publishable keys are safe to embed in client apps.

**Free Tier**: 10,000 monthly active users
**No Credit Card**: Required for development
**Production Ready**: Just update to live keys (`pk_live_...`) 