import { Plan, Role } from '../types';

/** Plan limits configuration */
export const PLAN_LIMITS = {
  [Plan.FREE]: {
    maxOrganizations: 1,
    maxMembersPerOrg: 2,
    maxTransactionsPerMonth: 100,
    maxAccounts: 2,
    maxProjects: 1,
    advancedReports: false,
    exportPdfExcel: false,
    integrations: false,
    apiAccess: false,
    auditLog: false,
  },
  [Plan.PRO]: {
    maxOrganizations: 3,
    maxMembersPerOrg: 10,
    maxTransactionsPerMonth: Infinity,
    maxAccounts: Infinity,
    maxProjects: Infinity,
    advancedReports: true,
    exportPdfExcel: true,
    integrations: true,
    apiAccess: false,
    auditLog: false,
  },
  [Plan.BUSINESS]: {
    maxOrganizations: Infinity,
    maxMembersPerOrg: Infinity,
    maxTransactionsPerMonth: Infinity,
    maxAccounts: Infinity,
    maxProjects: Infinity,
    advancedReports: true,
    exportPdfExcel: true,
    integrations: true,
    apiAccess: true,
    auditLog: true,
  },
} as const;

/**
 * Role hierarchy: higher index = more permissions.
 * Used to check if a role can perform actions on another role.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.VIEWER]: 0,
  [Role.ACCOUNTANT]: 1,
  [Role.ADMIN]: 2,
  [Role.OWNER]: 3,
};

/** Roles that can create/edit/delete financial data */
export const WRITE_ROLES: Role[] = [Role.OWNER, Role.ADMIN, Role.ACCOUNTANT];

/** Roles that can manage organization members */
export const MEMBER_MANAGEMENT_ROLES: Role[] = [Role.OWNER, Role.ADMIN];

/**
 * Default categories seeded for new organizations.
 * Los colores son los equivalentes sRGB de la rampa Ember `--eco-cat-*`
 * definida en apps/web/src/global.css, para que las orgs nuevas nazcan
 * coherentes con el design system. Las orgs existentes conservan los suyos.
 */
export const DEFAULT_CATEGORIES = [
  {
    name: 'Ingresos',
    icon: 'dollar',
    color: '#5ac576',
    children: [
      { name: 'Salario', icon: 'wallet', color: '#5ac576' },
      { name: 'Ventas', icon: 'shop', color: '#5ac576' },
      { name: 'Freelance', icon: 'laptop', color: '#5ac576' },
      { name: 'Inversiones', icon: 'stock', color: '#5ac576' },
      { name: 'Otros ingresos', icon: 'plus-circle', color: '#5ac576' },
    ],
  },
  {
    name: 'Vivienda',
    icon: 'home',
    color: '#6d95ee',
    children: [
      { name: 'Alquiler', icon: 'home', color: '#6d95ee' },
      { name: 'Servicios', icon: 'thunderbolt', color: '#6d95ee' },
      { name: 'Mantenimiento', icon: 'tool', color: '#6d95ee' },
      { name: 'Construccion', icon: 'build', color: '#6d95ee' },
    ],
  },
  {
    name: 'Alimentacion',
    icon: 'coffee',
    color: '#fa7c20',
    children: [
      { name: 'Mercado', icon: 'shopping-cart', color: '#fa7c20' },
      { name: 'Restaurantes', icon: 'coffee', color: '#fa7c20' },
      { name: 'Delivery', icon: 'car', color: '#fa7c20' },
    ],
  },
  {
    name: 'Transporte',
    icon: 'car',
    color: '#c97adb',
    children: [
      { name: 'Combustible', icon: 'fire', color: '#c97adb' },
      { name: 'Transporte publico', icon: 'swap', color: '#c97adb' },
      { name: 'Mantenimiento vehiculo', icon: 'tool', color: '#c97adb' },
    ],
  },
  {
    name: 'Familia',
    icon: 'team',
    color: '#ed8b8b',
    children: [
      { name: 'Educacion', icon: 'read', color: '#ed8b8b' },
      { name: 'Salud', icon: 'heart', color: '#ed8b8b' },
      { name: 'Ropa', icon: 'skin', color: '#ed8b8b' },
      { name: 'Entretenimiento', icon: 'smile', color: '#ed8b8b' },
    ],
  },
  {
    name: 'Tecnologia',
    icon: 'laptop',
    color: '#00bec7',
    children: [
      { name: 'Internet', icon: 'wifi', color: '#00bec7' },
      { name: 'Telefono', icon: 'phone', color: '#00bec7' },
      { name: 'Equipos', icon: 'desktop', color: '#00bec7' },
      { name: 'Software', icon: 'code', color: '#00bec7' },
    ],
  },
  {
    name: 'Otros gastos',
    icon: 'ellipsis',
    color: '#a68f68',
    children: [],
  },
] as const;

/** Supported currencies */
export const CURRENCIES = [
  { code: 'USD', name: 'Dolar estadounidense', symbol: '$' },
  { code: 'MN', name: 'Moneda Nacional (CUP)', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'MLC', name: 'Moneda Libremente Convertible', symbol: '$' },
  { code: 'USDT', name: 'Tether', symbol: '₮' },
] as const;

/** Codigos de moneda soportados, para validacion en DTOs */
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as unknown as string[];

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

/** Pagination defaults */
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;
