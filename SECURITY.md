# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration stores under `/data` only the address of the Tube Archivist
server read last, the ids of the videos already seen (archived, failed), the
size of the queue at the last reading and the titles and channels of the latest
videos. The API token stays in the configuration of Gladys: it is sent to Tube
Archivist only, in the `Authorization` header (prefer HTTPS when Tube Archivist
is behind a reverse proxy), and never written to the logs. The token must be an
admin one: it can do in Tube Archivist what its user can do, so keep it like a
password. The integration only calls the API to read, and writes only on a
request of the user: add a YouTube link to the queue, start the rescan of the
subscriptions. The links added are not logged. It only talks to the address
configured, over the local network; no cloud service, no inbound port.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Tube Archivist itself.
