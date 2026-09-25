import { randomUUID } from 'node:crypto';

export const now = () => new Date().toISOString();

export const createId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

export function requiredString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function requiredNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function requiredBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}
