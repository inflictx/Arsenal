# Research: infrastructure / post-exploitation (batch 3)

---

## 1. Linux Privilege Escalation

**When applicable.** After an initial shell (often `www-data`/a service user after RCE) with the goal of reaching `root`. HTB/CTF and authorized access to the host.

**Vector-finding logic (from cheap to expensive):**
1. Auto-enum (LinPEAS `-a` + `pspy` for dynamics) gives 80% of the leads - prioritize by highlighting.
2. First the "human" misconfigs: `sudo -l`, SUID/capabilities, cron, writable files, password/key reuse - more reliable than kernel exploits and won't crash the host.
3. Kernel/CVE - last: an exact version match (`uname -r`, `/etc/os-release`) matters more than "looks like it fits" (backports!).

**Gotchas.**
- LinPEAS from `/dev/shm` (often `noexec` on `/tmp`).
- GTFOBins: distinguish the **SUID** vs **Sudo** vs **Capabilities** sections - the payload differs; for a SUID shell you need `-p` (`bash -p`), otherwise the euid is dropped.
- LD_PRELOAD works only with `env_keep+=LD_PRELOAD` in `sudo -l`.
- PwnKit (CVE-2021-4034) almost always gives root if `pkexec` is present and unpatched - the "last chance".
- DirtyPipe requires kernel 5.8-5.16.x; otherwise a panic.
- The Docker/lxd group = effectively root, but an accessible socket is needed.

**Sources.** GTFOBins; HackTricks - Linux Privilege Escalation; PEASS-ng; `linux-exploit-suggester`; Exploit-DB.

---

## 2. Windows Privilege Escalation

