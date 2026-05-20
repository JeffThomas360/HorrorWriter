# HorrorWriter — Next Steps & TODOs

We have successfully transitioned the platform from static mock data to a fully dynamic **Supabase backend**, implemented **native Passkeys**, and secured the Magic Link flow with **Cloudflare Turnstile**. 

Here is the prioritized list of what remains to be done before or shortly after launch.

## 1. Custom Email & SMTP Configuration
Right now, Magic Links are sent from `noreply@mail.app.supabase.io`. To make them come from `noreply@horrorwriter.org`:
- [ ] **Choose an SMTP Provider**: Sign up for a service like Resend (recommended) or SendGrid.
- [ ] **Verify Domain**: Add the DNS records provided by the SMTP service to your Cloudflare dashboard.
- [ ] **Update Supabase**: Go to Supabase Dashboard -> Authentication -> **SMTP Settings**, enable Custom SMTP, and paste your credentials.
- [ ] **Design Email Template**: Go to Supabase Dashboard -> Authentication -> **Email Templates** and customize the HTML of the Magic Link email to match the 80s HorrorWriter aesthetic.

## 2. Cloudflare Pages Deployment
The code works flawlessly on `localhost`, but `horrorwriter.org` needs the latest code.
- [ ] **Commit & Push**: Commit all the recent changes (Turnstile, Supabase integrations, schemas) to your `main` branch and push to GitHub.
- [ ] **Configure Environment Variables**: In your Cloudflare Pages dashboard (under Settings -> Environment variables), ensure you have added:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_TURNSTILE_SITE_KEY`
- [ ] **Deploy**: Cloudflare Pages should automatically build and deploy the new version once pushed.

## 3. Frontend: Thread & Story Creation UI
The site currently *reads* data from Supabase perfectly, but users need a way to *write* data.
- [ ] **The Crypt (Forum) Posting**: Build a "New Thread" button and a modal/page with a rich text editor to allow authenticated users to post new topics to the `threads` table.
- [ ] **The Crypt (Replies)**: Create a new `posts` or `replies` table in Supabase and build the UI for users to reply inside a specific thread.
- [ ] **The Library (Submissions)**: Build a "Publish Story" UI allowing authors to submit their works to the `books` table.

## 4. Polish & Quality of Life
- [ ] **Dynamic Page Titles**: Add a `<title>` tag updater (using `react-helmet` or a simple `useEffect`) so the browser tab reflects the current page (e.g., "The Crypt - HorrorWriter") instead of just "Horror Writer".
- [ ] **Turnstile Pre-clearance (Optional)**: If you implement Cloudflare WAF rules later, Turnstile pre-clearance will ensure logged-in users aren't hit with Cloudflare waiting rooms.
