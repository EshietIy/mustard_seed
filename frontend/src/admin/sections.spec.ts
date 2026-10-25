import { describe, expect, it } from 'vitest';
import { adminSections, canUse, isStaff, roleLabel, sectionsFor } from './sections';

describe('admin sections', () => {
  it('lets supervisors use availability and meats, but not item prices or photos', () => {
    expect(sectionsFor('supervisor').map((s) => s.label)).toEqual([
      'Availability',
      'Meats & prices',
    ]);
  });

  it('lets a super_admin use every section', () => {
    expect(sectionsFor('super_admin').map((s) => s.label)).toEqual([
      'Availability',
      'Meats & prices',
      'Item prices',
      'Photos',
      'Staff',
    ]);
  });

  it('gives customers no sections at all', () => {
    expect(sectionsFor('customer')).toEqual([]);
    for (const section of adminSections) expect(canUse('customer', section.roles)).toBe(false);
  });

  it('treats only supervisors and super_admins as staff', () => {
    expect(isStaff('customer')).toBe(false);
    expect(isStaff('supervisor')).toBe(true);
    expect(isStaff('super_admin')).toBe(true);
  });

  it('refuses a role it does not know', () => {
    expect(isStaff('owner' as never)).toBe(false);
    expect(canUse('owner' as never, ['supervisor', 'super_admin'])).toBe(false);
  });

  it('names each role for people, not as a code', () => {
    expect(roleLabel('supervisor')).toBe('Kitchen supervisor');
    expect(roleLabel('super_admin')).toBe('Super admin');
    expect(roleLabel('customer')).toBe('Customer');
  });

  it('gives every section a unique route name and path under /admin', () => {
    const names = adminSections.map((s) => s.name);
    const paths = adminSections.map((s) => s.path);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path).toMatch(/^[a-z-]+$/);
  });
});
