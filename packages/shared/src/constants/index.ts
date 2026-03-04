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

/** Default categories seeded for new organizations */
export const DEFAULT_CATEGORIES = [
  {
    name: 'Ingresos',
    icon: 'dollar',
    color: '#52c41a',
    children: [
      { name: 'Salario', icon: 'wallet', color: '#52c41a' },
      { name: 'Ventas', icon: 'shop', color: '#52c41a' },
      { name: 'Freelance', icon: 'laptop', color: '#52c41a' },
      { name: 'Inversiones', icon: 'stock', color: '#52c41a' },
      { name: 'Otros ingresos', icon: 'plus-circle', color: '#52c41a' },
    ],
  },
  {
    name: 'Vivienda',
    icon: 'home',
    color: '#1890ff',
    children: [
      { name: 'Alquiler', icon: 'home', color: '#1890ff' },
      { name: 'Servicios', icon: 'thunderbolt', color: '#1890ff' },
      { name: 'Mantenimiento', icon: 'tool', color: '#1890ff' },
      { name: 'Construccion', icon: 'build', color: '#1890ff' },
    ],
  },
  {
    name: 'Alimentacion',
    icon: 'coffee',
    color: '#fa8c16',
    children: [
      { name: 'Mercado', icon: 'shopping-cart', color: '#fa8c16' },
      { name: 'Restaurantes', icon: 'coffee', color: '#fa8c16' },
      { name: 'Delivery', icon: 'car', color: '#fa8c16' },
    ],
  },
  {
    name: 'Transporte',
    icon: 'car',
    color: '#722ed1',
    children: [
      { name: 'Combustible', icon: 'fire', color: '#722ed1' },
      { name: 'Transporte publico', icon: 'swap', color: '#722ed1' },
      { name: 'Mantenimiento vehiculo', icon: 'tool', color: '#722ed1' },
    ],
  },
  {
    name: 'Familia',
    icon: 'team',
    color: '#eb2f96',
    children: [
      { name: 'Educacion', icon: 'read', color: '#eb2f96' },
      { name: 'Salud', icon: 'heart', color: '#eb2f96' },
      { name: 'Ropa', icon: 'skin', color: '#eb2f96' },
      { name: 'Entretenimiento', icon: 'smile', color: '#eb2f96' },
    ],
  },
  {
    name: 'Tecnologia',
    icon: 'laptop',
    color: '#13c2c2',
    children: [
      { name: 'Internet', icon: 'wifi', color: '#13c2c2' },
      { name: 'Telefono', icon: 'phone', color: '#13c2c2' },
      { name: 'Equipos', icon: 'desktop', color: '#13c2c2' },
      { name: 'Software', icon: 'code', color: '#13c2c2' },
    ],
  },
  {
    name: 'Otros gastos',
    icon: 'ellipsis',
    color: '#8c8c8c',
    children: [],
  },
] as const;

/** Supported currencies */
export const CURRENCIES = [
  { code: 'USD', name: 'Dolar estadounidense', symbol: '$' },
  { code: 'MN', name: 'Moneda Nacional (CUP)', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'MLC', name: 'Moneda Libremente Convertible', symbol: '$' },
] as const;

/** Pagination defaults */
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;
