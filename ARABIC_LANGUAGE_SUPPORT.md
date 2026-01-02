# Arabic Language Support - Implementation Guide

## Overview

AnalyzingHub now supports complete bilingual functionality with English and Arabic languages, including full RTL (right-to-left) layout support.

## Features Implemented

### 1. **Complete Translation System**
- Comprehensive translations for all UI elements
- English and Arabic language files with 300+ translation strings
- Type-safe translation keys for developer experience
- Organized translation structure by feature area

### 2. **RTL Support**
- Automatic RTL layout switching when Arabic is selected
- RTL-aware CSS using Tailwind RTL plugin
- Proper text alignment and direction for all components
- RTL-compatible spacing and positioning

### 3. **Font Support**
- Inter font for English (Latin characters)
- Cairo font for Arabic text
- Automatic font switching based on selected language
- Optimized font loading with Next.js Font API

### 4. **Language Persistence**
- User language preference saved to database
- localStorage for quick language switching
- Automatic language detection from browser settings
- Seamless language switching across sessions

### 5. **UI Components Updated**
- Login and OTP authentication forms
- Dashboard header with language switcher
- Navigation sidebar
- All authentication flows
- Theme toggle integrated with language switcher

## How to Use

### For Users

1. **Switch Language:**
   - Click the language switcher icon (🌐) in the header
   - Select "English" or "العربية" (Arabic)
   - The entire interface updates immediately

2. **Language Persists:**
   - Your language preference is saved
   - When you log in again, your preferred language loads automatically

### For Developers

#### Adding New Translations

1. **Add to English translations** (`lib/i18n/translations/en.ts`):
```typescript
export const en = {
  myFeature: {
    title: 'My Feature',
    description: 'Feature description',
  },
};
```

2. **Add Arabic translations** (`lib/i18n/translations/ar.ts`):
```typescript
export const ar: TranslationKeys = {
  myFeature: {
    title: 'ميزتي',
    description: 'وصف الميزة',
  },
};
```

#### Using Translations in Components

```typescript
'use client';

import { useTranslation } from '@/lib/i18n/language-context';

export function MyComponent() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t.myFeature.title}</h1>
      <p>{t.myFeature.description}</p>
    </div>
  );
}
```

#### RTL-Aware Styling

Use `start` and `end` instead of `left` and `right`:

```tsx
// ✅ Good - RTL aware
<div className="ms-4 me-2">  {/* margin-start, margin-end */}
<div className="ps-4 pe-2">  {/* padding-start, padding-end */}
<div className="start-0">    {/* left in LTR, right in RTL */}

// ❌ Avoid - Not RTL aware
<div className="ml-4 mr-2">  {/* Always left/right */}
<div className="left-0">     {/* Always left */}
```

## Technical Architecture

### Directory Structure

```
lib/i18n/
├── language-context.tsx      # React context for language state
├── translations/
│   ├── index.ts             # Export all translations
│   ├── en.ts                # English translations
│   └── ar.ts                # Arabic translations
```

### Components

```
components/ui/
└── language-switcher.tsx     # Language switcher dropdown
```

### Database Schema

Language preference is stored in the `profiles` table:

```sql
ALTER TABLE profiles ADD COLUMN language text DEFAULT 'en'
  CHECK (language IN ('en', 'ar'));
```

### Context Provider

The `LanguageProvider` wraps the entire application in `app/layout.tsx`:

```tsx
<LanguageProvider>
  {children}
</LanguageProvider>
```

## Translation Coverage

### Fully Translated Sections:
- ✅ Authentication (login, register, OTP)
- ✅ Common UI elements (buttons, labels, messages)
- ✅ Navigation menu
- ✅ Dashboard header
- ✅ Settings
- ✅ Profile sections
- ✅ Notifications
- ✅ Search functionality
- ✅ Analysis features
- ✅ Landing page content
- ✅ Error messages

## Best Practices

### 1. Always Use Translation Keys
Never hardcode text strings in components:

```typescript
// ❌ Bad
<button>Save</button>

// ✅ Good
<button>{t.common.save}</button>
```

### 2. Use RTL-Aware Classes
Use Tailwind's logical properties:

```typescript
// ❌ Bad
className="ml-4 mr-2 text-left"

// ✅ Good
className="ms-4 me-2 text-start"
```

### 3. Test Both Languages
Always test your changes in both English and Arabic to ensure:
- Text displays correctly
- Layout doesn't break
- Spacing is appropriate
- Icons are properly positioned

### 4. Keep Translations Organized
Group related translations together:

```typescript
analysis: {
  create: 'Create Analysis',
  edit: 'Edit Analysis',
  delete: 'Delete Analysis',
  // ... related keys
}
```

## Known Limitations

1. Some third-party components may not fully support RTL
2. Chart labels and technical data remain in English
3. Dynamic content from APIs may not be translated

## Future Enhancements

- Add more languages (French, Spanish, etc.)
- Translate chart labels and technical content
- Add language-specific date/time formatting
- Implement pluralization rules
- Add number formatting per locale

## Support

For issues or questions about Arabic language support:
1. Check translation files for correct keys
2. Verify RTL styles are properly applied
3. Ensure LanguageProvider wraps your component
4. Test with browser developer tools in both languages
