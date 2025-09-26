# NASRECO 訪問看護 - Design Guidelines

## Design Approach
**Selected Approach**: Design System Approach with Healthcare Utility Focus
- **Justification**: Japanese healthcare productivity application requiring efficiency, reliability, and professional trust
- **System**: Custom healthcare-focused design system with Japanese UX patterns
- **Key Principles**: Clinical clarity, workflow efficiency, professional trust, Japanese usability standards

## Core Design Elements

### A. Color Palette
**Light Mode:**
- Primary: 217 91% 60% (Medical blue - trust and professionalism)
- Secondary: 217 91% 95% (Light blue backgrounds)
- Success: 142 71% 45% (Healthcare green)
- Warning: 38 92% 50% (Alert amber)
- Error: 0 84% 60% (Critical red)
- Text Primary: 222 84% 5%
- Text Secondary: 215 25% 27%
- Background: 0 0% 100%
- Surface: 220 13% 97%

**Dark Mode:**
- Primary: 217 91% 65%
- Secondary: 217 91% 15%
- Success: 142 71% 50%
- Warning: 38 92% 55%
- Error: 0 84% 65%
- Text Primary: 210 40% 95%
- Text Secondary: 217 32% 65%
- Background: 222 84% 5%
- Surface: 217 33% 10%

### B. Typography
- **Primary Font**: Noto Sans JP (optimal Japanese readability)
- **Fallback**: Inter, system fonts
- **Heading Font**: Noto Sans JP (600-700 weight)
- **Body Text**: Noto Sans JP (400-500 weight)
- **Japanese Scale**: 14px, 16px, 18px, 20px, 24px, 28px, 36px, 44px
- **Line Height**: 1.6-1.8 for Japanese text readability

### C. Layout System
**Spacing Primitives**: Tailwind units 2, 4, 6, 8, 12, 16
- **Micro spacing**: p-2, m-2 (component padding)
- **Standard spacing**: p-4, m-4 (card content, form fields)
- **Section spacing**: p-6, m-6 (page sections)
- **Major spacing**: p-8, m-8 (page containers)
- **Layout spacing**: p-12, m-12 (major sections)
- **Page spacing**: p-16, m-16 (page margins)

### D. Component Library

**Navigation:**
- Vertical sidebar with Japanese text labels
- Collapsible menu sections for mobile
- Breadcrumb navigation in Japanese
- Tab navigation for content sections
- Facility selector in header with organization name

**Forms:**
- Large touch-friendly fields for mobile/tablet use
- Japanese label positioning (top-aligned)
- Clear required field indicators (※必須)
- Inline validation with Japanese error messages
- Date pickers with Japanese calendar format
- Time selection optimized for healthcare scheduling

**Data Displays:**
- Patient information cards with status badges
- Visit schedule tables with Japanese date formats
- Dashboard metrics with Japanese number formatting
- Calendar views with Japanese day/month labels
- Patient record timelines with status indicators

**Healthcare-Specific:**
- Patient status badges (在宅中、入院中、終了)
- Visit status indicators (予定、完了、未訪問)
- Care level indicators (要介護1-5)
- Insurance type badges (医療保険、介護保険)

**Japanese UX Patterns:**
- Right-to-left reading flow consideration
- Vertical text option for traditional layouts
- Japanese form validation patterns
- Mobile-first responsive design for Japanese users

### E. Animations
**Minimal and Clinical:**
- Subtle 200ms fade transitions
- Loading spinners with medical cross styling
- Gentle focus states on form fields
- No distracting animations during clinical work

## Images
**No large hero images** - prioritizing clinical efficiency over marketing visuals
- Small medical icons (stethoscope, medical cross, calendar)
- Patient avatar placeholders (professional, anonymous)
- Facility logos (small, header placement)
- Status indicator icons (checkmarks, warnings, alerts)
- All images should maintain medical professionalism

## Key Design Considerations

**Japanese Healthcare Standards:**
- Compliance with Japanese medical UI conventions
- Traditional respect for hierarchy and order
- Clean, minimalist aesthetic preferred in Japanese healthcare
- Mobile-first design for field nursing staff

**Professional Medical Interface:**
- Sterile, clean visual appearance
- High contrast for clinical environments
- Efficient information density
- Clear data hierarchy with Japanese text flow

**Multi-facility Management:**
- Clear facility identification
- Secure data separation visual cues
- Easy facility switching interface
- Consistent branding across organizations

**Responsive Healthcare:**
- Mobile-optimized for visiting nurses
- Tablet-friendly for patient bedside use
- Desktop efficiency for administrative tasks
- Touch-friendly controls throughout

This design system balances Japanese UX expectations with clinical workflow efficiency, ensuring professional healthcare standards while maintaining optimal usability for visiting nursing staff.