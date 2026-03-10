import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(timestamp: number) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
export function normalizePhoneNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) {
    return phone.trim();
  }
  if (digits.startsWith('0')) {
    return `+84${digits.slice(1)}`;
  }
  if (digits.startsWith('84') && digits.length >= 11) {
    return `+${digits}`;
  }
  if (digits.length >= 9 && !phone.startsWith('+')) {
    return `+${digits}`;
  }
  return phone.trim();
}
