# FinCoach API

This document describes the Express API implemented in `server/src/app.js` and `server/src/auth.js`.

## Base URL and authentication

- Local API: `http://localhost:4000/api` (the Vite app proxies browser requests from `/api`).
- Deployed API: `/api` on the same origin as the website.
- Account routes use the `fincoach_session` HTTP-only cookie. Browser requests should use `credentials: 'include'`; do not read or store the token in client JavaScript.
- The cookie expires after seven days. It is `Secure` in production and uses `SameSite=Lax`.
- Protected routes return `401` when the cookie is absent, invalid, or expired. All history, comparisons, and learning progress are scoped to the authenticated account.
- Registration and login are limited to 10 requests per 15 minutes per client IP and route. The current limiter is per process; configure the hosting provider's edge/WAF rate limiting for a shared production limit.
- Requests and responses use JSON unless the response is `204 No Content`. JSON request bodies are limited to 32 KB.

## Health and public calculation

### `GET /health`

Returns the configured storage state. Local development returns `storage: "local"` when MongoDB is not connected. Hosted account storage must be MongoDB; this endpoint does not report healthy until MongoDB and `JWT_SECRET` are configured and a connection succeeds.

```json
{ "status": "ok", "storage": "mongodb" }
```

Hosted error statuses are `503` with `status: "misconfigured"` when required configuration is missing/invalid, or `status: "unavailable"` when the MongoDB connection fails. Never expose environment values in a health response.

### `POST /simulations/:type`

Public, stateless calculation. Supported types: `investment`, `loan`, `credit-card`, `budget`, `savings-goal`, `buy-vs-save`. The JSON body is the input object for that simulator; see the initial input objects and calculation validators in `shared/calculations.js`.

```json
{
  "principal": 20000,
  "rate": 8,
  "years": 5
}
```

This is a valid `investment` request; other simulator types have their own input fields documented in `shared/calculations.js`. Success returns `{ "type", "inputs", "results" }`. Invalid input returns `400` with `{ "error", "field" }` where a field is identifiable. Unknown types return `404`.

## Account routes

### `POST /auth/register`

Public. Required JSON fields: `name` (1–80 characters), `email` (valid email, normalized to lowercase), `password` (8–128 characters, at least one letter and one number), and `confirmPassword` (must match). On success, returns `201 { "user": { "id", "name", "email", "createdAt" } }` and sets the session cookie. Duplicate email returns `409`; invalid fields return `400` with a `details` object keyed by field.

### `POST /auth/login`

Public. Body: `{ "email": "student@example.com", "password": "..." }`. On success returns `{ "user": { "id", "name", "email", "createdAt" } }` and sets the session cookie. Invalid credentials return `401`; malformed credentials return `400`.

### `POST /auth/logout`

Public. Clears the session cookie and returns `204`.

### `GET /auth/me`

Protected. Returns the current safe user object (never a password hash). Returns `401` if the session is invalid or the account no longer exists.

### `PATCH /auth/profile`

Protected. Body: `{ "name": "Student", "email": "student@example.com" }`. Returns `{ "user": ... }`; invalid details or an unavailable email return `400` or `409`.

### `PATCH /auth/password`

Protected. Body: `{ "currentPassword": "...", "newPassword": "..." }`. The new password uses the registration password policy. Returns `{ "message": "Password updated." }`; bad current password returns `401`.

### `DELETE /auth/account`

Protected and irreversible. Body: `{ "currentPassword": "..." }`. Confirms the password, removes the account's scenarios, comparisons, and learning record, clears the cookie, and returns `204`.

## Scenarios

All routes below require a session. Scenario records include the simulator type, title, original input object, server-recomputed results, assumptions, schema version, and timestamps.

