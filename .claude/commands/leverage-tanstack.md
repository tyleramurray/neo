---
description: "FIND TANSTACK OPTIMIZATION OPPORTUNITIES"
---

# Leverage TanStack

Ok I want you to look through the ENTIRE project and look for areas where, if we leveraged one of the many TanStack libraries (e.g., query, table, forms, etc), we could make part of the code much better, simpler, more performant, more maintainable, elegant, shorter, more reliable, etc.

## TanStack Libraries to Consider

1. **TanStack Query** - Data fetching, caching, synchronization
   - Replace manual fetch + useState + useEffect patterns
   - Add automatic refetching, caching, background updates

2. **TanStack Table** - Headless table logic
   - Replace custom table implementations
   - Add sorting, filtering, pagination for free

3. **TanStack Form** - Form state management
   - Replace manual form state handling
   - Add validation, touched states, submission handling

4. **TanStack Router** - Type-safe routing
   - Enhanced routing with better type inference

## Analysis Process

1. Search for patterns that TanStack could improve
2. Estimate effort vs benefit
3. Create beads for worthwhile improvements
4. Prioritize high-impact, low-effort changes

## For Awake Project

Focus on:
- Data fetching in dashboard components
- Any table/list rendering
- Form handling in settings or POV builder
