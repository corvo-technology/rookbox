# Security

This policy describes how to report security vulnerabilities in Rookbox, a
deployment built on SPACE, and which versions receive security fixes. Please
use the private reporting channel below for security-sensitive findings.

**Do not report security vulnerabilities through public GitHub issues,
pull requests, or discussions.**

## Reporting a Potential Security Vulnerability

Please report security issues privately:

- Web: [Report a vulnerability](https://github.com/corvo-technology/rookbox/security/advisories/new)
- Please include the following information:
  - Affected version, branch, or commit
  - Type of vulnerability and affected component
  - Instructions to reproduce the vulnerability
  - Proof-of-concept or exploit code, if available
  - Potential impact, including how an attacker could exploit the vulnerability

Use synthetic data where possible and remove credentials, customer data,
and other sensitive information from reproductions and logs.

A vulnerability that also affects upstream SPACE, independent of changes made
in this repository, should also be reported to the SPACE maintainers through
their [private reporting channel](https://github.com/perplexityai/SPACE/security/advisories/new).

## Supported Versions

Only the latest commit on the default branch receives security fixes.
