# NASRECO 訪問看護 System

## Overview

NASRECO 訪問看護 is a comprehensive healthcare management system designed for Japanese visiting nursing services. The application provides tools for patient management, nursing record keeping, visit scheduling, and user administration, featuring a modern React frontend with Japanese localization and a robust backend architecture.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React 18** with TypeScript for type safety and modern development
- **Vite** as the build tool and development server for fast hot module replacement
- **Wouter** for lightweight client-side routing instead of React Router
- **TanStack React Query** for efficient server state management and caching
- **shadcn/ui** components built on Radix UI primitives for consistent, accessible UI
- **Tailwind CSS** with custom design system optimized for Japanese healthcare workflows
- **CSS Variables** approach for dynamic theming with light/dark mode support

### Component Structure
The frontend follows a modular component architecture with:
- **Main Components**: Dashboard, PatientManagement, NursingRecords, UserManagement
- **UI Components**: Complete shadcn/ui library with healthcare-specific customizations
- **Layout System**: Responsive design with sidebar navigation and mobile-first approach
- **Design System**: Custom healthcare-focused color palette and typography using Noto Sans JP

### Backend Architecture
- **Express.js** server with TypeScript for REST API endpoints
- **Modular Route System**: Clean separation of API routes with `/api` prefix
- **Storage Interface Pattern**: Abstracted storage layer supporting both in-memory and database implementations
- **Session Management**: Express sessions with PostgreSQL session store
- **Error Handling**: Centralized error middleware with proper HTTP status codes

### Data Storage Solutions
- **PostgreSQL** as the primary database via Neon serverless
- **Drizzle ORM** for type-safe database operations and schema management
- **Schema-First Design**: Shared TypeScript types between frontend and backend
- **Migration System**: Drizzle Kit for database schema versioning
- **Connection Pooling**: Neon serverless connection pooling for scalability

### Authentication and Authorization
- **BCrypt** for password hashing and user credential security
- **Session-Based Authentication**: Express sessions stored in PostgreSQL
- **Role-Based Access**: Admin, nurse, and supervisor role distinctions
- **Form Validation**: Zod schemas for input validation and type safety

### State Management
- **React Query**: Server state caching, synchronization, and background updates
- **Local State**: React hooks for component-level state management
- **Form State**: React Hook Form with Zod resolvers for form handling
- **Theme State**: Context-based theming with localStorage persistence

## External Dependencies

### Database Services
- **Neon PostgreSQL**: Serverless PostgreSQL database with WebSocket support for real-time features
- **Drizzle ORM**: Modern TypeScript ORM with migrations and type safety

### UI and Styling
- **Radix UI**: Accessible, unstyled component primitives for complex UI patterns
- **Tailwind CSS**: Utility-first CSS framework with custom healthcare design tokens
- **Lucide Icons**: Consistent icon library with healthcare-specific iconography
- **Google Fonts**: Noto Sans JP for optimal Japanese text rendering

### Development Tools
- **Vite**: Fast build tool with TypeScript support and hot module replacement
- **ESBuild**: Fast JavaScript bundler for production builds
- **TypeScript**: Static type checking across the entire application stack
- **Replit Integration**: Development environment integration with runtime error handling

### Form and Validation
- **React Hook Form**: Performant form library with minimal re-renders
- **Zod**: TypeScript-first schema validation for forms and API inputs
- **Hookform Resolvers**: Integration between React Hook Form and Zod

### Development Dependencies
- **PostCSS**: CSS processing with Autoprefixer for browser compatibility
- **Class Variance Authority**: Type-safe utility for component variant styling
- **CLSX & Tailwind Merge**: Utility libraries for conditional CSS class handling