# X-RAY - Backend + React Frontend

## Project Overview

X-RAY is a Twitter-like social platform built on Solana with two modes:
- **Public Mode**: Traditional social media with wallet-based identity
- **Shadow Mode**: Anonymous posting with SOL-based bidding system

## Architecture

```
backend-reactfront/
├── api/                    # PHP API (JSON endpoints)
│   ├── index.php           # Main router - all API endpoints
│   ├── config/
│   │   └── database.php    # DB connection (external: 109.176.199.253)
│   ├── app/
│   │   ├── models/
│   │   │   ├── User.php        # User model (auth, profile, follow)
│   │   │   ├── Post.php        # Posts, likes, comments
│   │   │   └── ShadowWallet.php
│   │   ├── controllers/
│   │   │   └── *.php           # Various controllers
│   │   └── views/              # PHP views (legacy, not used by React)
├── front/                  # Next.js React frontend
│   ├── app/                # Next.js pages
│   │   ├── user/[username] # X-RAY user profile with shadow tab
│   │   └── user/x/[username] # X/Twitter profile page
│   ├── components/         # React components
│   │   ├── main-feed.tsx   # Feed with API calls + on-chain shadow posts
│   │   ├── post-modal.tsx  # Post creation modal (public + shadow with fund)
│   │   ├── left-sidebar.tsx # Nav + Wallet connection (Phantom/Solflare)
│   │   ├── right-panel.tsx # Trending (mock), suggested users (mock)
│   │   └── search-modal.tsx # User search (connected to API)
│   ├── contexts/
│   │   ├── auth-context.tsx # Auth state management
│   │   ├── mode-context.tsx # Shadow/Public mode toggle
│   │   └── shadow-context.tsx # Shadow wallet state (unlock, wallets, balances)
│   └── lib/
│       ├── api.ts          # API client for PHP backend
│       └── shadow/         # Solana on-chain interactions
│           ├── postService.ts    # Create posts, fund wallets
│           ├── shadowWallet.ts   # Derive shadow wallets from signature
│           ├── targetStats.ts    # Get bids for position preview
│           └── targetProfile.ts  # Fetch profiles + posts for target
├── nginx/
│   └── nginx.conf          # Reverse proxy config
├── docker-compose.yml      # Production
└── docker-compose.dev.yml  # Development (hot reload, external DB)
```

## Quick Start

### Development (with hot reload)
```bash
docker compose -f docker-compose.dev.yml up -d --build
```

### Production
```bash
docker compose up -d --build
```

### URLs
- **Frontend**: http://localhost
- **API**: http://localhost/api/?action=get-posts
- **phpMyAdmin (external)**: http://109.176.199.253:81

## API Endpoints

All endpoints return JSON. Base URL: `/api/?action=`

### Auth
| Action | Method | Description |
|--------|--------|-------------|
| `wallet-auth` | POST | Auth with Solana wallet address |
| `logout` | GET | Logout current session |
| `me` | GET | Get current user info |
| `toggle-shadow-mode` | POST | Toggle shadow/public mode |

### Posts
| Action | Method | Description |
|--------|--------|-------------|
| `get-posts` | GET | Get posts (params: page, limit, user_id, feed) |
| `get-post` | GET | Get single post (params: id) |
| `create-post` | POST | Create new post (JSON body) |
| `toggle-like` | POST | Like/unlike a post |

### Comments
| Action | Method | Description |
|--------|--------|-------------|
| `get-comments` | GET | Get comments for a post |
| `add-comment` | POST | Add a comment |
| `delete-comment` | POST | Delete a comment |
| `toggle-comment-like` | POST | Like/unlike a comment |

### Profile
| Action | Method | Description |
|--------|--------|-------------|
| `get-profile` | GET | Get user profile (params: username or user_id) |
| `user-profile` | GET | Get public user profile by username |
| `update-profile` | POST | Update user profile |
| `has-profile` | GET | Check if profile exists |

### Follow
| Action | Method | Description |
|--------|--------|-------------|
| `follow` | POST | Follow a user |
| `unfollow` | POST | Unfollow a user |
| `check-follow` | GET | Check if following |
| `get-followers` | GET | Get followers list |
| `get-following` | GET | Get following list |

### Search
| Action | Method | Description |
|--------|--------|-------------|
| `search-users` | GET | Search users by username (param: q) |
| `suggested-users` | GET | Get suggested users to follow (param: limit) |

### External APIs
| Action | Method | Description |
|--------|--------|-------------|
| `x-profile` | GET | Get X/Twitter profile via proxy (param: username) |

### Shadow Wallets
| Action | Method | Description |
|--------|--------|-------------|
| `api-wallets-count` | GET | Get wallet count for user (param: userId - hashed) |
| `api-wallets-increment` | POST | Increment wallet counter (body: { userId }) |
| `api-wallets-create` | POST | Register shadow wallet (body: { shadowPubkey, name }) |
| `api-wallets-name-exists` | GET | Check if name exists (param: name) |
| `api-wallets-name` | GET | Get name by pubkey (param: shadowPubkey) |
| `api-wallets-is-premium` | GET | Check if wallet is premium (param: walletAddress) |
| `api-wallets-set-premium` | POST | Set premium status (body: { walletAddress, is_premium }) |

## Database

**External Database**: `109.176.199.253`
- Database: `x-ray`
- User: `xray_user`

### Main Tables
- `users` - User accounts (wallet_address, username, profile_picture, bio, etc.)
- `posts` - User posts with content
- `comments` - Comments on posts
- `likes` - Post likes
- `comment_likes` - Comment likes
- `follows` - Follow relationships
- `shadow_wallets` - Shadow wallet names (shadow_pubkey, name)
- `wallet_counts` - Shadow wallet counters per user (user_id hash, count)
- `premium_wallets` - Premium users (wallet_address, is_premium)

### Shadow Wallet Schema
```sql
wallet_counts (
  user_id TEXT PRIMARY KEY,  -- hash(publicKey)
  count INT DEFAULT 0
)

shadow_wallets (
  shadow_pubkey TEXT PRIMARY KEY,
  name TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

premium_wallets (
  wallet_address TEXT PRIMARY KEY,
  is_premium BOOLEAN DEFAULT TRUE
)
```

## Frontend Components

### Connected to API
- `main-feed.tsx` - Fetches posts + on-chain shadow posts, likes, share
- `auth-context.tsx` - Auth state with wallet connection, stats
- `shadow-context.tsx` - Shadow wallet unlock, wallet list, balances, keypair derivation
- `left-sidebar.tsx` - Wallet connection (Phantom, Solflare, etc.)
- `search-modal.tsx` - User search
- `post-modal.tsx` - Create posts with fund modal, progress steps, live preview
- `app/post/[id]/page.tsx` - Post detail with comments
- `app/user/[username]/page.tsx` - User profile with follow/unfollow + shadow tab
- `app/user/x/[username]/page.tsx` - X/Twitter profile with shadow posts
- `app/profile/page.tsx` - Own profile editing + shadow wallet management
- `app/shadow/[name]/page.tsx` - Shadow wallet profile page
- `app/marketplace/page.tsx` - NDD marketplace (browse & buy premium identities)
- `app/messages/page.tsx` - Encrypted private messaging
- `app/how-it-works/page.tsx` - How it works explainer page
- `app/notifications/page.tsx` - Notifications page
- `right-panel.tsx` - Top posts 24h, NDD recommendations (random), footer
- `ndd-purchase-modal.tsx` - NDD purchase modal with revenue split
- `toast.tsx` - Toast notifications system

## On-Chain Integration (Devnet)

### Solana Program
- **Program ID**: `5gPGpcXTq1R2chrEP9qPaFw4i1ge5ZgG2n7xnrUGZHPk`
- **RPC**: `https://devnet.helius-rpc.com/?api-key=64cda369-a212-4064-8133-e0e6827644b7`
- **Treasury**: `6v1xwDMjdVeDZoZBLsud5KwfsB6yiZ69eS2vFXdgM93d`

### Shadow Post Flow
1. User unlocks shadow wallets (signs message → derives keypairs)
2. User funds shadow wallet from public wallet (auto-fund on post if needed)
3. User creates post: target + content + bid amount
4. Solana program creates post PDA and atomically transfers bid to treasury via CPI
5. Post stored on-chain with PDA derived from `["post", author_pubkey, target_bytes]`

### Account Order (CRITICAL - must match Rust struct)
```typescript
const keys = [
  { pubkey: shadowKeypair.publicKey, isSigner: true, isWritable: true },  // author
  { pubkey: XRAY_TREASURY, isSigner: false, isWritable: true },            // treasury
  { pubkey: postPDA, isSigner: false, isWritable: true },                  // post PDA
  { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }  // system_program
];
```

### Shadow Wallet Derivation
- Signature from "X-RAY Shadow Wallet Access" message
- Hash user's public key → userId
- Derive keypair: PBKDF2(signature + userId + index)
- Names stored in DB (shadow_wallets table)

## Wallet Integration

The app supports any Solana wallet that injects into `window.solana`:
- **Phantom** - via `window.phantom.solana` or `window.solana`
- **Solflare** - via `window.solflare`
- Other wallets via generic `window.solana`

Connection flow:
1. User clicks "connect_wallet"
2. Wallet selection menu appears
3. User selects wallet → wallet.connect()
4. Public key sent to `/api/?action=wallet-auth`
5. API creates/finds user, returns session
6. Frontend updates auth context

## Development Notes

### Adding new API endpoints
1. Add route in `api/index.php`
2. Create corresponding function in `front/lib/api.ts`
3. Use in React components

### Hot Reload
- **Frontend**: Changes to `front/` are automatically reloaded
- **API**: Changes to `api/` are immediately reflected (volume mounted)

## Troubleshooting

### API not responding
```bash
docker logs xray_api
docker logs xray_nginx
```

### Frontend build errors
```bash
docker logs xray_front
```

### Test API directly
```bash
curl http://localhost/api/?action=get-posts
```

### Rebuild everything
```bash
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up -d --build
```
