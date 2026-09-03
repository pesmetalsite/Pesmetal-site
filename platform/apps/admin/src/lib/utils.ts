/**
 * Utility: clsx + tailwind-merge.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatDate(iso: string, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return withTime ? d.toLocaleString('pt-BR') : d.toLocaleDateString('pt-BR');
}

export function initials(name: string): string {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase();
}
