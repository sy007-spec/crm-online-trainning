# System specification

## Scope
The application provides course administration, bilingual Markdown publication, access approval, instructor presentation, discussions, private notes, shared reading and engagement analytics. Customer materials and deployment configuration are not part of the source distribution. New installations start without courses or materials.

## Identity and access
Course codes select a course and are case-insensitive. They do not establish identity or grant access. Email identifies a learner; display names do not. Returning learners must satisfy their configured security check. Approval, IP policies and configured identity providers control access. Administrators can reset security state and manage course-scoped instructor permissions.

Sessions are server-validated. Administrative mutations require CSRF protection; authorization is checked on each request. Forwarded client addresses are trusted only from explicitly configured loopback proxies.

## Materials and compatibility
Chinese and English uploads share stable page IDs. Uploading creates or replaces an unpublished draft; publication is a separate administrative action. Business versions describe content scope; revisions record edits. Publication visibility and the default visible revision are independently controlled.

Content changes do not delete notes or discussions. Retired pages retain historical associations. Materials are accessible only through authenticated APIs or approved, unexpired reading links. Runtime databases, uploaded source files and images are not static repository assets.

## Collaboration
Questions and annotations use a unified model with course/page context and visibility controls. Replies, images, pins, bookmarks and exports respect the parent item's visibility. Private notes remain private. Administrator edits are visibly attributed. Language switching preserves page association.

## Sharing and analytics
Sharing permissions and maximum duration are course-specific. Share links require administrator approval unless explicitly preapproved. Extension requests are rate-limited and deduplicated. Reading events measure engagement, not knowledge mastery. Aggregation limits duplicate and inactive-tab time.

## Integrations and operations
Lark and agent access require explicit configuration. Agents receive scoped access; they cannot publish their own FAQ proposals. Credentials and signing keys are runtime secrets. Backups must include databases, uploads and configuration. Deployment details are supplied by the operator, outside this repository.

## Verification
Tests cover normal flows, access denial, forged proxy headers, CSRF, replay, expiry, course isolation, visibility, upload/publication, historical record retention, image handling and sharing. Browser tests cover presentation, discussions and mobile layouts with generated synthetic test data.