**When applicable.** A shell from a low-privileged user or service (IIS `iis apppool\`, `mssql`, `local/network service`) -> `NT AUTHORITY\SYSTEM`/local admin.

**Logic.**
1. `whoami /priv` - the main thing: `SeImpersonate`/`SeAssignPrimaryToken` on a service ~ SYSTEM via Potato. `SeBackup`/`SeRestore`/`SeDebug`/`SeTakeOwnership` - their own chains.
2. Auto-enum WinPEAS/PrivescCheck/PowerUp: unquoted paths, service ACLs, AlwaysInstallElevated, autostarts, saved creds.
3. Credential hunting (cmdkey, configs, GPP, DPAPI, SAM/SYSTEM) - often shorter than an exploit.
4. Kernel/missing KB (wesng/Watson) - when there are no misconfigs.

**Gotchas.**
- Choice of Potato per OS: classic JuicyPotato is dead on 2019+/Win10 1809+ -> **PrintSpoofer** (needs the Spooler) or **GodPotato**/**JuicyPotatoNG** (2019/2022/10/11). GodPotato is the most reliable.
- `accesschk` requires `-accepteula`.
- Unquoted path: you need write permission to an intermediate directory AND the right to restart the service.
- AlwaysInstallElevated - must be `=1` in BOTH branches (HKLM and HKCU).
- HiveNightmare (CVE-2021-36934): you need shadow copies (VSS) + readable ACLs on `SAM`/`SYSTEM`.
- AV blocks `winPEAS.exe`/`mimikatz` - `winPEASany`, SharpUp, in-memory, `-ep bypass`.

**Sources.** HackTricks - Windows Local Privilege Escalation; PayloadsAllTheThings; PEASS-ng (WinPEAS); itm4n (PrivescCheck/PrintSpoofer); BeichenDream/GodPotato; LOLBAS; wesng.

---

## 3. Active Directory - attack chain

**Chain logic (from anonymous to Domain Admin).** Each step is either obtaining a new identity (user/hash/ticket/cert) or elevating the context over it.

1. **Anonymous -> user list.** RID brute via SMB (works even with null/guest when LDAP is closed), anonymous LDAP, Kerberos user enum (`kerbrute`, only 88/tcp). A compromise is already possible here: **AS-REP roast without authentication** for accounts with `DONT_REQ_PREAUTH`.
2. **First credential -> domain map.** Immediately pull the BloodHound graph (`-c All`) - it turns "there is a user X" into a path to DA via ACL/delegation/membership. In parallel, Kerberoast and inspect `description` (passwords are a classic).
3. **Escalation forks:** the ACL path (ForceChangePassword/GenericAll/WriteDACL - the quietest, WriteDACL/Owner on the root = DCSync); Kerberos (Kerberoast/AS-REP, depends on password strength); delegation (unconstrained+coerce / constrained S4U / RBCD); **ADCS** (ESC1 in a single request -> a cert on behalf of DA, `certipy find -vulnerable`); coercion+relay (PetitPotam/PrinterBug + ntlmrelayx -> LDAP escalation or ESC8).
4. **Domain compromise -> dump/persistence.** DCSync (`secretsdump -just-dc`) -> krbtgt -> Golden Ticket; shadow creds and hidden DCSync rights - quiet persistence; a Silver ticket doesn't touch the DC.
5. **Lateral.** PtH/OverPtH/PtT, evil-winrm/psexec/wmiexec; `nxc` across the subnet instantly shows where an account is a local admin (`Pwn3d!`).

**Key forks.**
- Null closed? -> `guest`, then authenticated enum after the first crack.
- LDAP/SMB signing enabled? -> relay won't work (signing/CB is visible right in the `nxc ldap <dc> -u u -p 'p'` banner; the list of SMB targets without signing - `nxc smb <cidr> --gen-relay-list relay.txt`). Modern DCs require LDAP channel binding -> shift to SMB-relay or ADCS HTTP.
- Only AES (RC4 off)? -> Kerberoast `-m 19600/19700`, slower.
- Lockout: before spraying read `--pass-pol`, one password per round, `--no-bruteforce`.
- Tickets on Linux: a time desync with the DC > 5 min breaks Kerberos; `KRB5CCNAME`, `-k`, a correct `/etc/hosts`+DNS to the DC.

**Gotchas.** `bloodhound-python` requires DNS to the DC (`-ns`); ingest into **BloodHound CE**. **Certipy 5.x** changed the syntax (merged subcommands, `certipy relay` for ESC8); ESC16 in recent releases. `addcomputer` requires `MachineAccountQuota > 0`. ForceChangePassword breaks the working account - record the old hash. AS-REP/Kerberoast/DCSync are high-signal events (4768/4769/4662).

**Sources.** ired.team (AD attacks); thehacker.recipes (the AD section); Certipy wiki (ESC1-16); BloodHound CE docs; NetExec wiki; Impacket examples.

---

## 4. Cloud - AWS / Azure / GCP / Kubernetes

**When applicable.** Found cloud keys (`AKIA`/`ASIA`, `.aws/credentials`, GCP key.json, kubeconfig), SSRF in a cloud application (-> metadata -> role), or a shell in a container/pod.

**Logic.** First identification (`aws sts get-caller-identity` - the cloud "whoami", almost always allowed, don't make noise with Pacu/ScoutSuite before this). Then enum permissions (`pacu iam__enum_permissions`/`iam__privesc_scan`, ScoutSuite/prowler - misconfigs). Then privesc along known paths -> persistence -> lateral (AssumeRole, cross-account). Metadata is a separate quick vector.

**IMDSv1 vs IMDSv2 (key).** IMDSv1 - a simple GET, via any SSRF. IMDSv2 requires first `PUT /latest/api/token` (a TTL header), then a GET with `X-aws-ec2-metadata-token` - via a blind GET-only SSRF it's hard. The `hop-limit=1` of IMDSv2 is the main defense. Azure: `/metadata/identity/oauth2/token`, the header `Metadata: true`, the parameter `resource=`. GCP: `metadata.google.internal`, `Metadata-Flavor: Google`.

**Gotchas.** `ASIA` requires `AWS_SESSION_TOKEN` (otherwise `InvalidClientTokenId`). `--no-sign-request` for anonymous buckets. CloudTrail/GuardDuty log almost everything - on bug-bounty don't escalate destructively. `iam:PassRole` is useless without a second service (EC2/Lambda/Glue/CFN). K8s: everything is decided by `kubectl auth can-i --list`; `create pods` or `list secrets` ~ cluster admin. Escape markers: `privileged`, `hostPID/hostPath`, `docker.sock`, `SYS_ADMIN`.

**Tools.** awscli v2/az/gcloud/kubectl; ScoutSuite, Prowler v4/5, Pacu, CloudFox; ROADtools/AzureHound; trufflehog, enumerate-iam, peirates, kube-hunter.

**Sources.** hackingthe.cloud; Pacu wiki; ScoutSuite/Prowler docs; PayloadsAllTheThings (Cloud/Kubernetes); Rhino Security Labs - "AWS IAM Privilege Escalation Methods".

---

## 5. Pivoting and tunneling

**When applicable.** Captured a foothold with access to an internal network unreachable directly. Multi-layered networks - double/triple pivot.

**Tool choice.**
1. First reconnaissance of subnets (`ip a`/`ip route`/`arp -a`) - determines the routes.
2. **Ligolo-ng - the default choice for 2025/2026:** a true L3 tunnel via TUN; add `ip route add <subnet> dev ligolo` - and any tools (nmap `-sS`, Impacket, browser) work directly, without proxychains and without the UDP limitations of SOCKS.
3. **Chisel** - an HTTP/WS tunnel (passes through proxies/firewalls), no rights to TUN, Windows without admin.
4. **SSH** (`-L`/`-R`/`-D`) - if there is SSH access; **sshuttle** - a "poor man's VPN" (needs Python on the target).
5. **Meterpreter** (`autoroute`+`socks_proxy`+`portfwd`) - if there is an MSF session.

**Nuances.** SOCKS can't do ICMP and is clunky with UDP -> via proxychains `nmap -sT -Pn`; `-sS` goes only through the ligolo TUN. proxychains-ng: `dynamic_chain` for chains, turn off `proxy_dns` if it breaks resolution (but then internal-name DNS won't resolve). Reverse vs forward: with blocked inbound - the agent itself goes outward (reverse). Ligolo routes are added on the ATTACKER, not on the target.

**Gotchas.** Windows: ligolo installs the Wintun driver. Don't forget the firewall on the attacking machine (inbound 11601/8080). `sshuttle` requires root locally + Python remotely, no UDP. Long-lived reverse tunnels/TUN are an anomaly for EDR; disguise chisel as 443/TLS.

**Sources.** Ligolo-ng (nicocha30); Chisel (jpillora); sshuttle docs; OpenSSH man; proxychains-ng; HTB Academy "Pivoting, Tunneling, Port Forwarding"; PayloadsAllTheThings "Network Pivoting".

---

## 6. API Testing (OWASP API Top 10)

**Where the money is.** APIs are almost always stateless -> every endpoint must check permissions itself, and developers rely on "the front-end will hide it".
- **API1 BOLA/IDOR** - top-1 by payouts: an object is addressed by `id`/UUID/email, the server checks only authentication, not "does it belong". Always 2 accounts. A UUID doesn't save you (they're collected from other responses).
- **API5 BFLA** - a regular user calls an admin operation or changes the method (`GET`->`PUT`/`DELETE`). Especially on hidden `/admin`/`/internal`/`/actuator` and during version drift.
- **API2 Broken Auth** + **API3 (mass assignment + excessive data exposure)** - mass assignment (`"role":"admin"`) = direct privilege; excessive exposure leaks PII/secrets.

**Gotchas.**
- **Versioning = auth drift:** old `/v1` are often alive and less protected. Closed in `/v2` - repeat in `/v1`.
- **Method and override:** WAF/authorization sometimes look only at `GET`/`POST`. Try `PUT`/`PATCH`/`DELETE` and `X-HTTP-Method-Override`/`_method`.
- **UI != API:** compare the raw JSON with what the UI shows - extra fields = a report.
- **GraphQL:** introspection is often enabled in production (dump the schema; `clairvoyance` if disabled); BOLA field by field; batching bypasses rate-limit and brute-forces OTP; deep nesting -> DoS.
- **gRPC:** `grpcurl -plaintext host:port list` (reflection), methods often without the REST gateway's checks.
- **SSRF (API7):** not only `url=` - webhooks, import by link, preview, avatars; cloud-metadata is the main target, blind via Collaborator.
- **Mass assignment** look in "profile update" (PUT/PATCH + privileged fields); first `arjun` for hidden parameters.

**Sources.** OWASP API Security Top 10 - 2023; OWASP WSTG; PortSwigger Web Security Academy (API/GraphQL/SSRF/JWT); bug-bounty methodologies (kiterunner/arjun/graphql-cop/jwt_tool).

---

## 7. Recon pipeline (enumeration automation)

**Logic.** Recon is a funnel: broad passive collection -> narrowing to live/accessible -> prioritization by surface -> auto-checking for known bugs. Each stage trims noise for the next; the point is to link the tools so that the output of one is the input of another (stdin/stdout, "a host per line"). The canonical stack is ProjectDiscovery.

**Stages.** (1) Scope discipline - extra domains = going out of bounds + noise. (2) Passive subdomains (`subfinder -all`, `amass -passive`, `chaos`, crt.sh) - without touching the target, API keys are critical. (3) Resolve+live (`dnsx`->`httpx` with `-title -tech-detect`) - technologies = known CVEs. (4) Ports (`naabu`->`nmap -sCV` only on the found ones). (5) Crawling+JS (`katana`, `gau`, `waybackurls`, `getJS`) - **JS = recon gold**: hardcoded keys, hidden endpoints, internal hosts. (6) Screenshots (`gowitness`) - visual triage. (7) `nuclei` with `-severity`/`-es info` for the tech stack. (8) Linking + cron+`anew`+`notify` - "be the first to notice a new asset".

**Gotchas.** The wordlist is decisive (see the Wordlists module): SecLists `raft-*`/`api/`, assetnote. Rate-limit: `-rl`/concurrency, respect the scope. `anew` - the glue for diff monitoring (writes only what's new). `katana -jc -kf all` catches endpoints from JS. Always `sort -u`/`anew` between stages. Most passive sources require API keys in the config.

**Reference chain:** `subfinder -d target.com -all -silent | dnsx -silent | httpx -silent | nuclei -severity critical,high -silent`

**Sources.** ProjectDiscovery docs; OWASP Amass User Guide; SecLists; TomNomNom tools (gau/waybackurls/anew/getJS); Jason Haddix "The Bug Hunter's Methodology".
