# Roti Machine Service App

Initial foundation for a multi-role complaint and service platform for roti maker machines deployed across districts.

## Included
- Product requirements: `/Users/abhimanyusingh/Documents/New project/docs/PRODUCT_REQUIREMENTS.md`
- Workflow: `/Users/abhimanyusingh/Documents/New project/docs/WORKFLOW.md`
- OTP + warden flow API guide: `/Users/abhimanyusingh/Documents/New project/docs/OTP_AND_WARDEN_FLOW.md`
- Backend starter API: `/Users/abhimanyusingh/Documents/New project/backend`
- Prisma schema: `/Users/abhimanyusingh/Documents/New project/backend/prisma/schema.prisma`

## Current backend capabilities
1. OTP request + verify with DB-backed code expiry and attempt limits
2. Session token issuance after OTP verification
3. Warden pre-registration by Admin using phone + machine count (temporary machine codes) or serial mapping
4. Warden serial claim submission flow (`PENDING` -> Admin review)
5. Admin serial approval/rejection with warranty activation only after approval
6. One warden can have multiple machine assignments

## Next implementation steps
1. Install backend dependencies and run Prisma migrations.
2. Add SMS gateway integration for OTP delivery.
3. Add RBAC middleware for all admin/manager/supervisor endpoints.
4. Add complaint creation persistence with media storage.
5. Build Flutter mobile app and web dashboards.
