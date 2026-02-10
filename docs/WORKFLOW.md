# Complaint Lifecycle Workflow

## 1. Machine Pre-Registration (Company)
1. Admin uploads machine serial numbers and installation location mapping.
2. System marks machines as `NOT_CLAIMED` for warranty.

## 2. Warranty Claim (Warden)
1. Warden registers and enters district, block, hostel, machine serial, install date.
2. System validates serial-location match.
3. Warranty start date set from installation date.
4. Warranty end date = start date + 12 months.

## 3. Complaint Creation
1. Warden submits complaint text in Hindi or English.
2. Warden can upload up to 3 images, audio, and video.
3. AI service normalizes issue text and suggests category/subcategory.
4. Complaint status = `OPEN` and visible in Admin queue.

## 4. Assignment
1. Admin reviews complaint.
2. Admin can:
- assign to Service Manager, or
- assign directly to Service Supervisor.
3. If assigned to Manager, Manager must assign a Supervisor.

## 5. On-site Resolution
1. Supervisor accepts task and updates progress.
2. Supervisor visits site and performs repair/replacement.
3. Supervisor submits resolution notes and evidence.

## 6. Warranty/Payment Branching
1. If warranty active:
- service is free
- payment status = `NOT_REQUIRED`
2. If warranty expired:
- Admin publishes quote for parts + service
- payment status = `PENDING`
- after payment confirmation, supervisor dispatch proceeds

## 7. Closure
1. Supervisor marks issue resolved.
2. Warden verifies and marks complaint `CLOSED_BY_WARDEN`.
3. Monitoring dashboard updates SLA metrics.

## 8. Monitoring Official View
1. Read-only access to dashboards.
2. Track complaint volume and hotspots by district/block/hostel.
3. Track response and resolution timelines.
