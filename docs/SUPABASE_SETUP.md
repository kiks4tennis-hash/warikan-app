# Supabase setup for 割り勘ノート

The group ledger uses Supabase Database, Auth, Realtime, and private Storage. The personal calculator and its saved history continue to work locally.

## 1. Create the project

Create a Supabase project on the Free plan. Choose a region close to the people who will use the app. The Free plan can pause projects after a week of inactivity, so it is suitable for development and early testing but is not a no-downtime production guarantee.

## 2. Apply the database schema

In Supabase Dashboard, open **SQL Editor**, create a query, paste the full contents of [`supabase/migrations/202610060001_initial_shared_ledger.sql`](../supabase/migrations/202610060001_initial_shared_ledger.sql), and run it. The migration creates the tables, row-level security policies, invite-token functions, private receipt bucket, and Realtime publication entries.

## 3. Enable anonymous sign-in

In **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**. The app creates a private anonymous user on the device so group memberships and row-level security can work without requiring email or a password. If the app is deleted before the user links an account, the anonymous identity may not be recoverable.

## 4. Add local app credentials

Copy `.env.example` to `.env` in the project root. In the Supabase Dashboard's **Connect** panel, copy the Project URL and Publishable key into the matching variables:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The Publishable key is intended for the client app. Never put a `service_role` or secret key in the app or `.env` file. Row Level Security protects every group table; the publishable key is not a substitute for those policies.

## 5. Install packages and start Expo Go

From the repository root, run:

```powershell
npm install
npx expo install --check
npm run typecheck
npx expo start
```

If the anonymous sign-in request is rejected, confirm step 3. If groups cannot load after applying the schema, inspect the first SQL/API error before changing any RLS policy.

## Receipt OCR and the one native build

Groups, expenses, checklists, exchange-rate entry, and settlement work in Expo Go. Receipt text recognition uses the device's Apple Vision OCR through `expo-ocr-kit`, which contains native code and therefore is unavailable in Expo Go. Select **Read receipt** to choose a photo; OCR suggests a title and amount, and the user reviews both before saving. If the expense is saved with a selected receipt, the image is uploaded to the group's private Supabase bucket. To test OCR on an iPhone, install dependencies and create one iOS EAS development build after the Supabase connection works. Rebuilding is required after adding or changing native modules.

## Invitation behavior

Invite codes are random, stored as SHA-256 hashes, and expire after 30 days. A person who can open the invite link can join that group, so share it only with intended members. The database policies restrict group rows to members.

## Account deletion before App Store submission

The shared-group feature creates an anonymous Supabase account. Before release, apply the account-deletion migration and deploy the `delete-account` Edge Function:

1. Run [`supabase/migrations/202610180001_account_deletion.sql`](../supabase/migrations/202610180001_account_deletion.sql) in the Supabase Dashboard's **SQL Editor**.
2. In PowerShell at the project root, authenticate and deploy the function:

   ```powershell
   npx supabase@latest login
   npx supabase@latest link --project-ref kyuqofoeembejpbeogna
   npx supabase@latest functions deploy delete-account --project-ref kyuqofoeembejpbeogna
   ```

   The function uses Supabase's server-side `SUPABASE_SERVICE_ROLE_KEY`; never add that key to the app, `.env`, or EAS client variables.
3. Test deletion with a test account that owns a group with other members, a group with no other members, and membership in another person's group. Confirm that ownership is transferred or the empty group is removed, receipt files are deleted, and the account can no longer sign in.

Deletion removes expenses created or paid by that user and checklist items they created. In remaining expenses, the user is removed from the split and the remaining active participants share the amount by their existing weights. The user's owned groups transfer to the earliest remaining member, or are deleted if no other member remains.

## Privacy and backups

Group names, participant display names, expenses, checklist items, and attached receipts are cloud data visible to group members. Local-only calculator history remains on the device. Free-plan projects do not include automatic backups and may pause after inactivity; export or backup important records before a production launch.
