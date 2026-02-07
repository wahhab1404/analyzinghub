import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hasArabicText(text: string): boolean {
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
  return arabicRegex.test(text)
}

export function getTextDirection(text: string | null | undefined): 'rtl' | 'ltr' {
  if (!text) return 'ltr'
  return hasArabicText(text) ? 'rtl' : 'ltr'
}
