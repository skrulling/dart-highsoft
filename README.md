# Dart Highsoft 🎯

A modern, real-time dart scoring application built with Next.js, Supabase, and Highcharts. Perfect for casual players and competitive matches with comprehensive scoring, statistics, and spectator modes.

## ✨ Features

### 🎮 Game Modes
- **X01 Games**: Support for 201, 301, and 501 point games
- **Practice Mode**: Individual practice sessions with trend tracking
- **Around the World**: Classic dart training game
- **Custom Match Settings**: Configurable finish rules (single/double out) and legs to win

### 📊 Real-time Experience
- **Live Match Updates**: Real-time scoring and turn updates
- **Spectator Mode**: Dedicated UI for watching matches with live score progress charts
- **Haptic Feedback**: Mobile device vibration for scoring events
- **Celebration Animations**: Visual feedback for excellent throws and game completions

### 📱 Multi-Platform Interface
- **Mobile-First Design**: Touch-optimized keypad for mobile scoring
- **Desktop Dartboard**: Interactive dartboard interface for desktop users
- **Responsive Layout**: Seamless experience across all screen sizes

### 📈 Statistics & Analytics
- **ELO Rating System**: Competitive ranking system for players
- **Match Analytics**: Detailed statistics including averages, best rounds, and progression charts
- **Practice Tracking**: Session history and improvement trends
- **Leaderboards**: Global and filtered player rankings

### 🔧 Advanced Features
- **Real-time Synchronization**: Supabase realtime for live match updates
- **Player Management**: Create, edit, and manage player profiles
- **Match History**: Complete game records and replay functionality
- **Export Capabilities**: Data visualization with Highcharts integration

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Supabase account and project

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd dart-highsoft
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env.local` file with your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

4. **Database Setup**
   Run the migrations in the `supabase/migrations/` directory through your Supabase dashboard or CLI.  
   For a full local Supabase stack (Docker + Supabase CLI), see [`docs/SUPABASE_LOCAL_SETUP.md`](docs/SUPABASE_LOCAL_SETUP.md).

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🛠 Development Commands

```bash
# Start development server with Turbopack
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## 🧪 Testing

Rigorous unit tests ensure the game logic is accurate and reliable.

### Running Tests

```bash
# Run tests in watch mode (interactive)
npm test

# Run tests once (for CI/CD)
npm run test:run

# Run tests with visual UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### Test Coverage

The project uses **Vitest** for fast, modern testing with TypeScript support.

**Current Coverage:**
- **X01 Game Logic** (`src/utils/x01.ts`): **100% coverage**
  - 42 comprehensive test cases
  - Both single-out and double-out finish rules
  - All bust scenarios (below 0, landing on 1, non-double finish)
  - Edge cases and boundary conditions

### Adding New Tests

1. Create a test file next to the source file: `filename.test.ts`
2. Import Vitest functions:
   ```typescript
   import { describe, it, expect } from 'vitest';
   ```
3. Write your tests:
   ```typescript
   describe('My Function', () => {
     it('should do something', () => {
       expect(myFunction()).toBe(expectedValue);
     });
   });
   ```
4. Run tests to verify: `npm test`

See `src/utils/x01.test.ts` for comprehensive examples.

## 🏗 Architecture

### Tech Stack
- **Frontend**: Next.js 15 with React 19
- **Backend**: Supabase (PostgreSQL + Real-time)
- **UI Framework**: Tailwind CSS with shadcn/ui components
- **Charts**: Highcharts with React integration
- **Icons**: Lucide React
- **Deployment**: Vercel (recommended)

### Core Components

#### Game Engine (`src/utils/x01.ts`)
- Dart scoring logic and validation
- Bust rule enforcement
- Finish condition detection
- Turn and throw management

#### Match Management (`src/app/match/[id]/MatchClient.tsx`)
- Real-time match state synchronization
- Player rotation and turn management
- Spectator mode with live updates
- Mobile and desktop input handling

#### Data Model
- **Players**: Global player management with ELO ratings
- **Matches**: Game configuration (start score, finish rule, legs to win)
- **Match Players**: Junction table with play order
- **Legs**: Individual games within a match
- **Turns**: Player attempts within a leg
- **Throws**: Individual dart throws (1-3 per turn)

## 🌐 API Documentation

### Match Creation API

Create matches programmatically using the REST API.

**Endpoint**: `POST /api/matches`

#### Request Format
```json
{
  "type": 501,
  "legs": 2,
  "checkout": "double",
  "participants": ["Player1", "Player2"]
}
```

#### Request Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | number | ✅ | Start score: `201`, `301`, or `501` |
| `legs` | number | ✅ | Number of legs to win (must be > 0) |
| `checkout` | string | ✅ | Finish rule: `"single"` or `"double"` |
| `participants` | string[] | ✅ | Array of player names (minimum 2) |

#### Response Format
```json
{
  "scoringMode": "http://localhost:3000/match/abc123",
  "spectatorMode": "http://localhost:3000/match/abc123?spectator=true"
}
```

#### Response Fields
| Field | Type | Description |
|-------|------|-------------|
| `scoringMode` | string | URL for the match scoring interface |
| `spectatorMode` | string | URL for the spectator view with live updates |

#### Example Usage

**cURL**
```bash
curl -X POST http://localhost:3000/api/matches \
  -H "Content-Type: application/json" \
  -d '{
    "type": 501,
    "legs": 3,
    "checkout": "double",
    "participants": ["Alice", "Bob", "Charlie"]
  }'
