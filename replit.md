# RFP Assistant - Twilio Internal AI Processing Platform

## Overview

This is a full-stack web application designed for Twilio employees to process RFP (Request for Proposal) and security questionnaire CSV files using configurable AI agent pipelines. The system provides Google OAuth authentication, file upload capabilities, spreadsheet-style data editing, and real-time AI processing with step-by-step inspection of results.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with Vite for development and building
- **UI Library**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens for Twilio branding
- **State Management**: TanStack Query for server state management
- **Routing**: wouter for lightweight client-side routing
- **Real-time Communication**: WebSocket integration for live updates

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Database Provider**: Neon serverless PostgreSQL
- **Real-time**: WebSocket server for broadcasting job status updates
- **File Processing**: Multer for file uploads with CSV parsing capabilities

### Authentication System
- **Method**: Google OAuth 2.0 integration for Twilio workspace users
- **Session Management**: Cookie-based sessions with PostgreSQL session store using connect-pg-simple
- **Authorization**: User-based access control with automatic user provisioning
- **Security Features**: Session expiration, secure cookie configuration, automatic user creation

## Key Components

### Database Schema
- **Users**: Store Google OAuth user information (id, email, name, googleId)
- **Jobs**: Track CSV processing jobs with status, progress, and pipeline association
- **Pipelines**: Configurable AI agent chains with step definitions
- **Job Steps**: Individual processing steps for each row with detailed execution data
- **CSV Data**: Storage for original and enriched CSV row data

### File Upload and Processing
- **Validation**: CSV format validation, size limits (25MB), row limits (5000)
- **Storage**: Secure file storage with encryption at rest
- **Processing**: Row-by-row processing through configurable AI agent pipelines
- **Real-time Updates**: WebSocket broadcasting of processing progress

### AI Pipeline System
- **Configurable Agents**: Support for multiple OpenAI models with custom parameters
- **Step Inspection**: Detailed logging of inputs, outputs, prompts, and performance metrics
- **Error Handling**: Comprehensive error tracking and recovery mechanisms
- **Streaming**: Token-level streaming for real-time response display

### Spreadsheet Interface
- **Grid Display**: Excel-like interface for viewing and editing CSV data
- **Real-time Updates**: Live updates as AI processing completes
- **Cell Editing**: Direct cell editing with immediate persistence
- **Export**: Download enriched data as CSV

## Data Flow

1. **Authentication**: User signs in with Google OAuth for their Twilio workspace
2. **File Upload**: User uploads CSV file with validation and preview
3. **Pipeline Assignment**: User selects or creates AI processing pipeline
4. **Job Creation**: System creates job record and stores file securely
5. **Processing**: Backend processes rows through AI agent chain
6. **Real-time Updates**: WebSocket broadcasts progress to frontend
7. **Results Display**: Enriched data displayed in spreadsheet interface
8. **Step Inspection**: Detailed execution data available for debugging

## Recent Changes (January 2025)

### ✅ Google OAuth Authentication Implementation
- Implemented Google OAuth 2.0 authentication system with passport-google-oauth20
- Added secure session management with PostgreSQL-backed session store
- Created authentication middleware and protected routes
- Updated frontend with landing page for unauthenticated users
- Added authentication hooks and error handling
- Database schema updated for Google OAuth user model with sessions table
- Users are automatically created on first Google sign-in and can return to view their RFPs

### ✅ Deployment Fixes (January 25, 2025)
- Fixed application exit issue by removing process.exit(0) from database seeding
- Added health check route at '/api/health' endpoint for deployment health monitoring
- Ensured server stays alive after seeding for production deployment
- Application now properly handles deployment health checks
- Updated OAuth configuration to support both preview and deployed environments

### ✅ Enterprise OAuth Strategy (January 25, 2025)
- Implemented development authentication bypass for preview environments
- Added support for separate development OAuth applications
- Created mock authentication for development when OAuth credentials unavailable
- Follows enterprise patterns used by Facebook, Google, Microsoft for multi-environment auth
- Development mode auto-authenticates users to enable feature development without OAuth setup

### ✅ Secure Preview Authentication (January 25, 2025)
- Restricted username/password login to preview mode only (replit.dev domains)
- Production environments can only use Google OAuth for security
- Admin credentials (admin/twilio) work only in preview, not production
- Frontend dynamically shows appropriate login options based on environment
- Prevents unauthorized access using hardcoded credentials in deployed applications

### ✅ Reference-Based AI Pipeline (January 25, 2025)
- Updated default pipeline to focus on reference gathering and citation-based responses
- First step "Reference Research" now searches for authoritative sources and extracts quotes
- Second step "Response Generation" creates professional responses with citations
- Enhanced prompts to emphasize specific data points, metrics, and source credibility
- Pipeline now generates responses similar to enterprise RFP processing workflows
- Improved AI processing to include proper reference formatting and source validation

### ✅ Enhanced Progress Monitoring (January 25, 2025)
- Added real-time progress indicators showing current processing activity
- Dashboard job table displays "Processing row X..." for active jobs
- Improved job processing logging with emojis and detailed timing information
- Added better error handling and cancellation checks during processing
- Enhanced progress tracking with updated timestamps for last activity monitoring
- Fixed job hanging issues by implementing timeout mechanisms and activity heartbeats

### ✅ Intelligent Caching System (January 25, 2025)
- Implemented two-tier caching using OpenAI embeddings and cosine similarity
- Reference Research caching: Reuses validated references for similar questions (85% threshold)
- Response Generation caching: Reuses final responses for similar question+reference combinations (88% threshold)
- Automatic link validation ensures all cached references return 200 status codes
- Semantic similarity matching using text-embedding-3-small model for efficient cache lookups
- Performance optimization: Avoids duplicate AI processing and reference validation
- Database schema includes reference_cache and response_cache tables with embedding storage

### ✅ Real-time Dashboard Updates (January 25, 2025)
- Fixed WebSocket connection issues with malformed URL handling for different environments
- Updated message format to match backend event structure (event/data instead of type/payload)
- Added comprehensive debugging logs for WebSocket connection tracking
- Dashboard and spreadsheet views now update automatically without page refresh
- Real-time progress indicators show current job processing activity
- Fixed job table displays with live status changes and row processing updates

### ✅ Spreadsheet UI and Response Quality Improvements (January 25, 2025)
- Fixed React rendering error when CSV values contained objects with content/fileName properties
- Implemented proper column ordering: Original columns → Reference Research → Generic Draft → Tailored RFP Response
- Updated Tailored RFP Response prompts to eliminate inappropriate headers and meta-text
- Responses now generate clean, submission-ready content without "Company Overview" or "Response to RFP Question:" headers
- Enhanced value display handling for complex object types in spreadsheet cells

### ✅ External URL Prevention and Reference Inclusion (January 25, 2025)
- Fixed critical issue where Generic Draft Generation was adding external URLs (HIMSS, Ponemon Institute, PMI)
- Updated Generic Draft Generation prompts to strictly use only provided Twilio ecosystem research
- Enhanced Tailored RFP Response prompts to ensure reference URLs are included at bottom of responses
- Cleared all cached responses containing external references to ensure clean processing
- All responses now contain exclusively Twilio, Segment, and SendGrid references as required

### ✅ Enhanced Reference Research with Quality Validation (January 25, 2025)
- Fixed link validator to properly follow redirects (301/308) instead of marking them as invalid
- Completely rewrote Reference Research prompts to require minimum 5 specific, working sources per question
- Added automatic retry logic to find additional references if initial search yields fewer than 5 valid sources
- Enhanced URL validation to use final URLs after redirects for better accuracy
- Implemented comprehensive Twilio ecosystem coverage (products, docs, blogs, case studies, security, SendGrid, Segment)
- Added quality requirements: specific pages only (no generic homepages), direct question relevance, diverse resource types
- Cleared reference and response caches to ensure fresh processing with improved system
- Reference Research now guarantees at least 5 working, question-specific Twilio ecosystem sources per RFP question

