# AnalyzingHub - Architecture Documentation

## Overview

AnalyzingHub is built with a clean, modular architecture following Next.js 13+ App Router best practices with strict separation of concerns.

## Technology Stack

- **Framework**: Next.js 13.5 (App Router)
- **Language**: TypeScript 5.2
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS 3.3
- **UI Components**: shadcn/ui (Radix UI)
- **Icons**: Lucide React

## Architecture Layers

```
┌─────────────────────────────────────────┐
│         Presentation Layer              │
│  (Components, Pages, UI Elements)       │
├─────────────────────────────────────────┤
│         Business Logic Layer            │
│     (Services, Auth Utilities)          │
├─────────────────────────────────────────┤
│         Data Access Layer               │
│    (Supabase Client, Database)          │
├─────────────────────────────────────────┤
│         Security Layer                  │
│  (Middleware, RLS, Auth Guards)         │
└─────────────────────────────────────────┘
```

## Directory Structure

```
/app                          # Next.js App Router
├── /dashboard               # Protected dashboard routes
│   ├── layout.tsx          # Dashboard layout with auth
│   └── page.tsx            # Main dashboard page
├── /login                  # Public auth routes
│   └── page.tsx
├── /register
│   └── page.tsx
├── globals.css             # Global styles
├── layout.tsx              # Root layout
└── page.tsx                # Landing page

/components                  # React components
├── /auth                   # Authentication UI
│   ├── LoginForm.tsx
│   └── RegisterForm.tsx
├── /dashboard              # Dashboard UI
│   ├── Header.tsx
│   └── Sidebar.tsx
└── /ui                     # shadcn/ui components (64 components)

/lib                        # Core utilities
├── /auth                   # Authentication utilities
│   ├── rbac.ts            # Role-based access control
│   └── session.ts         # Session management
├── /supabase              # Supabase clients
│   ├── client.ts          # Browser client
│   └── server.ts          # Server client
├── /types                 # TypeScript definitions
│   └── database.ts        # Database types
└── utils.ts               # General utilities

/services                   # Business logic layer
├── auth.service.ts        # Authentication operations
└── user.service.ts        # User management

/scripts                    # Setup and maintenance
├── create-admin.md        # Admin setup guide
└── (future migrations)

/hooks                      # Custom React hooks
└── use-toast.ts           # Toast notifications

middleware.ts              # Route protection
```

## Key Design Patterns

### 1. Server-First Architecture

- **Server Components by default** for better performance
- Client Components only when needed ('use client' directive)
- Server-side data fetching and validation
- Reduced JavaScript bundle size

### 2. Separation of Concerns

**Presentation Layer** (`/components`, `/app`)
- Handles UI rendering and user interactions
- No direct database access
- Consumes services for business logic

**Business Logic Layer** (`/services`)
- Encapsulates business rules
- Handles data transformation
- Reusable across different UI components

**Data Access Layer** (`/lib/supabase`)
- Manages database connections
- Provides typed database clients
- Handles authentication state

**Security Layer** (`middleware.ts`, `/lib/auth`)
- Route protection
- Role-based access control
- Session validation

### 3. Type Safety

- Full TypeScript coverage
- Database types exported from schema
- No 'any' types in production code
- Compile-time error catching

### 4. Service Layer Pattern

```typescript
// Example: auth.service.ts
class AuthService {
  async signUp(data: SignUpData) { }
  async signIn(data: SignInData) { }
  async signOut() { }
}
```

Benefits:
- Centralized business logic
- Easy to test and mock
- Reusable across components
- Clear API surface

### 5. Authentication Flow

```
User Request → Middleware → Route Handler → Service → Database
      ↓             ↓             ↓            ↓          ↓
   Cookies     Check Auth    Validate    Business    RLS
                             Session      Logic    Policies
```

## Security Architecture

### Defense in Depth

1. **Transport Security**
   - HTTPS enforced (production)
   - HTTP-only cookies for sessions
   - CSRF protection via Supabase

2. **Authentication**
   - Supabase Auth (industry standard)
   - Secure password hashing (bcrypt)
   - Session management with JWT
   - No password storage in client

