# Security Policy

## Privacy and Data Handling

HackLM Memory stores all data **locally only**:

- Memory entries are written to `.memory/*.md` files in your workspace folder.
- No data is sent to any external server or cloud service.
- No telemetry is collected.
- The extension does make LM requests to the VS Code Copilot language model API — this follows VS Code's own privacy and data-handling policies.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report security issues privately via [GitHub Security Advisories](https://github.com/hacklmdev/memory/security/advisories/new).

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigation

You will receive a response within 7 days. We will keep you updated as we work on a fix.

## Scope

This policy covers the `hacklm-memory` VS Code extension source code in this repository. It does not cover:

- The VS Code Copilot service itself
- VS Code's language model API
- Third-party dependencies (report those to their respective maintainers)