| Method and path | Body | Success |
| --- | --- | --- |
| `GET /simulations` | — | `{ "simulations": [...] }` for this user |
| `POST /simulations` | `{ "type", "title?", "inputs" }` | `201 { "simulation": ... }`; result is recomputed by the API |
| `GET /simulations/:id` | — | `{ "simulation": ... }` |
| `PATCH /simulations/:id` | `{ "title" }` | `{ "simulation": ... }` |
| `DELETE /simulations/:id` | — | `204` |

IDs must be valid MongoDB ObjectId strings. A record owned by someone else is reported as not found; the API does not disclose its existence. Saving an over-allocated budget returns `400` with an explanation.

## Decision Replay comparisons

All comparison routes require a session. The API only accepts compatible simulator types and recalculates submitted scenarios using the shared calculation engine.

| Method and path | Body | Success |
| --- | --- | --- |
| `GET /comparisons` | — | `{ "comparisons": [...] }` for this user, including version history |
| `POST /comparisons` | `{ "title?", "scenarioA": { "type", "inputs" }, "scenarioB": { "type", "inputs" } }` | `201 { "comparison": ... }` with immutable baseline/variant snapshots and initial version |
| `GET /comparisons/:id/versions` | — | `{ "comparison": ... }` including version history |
| `POST /comparisons/:id/versions` | `{ "inputs", "notes?" }` | `201 { "comparison": ..., "version": ... }`; appends a server-recomputed version |
| `PATCH /comparisons/:id` | `{ "title" }` | `{ "comparison": ... }` |
| `DELETE /comparisons/:id` | — | `204` |

Replay versions are append-only: posting a new version does not replace the original baseline or earlier versions. Notes may be up to 500 characters. A budget replay that exceeds its income is rejected.

## Learning progress

All persistent progress routes require a session. Guests can still use lessons and browser-stored progress; guest quiz attempts are queued by the client and uploaded after sign-in.

| Method and path | Body | Success |
| --- | --- | --- |
| `GET /learning/progress` | — | `{ "progress": { "completedLessons": [], "quizAttempts": [], "readingList": [] } }` |
| `PUT /learning/progress` | `{ "completedLessons": ["course.lesson-id"] }` | `{ "progress": { "completedLessons": [...] } }` |
| `POST /learning/attempts` | `{ "attemptId": "<uuid>", "lessonId": "...", "selectedAnswer": 0 }` | `201 { "attempt": ..., "duplicate": false }`; the server grades the answer |
| `POST /learning/assessments/:assessmentId/attempts` | `{ "attemptId": "<uuid>", "answers": [0, 1, 2, 0] }` | `201 { "attempt": ..., "duplicate": false }`; the server grades all answers |
| `PUT /learning/reading-list` | `{ "items": [{ "title": "...", "status": "Want to Read" }] }` | `{ "readingList": [...] }` |

`PUT /learning/progress` accepts only lesson IDs present in the current shared course catalog. Unknown lesson IDs return `400` and are not saved.

Lesson and assessment attempt IDs are idempotency keys. Reposting a previously stored ID returns the existing attempt rather than adding another one. The server accepts only known lesson/assessment IDs and book titles. Attempt history is capped at the most recent 500 entries per account.

## Error format

Most errors use `{ "error": "Human-readable message" }`. Input-validation errors may also include `field` or `details`; malformed JSON returns `400`. Missing/expired authentication returns `401`, duplicate account/email conflicts return `409`, unknown routes or resources return `404`, and hosted database misconfiguration/unavailability returns `503`. Unexpected errors return a generic `500` message; server logs omit secrets and passwords.

## Local request example

```sh
curl -i -c fincoach-cookie.txt \
  -H 'Content-Type: application/json' \
  -d '{"name":"Student","email":"student@example.com","password":"learn1234","confirmPassword":"learn1234"}' \
  http://localhost:4000/api/auth/register

curl -i -b fincoach-cookie.txt http://localhost:4000/api/auth/me
```

The cookie jar contains a session credential; keep it private and delete it after the demonstration.
