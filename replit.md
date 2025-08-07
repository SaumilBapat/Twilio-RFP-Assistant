# RFP Assistant - Twilio Internal AI Processing Platform

## Overview
This full-stack web application enables Twilio employees to process RFP and security questionnaire CSV files using configurable AI agent pipelines. It provides Google OAuth authentication, file upload, spreadsheet-style data editing, and real-time AI processing with step-by-step inspection. The system aims to streamline RFP responses by generating professional, citable answers based on internal documentation and AI-powered research.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with Vite
- **UI Library**: shadcn/ui (Radix UI)
- **Styling**: Tailwind CSS (Twilio branding)
- **State Management**: TanStack Query
- **Routing**: wouter
- **Real-time**: WebSocket integration

### Backend
- **Runtime**: Node.js with Express.js
- **Database**: PostgreSQL (Drizzle ORM, Neon serverless)
- **Real-time**: WebSocket server for job status
- **File Processing**: Multer for CSV uploads

### Authentication
- **Method**: Google OAuth 2.0 for Twilio workspace users
- **Session Management**: Cookie-based sessions with PostgreSQL store
- **Authorization**: User-based access control, automatic user provisioning
- **Security**: Session expiration, secure cookies, Twilio-only access restriction

### Key Features & Design Patterns
- **Database Schema**: Dedicated tables for Users, Jobs, Pipelines, Job Steps, and CSV Data.
- **File Processing**: CSV validation (size, row limits), secure storage, row-by-row AI processing, WebSocket updates.
- **AI Pipeline System**: Configurable OpenAI models, detailed step inspection (inputs, outputs, prompts), error handling, token-level streaming.
- **Spreadsheet Interface**: Excel-like grid for CSV data, real-time updates, direct cell editing, CSV export.
- **AI Reference Research**: Semantic content analysis, web scraping, content chunking, embeddings for vector similarity search, comprehensive Twilio ecosystem coverage (twilio.com, sendgrid.com, segment.com).
- **Caching**: Two-tier caching using OpenAI embeddings and cosine similarity for reference research and response generation.
- **Feedback System**: Streamlined feedback reprocessing (targeted reference search, o3 model for final response improvement), bulk feedback application.
- **URL Management**: Normalization, validation (Twilio domains), bulk upload, and deletion for reference URLs.
- **Document Management**: Upload and deletion for reference documents (PDF, Word, Excel, CSV, TXT).
- **Real-time UI**: Live dashboard updates, processing console displaying step-by-step logs, live system health monitoring.
- **Security**: Data encryption at rest, private proxy for OpenAI requests, CORS, session security.

## External Dependencies

### Core Technologies
- **Database**: Neon PostgreSQL
- **AI Processing**: OpenAI API
- **Authentication**: Google OAuth 2.0 (passport-google-oauth20)
- **Session Storage**: connect-pg-simple
- **File Storage**: Local filesystem

### Development Tools
- **Build System**: Vite
- **Database Migrations**: Drizzle Kit
- **Type Safety**: TypeScript
- **Linting**: ESLint

### UI Components
- **Component Library**: Radix UI, shadcn/ui
- **Icons**: Lucide React
- **Styling**: Tailwind CSS