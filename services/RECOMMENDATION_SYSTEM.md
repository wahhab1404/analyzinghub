# AI-Driven Recommendation System

## Overview
AnalyzingHub now features a comprehensive recommendation system that personalizes content for traders based on their engagement patterns, following relationships, and analyzer performance metrics.

## Architecture

### Event Tracking
The system tracks user engagement through an `engagement_events` table that captures:
- **Entity Types**: analysis, analyzer, symbol
- **Event Types**: view, like, bookmark, comment, follow, share, unlike, unbookmark, unfollow
- **Metadata**: Additional context about each event

### Recommendation Engine
A deterministic scoring algorithm that generates personalized recommendations based on:

#### 1. Feed Recommendations (Analyses)
**Candidate Generation:**
- Analyses from followed analyzers
- Analyses for followed symbols
- Trending analyses (high engagement in last 24 hours)
- Excludes user's own analyses and recently viewed content

**Scoring Features:**
- **Recency Decay** (30%): Prioritizes newer content
  - < 2 hours: 100%
  - < 6 hours: 90%
  - < 24 hours: 70%
  - < 72 hours: 50%
  - < 1 week: 30%
  - Older: 10%

- **Symbol Affinity** (25%): Engagement with specific symbols
  - Following a symbol: 100%
  - Past interactions: Scaled by interaction count

- **Analyzer Affinity** (20%): Engagement with specific analyzers
  - Following an analyzer: 100%
  - Past interactions: Scaled by interaction count

- **Analyzer Quality** (15%): Performance metrics
  - Win rate with sample-size adjustment
  - Confidence scoring based on total analyses

- **Engagement Momentum** (10%): Recent popularity
  - Views, likes, bookmarks, comments velocity

- **Follower Relationship** (20%): Direct follows
  - Boosts content from followed users

#### 2. Analyzer Recommendations
**Candidate Generation:**
- Co-follow suggestions (followed by people you follow)
- Top-performing analyzers
- New analyzers

**Scoring Features:**
- Quality metrics (50%): Win rate and sample size
- Co-follow count (30%): Social proof
- Recency bonus (20%): New analyzer boost

#### 3. Symbol Recommendations
**Candidate Generation:**
- Symbols analyzed by followed analyzers
- Trending symbols with high analysis volume
- Symbols with growing follower counts

**Scoring Features:**
- Followed analyzer activity (50%)
- Analysis volume (30%)
- Follower count (20%)

## Data Pipeline

### Materialized Views
The system uses materialized views for performance:

1. **trending_analyses**: Tracks engagement in the last 24 hours
   - Engagement count, unique users
   - Breakdown by event type (views, likes, etc.)

2. **user_symbol_affinity**: User preferences for symbols
   - Interaction counts over 30 days
   - Follow and view tracking

3. **user_analyzer_affinity**: User preferences for analyzers
   - Interaction counts over 30 days
   - Follow and view tracking

### Refresh Strategy
Materialized views should be refreshed periodically (hourly recommended) using:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY trending_analyses;
```

## API Endpoints

### Event Tracking
- `POST /api/events`: Track user engagement events
  - Body: `{ entity_type, entity_id, event_type, metadata }`

### Recommendations
- `GET /api/recommendations/feed`: Get personalized analysis recommendations
  - Query params: `limit`, `offset`
  - Returns: Analysis list with reasons

- `GET /api/recommendations/analyzers`: Get analyzer suggestions
  - Query params: `limit`, `offset`
  - Returns: Analyzer list with stats and reasons

- `GET /api/recommendations/symbols`: Get symbol suggestions
  - Query params: `limit`, `offset`
  - Returns: Symbol list with stats and reasons

## UI Components

### Feed Page
- New "Recommended" tab showing personalized analyses
- Sidebar with recommended analyzers and symbols
- Reason badges explaining why content is recommended

### Event Tracking Integration
Automatic tracking throughout the application:
- Analysis views when card is displayed
- Likes, bookmarks, shares
- Comments
- Follow/unfollow actions
- Profile views

## Transparency
Each recommendation includes explicit reasons:
- "You follow [analyzer]"
- "You follow $[symbol]"
- "Trending today"
- "High win-rate analyzer"
- "Just posted"
- "Followed by [N] analysts you follow"

## Performance Considerations
- Materialized views reduce query complexity
- Indexes on engagement_events for fast lookups
- Candidate generation limits prevent over-fetching
- Scoring happens in-memory on pre-filtered candidates

## Future Enhancements
The current deterministic model can be replaced with:
- Collaborative filtering
- Deep learning models
- Vector similarity search
- Real-time recommendation updates
- A/B testing framework
- Personalized email digests

## Monitoring
Track these metrics:
- Recommendation click-through rate
- Engagement rate on recommended content
- Diversity of recommendations
- User retention impact
- Performance latency

## Security
- RLS policies ensure users only access their own events
- Service role can read all events for aggregation
- No PII in metadata fields
- Rate limiting on event tracking endpoint recommended
