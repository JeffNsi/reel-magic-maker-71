# DramaWave V1 plan

## Scope

Add DramaWave as a second app under `/dramawave/*` while keeping STORYREEL untouched at `/` and `/history`.

- Mobile-first vertical short-drama streaming (ReelShort/DramaBox style).
- Bottom nav: Home, Shorts, Rewards, My List, Profile.
- Simulated coins/VIP purchases for now; real Stripe/Paddle later.
- Email sign-in via Lovable Cloud. Guest = browse without signing in; unlocking/purchasing requires email sign-in.

## Database

New tables in one migration:

- `profiles` — id (fk auth.users), email, paid_coins, bonus_coins, is_vip, vip_until, last_checkin_date, checkin_streak.
- `dramas` — title, description, cover_url, tags, is_vip_only.
- `episodes` — drama_id, episode_number, title, video_url, coin_cost, is_free.
- `user_unlocked_episodes` — user_id, episode_id, unlocked_at.
- `my_list` — user_id, drama_id.

Trigger auto-creates a profile row on new `auth.users`. Seed 2 dramas × 3 episodes using public sample vertical MP4 URLs.

## Backend

`src/lib/dramawave.functions.ts` with server functions:

- `getHomeData` — featured banner + category rows.
- `getEpisodeFeed` — episodes for the vertical player, with unlock/VIP status.
- `unlockEpisode` — authenticated; deduct bonus coins first, then paid coins; record unlock.
- `claimDailyCheckin` — authenticated; streak logic + coin grants.
- `watchAd` — authenticated; +15 coins after a client-side countdown.
- `buyCoins` / `buyVip` — simulated purchases that add coins/VIP.
- `getRewards`, `getMyList`, `toggleMyList`, `getProfile`.

Add `attachSupabaseAuth` middleware in `src/start.ts` so protected functions receive the bearer token.

## Auth

- New public route `/auth` with email sign-in / sign-up form.
- `/dramawave/*` is not behind a route gate; guests can browse Home and Shorts.
- Unlock, purchase, check-in, and My List require auth; the UI shows a sign-in CTA modal that links to `/auth`.

## UI

- `src/routes/dramawave.tsx` — layout with bottom nav and `<Outlet />`.
- `src/routes/dramawave.index.tsx` — Home (banner carousel, category rows, series cards).
- `src/routes/dramawave.shorts.tsx` — full-screen 9:16 player with overlay controls and unlock modal.
- `src/routes/dramawave.rewards.tsx` — 7-day check-in, watch-ad button, tasks.
- `src/routes/dramawave.my-list.tsx` — saved dramas.
- `src/routes/dramawave.profile.tsx` — balance, VIP status, sign out.
- Shared modals: `CoinShopModal`, `UnlockEpisodeModal`.

## Theme

Add DramaWave tokens alongside STORYREEL tokens in `src/styles.css` so both apps coexist:

- `#0F0F12` background, `#1A1A20` cards.
- Purple/pink gradient primary, gold accent for coins/VIP.
- New utilities: `dw-surface`, `dw-gradient-text`, `dw-gold-text`.

STORYREEL pages keep the existing neon-red cinematic theme.

## Testing

- `bunx tsgo --noEmit` after all edits.
- Playwright mobile viewport checks for Home, Shorts, Rewards, and auth-gated unlock flow.
