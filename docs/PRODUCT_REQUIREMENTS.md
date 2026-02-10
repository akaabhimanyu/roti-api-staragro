# Roti Machine Service Platform - Product Requirements

## 1. Goal
Build a service platform for roti maker machines installed across Madhya Pradesh districts, enabling:
- machine registration and location mapping
- warranty claim activation by hostel wardens
- complaint capture with media
- admin-led assignment and SLA tracking
- service execution and closure
- monitoring dashboards with graphs

## 2. User Roles
1. Admin
- full access to users, machines, complaints, assignment, cost quotation, payment verification
- can assign complaint directly to Service Manager or Service Supervisor
- can block/unblock manager and supervisor accounts

2. Warden (Hostel)
- register machine warranty by district/block/hostel/serial/install date
- raise complaints with text, images (up to 3), audio, video
- close complaint after resolution confirmation

3. Service Manager
- receives assigned complaints from admin
- assigns Service Supervisor
- monitors supervisor activity

4. Service Supervisor
- receives complaint assignment
- updates visit status and resolution details
- marks work completed for warden confirmation

5. Monitoring Official (read-only)
- view dashboards, SLA metrics, complaint trends, district/block/hostel analytics

## 3. Core Modules
1. Master Data
- Districts, blocks, hostels
- Machine catalog and machine serial registrations

2. Warranty Registration
- Machine pre-uploaded by company with serial + installation location
- Warden claims warranty by submitting installation details
- Warranty starts from validated installation date
- Default warranty period: 12 months

3. Complaint Management
- Complaint creation (bilingual Hindi/English text)
- Category and subcategory classification
- File uploads: image/audio/video
- AI-assisted classification from text/voice/video note summary

4. Assignment Workflow
- New complaint -> Admin queue
- Admin assigns to Manager or directly to Supervisor
- If assigned to Manager, Manager must assign Supervisor
- Timeline logs: raised time, assigned time, first response, resolved time

5. Resolution & Closure
- Supervisor submits resolution action + parts used + proof media
- Warden confirms "Resolved" to close ticket

6. Warranty vs Paid Service
- In-warranty: zero cost
- Out-of-warranty: Admin adds part + service quote
- Payment required before dispatch for paid cases
- Payment details visible only to Admins

7. Monitoring & Analytics
- Complaints by district/block/hostel/category
- SLA metrics: response time, resolution time
- Pie/bar/line charts for trend and concentration

## 4. Complaint Categories (Initial)
1. ELECTRICAL
- wire issue
- heating plate issue
- motor issue
- gearbox issue

2. ELECTRONICS
- button panel
- sensor issue
- condenser issue
- special sensor issue

3. MECHANICAL
- conveyor wear and tear
- nut/bolt issue
- missing component

4. GAS_LPG
- pipeline issue
- knob issue
- regulator issue
- gas nozzle issue

## 5. Security & Compliance
- OTP-based login by phone for all roles
- Aadhaar capture for Service Manager and Service Supervisor
- role-based access control (RBAC)
- immutable audit log for assignments and status changes

## 6. Non-Functional Requirements
- multilingual UI: Hindi + English
- offline support for supervisor field use
- media upload with retry
- scalable for multiple districts and admins
- notification support (push + SMS where needed)

## 7. Suggested Delivery Plan
1. Phase 1 (MVP)
- role auth, machine registry, warranty claim, complaint flow, assignment, closure

2. Phase 2
- payment integration for out-of-warranty complaints
- richer AI classification and Hindi/English summary

3. Phase 3
- advanced analytics, preventive maintenance alerts, performance scorecards