```

**JavaScript/Fetch**
```javascript
const response = await fetch('/api/matches', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 301,
    legs: 1,
    checkout: 'single',
    participants: ['Player A', 'Player B']
  })
});

const match = await response.json();
console.log('Scoring URL:', match.scoringMode);
console.log('Spectator URL:', match.spectatorMode);
```

**Python**
```python
import requests

response = requests.post('http://localhost:3000/api/matches', json={
    'type': 501,
    'legs': 2,
    'checkout': 'double',
    'participants': ['Player1', 'Player2']
})

match_data = response.json()
print(f"Scoring URL: {match_data['scoringMode']}")
print(f"Spectator URL: {match_data['spectatorMode']}")
```

#### Error Responses

| Status Code | Description | Example Response |
|-------------|-------------|------------------|
| 400 | Invalid request parameters | `{"error": "Invalid type. Must be 201, 301, or 501"}` |
| 500 | Server error | `{"error": "Failed to create match"}` |

#### Player Management
- **Existing Players**: If a participant name matches an existing player, that player is used
- **New Players**: If a participant name doesn't exist, a new player is automatically created
- **Name Validation**: Player names cannot be empty after trimming whitespace

## 🎯 Usage Guide

### Creating a Match
1. Navigate to the "New Match" page
2. Select players or create new ones
3. Configure game settings (start score, finish rule, legs to win)
4. Start the match

### Scoring a Match
- **Mobile**: Use the touch keypad for quick scoring
- **Desktop**: Click on the interactive dartboard
- **Undo**: Edit individual throws if mistakes are made
- **Real-time**: All players see updates instantly

### Spectator Mode
- Access via `?spectator=true` URL parameter
- Live score updates and progress charts
- No scoring controls - perfect for displays or streaming
- Real-time turn indicators and checkout suggestions

### Practice Mode
- Individual practice sessions
- Track progress over time
- Multiple practice game types
- Statistics and trend analysis

## 🔧 Configuration

### Database Settings
Configure Row Level Security (RLS) policies in Supabase for proper access control. See migration files in `supabase/migrations/` for the complete schema.

### Real-time Features
Enable real-time subscriptions in your Supabase project for live match updates.

### Environment Variables
```env
# Required
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Optional (for development)
NODE_ENV=development
```

## 📦 Deployment

### Vercel (Recommended)
1. Connect your repository to Vercel
2. Add environment variables in the Vercel dashboard
3. Deploy automatically on push to main branch

### Manual Deployment
```bash
npm run build
npm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙋‍♂️ Support

For questions, issues, or feature requests, please open an issue on GitHub or contact the maintainers.

---

Built with ❤️ for dart enthusiasts worldwide 🎯
