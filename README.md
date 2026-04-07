# Trustr Service Dashboard

Web-based Nostr client for managing Trustr service requests and monitoring results.

## Features (Phase 1 - MVP)

- 🔐 **Authentication**: NIP-07 browser extension login (Alby, nos2x, etc.)
- 📝 **Request Builder**: Create and configure GrapeRank service requests
- 📊 **Request Monitoring**: View published requests and their status
- 💾 **SQLite Database**: Persistent storage of users, sessions, and requests
- 🌐 **Nostr Integration**: NDK-powered event publishing and management

## Technology Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **UI**: TailwindCSS + shadcn/ui components
- **Database**: SQLite + Drizzle ORM
- **Nostr**: @nostr-dev-kit/ndk
- **Authentication**: Session-based with HTTP-only cookies

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Nostr browser extension (Alby, nos2x, etc.)
- Access to Nostr relays

### Installation

1. Clone the repository:
```bash
git clone https://github.com/trustr-ing/trustr-service-dashboard.git
cd trustr-service-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` and configure:
```env
DATABASE_URL=./data/dashboard.db
SESSION_SECRET=your-random-64-character-hex-string
ORCHESTRATOR_URL=http://localhost:8080
NEXT_PUBLIC_DEFAULT_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band
```

4. Initialize the database:
```bash
npm run db:push
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

## Usage

### Login

1. Navigate to the login page
2. Click "Sign in with Nostr Extension (NIP-07)"
3. Approve the connection in your browser extension
4. You'll be redirected to the dashboard

### Create a Request

1. Go to Dashboard → New Request
2. Configure your GrapeRank request:
   - **Point of View**: JSON array of pubkeys, e.g., `["pubkey1","pubkey2"]`
   - **Type**: Select output type (p, e, a, t, r)
   - **Parameters**: Set minrank, attenuation, rigor, precision
   - **Interpreters**: Optional JSON configuration
3. Click "Publish Request"
4. Your request will be published to Nostr relays

### Monitor Requests

1. Go to Dashboard → My Requests
2. View all your published requests
3. See real-time status updates
4. Check result and feedback event counts

## Development

### Project Structure

```
trustr-service-dashboard/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   └── auth/          # Authentication endpoints
│   ├── dashboard/         # Dashboard pages
│   │   └── requests/      # Request management
│   ├── login/             # Login page
│   └── page.tsx           # Root redirect
├── components/            # React components
│   └── ui/               # UI components
├── lib/                   # Utilities
│   ├── auth/             # Session management
│   ├── db/               # Database schema & config
│   └── nostr/            # NDK & Nostr utilities
├── data/                  # SQLite database
├── drizzle/              # Database migrations
└── package.json
```

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
npm run db:generate  # Generate database migrations
npm run db:push      # Push schema changes to database
npm run db:studio    # Open Drizzle Studio
```

### Database Schema

- **users**: User accounts (pubkey, npub, displayName)
- **sessions**: Authentication sessions (7-day expiry)
- **saved_requests**: Published service requests with status tracking
- **request_templates**: Saved request configurations (Phase 2)
- **subscriptions**: Subscription keypairs (Phase 3)

## Roadmap

### Phase 2: Templates + Chaining
- Save and reuse request configurations
- Chain multiple requests together
- Output events as input for subsequent requests

### Phase 3: Subscription Management
- Create and manage subscription keypairs
- Orchestrator admin panel
- Service health monitoring
- Access control for subscriptions

## Deployment

### Production Build

```bash
npm run build
npm start
```

### Environment Variables (Production)

```env
DATABASE_URL=/opt/trustr-service-dashboard/data/dashboard.db
SESSION_SECRET=<production-secret-64-chars>
ORCHESTRATOR_URL=http://10.118.0.3:8080
NEXT_PUBLIC_DEFAULT_RELAYS=wss://relay.damus.io,wss://nos.lol
```

### Systemd Service

The dashboard can be deployed as a systemd service. See `/home/manime/Clients/Trustr/infrastructure/digitalocean/scripts/deploy-service.sh` for deployment automation.

## Related Services

- [trustr-service-orchestrator](https://github.com/trustr-ing/trustr-service-orchestrator) - Central orchestrator
- [trustr-graperank-service](https://github.com/trustr-ing/trustr-graperank-service) - GrapeRank WoT service
- [trustr-semantic-ranking-service](https://github.com/trustr-ing/trustr-semantic-ranking-service) - Semantic ranking service

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT
