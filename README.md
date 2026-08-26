# AgentifyAI

AgentifyAI is a Next.js learning workspace with Firebase Authentication, AI tutoring, autonomous missions, session replay, analytics, and a premium light/dark dashboard UI.

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Founder Admin Console

The founder-only Admin Console lives at `/dashboard/internal/admin`. The
authenticated backend `/admin/me` response is the production source of truth;
configure the backend founder/admin allow-list or verified Firebase custom
claims there. `NEXT_PUBLIC_FOUNDER_ADMIN_EMAILS` and
`NEXT_PUBLIC_ADMIN_EMAILS` are optional client fallbacks only and must never be
treated as the security boundary.

## Firebase Auth Branding

Google sign-in displays the Firebase Auth domain in the account chooser. To avoid showing the internal Firebase project name, configure a branded auth domain in Firebase and set this env var in production:

```bash
NEXT_PUBLIC_FIREBASE_BRANDED_AUTH_DOMAIN=agentifyai.in
```

Keep `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` as the default Firebase fallback. The branded domain must be configured/authorized in Firebase Authentication before enabling it in production.

Checklist:

1. In Firebase Hosting, connect a custom domain on the same Firebase project used for Authentication. Use either `agentifyai.in` if Firebase Hosting serves the app, or a dedicated auth domain such as `auth.agentifyai.in` if the app is hosted elsewhere.
2. In Firebase Console > Authentication > Settings > Authorized domains, add the branded auth domain.
3. In Google Cloud Console > APIs & Services > Credentials, open the Web OAuth client used by Firebase and add:
   - Authorized JavaScript origin: `https://agentifyai.in`
   - Authorized redirect URI: `https://YOUR_BRANDED_AUTH_DOMAIN/__/auth/handler`
4. In Google Auth Platform > Branding, set the app name to `AgentifyAI`, add support email, app domain, privacy policy, and terms links, then publish/verify if Google asks.
5. In production env vars, set `NEXT_PUBLIC_FIREBASE_BRANDED_AUTH_DOMAIN` to the branded auth domain and redeploy.
