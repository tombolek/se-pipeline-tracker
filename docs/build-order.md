# Build Order (Historical)

> The app is now fully built. This file records the original greenfield build sequence for historical reference. For new feature work, the current workflow is: edit code → TypeScript check → commit with scope tag → push → deploy.

Original build sequence (each step depended on the previous being tested):

1. **Environment check** — verify WSL2, Docker, Node versions.
2. **Project scaffold** — create directory structure, git init, push to GitHub.
3. **Docker Compose + DB** — get PostgreSQL running, verify connection.
4. **Migrations** — run all migration files in order, verify tables.
5. **Seed script** — create 1 manager user, 2 SE users, 5 sample opportunities, tasks, notes.
6. **Auth endpoints** — POST /auth/login, GET /auth/me, JWT middleware — test with curl before touching frontend.
7. **Opportunities endpoints** — GET list, GET detail, PATCH se_owner.
8. **Import pipeline** — CSV upload, reconciliation logic, import log — test with sample CSV.
9. **Tasks + Notes endpoints**.
10. **Insights endpoints** — all 4 manager views.
11. **Frontend auth** — login screen, session persistence, protected routes.
12. **Frontend pipeline view**.
13. **Frontend opportunity detail**.
14. **Frontend my tasks**.
15. **Frontend manager views**.
16. **AI summary integration**.
17. **Brand theming** — apply Ataccama colors once slide deck is provided.
