# Security Specification — NOMBRAMIENTOS SDA

## 1. Data Invariants
1. **Session Ownership**: Every nominating session (`/sessions/{sessionId}`) is owned by the authenticated Pastor/Secretary (`ownerId == request.auth.uid`, with `request.auth.token.email_verified == true`). Only the owner can modify session settings, committee members, departments, eligible members, or projector state.
2. **Token-Gated Committee Participation**: Committee members access `/sessions/{sessionId}/committee/{token}` strictly via exact document `get` using their unguessable token. `list` access on `/committee` is restricted exclusively to the session owner.
3. **Single-Vote Enforcement**: Each voter (committee token or `pastor_{uid}`) can create at most one receipt at `/sessions/{sessionId}/rounds/{roundId}/receipts/{receiptId}` per round (`!exists(...)` and `allow update: if false`). Receipts cannot be listed by non-admins.
4. **Secret Ballot Isolation**: Anonymous ballots at `/sessions/{sessionId}/rounds/{roundId}/ballots/{ballotId}` store strictly `{ sessionId, roundId, candidateIds, castAt }` with zero voter identity fields. Ballots are immutable (`allow update: if false`) and non-admins cannot read them.
5. **Round State & Seat Bounds**: Ballots and candidate proposals are rejected unless the parent round has `status == 'open'`. Ballot `candidateIds` array length must be between `1` and `round.seats`.
6. **Projector Isolation**: `/sessions/{sessionId}/projector/{projectorKey}` is readable strictly via exact `get` with the unguessable `projectorKey` and writable solely by the session owner.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Identity Spoofing on Session Create**: Unauthenticated or mismatched `ownerId != request.auth.uid` on `/sessions/{id}`.
2. **Shadow Field Injection on Ballot**: Creating a ballot containing an unexpected field `{ ..., voterToken: "leak" }`.
3. **Double Voting**: Creating `/receipts/{token}` when `/receipts/{token}` already exists.
4. **Closed Round Voting**: Creating a ballot or receipt when `round.status == 'closed'` or `'paused'`.
5. **Over-Selection Ballot**: Creating a ballot with `candidateIds.size() > round.seats`.
6. **Empty Ballot**: Creating a ballot with `candidateIds.size() == 0`.
7. **Unauthorized Pastor Vote**: Creating `/receipts/pastor_{uid}` when `round.pastorVoteAllowed == false`.
8. **Disabled Committee Member Vote**: Creating `/receipts/{token}` when `committee/{token}.enabled == false`.
9. **Candidate Vote Manipulation**: Committee member creating a candidate with `voteCount: 5` or `elected: true`.
10. **Committee Token Enumeration**: Non-admin attempting `list` on `/sessions/{sessionId}/committee`.
11. **Ballot Reading by Member**: Non-admin attempting `get` or `list` on `/sessions/{sessionId}/rounds/{roundId}/ballots`.
12. **Resource Poisoning (Oversized ID / String)**: Document ID > 128 chars or containing invalid characters, or `name` > 140 chars.
