# PESMETAL API — Railway / Docker image
# ---------------------------------------------------------------------------
# BUILD CONTEXT: the monorepo workspace root (platform/).
# railway.json (at platform/railway.json) points `build.dockerfilePath` to
# `apps/api/Dockerfile` and uses platform/ as the project root.
# ---------------------------------------------------------------------------

FROM node:24-slim

WORKDIR /app

# --- Workspace manifests + lock (root = platform/) -------------------------
# The API lives inside an npm workspaces monorepo. The lockfile is at the
# workspace root, so we copy the root manifest + lock plus every workspace
# package.json that the root `workspaces` glob resolves to (api, admin, web).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/web/package.json apps/web/package.json

# --- Install dependencies --------------------------------------------------
# Install ONLY the API workspace to keep the image lean (no Next.js).
# `tsx` is a runtime dependency (moved to "dependencies") so `npm start`
# works in production; `pg` is included for the Supabase/Postgres adapter.
RUN npm ci --workspace @pesmetal/api

# --- Copy API source ------------------------------------------------------
COPY apps/api apps/api

WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["npm", "start"]
