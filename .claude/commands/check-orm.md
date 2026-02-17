---
description: "DATABASE/ORM SCHEMA REVIEW"
---

# Check ORM

Now reread AGENTS.md, read your README.md, and then I want you to super carefully and critically read the entire data ORM schema/models and look for any issues or problems, conceptual mistakes, logical errors, or anything that doesn't fit your understanding of the business strategy and accepted best practices for the design and architecture of databases for these sorts of projects.

## Review Checklist

1. **Normalization** - Is data properly normalized? Any redundancy?
2. **Relationships** - Are foreign keys and relationships correct?
3. **Indexes** - Are appropriate indexes in place for queries?
4. **Constraints** - Are NOT NULL, UNIQUE, CHECK constraints appropriate?
5. **Naming** - Are table and column names consistent and descriptive?
6. **Types** - Are data types appropriate for the data being stored?
7. **Migrations** - Are migrations reversible and safe?
8. **Performance** - Any N+1 query risks? Missing eager loading?

For Awake specifically, review:
- `articles` table structure
- `user_briefings` and multi-tenant design
- `canonical_verticals` relationships
- Index coverage for common queries
