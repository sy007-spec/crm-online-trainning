# Self-hosting operations

Use Node.js 24 or the provided Dockerfile. Choose your own domain and servers; this repository does not contain an operator-specific topology or SSH configuration.

## Configuration

- PUBLIC_URL: public HTTPS origin.
- HOST and PORT: listener, normally 127.0.0.1 and 3140 behind a proxy.
- RUNTIME_DIR: private persistent runtime directory.
- TRUST_PROXY=loopback: trust proxy headers only from loopback. The proxy must overwrite X-Real-IP with the actual client address.

For the supplied Linux host-network Compose setup, set PUBLIC_URL and TRAINING_DATA_DIR. The data directory must be writable by the container user (UID 10001). Keep the application port private. Terminate HTTPS at your reverse proxy, preserve Host and overwrite forwarding headers. Proxy configuration, certificates and SSH keys are operator-managed outside Git.

## Backup and upgrades

Run node ops/backup.mjs in the application's environment to create a SQLite backup. Retain uploads and private configuration alongside database backups. Verify recovery in an isolated instance.

Before upgrading, retain the previous image and a consistent backup. Validate health, access controls, published materials and learning records. Do not overwrite newer records merely to roll back application code.

## Markdown import

    node ops/import-markdown.mjs HTTPS_ORIGIN PRIVATE_ADMIN_FILE CHINESE_MD COURSE_ID ENGLISH_MD

This uses the same parser and draft workflow as the administrator console. It does not publish. Materials and credentials stay outside Git; paths are supplied by the operator.

## Optional services

Configure messaging integrations only for the relevant deployment. Do not reuse credentials from unrelated systems. Lark notifications are sent only to explicitly configured recipients. Certificate issuance and renewal are the operator's responsibility.