3. **Authorization**
   - Database level: Row Level Security (RLS)
   - Application level: Server-side session checks
   - UI level: Conditional rendering
   - Middleware level: Route protection

4. **Input Validation**
   - Client-side: Form validation
   - Server-side: Supabase client sanitization
   - Type checking: TypeScript
   - Email validation: Regex patterns

5. **Data Protection**
   - No secrets in client code
   - Environment variables for config
   - Secure database connections
   - Minimal data exposure

## Database Architecture

### Schema Design

```
auth.users (Supabase Auth)
    ↓ (1:1)
profiles
    ↓ (N:1)
roles

profiles ←→ profiles (M:N via follows)
```

### Row Level Security (RLS)

Every table has RLS enabled with policies:

**roles**: Public read for all users
**profiles**: Read all, write own
**follows**: Read all, write own follows

### Data Integrity

- Foreign key constraints
- Unique constraints on relationships
- Check constraints (e.g., no self-follows)
- Automatic timestamp updates

## Performance Optimizations

1. **Database Indexes**
   - Email lookups: `idx_profiles_email`
   - Role filtering: `idx_profiles_role_id`
   - Follow queries: `idx_follows_follower_id`, `idx_follows_following_id`

2. **React Optimizations**
   - Server Components for static content
   - Client Components only for interactivity
   - Lazy loading for heavy components
   - Proper key usage in lists

3. **Caching Strategy**
   - React cache() for session data
   - Supabase client caching
   - Next.js automatic caching
   - Static generation where possible

4. **Code Splitting**
   - Route-based splitting (automatic)
   - Component-level splitting (lazy)
   - Third-party library optimization

## Error Handling

### Client-Side
- Try-catch blocks in async operations
- User-friendly error messages
- Toast notifications for feedback
- Form validation errors

### Server-Side
- Proper error types and messages
- No sensitive data in errors
- Logging for debugging
- Graceful degradation

## Testing Strategy (Future)

1. **Unit Tests**: Services and utilities
2. **Integration Tests**: API routes and auth flows
3. **E2E Tests**: Critical user journeys
4. **Type Tests**: TypeScript coverage

## Deployment Architecture

```
┌─────────────────┐
│   Vercel/       │ ← Static files, SSR, API routes
│   Netlify       │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   Supabase      │ ← Database, Auth, Storage
│   (Postgres)    │
└─────────────────┘
```

## Scalability Considerations

1. **Database**
   - Connection pooling via Supabase
   - Indexed queries for performance
   - Prepared statements for security

2. **Application**
   - Stateless server components
   - Edge middleware for fast routing
   - CDN for static assets

3. **Authentication**
   - JWT-based sessions (scalable)
   - No server-side session storage
   - Supabase handles auth scaling

## Future Enhancements

1. **Caching Layer**: Redis for sessions and data
2. **Queue System**: Background jobs for notifications
3. **Search**: Full-text search with PostgreSQL
4. **Analytics**: Event tracking and metrics
5. **CDN**: Image optimization and delivery
6. **Monitoring**: Error tracking and logging

## Code Quality Standards

- **TypeScript strict mode**: Enabled
- **ESLint**: Configured with Next.js rules
- **Formatting**: Consistent code style
- **Naming**: Clear, descriptive names
- **Comments**: Only where necessary
- **Documentation**: Inline JSDoc for complex functions

## API Design Principles (Future)

When implementing API routes:

1. RESTful conventions
2. Proper HTTP status codes
3. Consistent error format
4. Rate limiting
5. Request validation
6. Response pagination
7. API versioning

## Monitoring and Logging

Current:
- Console logging for development
- Supabase logs for database

Future:
- Structured logging (Winston/Pino)
- Error tracking (Sentry)
- Performance monitoring (Vercel Analytics)
- User analytics (PostHog/Mixpanel)

## Maintenance

- Database migrations versioned
- Dependency updates tracked
- Security patches prioritized
- Regular backup verification
- Performance monitoring

---

This architecture provides a solid foundation for Week 1 and is designed to scale as features are added in subsequent weeks.
