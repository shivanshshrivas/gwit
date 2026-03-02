# Security Policy

## Supported Versions

| Version | Status |
|---------|--------|
| 0.2.x   | Active development, security patches |
| 0.1.x   | Security patches only |

## Reporting a Vulnerability

If you discover a security vulnerability in gwit, please report it responsibly:

1. **Do NOT open a public issue.** Security vulnerabilities should not be disclosed publicly until a fix is available.
2. **Use GitHub Security Advisories.** Go to the [Security tab](../../security/advisories) of this repository and click "Report a vulnerability."
3. Alternatively, email the maintainer directly (see the repository profile).

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

### Response timeline

- **Acknowledgement:** Within 48 hours
- **Initial assessment:** Within 1 week
- **Fix and release:** Best effort, typically within 2 weeks for critical issues

## Scope

The following are considered security vulnerabilities in gwit:

- **Shell injection** via branch names, paths, or config values bypassing `runArgs()` safety
- **Path traversal** in `.gwitinclude` file copying that escapes the worktree boundary
- **Environment variable leakage** of `$GWIT_*` values into unintended contexts
- **Registry corruption** that could cause data loss or incorrect worktree state
- **Privilege escalation** through file permissions on `~/.gwitrc` or `~/.gwit/`

The following are **not** in scope:

- Malicious commands in `.gwitcommand` / `.gwitcleanup` (these are user-authored scripts; gwit's trust model matches `npm install` postinstall scripts)
- Issues requiring local filesystem access (gwit is a local CLI tool, not a network service)

## Security Architecture

For a detailed threat model and security controls, see [docs/security.md](https://github.com/shriv/gwit/blob/main/docs/security.md).