### ✅ Reference Data Structure and URL Path Improvements (January 25, 2025)
- Updated Reference Research to use structured JSON format: [{Reference_URL, Reference_URL_Summary, [Reference_URL_Quotes]}]
- Enhanced AI prompts to generate detailed summaries and extract specific quotes from each reference source
- Modified URL structure to support deep paths (/* notation) allowing multi-level URLs like /docs/api/feature/subfeature
- Added concrete examples of deep URLs to guide AI toward technical documentation and feature-specific pages
- Ensured equal treatment of all three Twilio ecosystem domains (twilio.com, sendgrid.com, segment.com)
- Fixed job completion messaging to display "Job completed successfully" instead of "Job started successfully"
- All reference data now provides richer context with summaries and quotes for higher quality RFP responses

### ✅ Dashboard Streamlining and Live System Health (January 25, 2025)
- Removed Quick Actions and Recent Activity sections from dashboard for cleaner interface
- Implemented live System Health monitoring with real operational data
- Added /api/system/health endpoint providing real-time metrics
- System Health now shows: API status, active jobs count, worker utilization, storage usage
- Health data refreshes every 5 seconds with live indicators and timestamps
- Enhanced system health display with grid layout and storage usage progress bar
- Removed non-operational "Avg Processing" metric from top panel and "Processing Rate" from system health
- Simplified dashboard to focus on meaningful real-time metrics (3-card stats grid)

### ✅ Enhanced Semantic Reference Research Architecture (January 25, 2025)
- Completely redesigned reference research system from URL validation to semantic content analysis
- Updated database schema with chunk-based reference cache storing embeddings, content, URLs, and metadata
- Created webScraper.ts service to fetch full page content from live URLs
- Implemented contentChunker.ts for semantic text chunking (500-1000 tokens per chunk)
- Built enhancedEmbeddings.ts service for vector storage and similarity search using OpenAI embeddings
- Updated storage interface with chunk-based methods: getAllReferenceChunks, getReferenceChunksByUrl, getReferenceChunksByHash
- Enhanced Reference Research step now: searches for URLs → scrapes full content → creates semantic chunks → stores embeddings → performs vector similarity search
- Generic Draft Generation step updated to use semantically relevant content chunks instead of URL lists
- System now processes all relevant live URLs found (not limited to 5) and skips embedding for already cached content
- Context resolution creates fully self-contained questions incorporating previous context for better semantic matching
- Equal domain coverage maintained: All three domains (twilio.com, sendgrid.com, segment.com) are searched and processed
- Architecture shift enables much more precise and contextually relevant responses through semantic similarity matching

## External Dependencies

### Core Technologies
- **Database**: Neon PostgreSQL serverless database
- **AI Processing**: OpenAI API with enterprise key integration
- **Authentication**: Google OAuth 2.0 with passport-google-oauth20
- **Session Storage**: PostgreSQL-backed sessions with connect-pg-simple
- **File Storage**: Local filesystem (configurable for cloud storage)

### Development Tools
- **Build System**: Vite for fast development and optimized production builds
- **Database Migrations**: Drizzle Kit for schema management
- **Type Safety**: TypeScript throughout the stack
- **Linting**: ESLint with TypeScript support

### UI Components
- **Component Library**: Radix UI primitives with shadcn/ui styling
- **Icons**: Lucide React icon library
- **Styling**: Tailwind CSS with PostCSS processing

## Deployment Strategy

### Development Environment
- **Local Development**: Vite dev server with Express backend
- **Hot Reloading**: Automatic code reloading for frontend and backend
- **Database**: Neon development database with migration support
- **Environment Variables**: Secure configuration for API keys and database URLs

### Production Deployment
- **Build Process**: 
  - Frontend: Vite build generating optimized static assets
  - Backend: esbuild bundling Node.js server code
- **Serving**: Express server serving both API routes and static frontend
- **Database**: Production Neon PostgreSQL instance
- **Session Storage**: PostgreSQL-backed session management

### Security Considerations
- **Data Encryption**: Files encrypted at rest
- **API Security**: Private proxy for OpenAI requests using Twilio enterprise key
- **Logging**: Request-level metadata logging only (no sensitive data)
- **Data Retention**: 30-day default policy with admin override
- **CORS**: Configured for Twilio domain restrictions
- **Session Security**: Secure cookie configuration with proper expiration

### Performance Targets
- **Throughput**: 2+ rows per second with 10-step agent chains
- **Concurrency**: Support for 50 parallel processing jobs
- **Availability**: 99.5% uptime for internal use
- **Accessibility**: WCAG 2.1 AA compliance

The application is designed as a modern, scalable solution for AI-powered document processing with enterprise-grade security and real-time collaboration features.