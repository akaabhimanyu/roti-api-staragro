# OTP + Warden-Machine Assignment API

## 0) Create first Admin (one-time bootstrap)
`POST /api/admin/bootstrap`

Request body:
```json
{
  "fullName": "Company Admin",
  "phone": "9999999999"
}
```

## 1) Pre-register Warden and assign machines (Admin action)
`POST /api/wardens/pre-register`

Request body:
```json
{
  "uploadedByAdminId": "admin_user_id",
  "fullName": "Warden Name",
  "phone": "9876543210",
  "districtId": "district_id",
  "machineCount": 2
}
```

Result:
- Warden user is created/updated using phone number
- system creates temporary machine codes (example: `TMP-3210-123456-1`)
- one warden can have multiple machine placeholders before serial verification

Alternative (if serials are already known):
```json
{
  "uploadedByAdminId": "admin_user_id",
  "fullName": "Warden Name",
  "phone": "9876543210",
  "districtId": "district_id",
  "machineSerialNumbers": ["MP-RT-0001", "MP-RT-0002"]
}
```

## 2) Request OTP
`POST /api/auth/otp/request`

Request body:
```json
{
  "phone": "9876543210",
  "role": "WARDEN"
}
```

Note:
- current implementation returns `devOtp` in response for testing
- in production, send OTP via SMS provider

## 3) Verify OTP and get session token
`POST /api/auth/otp/verify`

Request body:
```json
{
  "phone": "9876543210",
  "otp": "123456"
}
```

Use returned token in header:
`Authorization: Bearer <sessionToken>`

## 4) Get assigned machines for logged-in warden
`GET /api/wardens/me/machines`

Header:
`Authorization: Bearer <sessionToken>`

## 5) Warden submits serial claim for verification
`POST /api/wardens/me/serial-claim`

Header:
`Authorization: Bearer <sessionToken>`

Request body:
```json
{
  "tempMachineCode": "TMP-3210-123456-1",
  "claimedSerialNumber": "MP-RT-00991",
  "installationDate": "2026-02-06T10:30:00.000Z",
  "claimNotes": "Read from plate near motor"
}
```

Result:
- claim status becomes `PENDING`
- Admin must approve/reject this serial

## 6) Admin reviews serial claim
`POST /api/admin/machines/:machineId/serial-review`

Request body (approve):
```json
{
  "adminUserId": "admin_user_id",
  "action": "APPROVE"
}
```

Request body (reject):
```json
{
  "adminUserId": "admin_user_id",
  "action": "REJECT",
  "rejectionReason": "Serial photo unclear, please resubmit."
}
```

On approve:
- serial is locked on machine
- warranty auto-starts from claimed installation date
- warranty end is set to +12 months

## 7) Optional manual warranty update (legacy path)
`POST /api/warranty/claim`

Header:
`Authorization: Bearer <sessionToken>`

Request body:
```json
{
  "serialNumber": "MP-RT-0001",
  "installationDate": "2026-02-06T10:30:00.000Z",
  "hostelId": "optional_hostel_id"
}
```

Result:
- checks serial belongs to logged-in warden
- requires serial status already `APPROVED`
- sets warranty start from installation date
- sets warranty end to +12 months
