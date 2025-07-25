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